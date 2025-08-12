// Global variables
let ws;
let video;
let canvas;
let ctx;
let chart1, chart2;
let videoInfo = {};

// Line positions
let line1 = { x1: 50, y1: 100, x2: 300, y2: 150 };
let line2 = { x1: 100, y1: 50, x2: 150, y2: 300 };

// Dragging state
let dragging = null;
const DRAG_THRESHOLD = 15;

// Connection state
let isConnected = false;
let isEngineReady = false;

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    setupWebSocket();
    setupVideo();
    setupCanvas();
    setupCharts();
    setupControls();
});

// Initialize DOM elements
function initializeElements() {
    video = document.getElementById('thermalVideo');
    canvas = document.getElementById('lineOverlay');
    ctx = canvas.getContext('2d');
    
    document.getElementById('playBtn').disabled = true;
    document.getElementById('frameSlider').disabled = true;
}

// Setup WebSocket connection
function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        isConnected = true;
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };
    
    ws.onclose = () => {
        isConnected = false;
        setTimeout(setupWebSocket, 3000);
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'videoInfo':
            handleVideoInfo(message.data);
            break;
        case 'analysisResult':
            handleAnalysisResult(message.data);
            break;
    }
}

// Handle video info
function handleVideoInfo(data) {
    videoInfo = data;
    isEngineReady = data.loaded;
    
    document.getElementById('frameSlider').max = videoInfo.frames - 1;
    
    adjustCanvasSize();
    adjustLinePositions();
    drawLines();
    
    document.getElementById('playBtn').disabled = !isEngineReady;
    document.getElementById('frameSlider').disabled = !isEngineReady;
    
    if (isEngineReady) {
        requestAnalysis();
    }
}

// Handle analysis results
function handleAnalysisResult(data) {
    updateChart(chart1, data.line1.temperatures, '#2563eb');
    updateChart(chart2, data.line2.temperatures, '#059669');
}

// Setup video element
function setupVideo() {
    video.addEventListener('timeupdate', () => {
        if (isEngineReady && videoInfo.fps) {
            const currentFrame = Math.floor(video.currentTime * videoInfo.fps);
            updateFrameInfo(currentFrame);
            
            const slider = document.getElementById('frameSlider');
            if (!slider.dataset.dragging) {
                slider.value = currentFrame;
            }
            
            requestAnalysis();
        }
    });
}

// Setup canvas for line drawing
function setupCanvas() {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
}

// Setup Chart.js charts
function setupCharts() {
    const chartConfig = {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderWidth: 2,
                fill: false,
                pointRadius: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'Position (%)' } },
                y: { title: { display: true, text: 'Temperature (°C)' } }
            },
            plugins: { legend: { display: false } },
            animation: { duration: 0 }
        }
    };
    
    chart1 = new Chart(document.getElementById('chart1'), {
        ...chartConfig,
        data: {
            ...chartConfig.data,
            datasets: [{ ...chartConfig.data.datasets[0], borderColor: '#2563eb' }]
        }
    });
    
    chart2 = new Chart(document.getElementById('chart2'), {
        ...chartConfig,
        data: {
            ...chartConfig.data,
            datasets: [{ ...chartConfig.data.datasets[0], borderColor: '#059669' }]
        }
    });
}

// Setup controls
function setupControls() {
    document.getElementById('playBtn').addEventListener('click', () => {
        if (video.paused) {
            video.play();
            document.getElementById('playBtn').textContent = 'Pause';
        } else {
            video.pause();
            document.getElementById('playBtn').textContent = 'Play';
        }
    });
    
    const frameSlider = document.getElementById('frameSlider');
    frameSlider.addEventListener('input', (e) => {
        const frameNumber = parseInt(e.target.value);
        seekToFrame(frameNumber);
        requestAnalysis();
    });
}

// Mouse event handlers
function onMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const nearestEndpoint = getNearestEndpoint(x, y);
    if (nearestEndpoint) {
        dragging = nearestEndpoint;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
    }
}

