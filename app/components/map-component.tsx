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
  latitude: number
  longitude: number
  country: string
  city: string
  region: string
  manufacturer: string
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
  showDayNight = false
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

    return `
      <div style="font-family: Arial, sans-serif; max-width: 200px;">
        <h4 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 14px;">${camera.city}</h4>
        <p style="margin: 3px 0; font-size: 12px;"><b>Country:</b> ${camera.country}</p>
        <p style="margin: 3px 0; font-size: 12px;"><b>Status:</b> <span style="color: ${markerColor};">${camera.status}</span></p>
        <p style="margin: 3px 0; font-size: 11px;">${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}</p>
        <a href="${camera.page_url}" target="_blank" style="color: #3498db; text-decoration: none; font-size: 12px;">🔗 View Camera</a>
      </div>
    `
  }, [])

  // Memoize heat points to avoid recalculation
  const heatPoints = useMemo(() => {
    return cameras.map(camera => {
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

    switch (mapLayer) {
      case 'satellite':
        tileLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        attribution = '© Esri, Maxar, Earthstar Geographics'
        break
      case 'dark':
        tileLayerUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        attribution = '© OpenStreetMap contributors, © CARTO'
        break
      case 'earth':
        tileLayerUrl = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
        attribution = '© Google Earth'
        break
      case 'street':
      default:
        tileLayerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
        attribution = '© OpenStreetMap contributors'
        break
    }

    L.tileLayer(tileLayerUrl, { attribution }).addTo(mapRef.current)

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

    cameras.forEach((camera) => {
      const icon = getCachedIcon(camera.status)
      const popupContent = createPopupContent(camera)

      // Create 3 copies of each marker for seamless infinite scrolling (-360°, 0°, +360°)
      for (let offset = -1; offset <= 1; offset++) {
        const offsetLng = camera.longitude + (offset * 360)
        const marker = L.marker([camera.latitude, offsetLng], { icon })

        // Lazy popup binding - only bind when needed
        marker.on('click', () => {
          if (!marker.getPopup()) {
            marker.bindPopup(popupContent)
          }
        })

        markers.push(marker)

        // Highlight selected camera (all copies)
        if (selectedCamera === camera.id) {
          marker.bindPopup(popupContent)
          marker.openPopup()
          // Only set view for the original camera (offset 0)
          if (offset === 0) {
            mapRef.current?.setView([camera.latitude, camera.longitude], 10)
          }
        }
      }
    })

    // Add markers based on clustering preference (optimized thresholds)
    if (showClustering && cameras.length > 50) { // Lower threshold for clustering
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

      markers.forEach(marker => clusterGroupRef.current!.addLayer(marker))
      mapRef.current.addLayer(clusterGroupRef.current!)
    } else {
      // Use regular layer group for small datasets
      markersRef.current = L.layerGroup(markers)
      mapRef.current.addLayer(markersRef.current)
    }

    // Add heatmap if enabled (using memoized heat points)
    if (showHeatmap && heatPoints.length > 0) {
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
    }

    // Add day/night overlay if enabled (3 polygons for seamless wrapping)
    if (showDayNight) {
      try {
        const nightPolygons = createNightPolygons()
        nightLayerRef.current = L.layerGroup(nightPolygons)
        mapRef.current.addLayer(nightLayerRef.current!)
      } catch (error) {
        console.warn('Failed to create day/night overlay:', error)
      }
    }

    // Fit map to show all cameras
    if (cameras.length > 0 && !selectedCamera) {
      const group = L.featureGroup(markers)
      if (group.getBounds().isValid()) {
        mapRef.current.fitBounds(group.getBounds().pad(0.1))
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
          mapRef.current?.invalidateSize()
        }, 100)
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