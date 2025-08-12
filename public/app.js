// Global variables
let ws;
let video;
let canvas;
let ctx;
let chart1, chart2;
let videoInfo = {};

// Line positions (initial values, will be adjusted based on video size)
let line1 = { x1: 50, y1: 100, x2: 300, y2: 150 };
let line2 = { x1: 100, y1: 50, x2: 150, y2: 300 };

// Dragging state
let dragging = null;
let dragOffset = { x: 0, y: 0 };
const DRAG_THRESHOLD = 15;
const HANDLE_SIZE = 8;

// Connection state
let isConnected = false;
let isEngineReady = false;
let isVideoLoaded = false;

// Performance tracking
let lastAnalysisTime = 0;

// Initialize everything when page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing Thermal Video Analyzer...');
    
    initializeElements();
    setupWebSocket();
    setupVideo();
    setupCanvas();
    setupCharts();
    setupControls();
    setupModals();
    
    console.log('✅ Frontend initialization complete');
});

// Initialize DOM element references
function initializeElements() {
    video = document.getElementById('thermalVideo');
    canvas = document.getElementById('lineOverlay');
    ctx = canvas.getContext('2d');
    
    // Disable controls initially
    updateUIState(false);
}

// Setup WebSocket connection
function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        isConnected = true;
        updateConnectionStatus('connected');
    };
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };
    
    ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        isConnected = false;
        updateConnectionStatus('disconnected');
        
        // Attempt to reconnect after 3 seconds
        setTimeout(setupWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        isConnected = false;
        updateConnectionStatus('error');
    };
}

// Handle incoming WebSocket messages
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'videoInfo':
            handleVideoInfo(message.data);
            break;
            
        case 'analysisResult':
            handleAnalysisResult(message.data);
            break;
            
        case 'pixelTempResult':
            handlePixelTempResult(message.data);
            break;
            
        case 'error':
            handleError(message.message, message.error);
            break;
            
        case 'pong':
            // Connection health check response
            break;
            
        default:
            console.warn('Unknown message type:', message.type);
    }
}

// Handle video info from server
function handleVideoInfo(data) {
    videoInfo = data;
    isEngineReady = data.loaded;
    
    console.log('📹 Video info received:', videoInfo);
    
    // Update UI elements
    document.getElementById('frameSlider').max = videoInfo.frames - 1;
    document.getElementById('videoResolution').textContent = `${videoInfo.width}x${videoInfo.height}`;
    document.getElementById('videoFPS').textContent = `${videoInfo.fps.toFixed(2)} fps`;
    document.getElementById('videoFrames').textContent = videoInfo.frames;
    document.getElementById('videoDuration').textContent = `${(videoInfo.frames / videoInfo.fps).toFixed(1)}s`;
    
    // Adjust canvas size and line positions
    adjustCanvasSize();
    adjustLinePositions();
    
    updateEngineStatus(isEngineReady ? 'ready' : 'error');
    updateUIState(isEngineReady);
    
    // Draw initial lines
    drawLines();
    
    // Trigger initial analysis
    if (isEngineReady) {
        requestAnalysis();
    }
}

// Handle analysis results
function handleAnalysisResult(data) {
    const endTime = performance.now();
    lastAnalysisTime = endTime - (window.analysisStartTime || endTime);
    
    console.log(`📊 Analysis complete in ${lastAnalysisTime.toFixed(1)}ms`);
    
    // Update performance info
    document.getElementById('performanceInfo').textContent = `Processing: ${lastAnalysisTime.toFixed(1)}ms`;
    
    // Update line info displays
    updateLineInfo('line1Info', data.line1.stats);
    updateLineInfo('line2Info', data.line2.stats);
    
    // Update charts
    updateChart(chart1, data.line1.temperatures, 'Line 1', 'rgba(54, 162, 235, 0.8)');
    updateChart(chart2, data.line2.temperatures, 'Line 2', 'rgba(75, 192, 192, 0.8)');
}

// Handle pixel temperature results
function handlePixelTempResult(data) {
    const tempElement = document.getElementById('pixelTemp');
    if (data.temperature !== null) {
        tempElement.textContent = `${data.temperature.toFixed(1)}°C`;
        tempElement.className = 'temperature ' + getTemperatureClass(data.temperature);
    } else {
        tempElement.textContent = 'No data';
        tempElement.className = 'temperature';
    }
}

// Handle errors
function handleError(message, details) {
    console.error('Server error:', message, details);
    showError(message + (details ? ': ' + details : ''));
}

