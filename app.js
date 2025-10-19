// Main application logic for the standalone Precision Lens Creation
let currentPage = 'camera'; 

// Placeholder for the camera stream object (accessible within this scope)
let cameraStream = null;

// Global placeholder for page modules
let pageModules = {}; 

// The main application logic block - runs on page load
document.addEventListener('DOMContentLoaded', function() {
    // 1. Initialize all hardware listeners (PTT single click, Scroll Wheel)
    initializeHardwareListeners();
    
    // 2. Load the camera page UI
    loadCameraPage(document.getElementById('content')); 
});

// --- PTT and Scroll Wheel Handlers (The Core of the R1 Creation) ---
function initializeHardwareListeners() {
    
    // --- PTT Button Logic (RELIABLE SINGLE CLICK for Capture) ---
    // This is the only PTT event we rely on within the app.
    window.addEventListener('sideClick', () => {
        // Route Single Click to Capture
        if (currentPage === 'camera' && pageModules.camera && typeof pageModules.camera.handleSingleClick === 'function') {
            pageModules.camera.handleSingleClick(); // Capture and Analyze
        }
    });

    // --- Scroll Wheel Listeners (Digital Zoom) ---
    window.addEventListener('scrollUp', () => {
        if (currentPage === 'camera' && pageModules.camera) {
            pageModules.camera.handleScrollUp(); 
        }
    });

    window.addEventListener('scrollDown', () => {
        if (currentPage === 'camera' && pageModules.camera) {
            pageModules.camera.handleScrollDown(); 
        }
    });
    
    window.addEventListener('longPressStart', () => {
        // OS trap remains
        console.log('Long press started (OS will likely override for LLM).');
    });
}

