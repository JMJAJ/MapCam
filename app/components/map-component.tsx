'use client'

import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import 'leaflet.heat'
import { Maximize, Minimize } from 'lucide-react'

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

interface Camera {
  id: number
  latitude: number | null
  longitude: number | null
  country: string
  city: string
  region: string
  manufacturer: string | null
  image_url: string
  page_url: string
  status: string
  response_time: number
  last_check: string
}

interface MapComponentProps {
  cameras: Camera[]
  selectedCamera?: number | null
  mapLayer?: string
  showClustering?: boolean
  showHeatmap?: boolean
  showDayNight?: boolean
  onMapLayerChange?: (layer: string) => void
  onClusteringChange?: (enabled: boolean) => void
  onHeatmapChange?: (enabled: boolean) => void
  onDayNightChange?: (enabled: boolean) => void
}

// Cache for icons to avoid recreating them
const iconCache = new Map<string, L.DivIcon>()

// Solar terminator calculation functions
const getSolarDeclination = (dayOfYear: number): number => {
  return 23.45 * Math.sin((360 * (284 + dayOfYear) / 365) * Math.PI / 180)
}

const getHourAngle = (longitude: number, utcHours: number): number => {
  return 15 * (utcHours - 12) + longitude
}

// Efficient night polygons with manual wrapping
const createNightPolygons = (): L.Polygon[] => {
  const now = new Date()
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60
  const declination = getSolarDeclination(dayOfYear)

  const polygons: L.Polygon[] = []
  const terminatorPoints: L.LatLng[] = []

  // Calculate terminator line points (every 5 degrees for better performance)
  for (let lng = -180; lng <= 180; lng += 5) {
    const hourAngle = getHourAngle(lng, utcHours)

    // Calculate latitude where sun is at horizon
    const latRad = Math.atan(-Math.cos(hourAngle * Math.PI / 180) / Math.tan(declination * Math.PI / 180))
    let lat = latRad * 180 / Math.PI

    // Handle polar day/night
    if (isNaN(lat)) {
      lat = declination > 0 ? -90 : 90
    }

    // Clamp latitude to valid range
    lat = Math.max(-90, Math.min(90, lat))
    terminatorPoints.push(L.latLng(lat, lng))
  }

  // Create 3 copies of the night polygon for seamless wrapping (-360°, 0°, +360°)
  for (let offset = -1; offset <= 1; offset++) {
    const offsetPoints = terminatorPoints.map(point =>
      L.latLng(point.lat, point.lng + (offset * 360))
    )

    // Create night polygon
    const nightPoints: L.LatLng[] = [...offsetPoints]

    // Complete the polygon by adding polar regions
    const baseOffset = offset * 360
    if (declination > 0) {
      // Northern summer - add south pole
      nightPoints.push(L.latLng(-90, 180 + baseOffset))
      nightPoints.push(L.latLng(-90, -180 + baseOffset))
    } else {
      // Northern winter - add north pole  
      nightPoints.push(L.latLng(90, 180 + baseOffset))
      nightPoints.push(L.latLng(90, -180 + baseOffset))
    }

    const polygon = L.polygon(nightPoints, {
      color: 'transparent',
      fillColor: '#000033',
      fillOpacity: 0.4,
      weight: 0,
      interactive: false
    })

    polygons.push(polygon)
  }

  return polygons
}

