// Main application logic for the standalone Precision Lens Creation
let currentPage = 'camera'; 

// Placeholder for the camera stream object (accessible within this scope)
let cameraStream = null;

// The main application content will be loaded here
document.addEventListener('DOMContentLoaded', function() {
    initializeHardwareListeners();
    // Force load the camera page immediately as this is a standalone app
    loadCameraPage(document.getElementById('content')); 
});

// --- PTT and Scroll Wheel Handlers (The Core of the R1 Creation) ---
function initializeHardwareListeners() {
    
    // --- PTT Button Logic (RELIABLE SINGLE CLICK for Capture) ---
    window.addEventListener('sideClick', () => {
        // Only trigger the capture when the camera page is active
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
        // This is still trapped by the OS for LLM - avoid using in the app
        console.log('Long press started (OS will likely override for LLM).');
    });
}

// Global page modules object
let pageModules = {}; 

// Load page content (simplified to only handle the camera)
function loadCameraPage(container) {
    // Inject the final camera UI with Review Button
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
                <button id="reviewBtn" style="flex: 1 1 100%; background: #2a2a2a;" disabled>Review Last Photo (Plain Storage)</button>
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
                // Attempt to play a simple sound (will only work if allowed by WebView)
                new Audio('https://s3.amazonaws.com/clyp.it/wavs/clypit_shutter.wav').play().catch(e => console.log('Audio playback failed', e));
            } else {
                app.style.borderColor = '#00ff00'; // Revert to theme color
            }
        },

        // --- Camera Controls ---
        launchCamera: function(newFacingMode = this.currentFacingMode) {
            if (this.cameraStream) {
                this.stopCamera(); // Stop to toggle off
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
                this.updateStatus(`Camera Error: ${e.name}. Access denied or not available.`);
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
            videoEl.style.transform = `scale(${scale})`;
            videoEl.style.transformOrigin = 'center center';
            
            this.updateStatus(`Facing: ${this.currentFacingMode} / Zoom: ${this.zoomLevel.toFixed(1)}x`);
        },

        // --- Capture, Store, and Analyze ---
        handleSingleClick: function() {
            if (!this.cameraStream) {
                this.updateStatus('Launch camera first!');
                return;
            }
            this.captureStoreAndAnalyze();
        },
        
        captureStoreAndAnalyze: async function() {
            // 1. Visual/Audio Feedback
            this.toggleCaptureFeedback(true);
            setTimeout(() => this.toggleCaptureFeedback(false), 200);

            const videoEl = document.getElementById('cameraPreview');
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
            this.updateStatus('Captured. Sending to LLM...');
            
            // 2. Store the image (Plain Storage)
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
                // Stop camera stream if active to show image clearly
                this.stopCamera(); 
                
                reviewImg.src = imageBase64;
                reviewImg.style.display = 'block'; // Show review image
                videoEl.style.display = 'none'; // Hide video element
                this.updateStatus('Reviewing Last Captured Photo.');
            } else {
                this.updateStatus('No photo found in storage.');
            }
        },

        handleMessage: function(data) {
            // ... (LLM handling remains the same) ...
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
    
    // Store module reference
    pageModules.camera = cameraModule;
    
    // Bind handlers for app.js routing
    pageModules.camera.handleScrollUp = cameraModule.handleScrollUp.bind(cameraModule);
    pageModules.camera.handleScrollDown = cameraModule.handleScrollDown.bind(cameraModule);
    
    // --- UI Button Event Listeners ---
    document.getElementById('launchBtn').addEventListener('click', () => cameraModule.launchCamera());
    document.getElementById('toggleFacingBtn').addEventListener('click', () => cameraModule.toggleFacingMode());
    document.getElementById('reviewBtn').addEventListener('click', () => cameraModule.reviewLastPhoto());
}
