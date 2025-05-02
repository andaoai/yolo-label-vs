// Constants and Configuration
const CONFIG = {
    CLOSE_POINT_THRESHOLD: 0.01,
    COLORS: [
        '#2196F3', '#4CAF50', '#F44336', '#FFC107', '#9C27B0',
        '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63'
    ],
    DEBOUNCE_DELAY: 200,
    MAX_SEARCH_RESULTS: 10,
    MIN_ZOOM: 0.1,
    MAX_ZOOM: 10,
    ZOOM_SPEED: 0.1,
    SCROLL_SPEED: 30,
    POINT_RADIUS: 3,
    HIGHLIGHT_RADIUS: 5,
    CLOSE_HIGHLIGHT_RADIUS: 8,
    MIN_BOX_SIZE: 0.01, // 1% of image size
    LINE_WIDTH: 2,
    CROSSHAIR_COLOR: 'rgba(0, 255, 0, 0.94)',
    CROSSHAIR_CENTER_COLOR: 'rgba(255, 255, 255, 0.9)',
    BACKGROUND_COLOR: '#1e1e1e',
    LABEL_FONT_SIZE: 14,
    LABEL_PADDING: 5,
    LABEL_HEIGHT: 20
};

// State Management - Using ES6+ class fields
class LabelingState {
    // Use class fields for better organization and readability
    vscode = acquireVsCodeApi();
    currentImage = window.initialImageData;
    initialLabels = window.initialLabels;
    isDrawing = false;
    startX = 0;
    startY = 0;
    currentLabel = 0;
    classNamesList = window.classNames || [];
    currentMode = 'box';
    polygonPoints = [];
    isDrawingPolygon = false;
    showLabels = true;
    allImagePaths = [];
    selectedSearchIndex = -1;
    currentMousePos = null;
    searchTimeout = null;
    
    // Zoom and pan related state
    scale = 1;
    translateX = 0;
    translateY = 0;
    isPanning = false;
    lastPanPoint = { x: 0, y: 0 };
    
    // Image dimensions for coordinate calculations
    originalImageWidth = 0;
    originalImageHeight = 0;
    
    // Canvas and image relationship
    canvasRect = null;
    imageRect = null;
    
    // Animation related
    animationFrameId = null;
    needsRedraw = false;
    
    // For throttling mousemove events
    lastRenderTime = 0;
    throttleDelay = 16; // ~60fps
    
    // undo/redo history
    history = [];
    historyIndex = -1;
    maxHistorySize = 50;
    
    constructor() {
        // Ensure all labels have a visibility property
        if (this.initialLabels) {
            this.initialLabels.forEach(label => {
                if (label.visible === undefined) {
                    label.visible = true;
                }
            });
        }
        
        // Store initial labels in history
        this.pushHistory();
    }
    
    // Add undo/redo functionality
    pushHistory() {
        // Remove any future history if we're in the middle of the history stack
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        // Clone current labels for history
        const labelsCopy = JSON.parse(JSON.stringify(this.initialLabels));
        
        // Add to history
        this.history.push(labelsCopy);
        
        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
        
        // Update index
        this.historyIndex = this.history.length - 1;
    }
    
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.initialLabels = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            return true;
        }
        return false;
    }
    
    // Request animation frame for efficient rendering
    requestRedraw() {
        this.needsRedraw = true;
        if (!this.animationFrameId) {
            this.animationFrameId = requestAnimationFrame(() => {
                if (this.needsRedraw) {
                    this.needsRedraw = false;
                    this.animationFrameId = null;
                    // The actual redraw will be called by the manager
                    if (this.onRedrawRequested) {
                        this.onRedrawRequested();
                    }
                }
            });
        }
    }
    
    // Throttle function for mousemove events
    shouldUpdate() {
        const now = performance.now();
        if (now - this.lastRenderTime >= this.throttleDelay) {
            this.lastRenderTime = now;
            return true;
        }
        return false;
    }
}

// Canvas Manager
class CanvasManager {
    constructor(state) {
        this.state = state;
        this.canvas = document.getElementById('imageCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.coordinates = document.getElementById('coordinates');
        
        // Set callback for animation frame based redraw
        this.state.onRedrawRequested = this.redrawWithTransform.bind(this);
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Use object method reference with bind for better readability
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
        window.addEventListener('resize', this.handleResize.bind(this));
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));
        window.addEventListener('keydown', this.handleKeyboardShortcuts.bind(this));
        
        // Handle mouse leave with arrow function for conciseness
        this.canvas.addEventListener('mouseleave', () => {
            if (this.state.isDrawing) {
                this.state.isDrawing = false;
                this.state.requestRedraw();
            }
            if (this.state.isPanning) {
                this.state.isPanning = false;
                this.canvas.classList.remove('grabbing');
            }
            this.canvas.classList.remove('grabable');
        });
        