// --- CAMERA PAGE MODULE: THE PRECISION LENS (Patched for UI and Reliability) ---
function loadCameraPage(container) {
    // Inject the final UI with all buttons and containers
    container.innerHTML = `
        <div class="speak-container">
            <h3 style="margin-bottom: 10px;">Precision Lens</h3>
            <div style="font-size: 11px; color: #888; margin-bottom: 5px;">PTT Button: Capture. Scroll Wheel: Zoom.</div>
            
            <div style="position: relative; width: 220px; height: 180px; overflow: hidden; margin: 0 auto; border: 1px solid #00ff00; background: #333;">
                <video id="cameraPreview" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
                <img id="reviewImage" style="display: none; width: 100%; height: 100%; object-fit: contain; position: absolute; top: 0; left: 0;">
                <div id="cameraStatus" class="speak-status" style="position: absolute; bottom: 0; width: 100%; opacity: 0.9;">Not Active</div>
            </div>

            <div class="speak-controls" style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 4px;">
                <button id="launchBtn" style="flex: 1 1 48%;">Start Camera</button> 
                <button id="toggleFacingBtn" disabled style="flex: 1 1 48%;">Switch to User</button>
                <button id="reviewBtn" style="flex: 1 1 100%; background: #2a2a2a;">Review Last Photo (Plain Storage)</button>
            </div>
        </div>
    `;

    const cameraModule = {
        cameraStream: null,
        currentFacingMode: 'environment', 
        zoomLevel: 1.0,
        MAX_ZOOM: 3.0,
        MIN_ZOOM: 1.0,
        ZOOM_STEP: 0.2,

        // --- Utility ---
        updateStatus: function(status) {
            document.getElementById('cameraStatus').textContent = status;
        },
        
        toggleCaptureFeedback: function(enable) {
            const app = document.getElementById('app');
            if (enable) {
                // Flash red border for visual confirmation
                app.style.borderColor = '#FF0000';
                // Attempt to play a simple sound 
                new Audio('https://s3.amazonaws.com/clyp.it/wavs/clypit_shutter.wav').play().catch(e => console.log('Audio playback failed', e));
            } else {
                app.style.borderColor = '#00ff00'; // Revert to theme color
            }
        },

        // --- Camera Controls ---
        launchCamera: function(newFacingMode = this.currentFacingMode) {
            if (this.cameraStream) {
                this.stopCamera(); 
                return;
            }
            
            navigator.mediaDevices.getUserMedia({ 
                video: {
                    facingMode: newFacingMode 
                } 
            }).then(stream => {
                const videoEl = document.getElementById('cameraPreview');
                const reviewImg = document.getElementById('reviewImage');
                
                this.cameraStream = stream;
                this.currentFacingMode = newFacingMode;
                videoEl.srcObject = stream;
                videoEl.style.display = 'block'; // Show video
                reviewImg.style.display = 'none'; // Hide review image

                document.getElementById('launchBtn').textContent = 'Stop Camera';
                document.getElementById('toggleFacingBtn').disabled = false;
                document.getElementById('reviewBtn').disabled = false;
                this.updateStatus(`Facing: ${this.currentFacingMode} / Zoom: ${this.zoomLevel.toFixed(1)}x`);
                this.applyZoom();
            }).catch(e => {
                this.updateStatus(`Camera Error: ${e.name}. Tap Start to try again.`);
                console.error('Camera access error:', e);
            });
        },
        
        stopCamera: function() {
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(track => track.stop());
                this.cameraStream = null;
                document.getElementById('cameraPreview').style.display = 'none';
                document.getElementById('launchBtn').textContent = 'Start Camera';
                document.getElementById('toggleFacingBtn').disabled = true;
                this.updateStatus('Camera stopped.');
            }
        },

        toggleFacingMode: function() {
            if (!this.cameraStream) return;
            // Stop and restart camera with new mode
            const newMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
            this.launchCamera(newMode); 
        },
        
        // --- Digital Zoom (Scroll Wheel) Handlers ---
        handleScrollUp: function() {
            if (!this.cameraStream) return;
            this.zoomLevel = Math.min(this.MAX_ZOOM, this.zoomLevel + this.ZOOM_STEP);
            this.applyZoom();
        },
        
        handleScrollDown: function() {
            if (!this.cameraStream) return;
            this.zoomLevel = Math.max(this.MIN_ZOOM, this.zoomLevel - this.ZOOM_STEP);
            this.applyZoom();
        },
        
        applyZoom: function() {
            const videoEl = document.getElementById('cameraPreview');
            if (!videoEl) return;
            
            const scale = this.zoomLevel;
            // Use CSS transform for performance-friendly digital zoom 
            videoEl.style.transform = `scale(${scale})`;
            videoEl.style.transformOrigin = 'center center';
            
            this.updateStatus(`Facing: ${this.currentFacingMode} / Zoom: ${this.zoomLevel.toFixed(1)}x`);
        },

        // --- PTT Single-Click: Capture, Store, and Analyze ---
        handleSingleClick: function() {
            if (!this.cameraStream) {
                this.updateStatus('Launch camera first!');
                return;
            }
            this.captureStoreAndAnalyze();
        },
        
        captureStoreAndAnalyze: async function() {
            // 1. Visual/Audio Feedback for Capture
            this.toggleCaptureFeedback(true);
            setTimeout(() => this.toggleCaptureFeedback(false), 200);

            const videoEl = document.getElementById('cameraPreview');
            if (!this.cameraStream || !videoEl) return this.updateStatus('Camera not ready.');
            
            const canvas = document.createElement('canvas');
            canvas.width = 240;
            canvas.height = 282;
            const ctx = canvas.getContext('2d');

            // Calculate source dimensions for the current zoom level (Digital Zoom Capture)
            const srcWidth = videoEl.videoWidth / this.zoomLevel;
            const srcHeight = videoEl.videoHeight / this.zoomLevel;
            const srcX = (videoEl.videoWidth - srcWidth) / 2;
            const srcY = (videoEl.videoHeight - srcHeight) / 2;

            ctx.drawImage(videoEl, srcX, srcY, srcWidth, srcHeight, 0, 0, canvas.width, canvas.height);
            
            const imageBase64 = canvas.toDataURL('image/jpeg');
            this.updateStatus('Captured. Storing and Sending to LLM...');

            // 2. Store the image using PLAIN storage (only)
            if (typeof window.creationStorage !== 'undefined') {
                 try {
                    await window.creationStorage.plain.setItem('last_capture', imageBase64);
                    console.log('Image stored in plain storage.');
                 } catch (e) {
                     console.error('Plain Storage error:', e);
                 }
            }
            
            // 3. Send to LLM
            this.sendToLLM(imageBase64.split(',')[1]);
        },

        sendToLLM: function(base64Data) {
            const message = "Analyze this image and provide a concise description, a potential use, and respond ONLY with valid JSON in this format: {\"title\":\"...\",\"use\":\"...\",\"description\":\"...\"}";
            
            if (typeof PluginMessageHandler !== 'undefined') {
                const payload = {
                    message: message,
                    useLLM: true,
                    imageBase64: base64Data
                };
                PluginMessageHandler.postMessage(JSON.stringify(payload));
            } else {
                this.updateStatus('Plugin API not available for LLM.');
            }
        },

        // --- Review Captured Photo ---
        reviewLastPhoto: async function() {
            if (typeof window.creationStorage === 'undefined') return this.updateStatus('Storage API not available.');
            
            const imageBase64 = await window.creationStorage.plain.getItem('last_capture');
            const videoEl = document.getElementById('cameraPreview');
            const reviewImg = document.getElementById('reviewImage');
            
            if (imageBase64) {
                this.stopCamera(); // Stop camera stream if active

                reviewImg.src = imageBase64;
                reviewImg.style.display = 'block'; // Show review image
                videoEl.style.display = 'none'; // Hide video element
                this.updateStatus('Reviewing Last Captured Photo.');
            } else {
                this.updateStatus('No photo found in storage.');
            }
        },


        handleMessage: function(data) {
            console.log('Camera page handling LLM response:', data);
            let status = 'Analysis Complete.';
            if (data.data) {
                try {
                    const parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
                    status = `Analysis: ${parsed.title || 'Unknown Object'}`;
                } catch (e) {
                    status = `LLM Text: ${data.data.substring(0, 30)}...`;
                }
            }
            this.updateStatus(status);
        }
    };
    
    // Store module reference and bind handlers for routing
    pageModules.camera = cameraModule;
    pageModules.camera.handleScrollUp = cameraModule.handleScrollUp.bind(cameraModule);
    pageModules.camera.handleScrollDown = cameraModule.handleScrollDown.bind(cameraModule);
    
    // --- Hook up UI Button Event Listeners ---
    document.getElementById('launchBtn').addEventListener('click', () => cameraModule.launchCamera());
    document.getElementById('toggleFacingBtn').addEventListener('click', () => cameraModule.toggleFacingMode());
    document.getElementById('reviewBtn').addEventListener('click', () => cameraModule.reviewLastPhoto());
}
