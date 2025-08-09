"use client"

import { useState, useEffect } from "react"
import Cookies from 'js-cookie'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Video,
  Globe,
  Search,
  MapPin,
  Heart,
  X,
  Filter,
  Activity,
  Wifi,
  Play,
  Settings,
  BarChart3,
  Download,
  RefreshCw,
  TrendingUp,
  Database,
  Info,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Trash2,
  Map,
  Layers,
} from "lucide-react"
import dynamic from "next/dynamic"

// Dynamically import map component to avoid SSR issues
const MapComponent = dynamic(() => import("./components/map-component"), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-gradient-to-br from-slate-900 via-red-950/30 to-slate-900 animate-pulse rounded-xl flex items-center justify-center relative overflow-hidden border border-red-500/20">
      <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 via-transparent to-red-500/5 animate-pulse" />
      <div className="text-center space-y-4 z-10">
        <div className="relative">
          <Video className="h-12 w-12 mx-auto text-red-400 animate-bounce" />
          <div className="absolute -inset-2 bg-red-500/20 rounded-full animate-ping" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium bg-gradient-to-r from-red-400 to-red-500 bg-clip-text text-transparent">
            Loading Map...
          </p>
          <div className="flex items-center justify-center space-x-1">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce" />
            <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce animation-delay-100" />
            <div className="w-1.5 h-1.5 bg-red-300 rounded-full animate-bounce animation-delay-200" />
          </div>
        </div>
      </div>
    </div>
  ),
})

// Cookie utilities
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