// Setup video element
function setupVideo() {
    video.addEventListener('loadedmetadata', () => {
        console.log('📹 Video metadata loaded');
        isVideoLoaded = true;
        hideLoading();
    });
    
    video.addEventListener('timeupdate', () => {
        if (isVideoLoaded && videoInfo.fps) {
            const currentFrame = Math.floor(video.currentTime * videoInfo.fps);
            updateFrameInfo(currentFrame);
            
            // Update slider without triggering analysis
            const slider = document.getElementById('frameSlider');
            if (!slider.dataset.dragging) {
                slider.value = currentFrame;
            }
        }
    });
    
    video.addEventListener('error', (e) => {
        console.error('Video error:', e);
        showError('Failed to load video. Please check the file format and path.');
    });
}

// Setup canvas for line drawing
function setupCanvas() {
    // Mouse event handlers
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    
    // Prevent context menu on right click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Setup Chart.js charts
function setupCharts() {
    const chartConfig = {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature',
                data: [],
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                pointRadius: 2,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Distance (pixels)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Temperature (°C)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            animation: {
                duration: 200
            }
        }
    };
    
    chart1 = new Chart(document.getElementById('chart1'), {
        ...chartConfig,
        data: {
            ...chartConfig.data,
            datasets: [{
                ...chartConfig.data.datasets[0],
                borderColor: 'rgba(54, 162, 235, 1)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)'
            }]
        }
    });
    
    chart2 = new Chart(document.getElementById('chart2'), {
        ...chartConfig,
        data: {
            ...chartConfig.data,
            datasets: [{
                ...chartConfig.data.datasets[0],
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)'
            }]
        }
    });
}

// Setup control event handlers
function setupControls() {
    // Play/pause button
    document.getElementById('playBtn').addEventListener('click', () => {
        if (video.paused) {
            video.play();
            document.getElementById('playBtn').innerHTML = '<span class="btn-icon">⏸</span> Pause';
        } else {
            video.pause();
            document.getElementById('playBtn').innerHTML = '<span class="btn-icon">▶</span> Play';
        }
    });
    
    // Frame navigation
    document.getElementById('prevFrameBtn').addEventListener('click', () => {
        if (videoInfo.fps) {
            const currentFrame = Math.floor(video.currentTime * videoInfo.fps);
            const newFrame = Math.max(0, currentFrame - 1);
            seekToFrame(newFrame);
        }
    });
    
    document.getElementById('nextFrameBtn').addEventListener('click', () => {
        if (videoInfo.fps) {
            const currentFrame = Math.floor(video.currentTime * videoInfo.fps);
            const newFrame = Math.min(videoInfo.frames - 1, currentFrame + 1);
            seekToFrame(newFrame);
        }
    });
    
    // Frame slider
    const frameSlider = document.getElementById('frameSlider');
    frameSlider.addEventListener('input', (e) => {
        e.target.dataset.dragging = 'true';
        const frameNumber = parseInt(e.target.value);
        seekToFrame(frameNumber);
    });
    
    frameSlider.addEventListener('change', (e) => {
        delete e.target.dataset.dragging;
        requestAnalysis();
    });
}

// Setup modal handlers
function setupModals() {
    // Error modal
    document.getElementById('closeErrorModal').addEventListener('click', () => {
        document.getElementById('errorModal').style.display = 'none';
    });
    
    // Video info modal
    document.getElementById('videoInfoBtn').addEventListener('click', () => {
        document.getElementById('videoInfoModal').style.display = 'block';
    });
    
    document.getElementById('closeVideoInfoModal').addEventListener('click', () => {
        document.getElementById('videoInfoModal').style.display = 'none';
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        const errorModal = document.getElementById('errorModal');
        const videoModal = document.getElementById('videoInfoModal');
        
        if (e.target === errorModal) {
            errorModal.style.display = 'none';
        }
        if (e.target === videoModal) {
            videoModal.style.display = 'none';
        }
    });
}

// Mouse event handlers for line dragging
function onMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const nearestEndpoint = getNearestEndpoint(x, y);
    
    if (nearestEndpoint) {
        dragging = nearestEndpoint;
        canvas.style.cursor = 'grabbing';
        
        // Calculate drag offset
        const endpoint = getEndpointCoords(nearestEndpoint);
        dragOffset.x = x - endpoint.x;
        dragOffset.y = y - endpoint.y;
        
        e.preventDefault();
    }
}

