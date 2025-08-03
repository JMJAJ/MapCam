import requests
import json
import time
import logging
from typing import List, Dict, Optional
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
import ipaddress
from urllib.parse import urlparse
import re

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SmartCameraExpander:
    """Expand camera database by analyzing existing successful cameras."""
    
    def __init__(self, max_workers: int = 15):
        self.max_workers = max_workers
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        self.existing_cameras = []
        self.new_cameras = []
    
    def load_existing_cameras(self, filename: str = 'camera_data.json') -> List[Dict]:
        """Load existing camera data."""
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                cameras = json.load(f)
            logger.info(f"Loaded {len(cameras)} existing cameras")
            return cameras
        except Exception as e:
            logger.error(f"Error loading existing cameras: {e}")
            return []
    
    def analyze_camera_patterns(self, cameras: List[Dict]) -> Dict:
        """Analyze patterns in existing cameras."""
        patterns = {
            'ip_ranges': {},
            'url_patterns': {},
            'ports': {},
            'manufacturers': {},
            'countries': {}
        }
        
        for camera in cameras:
            try:
                url = camera.get('image_url', '')
                if not url:
                    continue
                
                parsed = urlparse(url)
                if not parsed.hostname:
                    continue
                
                # Analyze IP ranges
                ip = parsed.hostname
                try:
                    ip_obj = ipaddress.IPv4Address(ip)
                    # Get /24 subnet
                    subnet = str(ipaddress.IPv4Network(f"{ip}/24", strict=False).network_address)
                    patterns['ip_ranges'][subnet] = patterns['ip_ranges'].get(subnet, 0) + 1
                except:
                    pass
                
                # Analyze URL patterns
                path = parsed.path
                if path:
                    patterns['url_patterns'][path] = patterns['url_patterns'].get(path, 0) + 1
                
                # Analyze ports
                port = parsed.port or 80
                patterns['ports'][port] = patterns['ports'].get(port, 0) + 1
                
                # Analyze manufacturers
                manufacturer = camera.get('manufacturer', 'Unknown')
                patterns['manufacturers'][manufacturer] = patterns['manufacturers'].get(manufacturer, 0) + 1
                
                # Analyze countries
                country = camera.get('country', 'Unknown')
                patterns['countries'][country] = patterns['countries'].get(country, 0) + 1
                
            except Exception as e:
                continue
        
        return patterns
    
    def generate_similar_urls(self, base_camera: Dict, variations: int = 20) -> List[str]:
        """Generate similar URLs based on a successful camera."""
        urls = []
        
        try:
            base_url = base_camera.get('image_url', '')
            if not base_url:
                return []
            
            parsed = urlparse(base_url)
            if not parsed.hostname:
                return []
            
            base_ip = parsed.hostname
            base_port = parsed.port or 80
            base_path = parsed.path
            
            # Generate IP variations in same subnet
            try:
                ip_obj = ipaddress.IPv4Address(base_ip)
                network = ipaddress.IPv4Network(f"{base_ip}/24", strict=False)
                
                # Try nearby IPs in same subnet
                for _ in range(variations):
                    random_ip = str(network.network_address + random.randint(1, 254))
                    if random_ip != base_ip:
                        new_url = f"http://{random_ip}:{base_port}{base_path}"
                        urls.append(new_url)
                        
                        # Also try common port variations
                        if base_port == 80:
                            for alt_port in [8080, 8081, 8888]:
                                alt_url = f"http://{random_ip}:{alt_port}{base_path}"
                                urls.append(alt_url)
            except:
                pass
            
            # Generate path variations for same IP
            if base_path:
                path_variations = self.generate_path_variations(base_path)
                for path_var in path_variations[:10]:  # Limit variations
                    var_url = f"http://{base_ip}:{base_port}{path_var}"
                    urls.append(var_url)
        
        except Exception as e:
            logger.error(f"Error generating variations for {base_camera}: {e}")
        
        return list(set(urls))  # Remove duplicates
    
    def generate_path_variations(self, base_path: str) -> List[str]:
        """Generate path variations based on common patterns."""
        variations = []
        
        # Common parameter variations
        if 'Resolution=' in base_path:
            variations.extend([
                base_path.replace('Resolution=640x480', 'Resolution=320x240'),
                base_path.replace('Resolution=640x480', 'Resolution=800x600'),
                base_path.replace('Resolution=640x480', 'Resolution=1024x768'),
            ])
        
        if 'Quality=' in base_path:
            variations.extend([
                base_path.replace('Quality=Clarity', 'Quality=Standard'),
                base_path.replace('Quality=Standard', 'Quality=Clarity'),
            ])
        
        if 'resolution=' in base_path:
            variations.extend([
                base_path.replace('resolution=640', 'resolution=320'),
                base_path.replace('resolution=640', 'resolution=800'),
            ])
        
        # Camera number variations
        if 'cam_1' in base_path:
            for i in range(2, 6):
                variations.append(base_path.replace('cam_1', f'cam_{i}'))
        
        # Channel variations
        if 'channel=1' in base_path:
            for i in range(2, 5):
                variations.append(base_path.replace('channel=1', f'channel={i}'))
        
        # Counter variations
        if 'COUNTER' in base_path:
            variations.extend([
                base_path.replace('COUNTER', str(random.randint(1000, 9999))),
                base_path.replace('COUNTER', ''),
            ])
        
        return variations
    
    def test_camera_url(self, url: str) -> Optional[Dict]:
        """Test if a URL serves camera content."""
        try:
            response = self.session.get(url, timeout=8, stream=True)
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '').lower()
                
                # Check if it's camera content
                if any(media_type in content_type for media_type in 
                       ['image/', 'video/', 'multipart/x-mixed-replace']):
                    
                    # Get geolocation
                    parsed = urlparse(url)
                    ip = parsed.hostname
                    
                    geo_info = self.get_ip_geolocation(ip)
                    if geo_info:
                        manufacturer = self.detect_manufacturer(url)
                        
                        camera_info = {
                            "latitude": geo_info.get('lat', 0),
                            "longitude": geo_info.get('lon', 0),
                            "country": geo_info.get('country', 'Unknown'),
                            "city": geo_info.get('city', 'Unknown'),
                            "region": geo_info.get('region', 'Unknown'),
                            "manufacturer": manufacturer,
                            "image_url": url,
                            "page_url": f"http://{ip}:{parsed.port or 80}",
                            "source": "smart_expansion",
                            "ip_address": ip
                        }
                        
                        return camera_info
                        
        except Exception:
            pass
        
        return None
    
    def get_ip_geolocation(self, ip_address: str) -> Optional[Dict]:
        """Get geolocation for IP address."""
        try:
            # Use ipapi.co first
            response = self.session.get(f"https://ipapi.co/{ip_address}/json/", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if not data.get('error'):
                    return {
                        'lat': data.get('latitude'),
                        'lon': data.get('longitude'),
                        'country': data.get('country_name'),
                        'city': data.get('city'),
                        'region': data.get('region'),
                    }
            
            time.sleep(0.1)
            
            # Fallback to ip-api.com
            response = self.session.get(f"http://ip-api.com/json/{ip_address}", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'success':
                    return {
                        'lat': data.get('lat'),
                        'lon': data.get('lon'),
                        'country': data.get('country'),
                        'city': data.get('city'),
                        'region': data.get('regionName'),
                    }
            
            time.sleep(0.1)
            
        except Exception:
            pass
        
        return None
    
    def detect_manufacturer(self, url: str) -> str:
        """Detect manufacturer from URL."""
        url_lower = url.lower()
        
        if 'axis' in url_lower or 'mjpg/video' in url_lower:
            return 'Axis'
        elif 'snapshotjpeg' in url_lower or 'cgi-bin/camera' in url_lower:
            return 'Panasonic'
        elif 'getoneshot' in url_lower:
            return 'Canon'
        elif 'oneshotimage' in url_lower:
            return 'Sony'
        elif 'cam_' in url_lower and '.cgi' in url_lower:
            return 'WebcamXP'
        elif 'tmpfs/auto.jpg' in url_lower:
            return 'FDT'
        else:
            return 'Unknown'
    
    def expand_camera_database(self, target_new_cameras: int = 500) -> List[Dict]:
        """Main method to expand camera database."""
        logger.info(f"Starting smart camera expansion (target: {target_new_cameras} new cameras)...")
        
        # Load existing cameras
        self.existing_cameras = self.load_existing_cameras()
        if not self.existing_cameras:
            logger.error("No existing cameras found!")
            return []
        
        # Analyze patterns
        logger.info("Analyzing existing camera patterns...")
        patterns = self.analyze_camera_patterns(self.existing_cameras)
        
        # Show analysis
        logger.info(f"Found {len(patterns['ip_ranges'])} unique IP subnets")
        logger.info(f"Found {len(patterns['url_patterns'])} unique URL patterns")
        logger.info(f"Most common ports: {sorted(patterns['ports'].items(), key=lambda x: x[1], reverse=True)[:5]}")
        
        # Generate test URLs based on successful cameras
        logger.info("Generating test URLs based on successful cameras...")
        
        test_urls = []
        
        # Use top cameras from each country/manufacturer
        cameras_by_country = {}
        for camera in self.existing_cameras:
            country = camera.get('country', 'Unknown')
            if country not in cameras_by_country:
                cameras_by_country[country] = []
            cameras_by_country[country].append(camera)
        
        # Generate variations for representative cameras
        for country, country_cameras in cameras_by_country.items():
            # Take up to 5 cameras per country
            sample_cameras = country_cameras[:5]
            
            for camera in sample_cameras:
                variations = self.generate_similar_urls(camera, 15)
                test_urls.extend(variations)
                
                if len(test_urls) > target_new_cameras * 3:  # Don't generate too many
                    break
        
        # Remove duplicates and existing URLs
        existing_urls = set(camera.get('image_url', '') for camera in self.existing_cameras)
        test_urls = [url for url in set(test_urls) if url not in existing_urls]
        
        logger.info(f"Generated {len(test_urls)} test URLs to check")
        
        # Test URLs concurrently
        new_cameras = []
        tested_count = 0
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_url = {
                executor.submit(self.test_camera_url, url): url 
                for url in test_urls[:target_new_cameras * 2]  # Limit tests
            }
            
            for future in as_completed(future_to_url):
                url = future_to_url[future]
                tested_count += 1
                
                try:
                    result = future.result()
                    if result:
                        new_cameras.append(result)
                        logger.info(f"✅ Found new camera: {result['city']}, {result['country']} - {result['manufacturer']}")
                        
                        if len(new_cameras) >= target_new_cameras:
                            logger.info(f"Reached target of {target_new_cameras} cameras!")
                            break
                    
                    # Progress update
                    if tested_count % 50 == 0:
                        success_rate = (len(new_cameras) / tested_count) * 100
                        logger.info(f"Progress: {tested_count} tested, {len(new_cameras)} found ({success_rate:.1f}% success)")
                
                except Exception as e:
                    pass
        
        logger.info(f"Smart expansion completed: {len(new_cameras)} new cameras found")
        
        # Save results
        if new_cameras:
            with open('smart_expansion_cameras.json', 'w', encoding='utf-8') as f:
                json.dump(new_cameras, f, indent=2, ensure_ascii=False)
            
            # Merge with existing data
            all_cameras = self.existing_cameras + new_cameras
            with open('expanded_camera_data.json', 'w', encoding='utf-8') as f:
                json.dump(all_cameras, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Results saved to smart_expansion_cameras.json")
            logger.info(f"Combined dataset saved to expanded_camera_data.json ({len(all_cameras)} total cameras)")
        
        return new_cameras

def main():
    """Main execution function."""
    try:
        print("🧠 Smart Camera Database Expander")
        print("=" * 50)
        print("This tool analyzes your existing 2,465 cameras to find similar ones")
        print("by testing nearby IPs and URL variations.")
        print()
        
        # Get user preferences
        target = input("How many new cameras to find? (default: 300): ").strip()
        target_cameras = int(target) if target.isdigit() else 300
        
        workers = input("How many concurrent workers? (default: 15): ").strip()
        max_workers = int(workers) if workers.isdigit() else 15
        
        print(f"\n🚀 Starting smart expansion...")
        print(f"   Target: {target_cameras} new cameras")
        print(f"   Workers: {max_workers}")
        print("⚠️  This should take 10-20 minutes and has higher success rate")
        
        # Initialize expander
        expander = SmartCameraExpander(max_workers=max_workers)
        
        # Expand database
        new_cameras = expander.expand_camera_database(target_cameras)
        
        if new_cameras:
            print(f"\n✅ Successfully found {len(new_cameras)} new cameras!")
            print(f"💾 New cameras saved to 'smart_expansion_cameras.json'")
            print(f"💾 Combined dataset saved to 'expanded_camera_data.json'")
            
            # Show statistics
            countries = set(camera['country'] for camera in new_cameras)
            manufacturers = set(camera['manufacturer'] for camera in new_cameras)
            
            print(f"\n📈 New Cameras Statistics:")
            print(f"   New cameras: {len(new_cameras)}")
            print(f"   Countries: {len(countries)}")
            print(f"   Manufacturers: {len(manufacturers)}")
            print(f"   Total cameras now: {2465 + len(new_cameras)}")
            
            # Update your web app
            print(f"\n🔄 To use in your web app:")
            print(f"   1. Copy 'expanded_camera_data.json' to 'camera_data.json'")
            print(f"   2. Restart your Next.js app")
            print(f"   3. You'll now have {2465 + len(new_cameras)} cameras!")
            
        else:
            print("❌ No new cameras found. This could be due to:")
            print("   - Network restrictions")
            print("   - All similar cameras already discovered")
            print("   - Temporary connectivity issues")
            
    except KeyboardInterrupt:
        logger.info("Process interrupted by user")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")

if __name__ == '__main__':
    main()