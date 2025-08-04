import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory cache
const imageCache = new Map<string, { data: ArrayBuffer; timestamp: number; contentType: string }>();
const CACHE_DURATION = 30 * 1000; // 30 seconds cache
const MAX_CACHE_SIZE = 50; // Maximum cached images

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');


    if (!url) {
        return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    // Check cache first
    const cacheKey = url;
    const cached = imageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log('Serving from cache:', url);
        return new NextResponse(cached.data, {
            status: 200,
            headers: {
                'Content-Type': cached.contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=30',
                'X-Cache': 'HIT',
            },
        });
    }

    try {
        console.log('Fetching camera URL:', url);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // Reduced timeout

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`HTTP error! status: ${response.status} for URL: ${url}`);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        console.log('Content-Type:', contentType, 'for URL:', url);

        let imageData: ArrayBuffer | undefined;

        // Handle MJPEG streams - extract first frame
        if (contentType.includes('multipart/x-mixed-replace') || url.includes('.mjpg')) {
            try {
                imageData = await extractMJPEGFrame(response, contentType, url);
            } catch (mjpegError) {
                console.log(`MJPEG parsing failed for ${url}, trying as regular image:`, mjpegError.message);
                // Fallback: try to read as regular image
                try {
                    imageData = await response.arrayBuffer();
                } catch (fallbackError) {
                    throw new Error(`Both MJPEG and regular image parsing failed: ${mjpegError.message}`);
                }
            }
        } else {
            // For regular images
            imageData = await response.arrayBuffer();
        }

        // Cache management - remove oldest entries if cache is full
        if (imageCache.size >= MAX_CACHE_SIZE) {
            const oldestKey = imageCache.keys().next().value;
            if (oldestKey) {
                imageCache.delete(oldestKey);
            }
        }

        // Ensure imageData is defined before using it
        if (!imageData) {
            throw new Error('No image data available');
        }

        // Store in cache
        imageCache.set(cacheKey, {
            data: imageData,
            timestamp: Date.now(),
            contentType: contentType.includes('multipart') ? 'image/jpeg' : contentType
        });

        return new NextResponse(imageData, {
            status: 200,
            headers: {
                'Content-Type': contentType.includes('multipart') ? 'image/jpeg' : contentType,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=30',
                'X-Cache': 'MISS',
                'Content-Length': imageData.byteLength.toString(),
            },
        });
    } catch (error) {
        console.error('Proxy error for URL:', url, error);
        
        // Return a placeholder image on error
        return new NextResponse(null, {
            status: 302,
            headers: {
                'Location': '/placeholder.svg',
                'Access-Control-Allow-Origin': '*',
            },
        });
    }
}

