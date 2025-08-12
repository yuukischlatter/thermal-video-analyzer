const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

// Load the native C++ module
let thermalEngine;
try {
    thermalEngine = require('../native/build/Release/thermal_engine');
    console.log('✓ Native thermal engine loaded successfully');
} catch (error) {
    console.error('✗ Failed to load native thermal engine:', error.message);
    console.error('Make sure to build the native module first:');
    console.error('  cd native && npm install && node-gyp rebuild');
    process.exit(1);
}

// Initialize Express app
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3000;
const VIDEO_PATH = '../videos/demo_vid.avi';
const CSV_PATH = '../data/temp_mapping.csv';

// Global state
let videoInfo = null;
let isEngineReady = false;

// Serve static files
app.use(express.static('../public'));
app.use('/videos', express.static('../videos'));
app.use('/data', express.static('../data'));

// Initialize thermal engine
async function initializeEngine() {
    console.log('Initializing thermal engine...');
    
    try {
        // Check if files exist
        if (!fs.existsSync(VIDEO_PATH)) {
            throw new Error(`Video file not found: ${VIDEO_PATH}`);
        }
        
        if (!fs.existsSync(CSV_PATH)) {
            throw new Error(`Temperature mapping file not found: ${CSV_PATH}`);
        }
        
        // Load video
        console.log('Loading video:', VIDEO_PATH);
        const videoLoaded = thermalEngine.loadVideo(VIDEO_PATH);
        if (!videoLoaded) {
            throw new Error('Failed to load video file');
        }
        
        // Load temperature mapping
        console.log('Loading temperature mapping:', CSV_PATH);
        const mappingLoaded = thermalEngine.loadTempMapping(CSV_PATH);
        if (!mappingLoaded) {
            throw new Error('Failed to load temperature mapping');
        }
        
        // Get video information
        videoInfo = thermalEngine.getVideoInfo();
        console.log('Video Info:', videoInfo);
        
        // Check if engine is ready
        isEngineReady = thermalEngine.isReady();
        
        if (isEngineReady) {
            console.log('✓ Thermal engine initialized successfully');
            console.log(`  - Frames: ${videoInfo.frames}`);
            console.log(`  - FPS: ${videoInfo.fps}`);
            console.log(`  - Resolution: ${videoInfo.width}x${videoInfo.height}`);
        } else {
            throw new Error('Engine not ready after initialization');
        }
        
    } catch (error) {
        console.error('✗ Failed to initialize thermal engine:', error.message);
        isEngineReady = false;
        throw error;
    }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    
    // Send initial video info to client
    if (isEngineReady && videoInfo) {
        ws.send(JSON.stringify({
            type: 'videoInfo',
            data: videoInfo,
            timestamp: Date.now()
        }));
    } else {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Thermal engine not ready',
            timestamp: Date.now()
        }));
    }
    
    // Handle incoming messages
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received message:', message.type);
            
            switch (message.type) {
                case 'analyzeLine':
                    await handleAnalyzeLine(ws, message.data);
                    break;
                    
                case 'getPixelTemp':
                    await handleGetPixelTemp(ws, message.data);
                    break;
                    
                case 'ping':
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: Date.now()
                    }));
                    break;
                    
                default:
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: `Unknown message type: ${message.type}`,
                        timestamp: Date.now()
                    }));
            }
            
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to process message',
                error: error.message,
                timestamp: Date.now()
            }));
        }
    });
    
    // Handle connection close
    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
    
    // Handle connection errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Handle line analysis requests