        // Clean up event listeners when window is unloaded
        window.addEventListener('unload', this.cleanupEventListeners.bind(this));
    }
    
    // Cleanup method to prevent memory leaks
    cleanupEventListeners() {
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
        this.canvas.removeEventListener('wheel', this.handleWheel);
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('keydown', this.handleKeyboardShortcuts);
    }

    // Update canvas and image rectangles for coordinate calculations
    updateRects() {
        // Get current canvas client rectangle
        this.state.canvasRect = this.canvas.getBoundingClientRect();
        
        // Calculate aspect ratios
        const imageAspectRatio = this.state.originalImageWidth / this.state.originalImageHeight;
        const canvasAspectRatio = this.state.canvasRect.width / this.state.canvasRect.height;
        
        // Calculate image dimensions within canvas
        let imageWidth, imageHeight, imageLeft, imageTop;
        
        if (this.state.scale === 1) {
            // At standard scale, calculate image position based on aspect ratio
            if (imageAspectRatio > canvasAspectRatio) {
                // Image is wider than canvas
                imageWidth = this.state.canvasRect.width;
                imageHeight = imageWidth / imageAspectRatio;
                imageLeft = 0;
                imageTop = (this.state.canvasRect.height - imageHeight) / 2;
            } else {
                // Image is taller than canvas
                imageHeight = this.state.canvasRect.height;
                imageWidth = imageHeight * imageAspectRatio;
                imageLeft = (this.state.canvasRect.width - imageWidth) / 2;
                imageTop = 0;
            }
        } else {
            // When zoomed, use entire canvas
            imageWidth = this.state.canvasRect.width;
            imageHeight = this.state.canvasRect.height;
            imageLeft = 0;
            imageTop = 0;
        }
        
        // Store image rectangle for calculations
        this.state.imageRect = {
            left: imageLeft,
            top: imageTop,
            width: imageWidth,
            height: imageHeight,
            right: imageLeft + imageWidth,
            bottom: imageTop + imageHeight
        };
    }

    // Convert mouse position to image coordinates
    getMousePos(evt) {
        // Ensure rectangles are updated
        this.updateRects();
        
        // Calculate mouse position in canvas element pixels
        const mouseX = evt.clientX - this.state.canvasRect.left;
        const mouseY = evt.clientY - this.state.canvasRect.top;
        
        // Convert to canvas coordinate system
        let canvasX, canvasY;
        
        if (this.state.scale === 1) {
            // Standard scale: consider image might not fill canvas
            canvasX = (mouseX - this.state.imageRect.left) / this.state.imageRect.width * this.canvas.width;
            canvasY = (mouseY - this.state.imageRect.top) / this.state.imageRect.height * this.canvas.height;
        } else {
            // When zoomed: use canvas proportions directly
            canvasX = mouseX / this.state.canvasRect.width * this.canvas.width;
            canvasY = mouseY / this.state.canvasRect.height * this.canvas.height;
        }
        
        // Apply inverse transform to get image coordinates
        const imageX = (canvasX - this.state.translateX) / this.state.scale;
        const imageY = (canvasY - this.state.translateY) / this.state.scale;
        
        return { x: imageX, y: imageY };
    }

    // Get raw canvas coordinates without considering zoom/pan
    getRawMousePos(evt) {
        // Ensure rectangles are updated
        this.updateRects();
        
        // Calculate mouse position in canvas element
        const mouseX = evt.clientX - this.state.canvasRect.left;
        const mouseY = evt.clientY - this.state.canvasRect.top;
        
        let canvasX, canvasY;
        
        if (this.state.scale === 1) {
            // Standard scale: adjust for image position
            canvasX = (mouseX - this.state.imageRect.left) / this.state.imageRect.width * this.canvas.width;
            canvasY = (mouseY - this.state.imageRect.top) / this.state.imageRect.height * this.canvas.height;
        } else {
            // When zoomed: use canvas proportions
            canvasX = mouseX / this.state.canvasRect.width * this.canvas.width;
            canvasY = mouseY / this.state.canvasRect.height * this.canvas.height;
        }
        
        return { x: canvasX, y: canvasY };
    }

    handleMouseDown(e) {
        // Ensure rectangles are up to date
        this.updateRects();
        
        // Check for panning mode (alt key pressed)
        if (e.altKey) {
            this.state.isPanning = true;
            this.state.lastPanPoint = this.getRawMousePos(e);
            this.canvas.classList.add('grabbing');
            return;
        }
        
        // Get normalized mouse position (0-1 range)
        const pos = this.getMousePos(e);
        const x = pos.x / this.state.originalImageWidth;
        const y = pos.y / this.state.originalImageHeight;

        if (this.state.currentMode === 'box') {
            this.startBoxDrawing(x, y);
        } else if (this.state.currentMode === 'seg') {
            this.handleSegmentationClick(x, y);
        }
    }
    
    // Handle start of box drawing
    startBoxDrawing(x, y) {
        this.state.isDrawing = true;
        this.state.startX = x;
        this.state.startY = y;
    }
    
    // Handle click in segmentation mode
    handleSegmentationClick(x, y) {
        if (!this.state.isDrawingPolygon) {
            // Start new polygon
            this.state.isDrawingPolygon = true;
            this.state.polygonPoints = [x, y];
        } else {
            // Check if closing the polygon
            if (this.state.polygonPoints.length >= 6 && this.isNearFirstPoint(x, y)) {
                this.completePolygon();
            } else {
                // Add new point
                this.state.polygonPoints.push(x, y);
            }
        }
        this.state.requestRedraw();
    }

    handleMouseMove(e) {
        // Throttle updates for better performance
        if (!this.state.shouldUpdate()) return;
        
        // Update rectangles
        this.updateRects();
        
        // Update cursor based on alt key
        this.updateCursorStyle(e);
        
        // Handle panning if active
        if (this.state.isPanning) {
            this.handlePanning(e);
            return;
        }
        
        // Get normalized mouse position and update state
        const pos = this.getMousePos(e);
        const normalizedX = pos.x / this.state.originalImageWidth;
        const normalizedY = pos.y / this.state.originalImageHeight;
        
        this.state.currentMousePos = { x: normalizedX, y: normalizedY };
        
        // Update coordinate display
        this.updateCoordinateDisplay(normalizedX, normalizedY);
        
        // Redraw canvas with current mouse position
        this.state.requestRedraw();
    }
    
    // Update cursor style based on current state
    updateCursorStyle(e) {
        if (e.altKey && !this.state.isPanning) {
            this.canvas.classList.add('grabable');
        } else if (!e.altKey && !this.state.isPanning) {
            this.canvas.classList.remove('grabable');
        }
    }
    
    // Handle panning logic
    handlePanning(e) {
        const currentPoint = this.getRawMousePos(e);
        const deltaX = currentPoint.x - this.state.lastPanPoint.x;
        const deltaY = currentPoint.y - this.state.lastPanPoint.y;
        
        this.state.translateX += deltaX;
        this.state.translateY += deltaY;
        this.state.lastPanPoint = currentPoint;
        
        this.state.requestRedraw();
    }
    
    // Update coordinate display in status bar
    updateCoordinateDisplay(x, y) {
        this.coordinates.textContent = `X: ${Math.round(x * 100)}%, Y: ${Math.round(y * 100)}%`;
    }

    handleMouseUp(e) {
        // Update rectangles
        this.updateRects();
        
        // Handle pan end
        if (this.state.isPanning) {
            this.state.isPanning = false;
            this.canvas.classList.remove('grabbing');
            return;
        }
        
        // Handle box completion
        if (this.state.currentMode === 'box' && this.state.isDrawing) {
            this.completeBoxDrawing(e);
        }
    }
    
    // Complete box drawing and add to labels
    completeBoxDrawing(e) {
        const pos = this.getMousePos(e);
        
        // Get normalized coordinates
        const x = pos.x / this.state.originalImageWidth;
        const y = pos.y / this.state.originalImageHeight;
        
        // Calculate box dimensions
        const width = Math.abs(x - this.state.startX);
        const height = Math.abs(y - this.state.startY);
        
        // Only create box if minimum size is met
        if (width > CONFIG.MIN_BOX_SIZE && height > CONFIG.MIN_BOX_SIZE) {
            // Calculate box center
            const boxX = Math.min(this.state.startX, x) + width/2;
            const boxY = Math.min(this.state.startY, y) + height/2;
            
            // Add the new bounding box
            this.state.initialLabels.push({
                class: this.state.currentLabel,
                x: boxX,
                y: boxY,
                width: width,
                height: height,
                isSegmentation: false
            });
            
            // Add to history
            this.state.pushHistory();
            
            // Update UI
            this.updateLabelList();
        }
        
        this.state.isDrawing = false;
        this.state.requestRedraw();
    }

    handleWheel(e) {
        // Handle zooming with ctrl key
        if (e.ctrlKey) {
            this.handleZoom(e);
        }
        // Handle scrolling when zoomed in
        else if (this.state.scale > 1) {
            this.handleScroll(e);
        }
    }
    
    // Handle zoom with wheel
    handleZoom(e) {
        e.preventDefault();
        
        // Update rectangles
        this.updateRects();
        
        // Get mouse position before zoom
        const mousePos = this.getRawMousePos(e);
        
        // Calculate new scale
        const delta = e.deltaY > 0 ? -1 : 1;
        const zoom = delta * CONFIG.ZOOM_SPEED;
        const newScale = Math.max(
            CONFIG.MIN_ZOOM,
            Math.min(CONFIG.MAX_ZOOM, this.state.scale + zoom)
        );
        
        // Only proceed if scale actually changed
        if (newScale !== this.state.scale) {
            // Calculate zoom towards mouse position
            const scaleRatio = newScale / this.state.scale;
            
            // Update translation to zoom toward mouse cursor
            this.state.translateX = mousePos.x - (mousePos.x - this.state.translateX) * scaleRatio;
            this.state.translateY = mousePos.y - (mousePos.y - this.state.translateY) * scaleRatio;
            
            // Apply new scale
            this.state.scale = newScale;
            
            // Update zoom info display
            this.updateZoomDisplay();
            
            // Resize canvas and redraw
            this.resizeCanvas();
            this.state.requestRedraw();
        }
    }
    
    // Handle scrolling when zoomed in
    handleScroll(e) {
        e.preventDefault();
        
        // Calculate scroll distance
        const delta = e.deltaY > 0 ? 1 : -1;
        
        if (e.shiftKey) {
            // Horizontal scroll with shift key
            this.state.translateX -= delta * CONFIG.SCROLL_SPEED;
        } else {
            // Vertical scroll normally
            this.state.translateY -= delta * CONFIG.SCROLL_SPEED;
        }
        
        // Redraw canvas
        this.state.requestRedraw();
    }
    
    // Update zoom display in UI
    updateZoomDisplay() {
        const zoomPercent = Math.round(this.state.scale * 100);
        document.getElementById('zoom-info').textContent = `Zoom: ${zoomPercent}%`;
    }

    handleContextMenu(e) {
        e.preventDefault();
        // Cancel polygon drawing on right click
        if (this.state.currentMode === 'seg' && this.state.isDrawingPolygon) {
            this.state.isDrawingPolygon = false;
            this.state.polygonPoints = [];
            this.state.requestRedraw();
        }
    }

    handleResize() {
        if (this.state.currentImage) {
            this.resizeCanvas();
            this.state.requestRedraw();
        }
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const maxWidth = container.clientWidth;
        const maxHeight = container.clientHeight;
        
        if (this.state.scale !== 1) {
            // When zoomed, fill container without maintaining aspect ratio
            this.canvas.style.width = `${maxWidth}px`;
            this.canvas.style.height = `${maxHeight}px`;
            
            // Set canvas dimensions if needed
            if (this.canvas.width !== maxWidth || this.canvas.height !== maxHeight) {
                // Cache current canvas content
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = this.canvas.width;
                tempCanvas.height = this.canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(this.canvas, 0, 0);
                
                // Resize canvas
                this.canvas.width = maxWidth;
                this.canvas.height = maxHeight;
                
                // Restore content
                this.ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 
                                  0, 0, this.canvas.width, this.canvas.height);
            }
        } else {
            // At normal scale, maintain image aspect ratio
            const imageAspectRatio = this.state.originalImageWidth / this.state.originalImageHeight;
            const containerAspectRatio = maxWidth / maxHeight;
            
            let newWidth, newHeight;
            if (imageAspectRatio > containerAspectRatio) {
                newWidth = maxWidth;
                newHeight = maxWidth / imageAspectRatio;
            } else {
                newHeight = maxHeight;
                newWidth = maxHeight * imageAspectRatio;
            }
            
            this.canvas.style.width = `${newWidth}px`;
            this.canvas.style.height = `${newHeight}px`;
        }
        
        // Update rectangles to reflect new dimensions
        this.updateRects();
    }

    loadImage(imagePath) {
        if (!imagePath) return;
        
        const img = new Image();
        
        // Show loading indicator
        this.showLoadingState(true);
        
        img.onload = () => {
            // Hide loading indicator
            this.showLoadingState(false);
            
            const container = this.canvas.parentElement;
            const maxWidth = container.clientWidth;
            const maxHeight = container.clientHeight;
            
            // Store original image dimensions
            this.state.originalImageWidth = img.width;
            this.state.originalImageHeight = img.height;
            
            // Set canvas to image dimensions
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            
            // Adjust display size to container
            this.canvas.style.width = `${maxWidth}px`;
            this.canvas.style.height = `${maxHeight}px`;
            
            // Reset zoom and pan
            this.state.scale = 1;
            this.state.translateX = 0;
            this.state.translateY = 0;
            this.updateZoomDisplay();
            
            // Ensure canvas dimensions are correct
            this.resizeCanvas();
            
            // Update rectangles
            this.updateRects();
            
            // Draw image and labels
            this.state.requestRedraw();
            this.updateLabelList();
        };
        
        img.onerror = () => {
            this.showLoadingState(false);
            // Show error message
            this.showImageError();
        };
        
        img.src = imagePath;
        this.state.currentImage = img;
    }
    
    // Show loading state UI
    showLoadingState(isLoading) {
        const canvas = this.canvas;
        if (isLoading) {
            canvas.classList.add('loading');
            // Could add a loading spinner if desired
        } else {
            canvas.classList.remove('loading');
        }
    }
    
    // Show image loading error
    showImageError() {
        // Display error message on canvas
        this.ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#ff5252';
        this.ctx.font = '16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Error loading image', this.canvas.width / 2, this.canvas.height / 2);
    }

    redrawWithTransform() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background
        this.ctx.save();
        this.ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        
        // Draw image and annotations if image is loaded
        if (this.state.currentImage && this.state.currentImage.complete) {
            // Apply transformations
            this.ctx.save();
            this.ctx.translate(this.state.translateX, this.state.translateY);
            this.ctx.scale(this.state.scale, this.state.scale);
            
            // Draw image
            this.ctx.drawImage(this.state.currentImage, 0, 0);
            
            // Draw labels
            this.drawLabels();
            
            // Draw current polygon if in segmentation mode
            if (this.state.currentMode === 'seg' && this.state.isDrawingPolygon) {
                this.drawCurrentPolygon();
            }
            
            // Draw active box if in box mode and drawing
            if (this.state.currentMode === 'box' && this.state.isDrawing && this.state.currentMousePos) {
                this.drawPreviewBox(this.state.currentMousePos.x, this.state.currentMousePos.y);
            }
            
            // Draw crosshairs at mouse position
            if (this.state.currentMousePos) {
                const mouseX = this.state.currentMousePos.x * this.state.originalImageWidth;
                const mouseY = this.state.currentMousePos.y * this.state.originalImageHeight;
                this.drawCrosshairs(mouseX, mouseY);
            }
            
            this.ctx.restore();
        }
    }

    drawLabels() {
        if (!this.state.initialLabels || this.state.initialLabels.length === 0) {
            return;
        }
        
        this.state.initialLabels.forEach((label, index) => {
            // Skip labels that are not visible
            if (label.visible === false) {
                return;
            }
            
            const color = CONFIG.COLORS[label.class % CONFIG.COLORS.length];
            
            if (label.isSegmentation && label.points) {
                this.drawSegmentationLabel(label, color);
            } else {
                this.drawBoundingBoxLabel(label, color);
            }
        });
    }

    drawSegmentationLabel(label, color) {
        // Set styles
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = CONFIG.LINE_WIDTH / this.state.scale;
        this.ctx.fillStyle = `${color}33`; // Add transparency
        
        // Draw polygon
        this.ctx.beginPath();
        for (let i = 0; i < label.points.length; i += 2) {
            const x = label.points[i] * this.state.originalImageWidth;
            const y = label.points[i + 1] * this.state.originalImageHeight;
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        
        // Draw label text if enabled
        if (this.state.showLabels && label.points.length >= 2) {
            // Use first point for label position
            const labelX = label.points[0] * this.state.originalImageWidth;
            const labelY = label.points[1] * this.state.originalImageHeight;
            
            const text = `${this.state.classNamesList[label.class] || label.class.toString()} (SEG)`;
            this.drawLabelText(text, labelX, labelY, color);
        }
    }

    drawBoundingBoxLabel(label, color) {
        // Calculate pixel coordinates
        const x = label.x * this.state.originalImageWidth;
        const y = label.y * this.state.originalImageHeight;
        const width = label.width * this.state.originalImageWidth;
        const height = label.height * this.state.originalImageHeight;
        
        // Draw box
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = CONFIG.LINE_WIDTH / this.state.scale;
        this.ctx.strokeRect(x - width/2, y - height/2, width, height);
        
        // Draw label text if enabled
        if (this.state.showLabels) {
            const text = `${this.state.classNamesList[label.class] || label.class.toString()} (BOX)`;
            this.drawLabelText(text, x - width/2, y - height/2 - CONFIG.LABEL_HEIGHT / this.state.scale, color);
        }
    }
    
    // Helper method for drawing label text
    drawLabelText(text, x, y, color) {
        // Set font size based on zoom
        const fontSize = CONFIG.LABEL_FONT_SIZE / Math.max(1, this.state.scale);
        this.ctx.font = `${fontSize}px sans-serif`;
        
        // Measure text width
        const textWidth = this.ctx.measureText(text).width;
        
        // Draw text background
        this.ctx.fillStyle = color;
        this.ctx.fillRect(
            x,
            y,
            textWidth + (CONFIG.LABEL_PADDING * 2) / this.state.scale,
            CONFIG.LABEL_HEIGHT / this.state.scale
        );
        
        // Draw text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(
            text,
            x + CONFIG.LABEL_PADDING / this.state.scale,
            y + (CONFIG.LABEL_HEIGHT - CONFIG.LABEL_PADDING) / this.state.scale
        );
    }

    drawPreviewBox(currentX, currentY) {
        // Calculate normalized dimensions
        const width = Math.abs(currentX - this.state.startX);
        const height = Math.abs(currentY - this.state.startY);
        
        // Calculate the box center coordinates
        const boxX = Math.min(this.state.startX, currentX) + width/2;
        const boxY = Math.min(this.state.startY, currentY) + height/2;
        
        // Set styles
        this.ctx.strokeStyle = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        this.ctx.lineWidth = CONFIG.LINE_WIDTH / this.state.scale;
        
        // Convert to pixel coordinates
        const boxLeft = (boxX - width/2) * this.state.originalImageWidth;
        const boxTop = (boxY - height/2) * this.state.originalImageHeight;
        const boxWidth = width * this.state.originalImageWidth;
        const boxHeight = height * this.state.originalImageHeight;
        
        // Draw rectangle
        this.ctx.strokeRect(boxLeft, boxTop, boxWidth, boxHeight);
    }

    drawCrosshairs(x, y) {
        // Calculate canvas positions
        const canvasX = x * this.state.scale + this.state.translateX;
        const canvasY = y * this.state.scale + this.state.translateY;
        
        // Draw in canvas coordinate space
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Set crosshair style
        this.ctx.strokeStyle = CONFIG.CROSSHAIR_COLOR;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        
        // Draw horizontal line
        this.ctx.beginPath();
        this.ctx.moveTo(0, canvasY);
        this.ctx.lineTo(this.canvas.width, canvasY);
        this.ctx.stroke();
        
        // Draw vertical line
        this.ctx.beginPath();
        this.ctx.moveTo(canvasX, 0);
        this.ctx.lineTo(canvasX, this.canvas.height);
        this.ctx.stroke();
        
        // Draw center point
        this.ctx.beginPath();
        this.ctx.arc(canvasX, canvasY, 3, 0, Math.PI * 2);
        this.ctx.strokeStyle = CONFIG.CROSSHAIR_CENTER_COLOR;
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    drawCurrentPolygon() {
        if (!this.state.isDrawingPolygon || this.state.polygonPoints.length < 2) return;

        const color = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = CONFIG.LINE_WIDTH / this.state.scale;
        
        // Draw existing polygon lines
        this.ctx.beginPath();
        
        // Get first point
        const firstX = this.state.polygonPoints[0] * this.state.originalImageWidth;
        const firstY = this.state.polygonPoints[1] * this.state.originalImageHeight;
        this.ctx.moveTo(firstX, firstY);
        
        // Draw connected lines
        for (let i = 2; i < this.state.polygonPoints.length; i += 2) {
            const x = this.state.polygonPoints[i] * this.state.originalImageWidth;
            const y = this.state.polygonPoints[i + 1] * this.state.originalImageHeight;
            this.ctx.lineTo(x, y);
        }
        
        this.ctx.stroke();
        
        // Draw preview line if mouse position is available
        if (this.state.currentMousePos) {
            this.drawPreviewLine(firstX, firstY, color);
        }
        
        // Draw points
        this.drawPolygonPoints();
    }
    
    // Draw preview line from last point to current mouse or first point if closing
    drawPreviewLine(firstX, firstY, color) {
        const lastX = this.state.polygonPoints[this.state.polygonPoints.length - 2] * this.state.originalImageWidth;
        const lastY = this.state.polygonPoints[this.state.polygonPoints.length - 1] * this.state.originalImageHeight;
        
        this.ctx.beginPath();
        this.ctx.moveTo(lastX, lastY);
        
        if (this.isNearFirstPoint(this.state.currentMousePos.x, this.state.currentMousePos.y)) {
            // If near first point, snap preview line to first point
            this.ctx.lineTo(firstX, firstY);
        } else {
            // Otherwise draw to current mouse position
            this.ctx.lineTo(
                this.state.currentMousePos.x * this.state.originalImageWidth,
                this.state.currentMousePos.y * this.state.originalImageHeight
            );
        }
        
        this.ctx.strokeStyle = color;
        this.ctx.stroke();
    }

    drawPolygonPoints() {
        const color = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        this.ctx.fillStyle = color;
        
        // Calculate point radius based on zoom
        const pointRadius = CONFIG.POINT_RADIUS / this.state.scale;
        
        // Draw all points
        for (let i = 0; i < this.state.polygonPoints.length; i += 2) {
            const x = this.state.polygonPoints[i] * this.state.originalImageWidth;
            const y = this.state.polygonPoints[i + 1] * this.state.originalImageHeight;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Highlight first point if we have enough points
        if (this.state.polygonPoints.length >= 4) {
            this.highlightFirstPoint(color, pointRadius);
        }
    }
    
    // Highlight the first point of polygon
    highlightFirstPoint(color, pointRadius) {
        const firstX = this.state.polygonPoints[0] * this.state.originalImageWidth;
        const firstY = this.state.polygonPoints[1] * this.state.originalImageHeight;
        
        // Draw outer white circle
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = CONFIG.LINE_WIDTH / this.state.scale;
        this.ctx.beginPath();
        this.ctx.arc(firstX, firstY, CONFIG.HIGHLIGHT_RADIUS / this.state.scale, 0, Math.PI * 2);
        this.ctx.stroke();

        // Draw inner colored circle
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(firstX, firstY, pointRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Add extra highlight when mouse is near
        if (this.state.currentMousePos && 
            this.isNearFirstPoint(this.state.currentMousePos.x, this.state.currentMousePos.y)) {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 3 / this.state.scale;
            this.ctx.beginPath();
            this.ctx.arc(firstX, firstY, CONFIG.CLOSE_HIGHLIGHT_RADIUS / this.state.scale, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }

    isNearFirstPoint(x, y) {
        if (this.state.polygonPoints.length < 2) return false;
        
        const firstX = this.state.polygonPoints[0];
        const firstY = this.state.polygonPoints[1];
        const distance = Math.sqrt(Math.pow(x - firstX, 2) + Math.pow(y - firstY, 2));
        
        return distance < CONFIG.CLOSE_POINT_THRESHOLD;
    }

    completePolygon() {
        if (this.state.polygonPoints.length >= 6) {
            // Calculate bounding box from polygon points
            const bbox = this.calculateBoundingBoxFromPolygon(this.state.polygonPoints);
            
            // Add new segmentation label
            this.state.initialLabels.push({
                class: this.state.currentLabel,
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height,
                isSegmentation: true,
                points: [...this.state.polygonPoints]
            });
            
            // Add to history
            this.state.pushHistory();
            
            // Reset polygon state
            this.state.isDrawingPolygon = false;
            this.state.polygonPoints = [];
            
            // Update UI
            this.state.requestRedraw();
            this.updateLabelList();
        }
    }

    // Calculate bounding box from polygon points
    calculateBoundingBoxFromPolygon(points) {
        if (points.length < 4) return { x: 0, y: 0, width: 0, height: 0 };
        
        // Initialize min/max values
        let minX = points[0];
        let minY = points[1];
        let maxX = points[0];
        let maxY = points[1];
        
        // Find min/max x and y coordinates
        for (let i = 0; i < points.length; i += 2) {
            const x = points[i];
            const y = points[i + 1];
            
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
        
        // Calculate width and height
        const width = maxX - minX;
        const height = maxY - minY;
        
        // Return box with center point, width, and height (YOLO format)
        return {
            x: minX + width / 2,
            y: minY + height / 2,
            width: width,
            height: height
        };
    }

    updateLabelList() {
        const labelList = document.getElementById('labelList');
        labelList.innerHTML = '';
        
        if (!this.state.initialLabels.length) {
            // Show empty state if no labels
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.textContent = 'No labels yet. Draw on the image to add labels.';
            labelList.appendChild(emptyDiv);
            return;
        }
        
        this.state.initialLabels.forEach((label, index) => {
            const div = document.createElement('div');
            div.className = 'label-item';
            
            // Create color indicator
            const colorDiv = document.createElement('div');
            colorDiv.className = 'label-color';
            colorDiv.style.backgroundColor = CONFIG.COLORS[label.class % CONFIG.COLORS.length];
            
            // Create class selector
            const select = document.createElement('select');
            select.className = 'class-select';
            select.innerHTML = this.state.classNamesList.map((name, i) => 
                `<option value="${i}"${i === label.class ? ' selected' : ''}>${name}</option>`
            ).join('');
            select.onchange = () => {
                this.state.initialLabels[index].class = parseInt(select.value);
                colorDiv.style.backgroundColor = CONFIG.COLORS[label.class % CONFIG.COLORS.length];
                this.state.pushHistory();
                this.state.requestRedraw();
            };

            // Create type indicator
            const typeSpan = document.createElement('span');
            typeSpan.className = 'label-type';
            typeSpan.textContent = label.isSegmentation ? 'SEG' : 'BOX';
            
            // Create visibility toggle button (eye icon)
            const visibilityBtn = document.createElement('button');
            visibilityBtn.className = 'visibility-button';
            visibilityBtn.title = label.visible !== false ? 'Hide label' : 'Show label';
            visibilityBtn.innerHTML = label.visible !== false ? 
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : 
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            
            visibilityBtn.style.marginLeft = '4px';
            visibilityBtn.onclick = () => {
                // Toggle visibility
                label.visible = label.visible === false ? true : false;
                
                // Update button appearance
                visibilityBtn.title = label.visible ? 'Hide label' : 'Show label';
                visibilityBtn.innerHTML = label.visible ? 
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : 
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                
                // Redraw canvas
                this.state.requestRedraw();
            };
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '×';
            deleteBtn.title = 'Delete label';
            deleteBtn.className = 'delete-button';
            deleteBtn.style.marginLeft = 'auto';
            deleteBtn.onclick = () => {
                this.state.initialLabels.splice(index, 1);
                this.state.pushHistory();
                this.state.requestRedraw();
                this.updateLabelList();
            };
            
            // Assemble label item
            div.appendChild(colorDiv);
            div.appendChild(select);
            div.appendChild(typeSpan);
            div.appendChild(visibilityBtn);
            div.appendChild(deleteBtn);
            labelList.appendChild(div);
        });
    }

    handleKeyDown(e) {
        if (e.altKey && !this.state.isPanning && !e.ctrlKey) {
            this.canvas.classList.add('grabable');
        }
    }

    handleKeyUp(e) {
        if (!e.altKey && !this.state.isPanning) {
            this.canvas.classList.remove('grabable');
        }
    }

    // Handle keyboard shortcuts
    handleKeyboardShortcuts(e) {
        // Skip if target is input element
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            return;
        }
        
        // Save with Ctrl+S
        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            this.state.vscode.postMessage({ command: 'save', labels: this.state.initialLabels });
            return;
        }
        
        // Undo with Ctrl+Z
        if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (this.state.undo()) {
                this.state.requestRedraw();
                this.updateLabelList();
            }
            return;
        }
        
        // Navigation with A and D keys (without modifiers)
        if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
            switch (e.key.toLowerCase()) {
                case 'a':
                    e.preventDefault();
                    this.state.vscode.postMessage({ command: 'previous' });
                    break;
                case 'd':
                    e.preventDefault();
                    this.state.vscode.postMessage({ command: 'next' });
                    break;
            }
        }
    }
}

// UI Manager with improved event handling
class UIManager {
    constructor(state, canvasManager) {
        this.state = state;
        this.canvasManager = canvasManager;
        
        // Store DOM elements for better performance
        this.elements = {
            prevButton: document.getElementById('prevImage'),
            nextButton: document.getElementById('nextImage'),
            saveButton: document.getElementById('saveLabels'),
            labelMode: document.getElementById('labelMode'),
            toggleLabels: document.getElementById('toggleLabels'),
            searchInput: document.getElementById('imageSearch'),
            searchResults: document.getElementById('searchResults'),
            undoButton: this.createUndoRedoButtons()
        };
        
        this.setupEventListeners();
    }
    
    // Create undo/redo buttons and add to toolbar
    createUndoRedoButtons() {
        const toolbar = document.querySelector('.right-controls');
        
        // Create undo button
        const undoButton = document.createElement('button');
        undoButton.id = 'undoButton';
        undoButton.className = 'secondary';
        undoButton.title = 'Undo (Ctrl+Z)';
        undoButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 10h10c4 0 7 3 7 7v0c0 4-3 7-7 7H9"></path>
                <path d="M9 17l-6-7 6-7"></path>
            </svg>
        `;
        
        // Add button to toolbar
        toolbar.insertBefore(undoButton, toolbar.firstChild);
        
        return { undo: undoButton };
    }

    setupEventListeners() {
        // Add listeners with bound methods for better organization
        this.setupNavigationListeners();
        this.setupModeListeners();
        this.setupActionListeners();
        this.setupSearch();
    }
    
    setupNavigationListeners() {
        // Previous and next buttons
        this.elements.prevButton.addEventListener('click', this.navigatePrevious.bind(this));
        this.elements.nextButton.addEventListener('click', this.navigateNext.bind(this));
    }
    
    setupModeListeners() {
        // Label mode selector
        this.elements.labelMode.addEventListener('change', this.changeMode.bind(this));
        
        // Toggle labels button
        this.elements.toggleLabels.addEventListener('click', this.toggleLabels.bind(this));
    }
    
    setupActionListeners() {
        // Save button
        this.elements.saveButton.addEventListener('click', this.saveLabels.bind(this));
        
        // Undo button
        this.elements.undoButton.undo.addEventListener('click', this.handleUndo.bind(this));
    }
    
    // Navigation handlers
    navigatePrevious() {
        this.state.vscode.postMessage({ command: 'previous' });
    }
    
    navigateNext() {
        this.state.vscode.postMessage({ command: 'next' });
    }
    
    // Mode change handler
    changeMode(e) {
        this.state.currentMode = e.target.value;
        this.state.polygonPoints = [];
        this.state.isDrawingPolygon = false;
        this.state.requestRedraw();
    }
    
    // Toggle labels display
    toggleLabels() {
        this.state.showLabels = !this.state.showLabels;
        this.elements.toggleLabels.classList.toggle('active', this.state.showLabels);
        this.state.requestRedraw();
    }
    
    // Save labels
    saveLabels() {
        this.state.vscode.postMessage({ command: 'save', labels: this.state.initialLabels });
    }
    
    // Undo/Redo handlers
    handleUndo() {
        if (this.state.undo()) {
            this.state.requestRedraw();
            this.canvasManager.updateLabelList();
        }
    }

    setupSearch() {
        const searchInput = this.elements.searchInput;
        const resultsDiv = this.elements.searchResults;

        // Use debounced event handler for better performance
        searchInput.addEventListener('input', this.debounce(this.handleSearchInput.bind(this), CONFIG.DEBOUNCE_DELAY));
        searchInput.addEventListener('keydown', this.handleSearchKeydown.bind(this));

        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            const searchBox = document.querySelector('.search-box');
            if (!searchBox.contains(e.target)) {
                resultsDiv.style.display = 'none';
                this.state.selectedSearchIndex = -1;
            }
        });
    }
    
    // Debounce function to limit event handling frequency
    debounce(func, delay) {
        return (e) => {
            clearTimeout(this.state.searchTimeout);
            this.state.searchTimeout = setTimeout(() => func(e), delay);
        };
    }
    
    handleSearchInput(e) {
        this.handleSearch(e.target.value);
    }

    handleSearch(query) {
        if (!query) {
            this.elements.searchResults.style.display = 'none';
            return;
        }

        const results = this.state.allImagePaths
            .filter(path => {
                const lowerPath = path.toLowerCase();
                const lowerQuery = query.toLowerCase();
                return lowerPath.includes(lowerQuery) || 
                       path.split('/').pop().toLowerCase().includes(lowerQuery);
            })
            .slice(0, CONFIG.MAX_SEARCH_RESULTS);

        this.updateSearchResults(results);
    }

    handleSearchKeydown(e) {
        const results = this.elements.searchResults;
        const items = results.getElementsByClassName('search-result-item');
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.state.selectedSearchIndex = Math.min(
                    this.state.selectedSearchIndex + 1, 
                    items.length - 1
                );
                this.updateSelectedResult(items);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.state.selectedSearchIndex = Math.max(
                    this.state.selectedSearchIndex - 1, 
                    -1
                );
                this.updateSelectedResult(items);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.state.selectedSearchIndex >= 0 && items[this.state.selectedSearchIndex]) {
                    const path = items[this.state.selectedSearchIndex].getAttribute('data-path');
                    this.loadImage(path);
                }
                break;
            case 'Escape':
                e.preventDefault();
                results.style.display = 'none';
                this.state.selectedSearchIndex = -1;
                break;
        }
    }
    
    loadImage(path) {
        this.state.vscode.postMessage({ command: 'loadImage', path: path });
        this.elements.searchResults.style.display = 'none';
        this.state.selectedSearchIndex = -1;
    }

    updateSearchResults(results) {
        const resultsDiv = this.elements.searchResults;
        resultsDiv.innerHTML = '';
        
        if (results.length > 0) {
            results.forEach((path, index) => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                
                const filename = document.createElement('div');
                filename.className = 'filename';
                filename.textContent = path.split('/').pop();
                
                const filepath = document.createElement('div');
                filepath.className = 'filepath';
                filepath.textContent = path;
                
                div.appendChild(filename);
                div.appendChild(filepath);
                div.setAttribute('data-path', path);
                div.onclick = () => this.loadImage(path);
                
                resultsDiv.appendChild(div);
            });
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.style.display = 'none';
        }
    }

    updateSelectedResult(items) {
        Array.from(items).forEach((item, index) => {
            if (index === this.state.selectedSearchIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }
}

// Improved Message Handler
class MessageHandler {
    constructor(state, canvasManager) {
        this.state = state;
        this.canvasManager = canvasManager;
        this.setupMessageListener();
    }

    setupMessageListener() {
        window.addEventListener('message', this.handleMessage.bind(this));
    }
    
    handleMessage(event) {
        const message = event.data;
        
        switch (message.command) {
            case 'imageList':
                this.handleImageList(message);
                break;
            case 'updateImage':
                this.handleImageUpdate(message);
                break;
            case 'error':
                this.handleError(message);
                break;
        }
    }
    
    handleImageList(message) {
        this.state.allImagePaths = message.paths || [];
    }

    handleImageUpdate(message) {
        this.state.currentImage = message.imageData;
        this.state.initialLabels = message.labels || [];
        
        // Reset history
        this.state.history = [];
        this.state.historyIndex = -1;
        this.state.pushHistory();
        
        // Update UI
        document.getElementById('imageInfo').textContent = message.imageInfo || '';
        document.getElementById('imageSearch').value = message.currentPath || '';
        this.canvasManager.loadImage(this.state.currentImage);
    }
    
    handleError(message) {
        console.error('Error from extension:', message.error);
        this.showErrorMessage(message.error);
    }
    
    // Display error message to user
    showErrorMessage(errorMessage) {
        // Create or update error container
        let errorContainer = document.getElementById('error-container');
        
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.id = 'error-container';
            errorContainer.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: #f14c4c;
                color: white;
                padding: 16px 24px;
                border-radius: 4px;
                z-index: 1000;
                max-width: 80%;
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            `;
            
            // Add close button
            const closeButton = document.createElement('button');
            closeButton.textContent = '×';
            closeButton.style.cssText = `
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
                line-height: 24px;
                text-align: center;
            `;
            closeButton.onclick = () => {
                errorContainer.style.display = 'none';
            };
            
            // Add reload button
            const reloadButton = document.createElement('button');
            reloadButton.textContent = 'Reload Panel';
            reloadButton.style.cssText = `
                background-color: #ffffff;
                color: #f14c4c;
                border: none;
                padding: 8px 16px;
                margin-top: 16px;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
            `;
            reloadButton.onclick = () => {
                this.state.vscode.postMessage({ command: 'reload' });
            };
            
            const errorMessageElement = document.createElement('div');
            errorMessageElement.id = 'error-message';
            
            errorContainer.appendChild(closeButton);
            errorContainer.appendChild(errorMessageElement);
            errorContainer.appendChild(reloadButton);
            
            document.body.appendChild(errorContainer);
        } else {
            // Show the container if it was hidden
            errorContainer.style.display = 'block';
        }
        
        // Update error message
        const errorMessageElement = document.getElementById('error-message');
        errorMessageElement.textContent = errorMessage || 'An error occurred';
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    try {
        const state = new LabelingState();
        const canvasManager = new CanvasManager(state);
        const uiManager = new UIManager(state, canvasManager);
        const messageHandler = new MessageHandler(state, canvasManager);
        
        // Initialize UI states
        document.getElementById('toggleLabels').classList.toggle('active', state.showLabels);
        document.getElementById('labelMode').value = state.currentMode;
        document.getElementById('zoom-info').textContent = 'Zoom: 100%';
        
        // Initialize rectangles
        canvasManager.updateRects();
        
        // Request initial image list
        state.vscode.postMessage({ command: 'getImageList' });
        
        // Initialize with current image if available
        if (state.currentImage) {
            canvasManager.loadImage(state.currentImage);
        }
        
        // Add window resizing with throttle
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                canvasManager.handleResize();
            }, 100);
        });
        
        // Add global error handler
        window.addEventListener('error', (event) => {
            console.error('Uncaught error:', event.error);
            if (messageHandler) {
                messageHandler.showErrorMessage('An unexpected error occurred: ' + event.error.message);
            }
        });
    } catch (error) {
        console.error('Error initializing application:', error);
        
        // Show critical error that prevents initialization
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background-color: #1e1e1e;
            color: #ffffff;
            padding: 20px;
            z-index: 9999;
        `;
        
        errorDiv.innerHTML = `
            <h2 style="color: #f14c4c;">Critical Error</h2>
            <p>${error.message || 'Failed to initialize YOLO labeling panel'}</p>
            <button style="background-color: #0098ff; color: white; border: none; border-radius: 4px; padding: 8px 16px; margin-top: 16px; cursor: pointer;"
                    onclick="window.vscode.postMessage({ command: 'reload' })">
                Reload Panel
            </button>
        `;
        
        document.body.appendChild(errorDiv);
    }
}); 