// Enhanced MJPEG frame extraction with better error handling
async function extractMJPEGFrame(response: Response, contentType: string, url: string): Promise<ArrayBuffer> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No response body available');
    }

    let buffer = new Uint8Array();
    let foundImage = false;
    const maxBufferSize = 2 * 1024 * 1024; // 2MB buffer size
    let readAttempts = 0;
    const maxReadAttempts = 100; // Increased attempts for difficult streams
    let totalBytesRead = 0;

    // Extract boundary from content type if available
    const boundaryMatch = contentType.match(/boundary[=:]\s*([^;,\s]+)/i);
    const boundary = boundaryMatch ? boundaryMatch[1].replace(/['"]/g, '') : null;
    console.log(`Processing MJPEG stream with boundary: ${boundary || 'unknown'}`);

    try {
        while (!foundImage && readAttempts < maxReadAttempts) {
            const { done, value } = await reader.read();
            readAttempts++;
            
            if (done) {
                console.log(`Stream ended after ${readAttempts} attempts, total bytes: ${totalBytesRead}`);
                break;
            }

            if (!value || value.length === 0) {
                continue;
            }

            totalBytesRead += value.length;

            // Append new data to buffer
            const newBuffer = new Uint8Array(buffer.length + value.length);
            newBuffer.set(buffer);
            newBuffer.set(value, buffer.length);
            buffer = newBuffer;

            // Multiple strategies to find JPEG frames
            const frames = findJPEGFrames(buffer);
            
            if (frames.length > 0) {
                // Sort frames by size and quality indicators
                frames.sort((a, b) => {
                    const sizeA = a.end - a.start;
                    const sizeB = b.end - b.start;
                    
                    // Prefer frames between 5KB and 1MB
                    const isGoodSizeA = sizeA >= 5000 && sizeA <= 1024 * 1024;
                    const isGoodSizeB = sizeB >= 5000 && sizeB <= 1024 * 1024;
                    
                    if (isGoodSizeA && !isGoodSizeB) return -1;
                    if (!isGoodSizeA && isGoodSizeB) return 1;
                    
                    return sizeB - sizeA; // Prefer larger frames among good ones
                });

                const bestFrame = frames[0];
                const frameSize = bestFrame.end - bestFrame.start + 2;
                
                if (frameSize >= 1000) { // Minimum reasonable JPEG size
                    const frameData = buffer.slice(bestFrame.start, bestFrame.end + 2);
                    
                    // Validate JPEG structure
                    if (isValidJPEG(frameData)) {
                        console.log(`Found valid JPEG frame: ${frameSize} bytes after ${readAttempts} attempts`);
                        return frameData.buffer;
                    }
                }
            }

            // Prevent buffer from growing too large
            if (buffer.length > maxBufferSize) {
                console.log(`Buffer limit reached: ${buffer.length} bytes, attempting emergency extraction`);
                
                // Emergency extraction - take the best frame we can find
                const emergencyFrames = findJPEGFrames(buffer);
                if (emergencyFrames.length > 0) {
                    const frame = emergencyFrames[0];
                    const frameData = buffer.slice(frame.start, frame.end + 2);
                    if (frameData.length >= 500) { // Very minimal size check
                        console.log(`Emergency extraction: ${frameData.length} bytes`);
                        return frameData.buffer;
                    }
                }
                
                // Trim buffer to prevent memory issues
                buffer = buffer.slice(Math.max(0, buffer.length - maxBufferSize / 2));
            }

            // Progress logging for difficult streams
            if (readAttempts % 20 === 0) {
                console.log(`MJPEG parsing progress: ${readAttempts} attempts, ${totalBytesRead} bytes, buffer: ${buffer.length}`);
            }
        }
    } finally {
        reader.releaseLock();
    }

    throw new Error(`No valid JPEG frame found after ${readAttempts} attempts (${totalBytesRead} bytes processed)`);
}

// Find all potential JPEG frames in buffer
function findJPEGFrames(buffer: Uint8Array): Array<{start: number, end: number}> {
    const frames: Array<{start: number, end: number}> = [];
    let searchStart = 0;

    while (searchStart < buffer.length - 10) {
        const jpegStart = findSequence(buffer.subarray(searchStart), [0xFF, 0xD8]);
        if (jpegStart === -1) break;
        
        const actualStart = searchStart + jpegStart;
        
        // Look for corresponding end marker
        const searchEnd = Math.min(actualStart + 2, buffer.length - 2);
        const jpegEnd = findSequence(buffer.subarray(searchEnd), [0xFF, 0xD9]);
        
        if (jpegEnd !== -1) {
            const actualEnd = searchEnd + jpegEnd;
            frames.push({ start: actualStart, end: actualEnd });
        }
        
        searchStart = actualStart + 2;
    }

    return frames;
}

// Validate JPEG structure
function isValidJPEG(data: Uint8Array): boolean {
    if (data.length < 10) return false;
    
    // Check JPEG magic bytes
    if (data[0] !== 0xFF || data[1] !== 0xD8) return false;
    if (data[data.length - 2] !== 0xFF || data[data.length - 1] !== 0xD9) return false;
    
    // Look for essential JPEG markers
    let hasSOF = false; // Start of Frame
    let hasSOS = false; // Start of Scan
    
    for (let i = 2; i < data.length - 1; i++) {
        if (data[i] === 0xFF) {
            const marker = data[i + 1];
            if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
                hasSOF = true;
            }
            if (marker === 0xDA) {
                hasSOS = true;
            }
        }
    }
    
    return hasSOF && hasSOS;
}

// Helper function to find byte sequence in buffer
function findSequence(buffer: Uint8Array, sequence: number[]): number {
    for (let i = 0; i <= buffer.length - sequence.length; i++) {
        let found = true;
        for (let j = 0; j < sequence.length; j++) {
            if (buffer[i + j] !== sequence[j]) {
                found = false;
                break;
            }
        }
        if (found) return i;
    }
    return -1;
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}