function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Update mouse position display
    const videoX = Math.round(x * (videoInfo.width || 1) / canvas.width);
    const videoY = Math.round(y * (videoInfo.height || 1) / canvas.height);
    document.getElementById('mousePos').textContent = `x: ${videoX}, y: ${videoY}`;
    
    if (dragging) {
        // Update dragging line endpoint
        updateDraggedEndpoint(x - dragOffset.x, y - dragOffset.y);
        drawLines();
        
        // Throttled analysis request
        throttledAnalysisRequest();
    } else {
        // Update cursor based on proximity to endpoints
        const nearestEndpoint = getNearestEndpoint(x, y);
        canvas.style.cursor = nearestEndpoint ? 'grab' : 'crosshair';
        
        // Request pixel temperature for hover
        if (isConnected && isEngineReady) {
            requestPixelTemperature(videoX, videoY);
        }
    }
}

function onMouseUp(e) {
    if (dragging) {
        dragging = null;
        canvas.style.cursor = 'crosshair';
        
        // Trigger final analysis
        requestAnalysis();
    }
}

function onMouseLeave(e) {
    dragging = null;
    canvas.style.cursor = 'crosshair';
    document.getElementById('mousePos').textContent = 'x: -, y: -';
}

// Helper functions for line dragging
function getNearestEndpoint(x, y) {
    const endpoints = [
        { name: 'line1_start', x: line1.x1, y: line1.y1 },
        { name: 'line1_end', x: line1.x2, y: line1.y2 },
        { name: 'line2_start', x: line2.x1, y: line2.y1 },
        { name: 'line2_end', x: line2.x2, y: line2.y2 }
    ];
    
    for (const endpoint of endpoints) {
        const distance = Math.sqrt((x - endpoint.x) ** 2 + (y - endpoint.y) ** 2);
        if (distance <= DRAG_THRESHOLD) {
            return endpoint.name;
        }
    }
    
    return null;
}

function getEndpointCoords(endpointName) {
    switch (endpointName) {
        case 'line1_start': return { x: line1.x1, y: line1.y1 };
        case 'line1_end': return { x: line1.x2, y: line1.y2 };
        case 'line2_start': return { x: line2.x1, y: line2.y1 };
        case 'line2_end': return { x: line2.x2, y: line2.y2 };
    }
}

function updateDraggedEndpoint(x, y) {
    // Constrain to canvas bounds
    x = Math.max(0, Math.min(canvas.width - 1, x));
    y = Math.max(0, Math.min(canvas.height - 1, y));
    
    switch (dragging) {
        case 'line1_start':
            line1.x1 = x;
            line1.y1 = y;
            break;
        case 'line1_end':
            line1.x2 = x;
            line1.y2 = y;
            break;
        case 'line2_start':
            line2.x1 = x;
            line2.y1 = y;
            break;
        case 'line2_end':
            line2.x2 = x;
            line2.y2 = y;
            break;
    }
}

// Draw analysis lines on canvas
function drawLines() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Line 1 (blue)
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(line1.x1, line1.y1);
    ctx.lineTo(line1.x2, line1.y2);
    ctx.stroke();
    
    // Draw Line 2 (green)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(line2.x1, line2.y1);
    ctx.lineTo(line2.x2, line2.y2);
    ctx.stroke();
    
    // Draw endpoints
    drawEndpoint(line1.x1, line1.y1, '#3b82f6');
    drawEndpoint(line1.x2, line1.y2, '#3b82f6');
    drawEndpoint(line2.x1, line2.y1, '#10b981');
    drawEndpoint(line2.x2, line2.y2, '#10b981');
}

function drawEndpoint(x, y, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_SIZE, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
}

// Utility functions
function adjustCanvasSize() {
    if (video && videoInfo.width && videoInfo.height) {
        const videoRect = video.getBoundingClientRect();
        canvas.width = videoRect.width;
        canvas.height = videoRect.height;
        
        // Recalculate line positions
        adjustLinePositions();
    }
}

function adjustLinePositions() {
    if (canvas.width && canvas.height) {
        // Initial line positions as percentages of canvas size
        line1.x1 = canvas.width * 0.1;
        line1.y1 = canvas.height * 0.4;
        line1.x2 = canvas.width * 0.9;
        line1.y2 = canvas.height * 0.6;
        
        line2.x1 = canvas.width * 0.4;
        line2.y1 = canvas.height * 0.1;
        line2.x2 = canvas.width * 0.6;
        line2.y2 = canvas.height * 0.9;
    }
}

