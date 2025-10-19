// Placeholder for the camera stream object (accessible within this scope)
let cameraStream = null;

function loadCameraPage(container) {
    container.innerHTML = `
        <div class="speak-container">
            <h3 style="margin-bottom: 10px;">Precision Lens</h3>
            <div style="font-size: 11px; color: #888; margin-bottom: 5px;">Double PTT to Launch/Stop. Scroll to Zoom. Single PTT to Capture.</div>
            <div style="position: relative; width: 220px; height: 180px; overflow: hidden; margin: 0 auto; border: 1px solid #00ff00; background: #333;">
                <video id="cameraPreview" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
                <div id="cameraStatus" class="speak-status" style="position: absolute; bottom: 0; width: 100%; opacity: 0.9;">Facing: Environment</div>
            </div>
            <div class="speak-controls" style="margin-top: 10px; display: flex; gap: 8px;">
                <button id="launchBtn" style="flex: 1;">Status: Not Active</button>
                <button id="toggleFacingBtn" disabled style="flex: 1;">Switch to User</button>
            </div>
        </div>
    `;

    const cameraModule = {
        cameraStream: null,
        currentFacingMode: 'environment', // Start with Rabbit Eye external-facing
        zoomLevel: 1.0,
        MAX_ZOOM: 3.0,
        MIN_ZOOM: 1.0,
        ZOOM_STEP: 0.2,

        // --- Core Camera & Control Functions ---
        launchCamera: function(newFacingMode = this.currentFacingMode) {
            this.stopCamera(); // Stop the current stream first

            navigator.mediaDevices.getUserMedia({ 
                video: {
                    facingMode: newFacingMode 
                } 
            }).then(stream => {
                const videoEl = document.getElementById('cameraPreview');
                this.cameraStream = stream;
                this.currentFacingMode = newFacingMode;
                videoEl.srcObject = stream;
                
                document.getElementById('launchBtn').textContent = `Camera Active (${this.currentFacingMode})`;
                document.getElementById('toggleFacingBtn').textContent = `Switch to ${this.currentFacingMode === 'environment' ? 'User' : 'Environment'}`;
                document.getElementById('toggleFacingBtn').disabled = false;
                this.updateStatus(`Facing: ${this.currentFacingMode}`);
                this.applyZoom();
            }).catch(e => {
                this.updateStatus(`Camera Error: ${e.name}`);
                console.error('Camera access error:', e);
            });
        },
        
        stopCamera: function() {
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(track => track.stop()); // Stop all tracks
                this.cameraStream = null;
                document.getElementById('launchBtn').textContent = 'Status: Not Active';
                document.getElementById('toggleFacingBtn').disabled = true;
                this.updateStatus(`Facing: ${this.currentFacingMode}`);
            }
        },

        toggleFacingMode: function() {
            if (!this.cameraStream) return;
            // Toggle between environment (external) and user (selfie)
            const newMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
            this.launchCamera(newMode);
        },
        
        // --- Scroll Wheel (Digital Zoom) Handlers ---
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
            
            document.getElementById('launchBtn').textContent = `Active (Zoom: ${this.zoomLevel.toFixed(1)}x)`;
            this.updateStatus(`Zoom: ${this.zoomLevel.toFixed(1)}x / Facing: ${this.currentFacingMode}`);
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
            const videoEl = document.getElementById('cameraPreview');
            // ... [Capture setup remains the same, calculating zoom/crop] ...
            const canvas = document.createElement('canvas');
            canvas.width = 240; // R1 viewport width
            canvas.height = 282; // R1 viewport height
            const ctx = canvas.getContext('2d');

            // Calculate source dimensions for the current zoom level (Digital Zoom Capture)
            const srcWidth = videoEl.videoWidth / this.zoomLevel;
            const srcHeight = videoEl.videoHeight / this.zoomLevel;
            const srcX = (videoEl.videoWidth - srcWidth) / 2;
            const srcY = (videoEl.videoHeight - srcHeight) / 2;

            // Draw the zoomed/cropped frame to the canvas
            ctx.drawImage(videoEl, srcX, srcY, srcWidth, srcHeight, 0, 0, canvas.width, canvas.height);
            
            const imageBase64 = canvas.toDataURL('image/jpeg');
            this.updateStatus('Captured. Storing and Sending to LLM...');

            // --- 1. Store the image using PLAIN storage (only) ---
            if (typeof window.creationStorage !== 'undefined') {
                 try {
                    await window.creationStorage.plain.setItem('last_capture', imageBase64); // Uses plain storage
                    console.log('Image stored in plain storage.');
                 } catch (e) {
                     console.error('Plain Storage error:', e);
                 }
            }
            
            // --- 2. Send to LLM for structured analysis ---
            this.sendToLLM(imageBase64.split(',')[1]);
        },

        sendToLLM: function(base64Data) {
            // Enforcing Structured LLM Output for small screen display
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
        },
        
        updateStatus: function(status) {
            const statusDiv = document.getElementById('cameraStatus');
            if (statusDiv) {
                statusDiv.textContent = status;
            }
        }
    };
    
    // Store module reference
    pageModules.camera = cameraModule;
    
    // Bind hardware handlers for app.js routing
    pageModules.camera.handleScrollUp = cameraModule.handleScrollUp.bind(cameraModule);
    pageModules.camera.handleScrollDown = cameraModule.handleScrollDown.bind(cameraModule);
    
    // --- UI Button Event Listeners ---
    document.getElementById('launchBtn').addEventListener('click', () => cameraModule.launchCamera());
    document.getElementById('toggleFacingBtn').addEventListener('click', () => cameraModule.toggleFacingMode());
}