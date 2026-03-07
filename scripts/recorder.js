/**
 * Recording Module
 * Handles video (WebM/MP4) and GIF recording of the simulation canvas
 */

export class SimulationRecorder {
    constructor(canvas) {
        this.canvas = canvas;
        this.isRecording = false;
        this.format = 'webm'; // 'webm', 'gif'
        this.recordInterval = 1; // Record every N frames
        this.frameCount = 0;
        this.recordedFrameCount = 0;
        this.stepCounter = 0;
        
        // Video recording
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.videoStream = null;
        
        // GIF recording
        this.gifEncoder = null;
        this.gifFrames = [];
        
        // Callbacks
        this.onFrameCountUpdate = null;
        this.onRecordingComplete = null;
    }
    
    /**
     * Start recording with the specified format
     * @param {string} format - 'webm' or 'gif'
     * @param {number} recordInterval - Record every N steps
     */
    async startRecording(format = 'webm', recordInterval = 1) {
        if (this.isRecording) {
            console.warn('Already recording');
            return;
        }
        
        this.format = format;
        this.recordInterval = recordInterval;
        this.frameCount = 0;
        this.recordedFrameCount = 0;
        this.stepCounter = 0;
        this.isRecording = true;
        
        if (format === 'webm' || format === 'mp4') {
            await this.startVideoRecording();
        } else if (format === 'gif') {
            await this.startGifRecording();
        }
        
        console.log(`Started ${format.toUpperCase()} recording (every ${recordInterval} step${recordInterval !== 1 ? 's' : ''})`);
    }
    
    /**
     * Start video recording using MediaRecorder API
     */
    async startVideoRecording() {
        this.recordedChunks = [];
        
        // Capture stream from canvas
        this.videoStream = this.canvas.captureStream(30); // 30 FPS
        
        // Determine MIME type based on browser support
        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm;codecs=vp8';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
            }
        }
        
        this.mediaRecorder = new MediaRecorder(this.videoStream, {
            mimeType: mimeType,
            videoBitsPerSecond: 2500000
        });
        
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };
        
        this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            if (this.onRecordingComplete) {
                this.onRecordingComplete(blob, 'webm');
            }
        };
        
        this.mediaRecorder.start();
    }
    
    /**
     * Start GIF recording
     */
    async startGifRecording() {
        // Check if GIF.js is loaded
        if (typeof GIF === 'undefined') {
            console.error('GIF.js library not loaded. Please include gif.js script.');
            this.isRecording = false;
            return;
        }
        
        this.gifFrames = [];
        
        // Initialize GIF encoder (no workers to avoid cross-origin issues)
        this.gifEncoder = new GIF({
            workers: 0,
            quality: 10,
            width: this.canvas.width,
            height: this.canvas.height
        });
        
        this.gifEncoder.on('finished', (blob) => {
            if (this.onRecordingComplete) {
                this.onRecordingComplete(blob, 'gif');
            }
        });
    }
    
    /**
     * Capture the current frame
     * Should be called after each simulation step
     */
    captureFrame() {
        if (!this.isRecording) return;
        
        this.stepCounter++;
        
        // Only capture every N steps
        if (this.stepCounter % this.recordInterval !== 0) {
            return;
        }
        
        this.recordedFrameCount++;
        
        if (this.format === 'gif') {
            // For GIF, we need to manually capture frames
            this.captureGifFrame();
        }
        // For video, MediaRecorder captures automatically from the stream
        
        if (this.onFrameCountUpdate) {
            this.onFrameCountUpdate(this.recordedFrameCount);
        }
    }
    
    /**
     * Capture a frame for GIF encoding
     */
    captureGifFrame() {
        if (!this.gifEncoder) return;
        
        // Create a temporary canvas to capture the frame
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(this.canvas, 0, 0);
        
        // Add frame to GIF encoder with delay (ms per frame)
        // Calculate delay based on record interval
        const delayMs = 33 * this.recordInterval; // ~30fps base, adjusted by interval
        this.gifEncoder.addFrame(ctx, { copy: true, delay: delayMs });
    }
    
    /**
     * Stop recording and generate the output file
     */
    async stopRecording() {
        if (!this.isRecording) {
            console.warn('Not currently recording');
            return;
        }
        
        this.isRecording = false;
        
        if (this.format === 'webm' || this.format === 'mp4') {
            this.stopVideoRecording();
        } else if (this.format === 'gif') {
            await this.stopGifRecording();
        }
        
        console.log(`Stopped recording. Captured ${this.recordedFrameCount} frames.`);
    }
    
    /**
     * Stop video recording
     */
    stopVideoRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            
            // Stop all tracks in the stream
            if (this.videoStream) {
                this.videoStream.getTracks().forEach(track => track.stop());
                this.videoStream = null;
            }
        }
    }
    
    /**
     * Stop GIF recording and render
     */
    async stopGifRecording() {
        if (this.gifEncoder) {
            // Render the GIF (this will trigger the 'finished' event)
            this.gifEncoder.render();
        }
    }
    
    /**
     * Download the recorded file
     */
    downloadRecording(blob, format) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const extension = format === 'gif' ? 'gif' : 'webm';
        a.download = `lbm_simulation_${timestamp}.${extension}`;
        
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
    
    /**
     * Check if recording is supported in this browser
     */
    static isSupported() {
        return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
    }
    
    /**
     * Get supported video formats in this browser
     */
    static getSupportedFormats() {
        const formats = [];
        
        if (MediaRecorder.isTypeSupported('video/webm')) {
            formats.push('webm');
        }
        if (MediaRecorder.isTypeSupported('video/mp4')) {
            formats.push('mp4');
        }
        if (typeof GIF !== 'undefined') {
            formats.push('gif');
        }
        
        return formats;
    }
}