function seekToFrame(frameNumber) {
    if (videoInfo.fps) {
        const time = frameNumber / videoInfo.fps;
        video.currentTime = time;
        updateFrameInfo(frameNumber);
    }
}

function updateFrameInfo(frameNumber) {
    const time = frameNumber / (videoInfo.fps || 1);
    document.getElementById('frameInfo').textContent = `Frame: ${frameNumber} / ${videoInfo.frames - 1}`;
    document.getElementById('timeInfo').textContent = `Time: ${time.toFixed(2)}s`;
}

// Communication functions
function requestAnalysis() {
    if (!isConnected || !isEngineReady) return;
    
    const currentFrame = Math.floor(video.currentTime * (videoInfo.fps || 1));
    
    // Convert canvas coordinates to video coordinates
    const videoLine1 = convertToVideoCoords(line1);
    const videoLine2 = convertToVideoCoords(line2);
    
    window.analysisStartTime = performance.now();
    
    ws.send(JSON.stringify({
        type: 'analyzeLine',
        data: {
            frameNum: currentFrame,
            line1: videoLine1,
            line2: videoLine2
        }
    }));
}

function requestPixelTemperature(x, y) {
    // This would require getting actual pixel RGB values from video
    // For now, we'll skip this feature as it requires additional video frame access
}

function convertToVideoCoords(line) {
    const scaleX = (videoInfo.width || 1) / canvas.width;
    const scaleY = (videoInfo.height || 1) / canvas.height;
    
    return {
        x1: Math.round(line.x1 * scaleX),
        y1: Math.round(line.y1 * scaleY),
        x2: Math.round(line.x2 * scaleX),
        y2: Math.round(line.y2 * scaleY)
    };
}

// Throttled analysis to avoid spam
let analysisTimeout;
function throttledAnalysisRequest() {
    clearTimeout(analysisTimeout);
    analysisTimeout = setTimeout(requestAnalysis, 100);
}

// UI update functions
function updateConnectionStatus(status) {
    const element = document.getElementById('connectionStatus');
    element.className = `status-${status}`;
    element.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

function updateEngineStatus(status) {
    const element = document.getElementById('engineStatus');
    element.className = `status-${status}`;
    
    const statusText = {
        loading: 'Loading...',
        ready: 'Ready',
        error: 'Error'
    };
    
    element.textContent = statusText[status] || status;
}

function updateUIState(enabled) {
    const controls = [
        'playBtn', 'prevFrameBtn', 'nextFrameBtn', 'frameSlider'
    ];
    
    controls.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = !enabled;
        }
    });
}

function updateLineInfo(elementId, stats) {
    const element = document.getElementById(elementId);
    if (stats && stats.count > 0) {
        element.textContent = `Avg: ${stats.avg.toFixed(1)}°C, Max: ${stats.max.toFixed(1)}°C, Min: ${stats.min.toFixed(1)}°C`;
    } else {
        element.textContent = 'No data';
    }
}

function updateChart(chart, temperatures, label, color) {
    if (!temperatures || temperatures.length === 0) return;
    
    // Generate distance labels
    const labels = temperatures.map((_, index) => index);
    
    // Safely update chart data
    if (chart && chart.data) {
        chart.data.labels = labels;
        if (chart.data.datasets && chart.data.datasets[0]) {
            chart.data.datasets[0].data = temperatures;
            chart.data.datasets[0].label = label;
            chart.data.datasets[0].borderColor = color;
            
            chart.update('none'); // Update without animation for performance
        }
    }
}

function getTemperatureClass(temp) {
    if (temp > 1200) return 'temp-hot';
    if (temp > 900) return 'temp-warm';
    if (temp > 700) return 'temp-cool';
    return 'temp-cold';
}

function hideLoading() {
    const loading = document.getElementById('videoLoading');
    if (loading) {
        loading.style.display = 'none';
    }
}

function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorModal').style.display = 'block';
}

// Handle window resize
window.addEventListener('resize', () => {
    adjustCanvasSize();
    drawLines();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (!isEngineReady) return;
    
    switch (e.code) {
        case 'Space':
            e.preventDefault();
            document.getElementById('playBtn').click();
            break;
            
        case 'ArrowLeft':
            e.preventDefault();
            document.getElementById('prevFrameBtn').click();
            break;
            
        case 'ArrowRight':
            e.preventDefault();
            document.getElementById('nextFrameBtn').click();
            break;
    }
});

console.log('📱 Frontend app.js loaded successfully');