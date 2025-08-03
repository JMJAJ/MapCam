import requests
from bs4 import BeautifulSoup
import pandas as pd
import folium
import re
import time
import logging
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import json

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class InsecamScraper:
    """Enhanced scraper for insecam.org with better error handling and performance."""
    
    def __init__(self, num_pages: int = 500, max_workers: int = 15):
        self.base_url = "http://www.insecam.org"
        self.num_pages = num_pages
        self.max_workers = max_workers
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        self.scraped_count = 0
        self.total_links = 0
        
    def get_camera_links(self, page_num: int) -> List[str]:
        """Extract camera links from a page."""
        page_url = f"{self.base_url}/en/byrating/?page={page_num}"
        logger.info(f"Scraping page {page_num}: {page_url}")
        
        try:
            response = self.session.get(page_url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            
            camera_links = soup.select(".thumbnail-item__wrap")
            if not camera_links:
                logger.warning(f"No camera links found on page {page_num}")
                return []
                
            return [self.base_url + link['href'] for link in camera_links]
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to load page {page_num}: {e}")
            return []
    
    def extract_camera_details(self, camera_url: str) -> Optional[Dict]:
        """Extract details from a single camera page."""
        try:
            response = self.session.get(camera_url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            
            details_div = soup.find('div', class_='camera-details')
            if not details_div:
                return None
                
            def get_detail(text: str) -> str:
                element = details_div.find(string=re.compile(text))
                if element:
                    if text in ["Country:", "Region:", "City:", "Manufacturer:"]:
                        next_link = element.find_next('a')
                        return next_link.text.strip() if next_link else "N/A"
                    else:
                        next_div = element.find_next('div', class_='camera-details__cell')
                        return next_div.text.strip() if next_div else "N/A"
                return "N/A"
            
            # Extract all details
            lat = get_detail("Latitude:")
            lon = get_detail("Longitude:")
            country = get_detail("Country:")
            city = get_detail("City:")
            region = get_detail("Region:")
            manufacturer = get_detail("Manufacturer:")
            
            # Get camera image
            image_tag = soup.select_one(".img-responsive.img-rounded.detailimage")
            image_url = image_tag['src'] if image_tag else "N/A"
            
            # Validate required fields
            if all(v != "N/A" for v in [lat, lon, country, city]):
                try:
                    # Validate coordinates
                    lat_float = float(lat)
                    lon_float = float(lon)
                    if -90 <= lat_float <= 90 and -180 <= lon_float <= 180:
                        return {
                            "latitude": lat_float,
                            "longitude": lon_float,
                            "country": country,
                            "city": city,
                            "region": region,
                            "manufacturer": manufacturer,
                            "image_url": image_url,
                            "page_url": camera_url,
                        }
                except ValueError:
                    logger.warning(f"Invalid coordinates for {camera_url}: lat={lat}, lon={lon}")
                    
            return None
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Could not fetch camera page {camera_url}: {e}")
            return None
        except Exception as e:
            logger.error(f"Could not process camera page {camera_url}: {e}")
            return None
    
    def scrape_cameras(self) -> List[Dict]:
        """Main scraping method with concurrent processing and progress tracking."""
        logger.info(f"Starting to scrape {self.num_pages} pages from Insecam...")
        
        # Get all camera links first with progress tracking
        all_camera_links = []
        print(f"🔍 Collecting camera links from {self.num_pages} pages...")
        
        for page_num in range(1, self.num_pages + 1):
            links = self.get_camera_links(page_num)
            all_camera_links.extend(links)
            
            # Progress update every 10 pages
            if page_num % 10 == 0:
                print(f"📄 Processed {page_num}/{self.num_pages} pages, found {len(all_camera_links)} camera links so far...")
            
            time.sleep(0.3)  # Be respectful to the server
        
        self.total_links = len(all_camera_links)
        logger.info(f"Found {self.total_links} camera links to process")
        print(f"✅ Found {self.total_links} total camera links!")
        
        # Remove duplicates
        all_camera_links = list(set(all_camera_links))
        print(f"🔄 After removing duplicates: {len(all_camera_links)} unique cameras")
        
        # Process camera details concurrently with progress tracking
        camera_data = []
        processed_count = 0
        
        print(f"🚀 Processing camera details with {self.max_workers} workers...")
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_url = {
                executor.submit(self.extract_camera_details, url): url 
                for url in all_camera_links
            }
            
            for future in as_completed(future_to_url):
                url = future_to_url[future]
                processed_count += 1
                
                try:
                    result = future.result()
                    if result:
                        camera_data.append(result)
                        self.scraped_count += 1
                        
                        # Progress update every 50 cameras
                        if processed_count % 50 == 0:
                            success_rate = (self.scraped_count / processed_count) * 100
                            print(f"📊 Progress: {processed_count}/{len(all_camera_links)} processed, "
                                  f"{self.scraped_count} valid cameras found ({success_rate:.1f}% success rate)")
                        
                        # Save intermediate results every 100 cameras
                        if self.scraped_count % 100 == 0:
                            with open('camera_data_temp.json', 'w', encoding='utf-8') as f:
                                json.dump(camera_data, f, indent=2, ensure_ascii=False)
                            print(f"💾 Intermediate save: {self.scraped_count} cameras saved to camera_data_temp.json")
                            
                except Exception as e:
                    logger.error(f"Error processing {url}: {e}")
        
        final_success_rate = (self.scraped_count / len(all_camera_links)) * 100
        logger.info(f"Successfully scraped {self.scraped_count} cameras ({final_success_rate:.1f}% success rate)")
        
        # Save final data to JSON
        with open('camera_data.json', 'w', encoding='utf-8') as f:
            json.dump(camera_data, f, indent=2, ensure_ascii=False)
        
        # Clean up temp file
        import os
        if os.path.exists('camera_data_temp.json'):
            os.remove('camera_data_temp.json')
        
        return camera_data

class MapGenerator:
    """Enhanced map generator with clustering and better visualization."""
    
    def __init__(self, camera_data: List[Dict]):
        self.camera_data = camera_data
        self.df = self._prepare_dataframe()
    
    def _prepare_dataframe(self) -> pd.DataFrame:
        """Prepare and clean the dataframe."""
        if not self.camera_data:
            logger.warning("No camera data provided for map generation")
            return pd.DataFrame()
        
        df = pd.DataFrame(self.camera_data)
        df['latitude'] = pd.to_numeric(df['latitude'], errors='coerce')
        df['longitude'] = pd.to_numeric(df['longitude'], errors='coerce')
        df.dropna(subset=['latitude', 'longitude'], inplace=True)
        
        logger.info(f"Prepared {len(df)} valid camera locations for mapping")
        return df
    
    def _get_marker_color(self, country: str) -> str:
        """Get marker color based on country for better visualization."""
        color_map = {
            'United States': 'red',
            'Russia': 'blue',
            'Germany': 'green',
            'Japan': 'purple',
            'United Kingdom': 'orange',
            'France': 'darkred',
            'Italy': 'lightred',
            'Spain': 'beige',
            'Canada': 'darkblue',
            'Australia': 'darkgreen'
        }
        return color_map.get(country, 'gray')
    
    def _create_enhanced_popup(self, row: pd.Series) -> str:
        """Create enhanced popup with better formatting and error handling."""
        # Handle missing image gracefully
        image_html = ""
        if row.get('image_url') and row['image_url'] != "N/A":
            image_html = f'<img src="{row["image_url"]}" width="200px" style="border-radius: 5px; margin-top: 10px;" onerror="this.style.display=\'none\'">'
        
        # Build popup with all available information
        popup_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 250px;">
            <h4 style="margin: 0 0 10px 0; color: #2c3e50;">{row['city']}</h4>
            <p style="margin: 5px 0;"><b>Country:</b> {row['country']}</p>
            {f'<p style="margin: 5px 0;"><b>Region:</b> {row["region"]}</p>' if row.get('region') and row['region'] != 'N/A' else ''}
            {f'<p style="margin: 5px 0;"><b>Manufacturer:</b> {row["manufacturer"]}</p>' if row.get('manufacturer') and row['manufacturer'] != 'N/A' else ''}
            <p style="margin: 5px 0;"><b>Coordinates:</b> {row['latitude']:.4f}, {row['longitude']:.4f}</p>
            <a href="{row['page_url']}" target="_blank" style="color: #3498db; text-decoration: none;">🔗 View Camera Page</a>
            {image_html}
        </div>
        """
        return popup_html
    
    def create_enhanced_map(self, filename: str = 'insecam_map.html') -> None:
        """Create an enhanced interactive map with clustering and statistics."""
        if self.df.empty:
            logger.error("No valid camera coordinates found to create a map")
            return
        
        # Calculate map center
        map_center = [self.df['latitude'].mean(), self.df['longitude'].mean()]
        
        # Create base map with multiple tile layers
        world_map = folium.Map(
            location=map_center,
            zoom_start=3,
            tiles='OpenStreetMap'
        )
        
        # Add alternative tile layers
        folium.TileLayer('Stamen Terrain').add_to(world_map)
        folium.TileLayer('Stamen Toner').add_to(world_map)
        folium.TileLayer('CartoDB positron').add_to(world_map)
        
        # Add marker clustering for better performance with many markers
        from folium.plugins import MarkerCluster, HeatMap
        marker_cluster = MarkerCluster(name="Camera Locations").add_to(world_map)
        
        # Create country statistics
        country_stats = self.df['country'].value_counts()
        
        logger.info("Adding camera markers to the map...")
        for index, row in self.df.iterrows():
            popup_html = self._create_enhanced_popup(row)
            popup = folium.Popup(popup_html, max_width=300)
            
            # Create marker with custom color
            folium.Marker(
                [row['latitude'], row['longitude']],
                popup=popup,
                tooltip=f"📹 {row['city']}, {row['country']}",
                icon=folium.Icon(
                    color=self._get_marker_color(row['country']),
                    icon='video-camera',
                    prefix='fa'
                )
            ).add_to(marker_cluster)
        
        # Add heatmap layer
        heat_data = [[row['latitude'], row['longitude']] for idx, row in self.df.iterrows()]
        HeatMap(heat_data, name="Camera Density Heatmap", show=False).add_to(world_map)
        
        # Add statistics panel
        stats_html = self._create_statistics_panel(country_stats)
        world_map.get_root().html.add_child(folium.Element(stats_html))
        
        # Add layer control
        folium.LayerControl().add_to(world_map)
        
        # Save the map
        world_map.save(filename)
        logger.info(f"Enhanced map saved to {filename}")
        logger.info(f"Map contains {len(self.df)} cameras from {len(country_stats)} countries")
    
    def _create_statistics_panel(self, country_stats: pd.Series) -> str:
        """Create a statistics panel for the map."""
        top_countries = country_stats.head(10)
        stats_list = "".join([f"<li>{country}: {count}</li>" for country, count in top_countries.items()])
        
        return f"""
        <div style="position: fixed; top: 10px; right: 10px; width: 250px; height: auto; 
                    background-color: white; border: 2px solid grey; z-index: 9999; 
                    font-size: 14px; padding: 10px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.3);">
            <h4 style="margin-top: 0;">📊 Camera Statistics</h4>
            <p><b>Total Cameras:</b> {len(self.df)}</p>
            <p><b>Countries:</b> {len(country_stats)}</p>
            <p><b>Top Countries:</b></p>
            <ul style="margin: 0; padding-left: 20px; max-height: 200px; overflow-y: auto;">
                {stats_list}
            </ul>
        </div>
        """

def load_existing_camera_data(filename: str = 'camera_data.json') -> List[Dict]:
    """Load camera data from existing JSON file."""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
        logger.info(f"Loaded {len(data)} cameras from {filename}")
        return data
    except FileNotFoundError:
        logger.warning(f"File {filename} not found")
        return []
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON file {filename}: {e}")
        return []
    except Exception as e:
        logger.error(f"Error loading {filename}: {e}")
        return []

def main():
    """Main execution function."""
    try:
        # Check if camera_data.json exists and ask user preference
        import os
        
        if os.path.exists('camera_data.json'):
            print("📁 Found existing camera_data.json file")
            choice = input("Do you want to:\n1. Use existing data (faster)\n2. Scrape new data\nEnter choice (1 or 2): ").strip()
            
            if choice == '1':
                # Load existing data
                camera_data = load_existing_camera_data('camera_data.json')
                if not camera_data:
                    logger.error("Failed to load existing camera data. Exiting.")
                    return
                print(f"✅ Using existing data with {len(camera_data)} cameras")
            else:
                # Scrape new data with comprehensive settings
                print("🚀 Starting comprehensive scraping (this will take a while)...")
                pages = input("How many pages to scrape? (default: 500, press Enter for default): ").strip()
                num_pages = int(pages) if pages.isdigit() else 500
                
                workers = input("How many concurrent workers? (default: 15, press Enter for default): ").strip()
                max_workers = int(workers) if workers.isdigit() else 15
                
                print(f"📡 Scraping {num_pages} pages with {max_workers} workers...")
                scraper = InsecamScraper(num_pages=num_pages, max_workers=max_workers)
                camera_data = scraper.scrape_cameras()
                if not camera_data:
                    logger.error("No camera data was scraped. Exiting.")
                    return
        else:
            # No existing data, scrape new with comprehensive settings
            print("📡 No existing camera data found. Starting comprehensive scraping...")
            pages = input("How many pages to scrape? (default: 500, press Enter for default): ").strip()
            num_pages = int(pages) if pages.isdigit() else 500
            
            workers = input("How many concurrent workers? (default: 15, press Enter for default): ").strip()
            max_workers = int(workers) if workers.isdigit() else 15
            
            print(f"🚀 Scraping {num_pages} pages with {max_workers} workers (this will take a while)...")
            scraper = InsecamScraper(num_pages=num_pages, max_workers=max_workers)
            camera_data = scraper.scrape_cameras()
            if not camera_data:
                logger.error("No camera data was scraped. Exiting.")
                return
        
        # Generate enhanced map
        map_generator = MapGenerator(camera_data)
        map_generator.create_enhanced_map('insecam_map.html')
        
        # Print summary
        print(f"\n🎉 Successfully completed!")
        print(f"📊 Using {len(camera_data)} cameras")
        print(f"🗺️  Enhanced map saved to 'insecam_map.html'")
        print(f"💾 Data available in 'camera_data.json'")
        
    except KeyboardInterrupt:
        logger.info("Process interrupted by user")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")

if __name__ == '__main__':
    main()