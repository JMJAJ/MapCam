'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import 'leaflet.heat'

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
}

export default function MapComponent({
  cameras,
  selectedCamera,
  mapLayer = 'street',
  showClustering = true,
  showHeatmap = false
}: MapComponentProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
  const heatLayerRef = useRef<L.HeatLayer | null>(null)

  useEffect(() => {
    if (!mapContainerRef.current) return

    // Initialize map
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([20, 0], 2)
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

    // Create markers array
    const markers: L.Marker[] = []
    const heatPoints: [number, number, number][] = []

    cameras.forEach((camera) => {
      const markerColor = camera.status === 'online' ? 'green' :
        camera.status === 'offline' ? 'red' : 'gray'

      // Create custom icon based on status
      const icon = L.divIcon({
        className: 'custom-camera-marker',
        html: `<div style="
          width: 16px; 
          height: 16px; 
          background-color: ${markerColor}; 
          border: 2px solid white; 
          border-radius: 50%; 
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })

      const marker = L.marker([camera.latitude, camera.longitude], { icon })

      // Create popup content
      const popupContent = `
        <div style="font-family: Arial, sans-serif; max-width: 250px;">
          <h4 style="margin: 0 0 10px 0; color: #2c3e50;">${camera.city}</h4>
          <p style="margin: 5px 0;"><b>Country:</b> ${camera.country}</p>
          <p style="margin: 5px 0;"><b>Region:</b> ${camera.region}</p>
          <p style="margin: 5px 0;"><b>Manufacturer:</b> ${camera.manufacturer}</p>
          <p style="margin: 5px 0;"><b>Status:</b> <span style="color: ${markerColor};">${camera.status}</span></p>
          <p style="margin: 5px 0;"><b>Coordinates:</b> ${camera.latitude.toFixed(4)}, ${camera.longitude.toFixed(4)}</p>
          <a href="${camera.page_url}" target="_blank" style="color: #3498db; text-decoration: none;">🔗 View Camera Page</a>
          ${camera.image_url && camera.image_url !== 'N/A' ? `<br><img src="/api/camera-proxy?url=${encodeURIComponent(camera.image_url)}" width="200" style="border-radius: 5px; margin-top: 10px;" onerror="this.style.display='none'">` : ''}
        </div>
      `

      marker.bindPopup(popupContent)
      markers.push(marker)

      // Add to heatmap data (with intensity based on status)
      const intensity = camera.status === 'online' ? 1 : camera.status === 'offline' ? 0.5 : 0.3
      heatPoints.push([camera.latitude, camera.longitude, intensity])

      // Highlight selected camera
      if (selectedCamera === camera.id) {
        marker.openPopup()
        mapRef.current?.setView([camera.latitude, camera.longitude], 10)
      }
    })

    // Add markers based on clustering preference
    if (showClustering && cameras.length > 100) {
      // Use clustering for large datasets
      clusterGroupRef.current = (L as any).markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
      })

      markers.forEach(marker => clusterGroupRef.current!.addLayer(marker))
      mapRef.current.addLayer(clusterGroupRef.current!)
    } else {
      // Use regular layer group
      markersRef.current = L.layerGroup(markers)
      mapRef.current.addLayer(markersRef.current)
    }

    // Add heatmap if enabled
    if (showHeatmap && heatPoints.length > 0) {
      heatLayerRef.current = (L as any).heatLayer(heatPoints, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        gradient: {
          0.0: 'blue',
          0.5: 'lime',
          0.7: 'yellow',
          1.0: 'red'
        }
      })
      mapRef.current.addLayer(heatLayerRef.current!)
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
  }, [cameras, selectedCamera, mapLayer, showClustering, showHeatmap])

  return <div ref={mapContainerRef} className="w-full h-full" />
}