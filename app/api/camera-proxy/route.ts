import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    try {
        console.log('Fetching camera URL:', url);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

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

        // Handle MJPEG streams - extract first frame
        if (contentType.includes('multipart/x-mixed-replace') || url.includes('.mjpg')) {
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            let buffer = new Uint8Array();
            let foundImage = false;

            while (!foundImage) {
                const { done, value } = await reader.read();
                if (done) break;

                // Append new data to buffer
                const newBuffer = new Uint8Array(buffer.length + value.length);
                newBuffer.set(buffer);
                newBuffer.set(value, buffer.length);
                buffer = newBuffer;

                // Look for JPEG start and end markers
                const jpegStart = findSequence(buffer, [0xFF, 0xD8]); // JPEG start
                const jpegEnd = findSequence(buffer, [0xFF, 0xD9]); // JPEG end

                if (jpegStart !== -1 && jpegEnd !== -1 && jpegEnd > jpegStart) {
                    // Extract the JPEG image
                    const imageData = buffer.slice(jpegStart, jpegEnd + 2);
                    foundImage = true;
                    
                    return new NextResponse(imageData, {
                        status: 200,
                        headers: {
                            'Content-Type': 'image/jpeg',
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type',
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Pragma': 'no-cache',
                            'Expires': '0',
                        },
                    });
                }

                // Prevent buffer from growing too large
                if (buffer.length > 1024 * 1024) { // 1MB limit
                    break;
                }
            }
        }

        // For regular images
        const body = await response.arrayBuffer();

        return new NextResponse(body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
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