function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (dragging) {
        const constrainedX = Math.max(0, Math.min(canvas.width - 1, x));
        const constrainedY = Math.max(0, Math.min(canvas.height - 1, y));
        
        updateDraggedEndpoint(constrainedX, constrainedY);
        drawLines();
        requestAnalysis();
    } else {
        const nearestEndpoint = getNearestEndpoint(x, y);
        canvas.style.cursor = nearestEndpoint ? 'grab' : 'crosshair';
    }
}

function onMouseUp(e) {
    if (dragging) {
        dragging = null;
        canvas.style.cursor = 'crosshair';
        requestAnalysis();
    }
}

// Helper functions
function getNearestEndpoint(x, y) {
    const endpoints = [
        { name: 'line1_start', x: line1.x1, y: line1.y1 },
        { name: 'line1_end', x: line1.x2, y: line1.y2 },
        { name: 'line2_start', x: line2.x1, y: line2.y1 },
        { name: 'line2_end', x: line2.x2, y: line2.y2 }
    ];
    
    let minDistance = Infinity;
    let nearestEndpoint = null;
    
    for (const endpoint of endpoints) {
        const distance = Math.sqrt((x - endpoint.x) ** 2 + (y - endpoint.y) ** 2);
        if (distance <= DRAG_THRESHOLD && distance < minDistance) {
            minDistance = distance;
            nearestEndpoint = endpoint.name;
        }
    }
    
    return nearestEndpoint;
}

function updateDraggedEndpoint(x, y) {
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

function drawLines() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Line 1 (blue)
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(line1.x1, line1.y1);
    ctx.lineTo(line1.x2, line1.y2);
    ctx.stroke();
    
    // Line 2 (green)
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(line2.x1, line2.y1);
    ctx.lineTo(line2.x2, line2.y2);
    ctx.stroke();
    
    // Endpoints
    drawEndpoint(line1.x1, line1.y1, '#2563eb');
    drawEndpoint(line1.x2, line1.y2, '#2563eb');
    drawEndpoint(line2.x1, line2.y1, '#059669');
    drawEndpoint(line2.x2, line2.y2, '#059669');
}

function drawEndpoint(x, y, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
}

function adjustCanvasSize() {
    // Set canvas to exact video size
    canvas.width = 908;
    canvas.height = 1200;
    adjustLinePositions();
}

function adjustLinePositions() {
    if (canvas.width && canvas.height) {
        // Horizontal line
        line1.x1 = canvas.width * 0.1;
        line1.y1 = canvas.height * 0.5;
        line1.x2 = canvas.width * 0.9;
        line1.y2 = canvas.height * 0.5;
        
        // Vertical line
        line2.x1 = canvas.width * 0.5;
        line2.y1 = canvas.height * 0.1;
        line2.x2 = canvas.width * 0.5;
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
    document.getElementById('frameInfo').textContent = `Frame: ${frameNumber} / ${videoInfo.frames - 1}`;
}

function requestAnalysis() {
    if (!isConnected || !isEngineReady) return;
    
    const currentFrame = Math.floor(video.currentTime * (videoInfo.fps || 1));
    const videoLine1 = convertToVideoCoords(line1);
    const videoLine2 = convertToVideoCoords(line2);
    
    ws.send(JSON.stringify({
        type: 'analyzeLine',
        data: {
            frameNum: currentFrame,
            line1: videoLine1,
            line2: videoLine2
        }
    }));
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

function updateChart(chart, temperatures, color) {
    if (!temperatures || temperatures.length === 0) return;
    
    const labels = temperatures.map((_, index) => 
        Math.round((index / (temperatures.length - 1)) * 100)
    );
    
    chart.data.labels = labels;
    chart.data.datasets[0].data = temperatures;
    chart.data.datasets[0].borderColor = color;
    chart.update('none');
}

// Handle window resize
window.addEventListener('resize', () => {
    adjustCanvasSize();
    drawLines();
});