async function handleAnalyzeLine(ws, data) {
    if (!isEngineReady) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Thermal engine not ready',
            timestamp: Date.now()
        }));
        return;
    }
    
    try {
        const { frameNum, line1, line2 } = data;
        
        // Validate parameters
        if (typeof frameNum !== 'number' || frameNum < 0 || frameNum >= videoInfo.frames) {
            throw new Error(`Invalid frame number: ${frameNum}`);
        }
        
        if (!line1 || !line2) {
            throw new Error('Both line1 and line2 must be provided');
        }
        
        // Validate line coordinates
        const validateLine = (line, name) => {
            const { x1, y1, x2, y2 } = line;
            if (typeof x1 !== 'number' || typeof y1 !== 'number' || 
                typeof x2 !== 'number' || typeof y2 !== 'number') {
                throw new Error(`Invalid coordinates for ${name}`);
            }
            
            // Clamp coordinates to video bounds
            line.x1 = Math.max(0, Math.min(x1, videoInfo.width - 1));
            line.y1 = Math.max(0, Math.min(y1, videoInfo.height - 1));
            line.x2 = Math.max(0, Math.min(x2, videoInfo.width - 1));
            line.y2 = Math.max(0, Math.min(y2, videoInfo.height - 1));
        };
        
        validateLine(line1, 'line1');
        validateLine(line2, 'line2');
        
        // Analyze both lines
        console.log(`Analyzing frame ${frameNum} with lines:`, {
            line1: `(${line1.x1},${line1.y1}) -> (${line1.x2},${line1.y2})`,
            line2: `(${line2.x1},${line2.y1}) -> (${line2.x2},${line2.y2})`
        });
        
        const line1Temps = thermalEngine.analyzeLine(frameNum, line1.x1, line1.y1, line1.x2, line1.y2);
        const line2Temps = thermalEngine.analyzeLine(frameNum, line2.x1, line2.y1, line2.x2, line2.y2);
        
        // Calculate statistics
        const calculateStats = (temps) => {
            if (temps.length === 0) return { avg: 0, max: 0, min: 0, count: 0 };
            
            const validTemps = temps.filter(t => t > 0);
            if (validTemps.length === 0) return { avg: 0, max: 0, min: 0, count: 0 };
            
            const sum = validTemps.reduce((a, b) => a + b, 0);
            return {
                avg: sum / validTemps.length,
                max: Math.max(...validTemps),
                min: Math.min(...validTemps),
                count: validTemps.length
            };
        };
        
        const line1Stats = calculateStats(line1Temps);
        const line2Stats = calculateStats(line2Temps);
        
        // Send results back to client
        ws.send(JSON.stringify({
            type: 'analysisResult',
            data: {
                frameNum,
                line1: {
                    temperatures: line1Temps,
                    stats: line1Stats,
                    coordinates: line1
                },
                line2: {
                    temperatures: line2Temps,
                    stats: line2Stats,
                    coordinates: line2
                }
            },
            timestamp: Date.now()
        }));
        
    } catch (error) {
        console.error('Error analyzing line:', error);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to analyze line',
            error: error.message,
            timestamp: Date.now()
        }));
    }
}

// Handle pixel temperature requests
async function handleGetPixelTemp(ws, data) {
    if (!isEngineReady) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Thermal engine not ready',
            timestamp: Date.now()
        }));
        return;
    }
    
    try {
        const { r, g, b } = data;
        
        // Validate RGB values
        if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number' ||
            r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
            throw new Error('Invalid RGB values');
        }
        
        const temperature = thermalEngine.getPixelTemperature(r, g, b);
        
        ws.send(JSON.stringify({
            type: 'pixelTempResult',
            data: {
                r, g, b,
                temperature
            },
            timestamp: Date.now()
        }));
        
    } catch (error) {
        console.error('Error getting pixel temperature:', error);
        ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to get pixel temperature',
            error: error.message,
            timestamp: Date.now()
        }));
    }
}

// REST API endpoints
app.get('/api/video-info', (req, res) => {
    if (!isEngineReady || !videoInfo) {
        return res.status(503).json({
            error: 'Thermal engine not ready',
            ready: false
        });
    }
    
    res.json({
        ...videoInfo,
        ready: isEngineReady
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        engineReady: isEngineReady,
        timestamp: Date.now(),
        uptime: process.uptime()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
async function startServer() {
    try {
        // Initialize thermal engine first
        await initializeEngine();
        
        // Start HTTP server
        server.listen(PORT, () => {
            console.log(`\n🚀 Thermal Video Analyzer Server running on:`);
            console.log(`   http://localhost:${PORT}`);
            console.log(`\n📁 Serving files from:`);
            console.log(`   Video: ${VIDEO_PATH}`);
            console.log(`   Mapping: ${CSV_PATH}`);
            console.log(`\n🔌 WebSocket endpoint: ws://localhost:${PORT}`);
            console.log(`\n✅ Ready for thermal analysis!`);
        });
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server stopped.');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down...');
    server.close(() => {
        console.log('Server stopped.');
        process.exit(0);
    });
});

// Start the server
startServer();