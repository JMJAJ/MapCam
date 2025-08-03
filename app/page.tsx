"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Video,
  Globe,
  Building2,
  Factory,
  Search,
  Grid3X3,
  List,
  MapPin,
  Eye,
  Play,
  Pause,
  Download,
  Moon,
  Sun,
  BarChart3,
  Activity,
  Settings,
  ChevronDown,
  Layers,
  Target,
  Clock,
  Wifi,
  WifiOff,
  HelpCircle,
} from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import dynamic from "next/dynamic"

// Dynamically import map component to avoid SSR issues
const MapComponent = dynamic(() => import("./components/map-component"), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] bg-muted animate-pulse rounded-lg flex items-center justify-center">Loading Map...</div>
  ),
})

export default function CameraMonitoringDashboard() {
  const [cameras, setCameras] = useState<any[]>([])
  const [filteredCameras, setFilteredCameras] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCountry, setSelectedCountry] = useState("all")
  const [selectedManufacturer, setSelectedManufacturer] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(9)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [monitoringInterval, setMonitoringInterval] = useState("60")
  const [darkMode, setDarkMode] = useState(true)
  const [selectedCamera, setSelectedCamera] = useState<number | null>(null)
  const [mapLayer, setMapLayer] = useState("street")
  const [showClustering, setShowClustering] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const monitoringIntervalRef = useRef<NodeJS.Timeout | null>(null)

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

  // Get unique countries and manufacturers
  const countries = [...new Set(cameras.map((c) => c.country))].sort()
  const manufacturers = [...new Set(cameras.map((c) => c.manufacturer))].sort()

  // Filter cameras
  useEffect(() => {
    let filtered = cameras

    if (selectedCountry !== "all") {
      filtered = filtered.filter((c) => c.country === selectedCountry)
    }

    if (selectedManufacturer !== "all") {
      filtered = filtered.filter((c) => c.manufacturer === selectedManufacturer)
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (c) =>
          c.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.region.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    setFilteredCameras(filtered)
    setCurrentPage(1)
  }, [selectedCountry, selectedManufacturer, searchTerm, cameras])

  // Pagination
  const totalPages = Math.ceil(filteredCameras.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedCameras = filteredCameras.slice(startIndex, startIndex + itemsPerPage)

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

  // Chart data
  const countryData = countries.map((country) => ({
    name: country,
    value: cameras.filter((c) => c.country === country).length,
  }))

  const manufacturerData = manufacturers.map((manufacturer) => ({
    name: manufacturer,
    value: cameras.filter((c) => c.manufacturer === manufacturer).length,
  }))

  const statusData = [
    { name: "Online", value: stats.onlineCameras, color: "#27ae60" },
    { name: "Offline", value: stats.offlineCameras, color: "#e74c3c" },
    { name: "Unknown", value: stats.unknownCameras, color: "#95a5a6" },
  ]

  // Monitoring functions
  const startMonitoring = () => {
    setIsMonitoring(true)
    const interval = Number.parseInt(monitoringInterval) * 1000

    monitoringIntervalRef.current = setInterval(() => {
      setCameras((prev) =>
        prev.map((camera) => ({
          ...camera,
          status: Math.random() > 0.8 ? "offline" : Math.random() > 0.1 ? "online" : "unknown",
          response_time: Math.floor(Math.random() * 300) + 50,
          last_check: new Date().toISOString(),
        })),
      )
    }, interval)
  }

  const stopMonitoring = () => {
    setIsMonitoring(false)
    if (monitoringIntervalRef.current) {
      clearInterval(monitoringIntervalRef.current)
    }
  }

  // Export functions
  const exportJSON = () => {
    const dataStr = JSON.stringify(filteredCameras, null, 2)
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr)
    const exportFileDefaultName = "cameras.json"
    const linkElement = document.createElement("a")
    linkElement.setAttribute("href", dataUri)
    linkElement.setAttribute("download", exportFileDefaultName)
    linkElement.click()
  }

  const exportCSV = () => {
    const headers = ["ID", "Country", "City", "Region", "Manufacturer", "Latitude", "Longitude", "Status"]
    const csvContent = [
      headers.join(","),
      ...filteredCameras.map((camera) =>
        [
          camera.id,
          camera.country,
          camera.city,
          camera.region,
          camera.manufacturer,
          camera.latitude,
          camera.longitude,
          camera.status,
        ].join(","),
      ),
    ].join("\n")

    const dataUri = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent)
    const exportFileDefaultName = "cameras.csv"
    const linkElement = document.createElement("a")
    linkElement.setAttribute("href", dataUri)
    linkElement.setAttribute("download", exportFileDefaultName)
    linkElement.click()
  }

  const [activeTab, setActiveTab] = useState("explorer")

  const handleCameraSelect = (cameraId: number) => {
    setSelectedCamera(cameraId)
    // Switch to map tab when camera is selected
    setActiveTab("map")
  }

  const handleCameraView = (camera: any) => {
    // Open camera page in new tab
    if (camera.page_url) {
      window.open(camera.page_url, '_blank')
    } else {
      // Fallback: show camera details in alert
      alert(`Camera Details:\nLocation: ${camera.city}, ${camera.country}\nManufacturer: ${camera.manufacturer}\nStatus: ${camera.status}`)
    }
  }

  if (loading) {
    return (
      <div className={`min-h-screen ${darkMode ? "dark" : ""}`}>
        <div className="bg-background text-foreground flex items-center justify-center">
          <div className="text-center">
            <Video className="h-16 w-16 mx-auto mb-4 text-red-500 animate-pulse" />
            <h2 className="text-2xl font-bold mb-2">Loading Camera Data...</h2>
            <p className="text-muted-foreground">Please wait while we fetch the latest camera information</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? "dark" : ""}`}>
      <div className="bg-background text-foreground">
        {/* Navigation */}
        <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Video className="h-8 w-8 text-red-500" />
                <span className="text-xl font-bold">CamMonitor Pro</span>
              </div>

              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="icon" onClick={() => setDarkMode(!darkMode)}>
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Tools <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={exportJSON}>
                      <Download className="mr-2 h-4 w-4" />
                      Export JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={exportCSV}>
                      <Download className="mr-2 h-4 w-4" />
                      Export CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Generate Report
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 text-white py-16">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-6xl font-bold mb-4">Global Camera Network</h1>
              <p className="text-xl md:text-2xl opacity-90">Monitor security cameras worldwide in real-time</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20 transition-all duration-300 transform hover:scale-105">
                <CardContent className="p-6 text-center">
                  <Video className="h-12 w-12 mx-auto mb-4 text-white" />
                  <div className="text-3xl font-bold mb-2">{stats.totalCameras}</div>
                  <div className="text-white/80">Total Cameras</div>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20 transition-all duration-300 transform hover:scale-105">
                <CardContent className="p-6 text-center">
                  <Globe className="h-12 w-12 mx-auto mb-4 text-white" />
                  <div className="text-3xl font-bold mb-2">{stats.countries}</div>
                  <div className="text-white/80">Countries</div>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20 transition-all duration-300 transform hover:scale-105">
                <CardContent className="p-6 text-center">
                  <Building2 className="h-12 w-12 mx-auto mb-4 text-white" />
                  <div className="text-3xl font-bold mb-2">{stats.cities}</div>
                  <div className="text-white/80">Cities</div>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur border-white/20 text-white hover:bg-white/20 transition-all duration-300 transform hover:scale-105">
                <CardContent className="p-6 text-center">
                  <Factory className="h-12 w-12 mx-auto mb-4 text-white" />
                  <div className="text-3xl font-bold mb-2">{stats.manufacturers}</div>
                  <div className="text-white/80">Manufacturers</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="explorer">Camera Explorer</TabsTrigger>
              <TabsTrigger value="map">Interactive Map</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            </TabsList>

            {/* Camera Explorer */}
            <TabsContent value="explorer" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Camera Explorer
                  </CardTitle>
                  <CardDescription>Browse and filter cameras from around the world</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Filters */}
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <Input
                        placeholder="Search by city, country, or region..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                      <SelectTrigger className="w-full md:w-48">
                        <SelectValue placeholder="Select Country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Countries</SelectItem>
                        {countries.map((country) => (
                          <SelectItem key={country} value={country}>
                            {country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedManufacturer} onValueChange={setSelectedManufacturer}>
                      <SelectTrigger className="w-full md:w-48">
                        <SelectValue placeholder="Select Manufacturer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Manufacturers</SelectItem>
                        {manufacturers.map((manufacturer) => (
                          <SelectItem key={manufacturer} value={manufacturer}>
                            {manufacturer}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* View Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">Showing {filteredCameras.length} cameras</div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={viewMode === "grid" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setViewMode("grid")}
                      >
                        <Grid3X3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={viewMode === "list" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setViewMode("list")}
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Camera Grid/List */}
                  {viewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {paginatedCameras.map((camera) => (
                        <Card key={camera.id} className="hover:shadow-lg transition-shadow">
                          <CardContent className="p-4">
                            <div className="aspect-video mb-4 bg-muted rounded-lg overflow-hidden">
                              <img
                                src={camera.image_url && camera.image_url !== 'N/A' ? `/api/camera-proxy?url=${encodeURIComponent(camera.image_url)}` : "/placeholder.svg"}
                                alt={`Camera in ${camera.city}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.src = "/placeholder.jpg"
                                }}
                              />
                              <div className="hidden w-full h-full flex items-center justify-center bg-muted">
                                <Video className="h-12 w-12 text-muted-foreground" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h3 className="font-semibold">
                                  {camera.city}, {camera.country}
                                </h3>
                                <Badge
                                  variant={
                                    camera.status === "online"
                                      ? "default"
                                      : camera.status === "offline"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {camera.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {camera.region} • {camera.manufacturer}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {camera.latitude.toFixed(4)}, {camera.longitude.toFixed(4)}
                              </p>
                              <div className="flex gap-2 pt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 bg-transparent"
                                  onClick={() => handleCameraView(camera)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 bg-transparent"
                                  onClick={() => handleCameraSelect(camera.id)}
                                >
                                  <MapPin className="h-4 w-4 mr-1" />
                                  Map
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {paginatedCameras.map((camera) => (
                        <Card key={camera.id}>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                              <div className="w-24 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                                <img
                                  src={camera.image_url && camera.image_url !== 'N/A' ? `/api/camera-proxy?url=${encodeURIComponent(camera.image_url)}` : "/placeholder.svg"}
                                  alt={`Camera in ${camera.city}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.src = "/placeholder.jpg"
                                  }}
                                />
                                <div className="hidden w-full h-full flex items-center justify-center bg-muted">
                                  <Video className="h-6 w-6 text-muted-foreground" />
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-1">
                                  <h3 className="font-semibold">
                                    {camera.city}, {camera.country}
                                  </h3>
                                  <Badge
                                    variant={
                                      camera.status === "online"
                                        ? "default"
                                        : camera.status === "offline"
                                          ? "destructive"
                                          : "secondary"
                                    }
                                  >
                                    {camera.status}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {camera.region} • {camera.manufacturer}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {camera.latitude.toFixed(4)}, {camera.longitude.toFixed(4)}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCameraView(camera)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleCameraSelect(camera.id)}>
                                  <MapPin className="h-4 w-4 mr-1" />
                                  Map
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Interactive Map */}
            <TabsContent value="map" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Interactive World Map
                  </CardTitle>
                  <CardDescription>Explore camera locations on an interactive map</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Map Controls */}
                  <div className="flex flex-wrap gap-4 p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      <Select value={mapLayer} onValueChange={setMapLayer}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="street">Street</SelectItem>
                          <SelectItem value="satellite">Satellite</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch id="clustering" checked={showClustering} onCheckedChange={setShowClustering} />
                      <Label htmlFor="clustering">Clustering</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch id="heatmap" checked={showHeatmap} onCheckedChange={setShowHeatmap} />
                      <Label htmlFor="heatmap">Heatmap</Label>
                    </div>

                    <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Filter Country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Countries</SelectItem>
                        {countries.map((country) => (
                          <SelectItem key={country} value={country}>
                            {country}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button variant="outline" size="sm">
                      <Target className="h-4 w-4 mr-2" />
                      Fit to Data
                    </Button>
                  </div>

                  {/* Map Container */}
                  <div className="h-[600px] rounded-lg overflow-hidden border">
                    <MapComponent
                      cameras={filteredCameras}
                      selectedCamera={selectedCamera}
                      mapLayer={mapLayer}
                      showClustering={showClustering}
                      showHeatmap={showHeatmap}
                    />
                  </div>

                  {/* Map Legend */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                      <span className="text-sm">Online Cameras</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                      <span className="text-sm">Offline Cameras</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-gray-500 rounded-full"></div>
                      <span className="text-sm">Unknown Status</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Analytics */}
            <TabsContent value="analytics" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Country Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={countryData}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                        >
                          {countryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={`hsl(${index * 45}, 70%, 50%)`} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Manufacturer Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={manufacturerData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" fill="#ef4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Status Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Coverage Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{stats.onlineCameras}</div>
                        <div className="text-sm text-muted-foreground">Online</div>
                      </div>
                      <div className="text-center p-4 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-red-600">{stats.offlineCameras}</div>
                        <div className="text-sm text-muted-foreground">Offline</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>HTTP Connections</span>
                        <span className="font-semibold">{Math.floor(stats.totalCameras * 0.6)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>MJPEG Streams</span>
                        <span className="font-semibold">{Math.floor(stats.totalCameras * 0.3)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Snapshots</span>
                        <span className="font-semibold">{Math.floor(stats.totalCameras * 0.1)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Monitoring */}
            <TabsContent value="monitoring" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Real-time Monitoring
                  </CardTitle>
                  <CardDescription>Monitor camera status and performance in real-time</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Monitoring Controls */}
                  <div className="flex flex-wrap items-center gap-4 p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      {isMonitoring ? (
                        <Button onClick={stopMonitoring} variant="destructive" size="sm">
                          <Pause className="h-4 w-4 mr-2" />
                          Stop Monitoring
                        </Button>
                      ) : (
                        <Button onClick={startMonitoring} size="sm">
                          <Play className="h-4 w-4 mr-2" />
                          Start Monitoring
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <Select value={monitoringInterval} onValueChange={setMonitoringInterval}>
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30s</SelectItem>
                          <SelectItem value="60">1m</SelectItem>
                          <SelectItem value="300">5m</SelectItem>
                          <SelectItem value="600">10m</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {isMonitoring && (
                      <Badge variant="default" className="animate-pulse">
                        <Activity className="h-3 w-3 mr-1" />
                        Monitoring Active
                      </Badge>
                    )}
                  </div>

                  {/* Status Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                      <CardContent className="p-4 text-center">
                        <Wifi className="h-8 w-8 mx-auto mb-2 text-green-600" />
                        <div className="text-2xl font-bold text-green-600">{stats.onlineCameras}</div>
                        <div className="text-sm text-green-700 dark:text-green-300">Online Cameras</div>
                      </CardContent>
                    </Card>

                    <Card className="border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
                      <CardContent className="p-4 text-center">
                        <WifiOff className="h-8 w-8 mx-auto mb-2 text-red-600" />
                        <div className="text-2xl font-bold text-red-600">{stats.offlineCameras}</div>
                        <div className="text-sm text-red-700 dark:text-red-300">Offline Cameras</div>
                      </CardContent>
                    </Card>

                    <Card className="border-gray-200 bg-gray-50 dark:bg-gray-950 dark:border-gray-800">
                      <CardContent className="p-4 text-center">
                        <HelpCircle className="h-8 w-8 mx-auto mb-2 text-gray-600" />
                        <div className="text-2xl font-bold text-gray-600">{stats.unknownCameras}</div>
                        <div className="text-sm text-gray-700 dark:text-gray-300">Unknown Status</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Monitoring Results Table */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Monitoring Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">Status</th>
                              <th className="text-left p-2">Location</th>
                              <th className="text-left p-2">Manufacturer</th>
                              <th className="text-left p-2">Response Time</th>
                              <th className="text-left p-2">Last Check</th>
                              <th className="text-left p-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cameras.map((camera) => (
                              <tr key={camera.id} className="border-b">
                                <td className="p-2">
                                  <Badge
                                    variant={
                                      camera.status === "online"
                                        ? "default"
                                        : camera.status === "offline"
                                          ? "destructive"
                                          : "secondary"
                                    }
                                  >
                                    {camera.status}
                                  </Badge>
                                </td>
                                <td className="p-2">
                                  {camera.city}, {camera.country}
                                </td>
                                <td className="p-2">{camera.manufacturer}</td>
                                <td className="p-2">
                                  {camera.status === "online" ? `${camera.response_time}ms` : "-"}
                                </td>
                                <td className="p-2">{new Date(camera.last_check).toLocaleTimeString()}</td>
                                <td className="p-2">
                                  <Button size="sm" variant="outline">
                                    <Settings className="h-3 w-3" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