const setCookie = (name: string, value: string, days: number = 30) => {
  if (typeof document === 'undefined') return
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${value}; expires=${expires}; path=/`
}

export default function CameraMonitoringDashboard() {
  const [cameras, setCameras] = useState<any[]>([])
  const [filteredCameras, setFilteredCameras] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCountry, setSelectedCountry] = useState("all")
  const [selectedManufacturer, setSelectedManufacturer] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(12)
  const [selectedCamera, setSelectedCamera] = useState<number | null>(null)
  const [mapLayer, setMapLayer] = useState("dark")
  const [showClustering, setShowClustering] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showDayNight, setShowDayNight] = useState(false)
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [cookiesLoaded, setCookiesLoaded] = useState(false)
  const [activeView, setActiveView] = useState<"dashboard" | "cameras" | "analytics" | "settings">("dashboard")
  const [currentTime, setCurrentTime] = useState(new Date())

  // Advanced filters
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedRegion, setSelectedRegion] = useState("all")
  const [selectedCity, setSelectedCity] = useState("all")
  const [sortBy, setSortBy] = useState("name")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [responseTimeFilter, setResponseTimeFilter] = useState("all")

  // Settings
  const [showSettingsPanel, setShowSettingsPanel] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [notifications, setNotifications] = useState(true)
  const [compactMode, setCompactMode] = useState(false)
  const [showTooltips, setShowTooltips] = useState(true)

  // Settings cookie management
  const saveSettingsToCookies = () => {
    const settings = {
      autoRefresh,
      refreshInterval,
      notifications,
      compactMode,
      showTooltips,
      mapLayer,
      showClustering,
      showDayNight
    }
    Cookies.set('camera-settings', JSON.stringify(settings), { expires: 365 })
  }

  const loadSettingsFromCookies = () => {
    const savedSettings = Cookies.get('camera-settings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        setAutoRefresh(settings.autoRefresh ?? false)
        setRefreshInterval(settings.refreshInterval ?? 30)
        setNotifications(settings.notifications ?? true)
        setCompactMode(settings.compactMode ?? false)
        setShowTooltips(settings.showTooltips ?? true)
        setMapLayer(settings.mapLayer ?? "dark")
        setShowClustering(settings.showClustering ?? true)
        setShowDayNight(settings.showDayNight ?? false)
      } catch (error) {
        console.error('Error loading settings from cookies:', error)
      }
    }
  }

  // Analytics
  const [selectedTimeframe, setSelectedTimeframe] = useState("24h")
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Load preferences from cookies on mount
  useEffect(() => {
    const savedFavorites = getCookie('camera-favorites')
    const savedMapLayer = getCookie('camera-maplayer')

    if (savedFavorites && savedFavorites !== 'undefined' && savedFavorites !== '[]') {
      try {
        const favIds = JSON.parse(savedFavorites)
        if (Array.isArray(favIds) && favIds.length > 0) {
          setFavorites(new Set(favIds))
        }
      } catch (e) {
        console.warn('Failed to parse favorites from cookie:', e)
      }
    }

    if (savedMapLayer) {
      setMapLayer(savedMapLayer)
    }

    // Load general settings
    loadSettingsFromCookies()

    setCookiesLoaded(true)
  }, [])

  // Save preferences to cookies when they change
  useEffect(() => {
    if (cookiesLoaded) {
      const favoritesArray = [...favorites]
      setCookie('camera-favorites', JSON.stringify(favoritesArray))
    }
  }, [favorites, cookiesLoaded])

  // Save settings to cookies when they change
  useEffect(() => {
    if (cookiesLoaded) {
      saveSettingsToCookies()
    }
  }, [autoRefresh, refreshInterval, notifications, compactMode, showTooltips, mapLayer, showClustering, showDayNight, cookiesLoaded])

  useEffect(() => {
    setCookie('camera-maplayer', mapLayer)
  }, [mapLayer])

  // Fetch camera data on component mount
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const response = await fetch('/api/cameras')
        if (!response.ok) {
          throw new Error('Failed to fetch cameras')
        }
        const data = await response.json()
        setCameras(data)
        setFilteredCameras(data)
      } catch (error) {
        console.error('Error fetching cameras:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchCameras()
  }, [])

  // Get unique values for filters
  const countries = [...new Set(cameras.map((c) => c.country))].sort()
  
  // Calculate manufacturer counts once for efficiency
  const manufacturerCounts = cameras.reduce((acc, camera) => {
    acc[camera.manufacturer] = (acc[camera.manufacturer] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  
  const manufacturers = Object.keys(manufacturerCounts)
    .sort((a, b) => manufacturerCounts[b] - manufacturerCounts[a])
  
  const regions = [...new Set(cameras.map((c) => c.region))].sort()
  const cities = [...new Set(cameras.map((c) => c.city))].sort()

  // Enhanced filtering with all filters
  useEffect(() => {
    let filtered = cameras

    if (showFavoritesOnly) {
      filtered = filtered.filter((c) => favorites.has(c.id))
    }

    if (selectedCountry !== "all") {
      filtered = filtered.filter((c) => c.country === selectedCountry)
    }

    if (selectedManufacturer !== "all") {
      filtered = filtered.filter((c) => c.manufacturer === selectedManufacturer)
    }

    if (selectedStatus !== "all") {
      filtered = filtered.filter((c) => c.status === selectedStatus)
    }

    if (selectedRegion !== "all") {
      filtered = filtered.filter((c) => c.region === selectedRegion)
    }

    if (selectedCity !== "all") {
      filtered = filtered.filter((c) => c.city === selectedCity)
    }

    if (responseTimeFilter !== "all") {
      filtered = filtered.filter((c) => {
        if (responseTimeFilter === "fast") return c.response_time < 1000
        if (responseTimeFilter === "medium") return c.response_time >= 1000 && c.response_time < 3000
        if (responseTimeFilter === "slow") return c.response_time >= 3000
        return true
      })
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter((c) =>
        c.city.toLowerCase().includes(term) ||
        c.country.toLowerCase().includes(term) ||
        c.region.toLowerCase().includes(term) ||
        (c.manufacturer && c.manufacturer.toLowerCase().includes(term))
      )
    }

    // Sorting
    filtered.sort((a, b) => {
      let aValue, bValue
      switch (sortBy) {
        case "name":
          aValue = `${a.city}, ${a.country}`
          bValue = `${b.city}, ${b.country}`
          break
        case "status":
          aValue = a.status
          bValue = b.status
          break
        case "country":
          aValue = a.country
          bValue = b.country
          break
        case "manufacturer":
          aValue = a.manufacturer
          bValue = b.manufacturer
          break
        case "response_time":
          aValue = a.response_time
          bValue = b.response_time
          break
        default:
          aValue = a.id
          bValue = b.id
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortOrder === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      }
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue
    })

    setFilteredCameras(filtered)
  }, [
    selectedCountry, selectedManufacturer, selectedStatus, selectedRegion, selectedCity,
    responseTimeFilter, searchTerm, cameras, favorites, showFavoritesOnly, sortBy, sortOrder
  ])

  // Reset page only when actual filter criteria change (not individual favorites)
  useEffect(() => {
    setCurrentPage(1)
  }, [
    selectedCountry, selectedManufacturer, selectedStatus, selectedRegion, selectedCity,
    responseTimeFilter, searchTerm, showFavoritesOnly, sortBy, sortOrder
  ])

  // Statistics
  const stats = {
    totalCameras: cameras.length,
    countries: countries.length,
    cities: [...new Set(cameras.map((c) => c.city))].length,
    manufacturers: manufacturers.length,
    onlineCameras: cameras.filter((c) => c.status === "online").length,
    offlineCameras: cameras.filter((c) => c.status === "offline").length,
    unknownCameras: cameras.filter((c) => c.status === "unknown").length,
  }

  // Pagination
  const totalPages = Math.ceil(filteredCameras.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedCameras = filteredCameras.slice(startIndex, startIndex + itemsPerPage)

  // Favorites functions
  const toggleFavorite = (cameraId: number) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev)
      if (newFavorites.has(cameraId)) {
        newFavorites.delete(cameraId)
      } else {
        newFavorites.add(cameraId)
      }
      return newFavorites
    })
  }

  const clearAllFilters = () => {
    setSelectedCountry("all")
    setSelectedManufacturer("all")
    setSelectedStatus("all")
    setSelectedRegion("all")
    setSelectedCity("all")
    setResponseTimeFilter("all")
    setSearchTerm("")
    setShowFavoritesOnly(false)
    setSortBy("name")
    setSortOrder("asc")
  }

  // Auto refresh functionality
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      const fetchCameras = async () => {
        try {
          const response = await fetch('/api/cameras')
          if (response.ok) {
            const data = await response.json()
            setCameras(data)
          }
        } catch (error) {
          console.error('Auto refresh failed:', error)
        }
      }
      fetchCameras()
    }, refreshInterval * 1000)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval])

  // Export functionality
  const exportData = (format: 'json' | 'csv') => {
    const dataToExport = filteredCameras.map(camera => ({
      id: camera.id,
      city: camera.city,
      country: camera.country,
      region: camera.region,
      manufacturer: camera.manufacturer,
      status: camera.status,
      response_time: camera.response_time,
      last_check: camera.last_check,
      latitude: camera.latitude,
      longitude: camera.longitude
    }))

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cameras-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } else if (format === 'csv') {
      const headers = Object.keys(dataToExport[0] || {}).join(',')
      const rows = dataToExport.map(row => Object.values(row).join(','))
      const csv = [headers, ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cameras-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }
  const handleCameraSelect = (cameraId: number) => {
    setSelectedCamera(cameraId)
    setActiveView("dashboard")
  }

  const handleCameraView = (camera: any) => {
    if (camera.page_url) {
      window.open(camera.page_url, '_blank')
    } else {
      alert(`Camera Details:\nLocation: ${camera.city}, ${camera.country}\nManufacturer: ${camera.manufacturer}\nStatus: ${camera.status}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-red-950/20 via-slate-950 to-red-950/20" />
          <div className="absolute top-0 left-0 w-full h-full opacity-30">
            {[...Array(30)].map((_, i) => (
              <div
                key={i}
                className="absolute w-0.5 h-0.5 bg-red-400/40 rounded-full animate-pulse"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${2 + Math.random() * 3}s`
                }}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center space-y-8">
            <div className="relative">
              <div className="absolute -inset-6 bg-gradient-to-r from-red-500/20 via-red-600/20 to-red-500/20 rounded-full animate-spin-slow" />
              <div className="absolute -inset-3 bg-red-500/10 rounded-full animate-ping" />
              <Video className="h-16 w-16 mx-auto text-red-400 animate-pulse relative z-10" />
            </div>
            <div className="space-y-4">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent">
                Loading MapCam
              </h2>
              <p className="text-red-300/60 text-sm">
                Connecting to surveillance network...
              </p>
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce animation-delay-100" />
                <div className="w-2 h-2 bg-red-300 rounded-full animate-bounce animation-delay-200" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-slate-900/95 backdrop-blur-xl z-40">
        <div className="p-6">
          {/* Logo */}
          <div className="flex items-center space-x-3 mb-8">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-red-500 to-red-600 rounded-lg blur opacity-75" />
              <div className="relative p-2 bg-gradient-to-br from-red-500 to-red-600 rounded-lg">
                <Video className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-red-400 to-red-500 bg-clip-text text-transparent">
                MapCam
              </h1>
              <p className="text-xs text-slate-400">Surveillance Network</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-2">
            <Button
              variant={activeView === "dashboard" ? "default" : "ghost"}
              className={`w-full justify-start ${activeView === "dashboard"
                ? "bg-gradient-to-r from-red-500 to-red-600 text-white"
                : "hover:bg-red-500/10 text-slate-300"
                }`}
              onClick={() => setActiveView("dashboard")}
            >
              <BarChart3 className="h-4 w-4 mr-3" />
              Dashboard
            </Button>
            <Button
              variant={activeView === "cameras" ? "default" : "ghost"}
              className={`w-full justify-start ${activeView === "cameras"
                ? "bg-gradient-to-r from-red-500 to-red-600 text-white"
                : "hover:bg-red-500/10 text-slate-300"
                }`}
              onClick={() => setActiveView("cameras")}
            >
              <Video className="h-4 w-4 mr-3" />
              Cameras
            </Button>
            <Button
              variant={activeView === "analytics" ? "default" : "ghost"}
              className={`w-full justify-start ${activeView === "analytics"
                ? "bg-gradient-to-r from-red-500 to-red-600 text-white"
                : "hover:bg-red-500/10 text-slate-300"
                }`}
              onClick={() => setActiveView("analytics")}
            >
              <TrendingUp className="h-4 w-4 mr-3" />
              Analytics
            </Button>
            <Button
              variant={activeView === "settings" ? "default" : "ghost"}
              className={`w-full justify-start ${activeView === "settings"
                ? "bg-gradient-to-r from-red-500 to-red-600 text-white"
                : "hover:bg-red-500/10 text-slate-300"
                }`}
              onClick={() => setActiveView("settings")}
            >
              <Settings className="h-4 w-4 mr-3" />
              Settings
            </Button>
          </nav>
          {/* Stats */}
          <div className="mt-8 space-y-4">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Network Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Total Nodes</span>
                <span className="text-sm font-mono text-red-400">{stats.totalCameras}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Online</span>
                <span className="text-sm font-mono text-green-400">{stats.onlineCameras}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Offline</span>
                <span className="text-sm font-mono text-red-400">{stats.offlineCameras}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Regions</span>
                <span className="text-sm font-mono text-blue-400">{stats.countries}</span>
              </div>
            </div>
          </div>

          {/* Live indicator */}
          <div className="mt-8 flex items-center space-x-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs font-mono text-red-300">LIVE</span>
            <span className="text-xs font-mono text-slate-400 ml-auto">
              {currentTime.toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64 min-h-screen">
        {/* Header */}
        <header className="bg-slate-900/50 backdrop-blur-xl border-b border-red-500/20 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">
                {activeView === "dashboard" && "Surveillance Dashboard"}
                {activeView === "cameras" && "Camera Network"}
                {activeView === "analytics" && "Network Analytics"}
                {activeView === "settings" && "System Settings"}
              </h2>
              <p className="text-sm text-slate-400">
                {activeView === "dashboard" && "Real-time monitoring and analytics"}
                {activeView === "cameras" && `${filteredCameras.length} cameras available`}
                {activeView === "analytics" && "Performance metrics and insights"}
                {activeView === "settings" && "Configure system preferences"}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {activeView === "cameras" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-500/30 hover:bg-blue-500/10 text-blue-300"
                    onClick={() => exportData('json')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export JSON
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-green-500/30 hover:bg-green-500/10 text-green-300"
                    onClick={() => exportData('csv')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                size="sm"
                className="border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-300"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>

              {/* <Button
                variant="outline"
                size="sm"
                className="border-red-500/30 hover:bg-red-500/10"
                onClick={() => setShowSettingsPanel(!showSettingsPanel)}
              >
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Quick Settings
              </Button> */}
            </div>
          </div>
        </header>
        {/* Content */}
        <div className="p-6">
          {activeView === "dashboard" ? (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-slate-900/50 border-red-500/20 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-red-500/20 rounded-xl">
                        <Video className="h-6 w-6 text-red-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">{stats.totalCameras}</p>
                        <p className="text-sm text-slate-400">Total Cameras</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-green-500/20 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-green-500/20 rounded-xl">
                        <Wifi className="h-6 w-6 text-green-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">{stats.onlineCameras}</p>
                        <p className="text-sm text-slate-400">Online</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-blue-500/20 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-blue-500/20 rounded-xl">
                        <Globe className="h-6 w-6 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">{stats.countries}</p>
                        <p className="text-sm text-slate-400">Countries</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-purple-500/20 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-purple-500/20 rounded-xl">
                        <Heart className="h-6 w-6 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">{favorites.size}</p>
                        <p className="text-sm text-slate-400">Favorites</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Map Section */}
              <Card className="bg-slate-900/50 border-red-500/20 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white">Global Network Map</CardTitle>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Label className="text-sm text-slate-300">Map Style:</Label>
                        <Select value={mapLayer} onValueChange={setMapLayer}>
                          <SelectTrigger className="w-48 bg-slate-800 border-slate-700 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700 max-h-80 overflow-y-auto">
                            {/* Standard Maps */}
                            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Standard</div>
                            <SelectItem value="street">🗺️ OpenStreetMap</SelectItem>
                            <SelectItem value="dark">🌙 Dark Theme</SelectItem>
                            <SelectItem value="carto-light">☀️ CartoDB Light</SelectItem>
                            <SelectItem value="carto-voyager">🧭 CartoDB Voyager</SelectItem>
                            <SelectItem value="wikimedia">📚 Wikimedia</SelectItem>

                            {/* Google Maps */}
                            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">Google Maps</div>
                            <SelectItem value="google-earth">🌍 Google Earth</SelectItem>
                            <SelectItem value="google-hybrid">🛰️ Google Hybrid</SelectItem>
                            <SelectItem value="google-terrain">🏔️ Google Terrain</SelectItem>
                            <SelectItem value="google-streets">🛣️ Google Streets</SelectItem>

                            {/* Esri Maps */}
                            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">Esri Professional</div>
                            <SelectItem value="satellite">📡 Esri Satellite</SelectItem>
                            <SelectItem value="esri-world-topo">🗻 Esri Topographic</SelectItem>
                            <SelectItem value="esri-world-street">🏙️ Esri Street Map</SelectItem>
                            <SelectItem value="esri-world-physical">🌋 Esri Physical</SelectItem>

                            {/* Specialized Maps */}
                            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">Specialized</div>
                            <SelectItem value="opentopomap">⛰️ OpenTopoMap</SelectItem>
                            <SelectItem value="stamen-terrain">🏞️ Stamen Terrain</SelectItem>
                            <SelectItem value="stamen-watercolor">🎨 Stamen Watercolor</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-400 hover:text-white"
                          title="Map Information"
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="clustering"
                            checked={showClustering}
                            onCheckedChange={setShowClustering}
                          />
                          <Label htmlFor="clustering" className="text-sm text-slate-300">
                            Cluster
                          </Label>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            id="heatmap"
                            checked={showHeatmap}
                            onCheckedChange={setShowHeatmap}
                          />
                          <Label htmlFor="heatmap" className="text-sm text-slate-300">
                            Heatmap
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[60vh] rounded-b-xl overflow-hidden">
                    <MapComponent
                      cameras={filteredCameras}
                      selectedCamera={selectedCamera}
                      mapLayer={mapLayer}
                      showClustering={showClustering}
                      showHeatmap={showHeatmap}
                      showDayNight={showDayNight}
                      onMapLayerChange={setMapLayer}
                      onClusteringChange={setShowClustering}
                      onHeatmapChange={setShowHeatmap}
                      onDayNightChange={setShowDayNight}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : activeView === "cameras" ? (
            <div className="space-y-6">
              {/* Enhanced Filters */}
              <Card className="bg-slate-900/50 border-red-500/20 backdrop-blur-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white flex items-center">
                      <Filter className="h-5 w-5 mr-2" />
                      Filters & Search
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className="text-slate-400 hover:text-white"
                    >
                      {showAdvancedFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      Advanced
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Basic Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search cameras..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-slate-800 border-slate-700 text-white placeholder-slate-400"
                      />
                    </div>

                    <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="All Countries" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="all">All Countries</SelectItem>
                        {countries.map((country) => (
                          <SelectItem key={country} value={country}>
                            {country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="online">
                          <div className="flex items-center">
                            <div className="w-2 h-2 bg-green-400 rounded-full mr-2" />
                            Online
                          </div>
                        </SelectItem>
                        <SelectItem value="offline">
                          <div className="flex items-center">
                            <div className="w-2 h-2 bg-red-400 rounded-full mr-2" />
                            Offline
                          </div>
                        </SelectItem>
                        <SelectItem value="unknown">
                          <div className="flex items-center">
                            <div className="w-2 h-2 bg-gray-400 rounded-full mr-2" />
                            Unknown
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={selectedManufacturer} onValueChange={setSelectedManufacturer}>
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="All Manufacturers" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="all">All Manufacturers</SelectItem>
                        {manufacturers.map((manufacturer) => (
                          <SelectItem key={manufacturer} value={manufacturer}>
                            {manufacturer}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Advanced Filters */}
                  {showAdvancedFilters && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-700">
                      <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue placeholder="All Regions" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 max-h-60 overflow-y-auto">
                          <SelectItem value="all">All Regions</SelectItem>
                          {regions.slice(0, 100).map((region) => (
                            <SelectItem key={region} value={region}>
                              {region}
                            </SelectItem>
                          ))}
                          {regions.length > 100 && (
                            <SelectItem value="" disabled className="text-slate-500 text-xs">
                              ... and {regions.length - 100} more (use search to find specific regions)
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>

                      <Select value={selectedCity} onValueChange={setSelectedCity}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue placeholder="All Cities" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 max-h-60 overflow-y-auto">
                          <SelectItem value="all">All Cities</SelectItem>
                          {cities.slice(0, 100).map((city) => (
                            <SelectItem key={city} value={city}>
                              {city}
                            </SelectItem>
                          ))}
                          {cities.length > 100 && (
                            <SelectItem value="" disabled className="text-slate-500 text-xs">
                              ... and {cities.length - 100} more (use search to find specific cities)
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>

                      <Select value={responseTimeFilter} onValueChange={setResponseTimeFilter}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue placeholder="Response Time" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          <SelectItem value="all">All Response Times</SelectItem>
                          <SelectItem value="fast">Fast (&lt; 1s)</SelectItem>
                          <SelectItem value="medium">Medium (1-3s)</SelectItem>
                          <SelectItem value="slow">Slow (&gt; 3s)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Sort and Options */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Label className="text-sm text-slate-300">Sort by:</Label>
                        <Select value={sortBy} onValueChange={setSortBy}>
                          <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="name">Name</SelectItem>
                            <SelectItem value="status">Status</SelectItem>
                            <SelectItem value="country">Country</SelectItem>
                            <SelectItem value="manufacturer">Manufacturer</SelectItem>
                            <SelectItem value="response_time">Response Time</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                          className="text-slate-400 hover:text-white"
                        >
                          {sortOrder === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Switch
                          id="favorites-only"
                          checked={showFavoritesOnly}
                          onCheckedChange={setShowFavoritesOnly}
                        />
                        <Label htmlFor="favorites-only" className="text-sm text-slate-300">
                          Favorites Only
                        </Label>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="border-slate-600 text-slate-300">
                        {filteredCameras.length} results
                      </Badge>

                      {(selectedCountry !== "all" || selectedManufacturer !== "all" || selectedStatus !== "all" ||
                        selectedRegion !== "all" || selectedCity !== "all" || responseTimeFilter !== "all" ||
                        searchTerm || showFavoritesOnly) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={clearAllFilters}
                            className="border-red-500/30 hover:bg-red-500/10 text-red-300"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Clear All
                          </Button>
                        )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              {/* Camera Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {paginatedCameras.map((camera) => (
                  <Card key={camera.id} className="bg-slate-900/50 border-red-500/20 hover:border-red-500/50 transition-all duration-300 backdrop-blur-sm group">
                    <CardContent className="p-4">
                      <div className="aspect-video mb-4 rounded-lg overflow-hidden bg-slate-800 relative">
                        <img
                          src={camera.image_url && camera.image_url !== 'N/A' ? `/api/camera-proxy?url=${encodeURIComponent(camera.image_url)}` : "/placeholder.svg"}
                          alt={`Camera in ${camera.city}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute top-2 left-2 flex items-center space-x-1 px-2 py-1 bg-black/80 rounded-md">
                          <div className={`w-1.5 h-1.5 rounded-full ${camera.status === 'online' ? 'bg-green-400 animate-pulse' :
                            camera.status === 'offline' ? 'bg-red-400' : 'bg-gray-400'
                            }`} />
                          <span className="text-xs text-white">{camera.status}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-8 w-8 bg-black/80 hover:bg-black/90"
                          onClick={() => toggleFavorite(camera.id)}
                        >
                          <Heart className={`h-4 w-4 ${favorites.has(camera.id) ? 'text-red-400 fill-current' : 'text-white'}`} />
                        </Button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <h3 className="font-medium text-white text-sm truncate">
                            {camera.city}, {camera.country}
                          </h3>
                          <p className="text-xs text-slate-400">
                            {camera.region} • {camera.manufacturer}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white"
                            onClick={() => handleCameraView(camera)}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/30 hover:bg-red-500/10 text-red-300"
                            onClick={() => handleCameraSelect(camera.id)}
                          >
                            <MapPin className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="border-red-500/30 hover:bg-red-500/10 text-red-300"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-slate-400">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="border-red-500/30 hover:bg-red-500/10 text-red-300"
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          ) : activeView === "analytics" ? (
            <div className="space-y-6">
              {/* Analytics Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Network Performance Analytics</h3>
                  <p className="text-sm text-slate-400">Insights and trends from your surveillance network</p>
                </div>
                <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
                  <SelectTrigger className="w-32 bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="1h">Last Hour</SelectItem>
                    <SelectItem value="24h">Last 24h</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Analytics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="bg-slate-900/50 border-green-500/20 backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-green-400 flex items-center text-sm">
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Uptime Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white mb-2">
                      {((stats.onlineCameras / stats.totalCameras) * 100).toFixed(1)}%
                    </div>
                    <p className="text-xs text-slate-400">
                      {stats.onlineCameras} of {stats.totalCameras} cameras online
                    </p>
                    <div className="mt-3 w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-green-500 to-green-400 h-2 rounded-full"
                        style={{ width: `${(stats.onlineCameras / stats.totalCameras) * 100}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-blue-500/20 backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-blue-400 flex items-center text-sm">
                      <Activity className="h-4 w-4 mr-2" />
                      Avg Response Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white mb-2">
                      {cameras.length > 0 ?
                        Math.round(cameras.reduce((sum, c) => sum + (c.response_time || 0), 0) / cameras.length)
                        : 0}ms
                    </div>
                    <p className="text-xs text-slate-400">
                      Network average response time
                    </p>
                    <div className="mt-3 flex items-center space-x-2">
                      <div className="flex items-center text-xs">
                        <div className="w-2 h-2 bg-green-400 rounded-full mr-1" />
                        Fast: {cameras.filter(c => c.response_time < 1000).length}
                      </div>
                      <div className="flex items-center text-xs">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full mr-1" />
                        Medium: {cameras.filter(c => c.response_time >= 1000 && c.response_time < 3000).length}
                      </div>
                      <div className="flex items-center text-xs">
                        <div className="w-2 h-2 bg-red-400 rounded-full mr-1" />
                        Slow: {cameras.filter(c => c.response_time >= 3000).length}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-purple-500/20 backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-purple-400 flex items-center text-sm">
                      <Globe className="h-4 w-4 mr-2" />
                      Geographic Coverage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white mb-2">
                      {stats.countries}
                    </div>
                    <p className="text-xs text-slate-400">
                      Countries with active cameras
                    </p>
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Cities:</span>
                        <span className="text-white">{stats.cities}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Manufacturers:</span>
                        <span className="text-white">{stats.manufacturers}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              {/* Status Distribution */}
              <Card className="bg-slate-900/50 border-red-500/20 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white">Network Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-400 mb-2">{stats.onlineCameras}</div>
                      <div className="text-sm text-slate-400 mb-3">Online Cameras</div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-green-400 h-2 rounded-full"
                          style={{ width: `${(stats.onlineCameras / stats.totalCameras) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-400 mb-2">{stats.offlineCameras}</div>
                      <div className="text-sm text-slate-400 mb-3">Offline Cameras</div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-red-400 h-2 rounded-full"
                          style={{ width: `${(stats.offlineCameras / stats.totalCameras) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-400 mb-2">{stats.unknownCameras}</div>
                      <div className="text-sm text-slate-400 mb-3">Unknown Status</div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-gray-400 h-2 rounded-full"
                          style={{ width: `${(stats.unknownCameras / stats.totalCameras) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Top Manufacturers */}
              <Card className="bg-slate-900/50 border-red-500/20 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white">Top Manufacturers</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {manufacturers.slice(0, 5).map((manufacturer) => {
                      const count = manufacturerCounts[manufacturer]
                      const percentage = (count / cameras.length) * 100
                      return (
                        <div key={manufacturer} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-red-600 rounded-lg flex items-center justify-center">
                              <span className="text-xs font-bold text-white">
                                {manufacturer.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-white break-words">{manufacturer}</div>
                              <div className="text-xs text-slate-400">{count} cameras</div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <div className="w-24 bg-slate-700 rounded-full h-2">
                              <div
                                className="bg-gradient-to-r from-red-500 to-red-400 h-2 rounded-full"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-sm text-slate-300 w-12 text-right">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : activeView === "settings" ? (
            <div className="space-y-6">
              {/* General Settings */}
              <Card className="bg-slate-900/50 border-red-500/20 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <Settings className="h-5 w-5 mr-2" />
                    General Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-white">Auto Refresh</Label>
                          <p className="text-xs text-slate-400">Automatically refresh camera data</p>
                        </div>
                        <Switch
                          checked={autoRefresh}
                          onCheckedChange={setAutoRefresh}
                        />
                      </div>

                      {autoRefresh && (
                        <div>
                          <Label className="text-sm font-medium text-white">Refresh Interval</Label>
                          <Select value={refreshInterval.toString()} onValueChange={(value) => setRefreshInterval(parseInt(value))}>
                            <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              <SelectItem value="10">10 seconds</SelectItem>
                              <SelectItem value="30">30 seconds</SelectItem>
                              <SelectItem value="60">1 minute</SelectItem>
                              <SelectItem value="300">5 minutes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-white">Notifications</Label>
                          <p className="text-xs text-slate-400">Show system notifications</p>
                        </div>
                        <Switch
                          checked={notifications}
                          onCheckedChange={setNotifications}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-white">Compact Mode</Label>
                          <p className="text-xs text-slate-400">Use compact layout for lists</p>
                        </div>
                        <Switch
                          checked={compactMode}
                          onCheckedChange={setCompactMode}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium text-white flex items-center">
                          <Map className="h-4 w-4 mr-2" />
                          Default Map Layer
                        </Label>
                        <Select value={mapLayer} onValueChange={setMapLayer}>
                          <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700 max-h-80 overflow-y-auto">
                            {/* Standard Maps */}
                            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Standard</div>
                            <SelectItem value="street">🗺️ OpenStreetMap</SelectItem>
                            <SelectItem value="dark">🌙 Dark Theme</SelectItem>
                            <SelectItem value="carto-light">☀️ CartoDB Light</SelectItem>
                            <SelectItem value="carto-voyager">🧭 CartoDB Voyager</SelectItem>
                            <SelectItem value="wikimedia">📚 Wikimedia</SelectItem>

                            {/* Google Maps */}
                            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">Google Maps</div>
                            <SelectItem value="google-earth">🌍 Google Earth</SelectItem>
                            <SelectItem value="google-hybrid">🛰️ Google Hybrid</SelectItem>
                            <SelectItem value="google-terrain">🏔️ Google Terrain</SelectItem>
                            <SelectItem value="google-streets">🛣️ Google Streets</SelectItem>

                            {/* Esri Maps */}
                            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">Esri Professional</div>
                            <SelectItem value="satellite">📡 Esri Satellite</SelectItem>
                            <SelectItem value="esri-world-topo">🗻 Esri Topographic</SelectItem>
                            <SelectItem value="esri-world-street">🏙️ Esri Street Map</SelectItem>
                            <SelectItem value="esri-world-physical">🌋 Esri Physical</SelectItem>

                            {/* Specialized Maps */}
                            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">Specialized</div>
                            <SelectItem value="opentopomap">⛰️ OpenTopoMap</SelectItem>
                            <SelectItem value="stamen-terrain">🏞️ Stamen Terrain</SelectItem>
                            <SelectItem value="stamen-watercolor">🎨 Stamen Watercolor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-white">Show Tooltips</Label>
                          <p className="text-xs text-slate-400">Display helpful tooltips</p>
                        </div>
                        <Switch
                          checked={showTooltips}
                          onCheckedChange={setShowTooltips}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-white">Map Clustering</Label>
                          <p className="text-xs text-slate-400">Group nearby cameras on map</p>
                        </div>
                        <Switch
                          checked={showClustering}
                          onCheckedChange={setShowClustering}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium text-white">Day/Night Overlay</Label>
                          <p className="text-xs text-slate-400">Show day/night regions on map</p>
                        </div>
                        <Switch
                          checked={showDayNight}
                          onCheckedChange={setShowDayNight}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {/* Data Management */}
              <Card className="bg-slate-900/50 border-red-500/20 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <Database className="h-5 w-5 mr-2" />
                    Data Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button
                      variant="outline"
                      className="border-blue-500/30 hover:bg-blue-500/10 text-blue-300"
                      onClick={() => exportData('json')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export JSON
                    </Button>
                    <Button
                      variant="outline"
                      className="border-green-500/30 hover:bg-green-500/10 text-green-300"
                      onClick={() => exportData('csv')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                    <Button
                      variant="outline"
                      className="border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-300"
                      onClick={() => {
                        setFavorites(new Set())
                        localStorage.clear()
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear Data
                    </Button>
                  </div>

                  <div className="pt-4 border-t border-slate-700">
                    <div className="text-sm text-slate-400 space-y-2">
                      <p>• Favorites: {favorites.size} cameras saved</p>
                      <p>• Last updated: {new Date().toLocaleString()}</p>
                      <p>• Total storage: ~{Math.round((JSON.stringify(cameras).length / 1024))} KB</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Map Layers Information */}
              <Card className="bg-slate-900/50 border-red-500/20 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <Layers className="h-5 w-5 mr-2" />
                    Available Map Layers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-slate-300">🌍 Google Maps Suite</div>
                      <div className="text-xs text-slate-400 space-y-1">
                        <p>• Google Earth: High-resolution satellite imagery</p>
                        <p>• Google Hybrid: Satellite with street labels</p>
                        <p>• Google Terrain: Topographic with elevation</p>
                        <p>• Google Streets: Detailed street mapping</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-slate-300">📡 Professional Esri</div>
                      <div className="text-xs text-slate-400 space-y-1">
                        <p>• Esri Satellite: Professional satellite imagery</p>
                        <p>• Esri Topographic: Detailed contour mapping</p>
                        <p>• Esri Street: Professional street maps</p>
                        <p>• Esri Physical: Terrain and relief mapping</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-slate-300">🎨 Artistic & Specialized</div>
                      <div className="text-xs text-slate-400 space-y-1">
                        <p>• Stamen Watercolor: Artistic watercolor style</p>
                        <p>• Stamen Terrain: Hill-shaded terrain</p>
                        <p>• OpenTopoMap: Hiking and outdoor activities</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-slate-300">🗺️ Standard & Open Source</div>
                      <div className="text-xs text-slate-400 space-y-1">
                        <p>• OpenStreetMap: Community-maintained</p>
                        <p>• CartoDB: Clean, minimal designs</p>
                        <p>• Wikimedia: Community-driven mapping</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* System Information */}
              <Card className="bg-slate-900/50 border-red-500/20 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <Info className="h-5 w-5 mr-2" />
                    System Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Version:</span>
                        <span className="text-white">MapCam v2.0.0</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Last Update:</span>
                        <span className="text-white">{new Date().toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Browser:</span>
                        <span className="text-white">{navigator.userAgent.split(' ')[0]}</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total Cameras:</span>
                        <span className="text-white">{stats.totalCameras}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Active Sessions:</span>
                        <span className="text-white">1</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Uptime:</span>
                        <span className="text-white">99.9%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}