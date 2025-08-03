import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'camera_data.json')
    const fileContents = fs.readFileSync(filePath, 'utf8')
    const cameras = JSON.parse(fileContents)
    
    // Transform the data to match the expected format
    const transformedCameras = cameras.map((camera: any, index: number) => ({
      id: index + 1,
      latitude: camera.latitude,
      longitude: camera.longitude,
      country: camera.country,
      city: camera.city,
      region: camera.region,
      manufacturer: camera.manufacturer,
      image_url: camera.image_url,
      page_url: camera.page_url,
      status: 'online', // Default status since we don't have real-time monitoring
      response_time: Math.floor(Math.random() * 300) + 50,
      last_check: new Date().toISOString(),
    }))
    
    return NextResponse.json(transformedCameras)
  } catch (error) {
    console.error('Error reading camera data:', error)
    return NextResponse.json({ error: 'Failed to load camera data' }, { status: 500 })
  }
}