// Create cached icon function
const getCachedIcon = (status: string): L.DivIcon => {
  if (iconCache.has(status)) {
    return iconCache.get(status)!
  }

  const markerColor = status === 'online' ? 'green' :
    status === 'offline' ? 'red' : 'gray'

  const icon = L.divIcon({
    className: 'custom-camera-marker',
    html: `<div style="
      width: 12px; 
      height: 12px; 
      background-color: ${markerColor}; 
      border: 1px solid white; 
      border-radius: 50%; 
      box-shadow: 0 1px 2px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  })

  iconCache.set(status, icon)
  return icon
}

export default function MapComponent({
  cameras,
  selectedCamera,
  mapLayer = 'street',
  showClustering = true,
  showHeatmap = false,
  showDayNight = false,
  onMapLayerChange,
  onClusteringChange,
  onHeatmapChange,
  onDayNightChange
}: MapComponentProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
  const heatLayerRef = useRef<L.HeatLayer | null>(null)
  const nightLayerRef = useRef<L.LayerGroup | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Memoize popup content creation to avoid recreating on every render
  const createPopupContent = useCallback((camera: Camera) => {
    const markerColor = camera.status === 'online' ? 'green' :
      camera.status === 'offline' ? 'red' : 'gray'

    // Handle null coordinates
    const coordinates = camera.latitude !== null && camera.longitude !== null
      ? `${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}`
      : 'Coordinates unavailable'

    return `
      <div style="font-family: Arial, sans-serif; max-width: 250px;">
        <h4 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 14px;">${camera.city}</h4>
        <div style="margin: 8px 0;">
          <img src="${camera.image_url}" 
               alt="Camera view" 
               style="width: 100%; max-width: 240px; height: auto; border-radius: 4px; cursor: pointer;"
               onclick="window.open('${camera.page_url}', '_blank')"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <div style="display: none; padding: 20px; background: #f5f5f5; border-radius: 4px; text-align: center; color: #666;">
            Image unavailable
          </div>
        </div>
        <p style="margin: 3px 0; font-size: 12px;"><b>Country:</b> ${camera.country}</p>
        <p style="margin: 3px 0; font-size: 12px;"><b>Status:</b> <span style="color: ${markerColor};">${camera.status}</span></p>
        <p style="margin: 3px 0; font-size: 11px;">${coordinates}</p>
        <a href="${camera.page_url}" target="_blank" style="color: #3498db; text-decoration: none; font-size: 12px;">🔗 View Full Page</a>
      </div>
    `
  }, [])

  // Memoize heat points to avoid recalculation
  const heatPoints = useMemo(() => {
    return cameras
      .filter(camera => camera.latitude !== null && camera.longitude !== null)
      .map(camera => {
        const intensity = camera.status === 'online' ? 1 : camera.status === 'offline' ? 0.5 : 0.3
        return [camera.latitude, camera.longitude, intensity] as [number, number, number]
      })
  }, [cameras])

  useEffect(() => {
    if (!mapContainerRef.current) return

    // Initialize map with world wrapping enabled
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        worldCopyJump: true, // Enable seamless world wrapping
        maxBounds: [[-95, -Infinity], [95, Infinity]], // Allow full latitude range for polar cameras
        maxBoundsViscosity: 0.5, // Resistance when trying to pan beyond vertical bounds
        minZoom: 1, // Prevent zooming out too far
        maxZoom: 18 // Set reasonable max zoom
      }).setView([20, 0], 2)
    }

    // Clear existing tile layers
    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        mapRef.current!.removeLayer(layer)
      }
    })

    // Add appropriate tile layer based on mapLayer prop
    let tileLayerUrl = ''
    let attribution = ''
    let maxZoom = 18

    switch (mapLayer) {
      case 'satellite':
        tileLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        attribution = '© Esri, Maxar, Earthstar Geographics'
        maxZoom = 19
        break
      case 'dark':
        tileLayerUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        attribution = '© OpenStreetMap contributors, © CARTO'
        break
      case 'google-earth':
        tileLayerUrl = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
        attribution = '© Google Earth'
        maxZoom = 20
        break
      case 'google-hybrid':
        tileLayerUrl = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
        attribution = '© Google Maps'
        maxZoom = 20
        break
      case 'google-terrain':
        tileLayerUrl = 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}'
        attribution = '© Google Maps'
        maxZoom = 16
        break
      case 'google-streets':
        tileLayerUrl = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
        attribution = '© Google Maps'
        maxZoom = 20
        break
      case 'esri-world-topo':
        tileLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
        attribution = '© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
        maxZoom = 19
        break
      case 'esri-world-street':
        tileLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
        attribution = '© Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
        maxZoom = 19
        break
      case 'esri-world-physical':
        tileLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}'
        attribution = '© Esri, US National Park Service'
        maxZoom = 8
        break
      case 'carto-light':
        tileLayerUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        attribution = '© OpenStreetMap contributors, © CARTO'
        break
      case 'carto-voyager':
        tileLayerUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
        attribution = '© OpenStreetMap contributors, © CARTO'
        break
      case 'opentopomap':
        tileLayerUrl = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
        attribution = '© OpenStreetMap contributors, © OpenTopoMap (CC-BY-SA)'
        maxZoom = 17
        break
      case 'stamen-terrain':
        tileLayerUrl = 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg'
        attribution = '© Stamen Design, © OpenStreetMap contributors'
        maxZoom = 16
        break
      case 'stamen-watercolor':
        tileLayerUrl = 'https://stamen-tiles-{s}.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg'
        attribution = '© Stamen Design, © OpenStreetMap contributors'
        maxZoom = 16
        break
      case 'wikimedia':
        tileLayerUrl = 'https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png'
        attribution = '© OpenStreetMap contributors, © Wikimedia maps'
        break
      case 'street':
      default:
        tileLayerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        attribution = '© OpenStreetMap contributors'
        break
    }

    L.tileLayer(tileLayerUrl, {
      attribution,
      maxZoom,
      subdomains: ['a', 'b', 'c']
    }).addTo(mapRef.current)

    // Update map max zoom
    mapRef.current.setMaxZoom(maxZoom)

    // Clear existing layers
    if (markersRef.current) {
      mapRef.current.removeLayer(markersRef.current)
      markersRef.current = null
    }
    if (clusterGroupRef.current) {
      mapRef.current.removeLayer(clusterGroupRef.current)
      clusterGroupRef.current = null
    }
    if (heatLayerRef.current) {
      mapRef.current.removeLayer(heatLayerRef.current)
      heatLayerRef.current = null
    }
    if (nightLayerRef.current) {
      mapRef.current.removeLayer(nightLayerRef.current)
      nightLayerRef.current = null
    }

    // Create markers array with efficient infinite wrapping
    const markers: L.Marker[] = []

    // Filter out cameras with null coordinates
    const validCameras = cameras.filter(camera =>
      camera.latitude !== null && camera.longitude !== null
    )

    validCameras.forEach((camera) => {
      const icon = getCachedIcon(camera.status)
      const popupContent = createPopupContent(camera)
      const markerColor = camera.status === 'online' ? 'green' :
        camera.status === 'offline' ? 'red' : 'gray'

      // Create 3 copies of each marker for seamless infinite scrolling (-360°, 0°, +360°)
      for (let offset = -1; offset <= 1; offset++) {
        const offsetLng = camera.longitude! + (offset * 360)
        const marker = L.marker([camera.latitude!, offsetLng], { icon })

        // Bind popup and open on single click
        marker.bindPopup(popupContent)
        marker.on('click', () => {
          marker.openPopup()
        })

        markers.push(marker)

        // Highlight selected camera (all copies)
        if (selectedCamera === camera.id) {
          marker.bindPopup(popupContent)
          marker.openPopup()

          // Add pulsing animation for selected camera
          const pulsingIcon = L.divIcon({
            className: 'custom-camera-marker pulsing-marker',
            html: `
              <div style="
                width: 12px; 
                height: 12px; 
                background-color: ${markerColor}; 
                border: 1px solid white; 
                border-radius: 50%; 
                box-shadow: 0 1px 2px rgba(0,0,0,0.3);
                animation: pulse 1s ease-in-out 3;
              "></div>
              <style>
                @keyframes pulse {
                  0% { transform: scale(1); opacity: 1; }
                  50% { transform: scale(1.8); opacity: 0.7; }
                  100% { transform: scale(1); opacity: 1; }
                }
              </style>
            `,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          })

          marker.setIcon(pulsingIcon)

          // Only set view for the original camera (offset 0)
          if (offset === 0) {
            mapRef.current?.setView([camera.latitude!, camera.longitude!], 10)
          }
        }
      }
    })

    // Add markers based on clustering preference (optimized thresholds)
    if (mapRef.current && markers.length > 0) {
      if (showClustering && validCameras.length > 50) { // Lower threshold for clustering
        // Use clustering for medium+ datasets with optimized settings
        clusterGroupRef.current = (L as any).markerClusterGroup({
          chunkedLoading: true,
          maxClusterRadius: 40, // Smaller radius for better performance
          spiderfyOnMaxZoom: false, // Disable spiderfy for performance
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          disableClusteringAtZoom: 12, // Disable clustering at high zoom for performance
          animate: false // Disable animations for better performance
        })

        try {
          markers.forEach(marker => clusterGroupRef.current!.addLayer(marker))
          mapRef.current.addLayer(clusterGroupRef.current!)
        } catch (error) {
          console.warn('Error adding cluster group:', error)
          // Fallback to regular layer group
          markersRef.current = L.layerGroup(markers)
          mapRef.current.addLayer(markersRef.current)
        }
      } else {
        // Use regular layer group for small datasets
        markersRef.current = L.layerGroup(markers)
        mapRef.current.addLayer(markersRef.current)
      }
    }

    // Add heatmap if enabled (using memoized heat points)
    if (mapRef.current && showHeatmap && heatPoints.length > 0) {
      try {
        heatLayerRef.current = (L as any).heatLayer(heatPoints, {
          radius: 20, // Reduced radius for better performance
          blur: 10,   // Reduced blur for better performance
          maxZoom: 15, // Lower max zoom to reduce calculations
          gradient: {
            0.0: 'blue',
            0.5: 'lime',
            0.7: 'yellow',
            1.0: 'red'
          }
        })
        mapRef.current.addLayer(heatLayerRef.current!)
      } catch (error) {
        console.warn('Error adding heatmap layer:', error)
      }
    }

    // Add day/night overlay if enabled (3 polygons for seamless wrapping)
    if (mapRef.current && showDayNight) {
      try {
        const nightPolygons = createNightPolygons()
        nightLayerRef.current = L.layerGroup(nightPolygons)
        mapRef.current.addLayer(nightLayerRef.current!)
      } catch (error) {
        console.warn('Failed to create day/night overlay:', error)
      }
    }

    // Fit map to show all cameras
    if (mapRef.current && validCameras.length > 0 && !selectedCamera && markers.length > 0) {
      try {
        const group = L.featureGroup(markers)
        if (group.getBounds().isValid()) {
          mapRef.current.fitBounds(group.getBounds().pad(0.1))
        }
      } catch (error) {
        console.warn('Error fitting bounds:', error)
      }
    }

    return () => {
      // Cleanup on unmount
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [cameras, selectedCamera, mapLayer, showClustering, showHeatmap, showDayNight])

  // Fullscreen functionality
  const toggleFullscreen = useCallback(() => {
    if (!fullscreenContainerRef.current) return

    if (!isFullscreen) {
      // Enter fullscreen
      if (fullscreenContainerRef.current.requestFullscreen) {
        fullscreenContainerRef.current.requestFullscreen()
      } else if ((fullscreenContainerRef.current as any).webkitRequestFullscreen) {
        (fullscreenContainerRef.current as any).webkitRequestFullscreen()
      } else if ((fullscreenContainerRef.current as any).msRequestFullscreen) {
        (fullscreenContainerRef.current as any).msRequestFullscreen()
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen()
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen()
      } else if ((document as any).msExitFullscreen) {
        (document as any).msExitFullscreen()
      }
    }
  }, [isFullscreen])

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      )
      setIsFullscreen(isCurrentlyFullscreen)

      // Invalidate map size when entering/exiting fullscreen
      if (mapRef.current) {
        setTimeout(() => {
          if (mapRef.current) {
            try {
              mapRef.current.invalidateSize()
            } catch (error) {
              console.warn('Error invalidating map size:', error)
            }
          }
        }, 200) // Increased delay to ensure DOM is ready
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('msfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('msfullscreenchange', handleFullscreenChange)
    }
  }, [])

  return (
    <div
      ref={fullscreenContainerRef}
      className={`relative w-full h-full ${isFullscreen ? 'bg-black' : ''}`}
    >
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Fullscreen Dashboard Controls */}
      {isFullscreen && (
        <div className="absolute top-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-sm rounded-lg p-4 shadow-lg border border-slate-700 max-w-sm">
          <div className="space-y-4">
            {/* Map Layer Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-white">Map Style</label>
              <select
                value={mapLayer}
                onChange={(e) => onMapLayerChange?.(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <optgroup label="Standard">
                  <option value="street">🗺️ OpenStreetMap</option>
                  <option value="dark">🌙 Dark Theme</option>
                  <option value="carto-light">☀️ CartoDB Light</option>
                  <option value="carto-voyager">🧭 CartoDB Voyager</option>
                </optgroup>
                <optgroup label="Google Maps">
                  <option value="google-earth">🌍 Google Earth</option>
                  <option value="google-hybrid">🛰️ Google Hybrid</option>
                  <option value="google-terrain">🏔️ Google Terrain</option>
                  <option value="google-streets">🛣️ Google Streets</option>
                </optgroup>
                <optgroup label="Satellite">
                  <option value="satellite">📡 Esri Satellite</option>
                  <option value="esri-world-topo">🗻 Esri Topographic</option>
                </optgroup>
              </select>
            </div>

            {/* Toggle Controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-white">Clustering</label>
                <button
                  onClick={() => onClusteringChange?.(!showClustering)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showClustering ? 'bg-blue-600' : 'bg-slate-600'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showClustering ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-white">Heatmap</label>
                <button
                  onClick={() => onHeatmapChange?.(!showHeatmap)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showHeatmap ? 'bg-red-600' : 'bg-slate-600'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showHeatmap ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-white">Day/Night</label>
                <button
                  onClick={() => onDayNightChange?.(!showDayNight)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showDayNight ? 'bg-purple-600' : 'bg-slate-600'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showDayNight ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Toggle Button */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-4 right-4 z-[1000] bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 p-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 transition-colors duration-200"
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? (
          <Minimize className="h-4 w-4" />
        ) : (
          <Maximize className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}