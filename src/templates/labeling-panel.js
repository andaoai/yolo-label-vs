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
    ZOOM_SPEED: 0.1
};

// State Management
class LabelingState {
    constructor() {
        this.vscode = acquireVsCodeApi();
        this.currentImage = window.initialImageData;
        this.initialLabels = window.initialLabels;
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.currentLabel = 0;
        this.classNamesList = window.classNames || [];
        this.currentMode = 'box';
        this.polygonPoints = [];
        this.isDrawingPolygon = false;
        this.showLabels = true;
        this.allImagePaths = [];
        this.selectedSearchIndex = -1;
        this.currentMousePos = null;
        this.searchTimeout = null;
        
        // Zoom and pan related state
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.isPanning = false;
        this.lastPanPoint = { x: 0, y: 0 };
    }
}

// Canvas Manager
class CanvasManager {
    constructor(state) {
        this.state = state;
        this.canvas = document.getElementById('imageCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.coordinates = document.getElementById('coordinates');
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', () => {
            if (this.state.isDrawing) {
                this.state.isDrawing = false;
                this.redrawWithTransform();
            }
            if (this.state.isPanning) {
                this.state.isPanning = false;
                this.canvas.classList.remove('grabbing');
            }
            this.canvas.classList.remove('grabable');
        });
        this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        window.addEventListener('resize', this.handleResize.bind(this));

        // Add wheel event for zooming
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));

        // Add keyboard events for cursor updates
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));
    }

    getMousePos(evt) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        // Calculate mouse position considering zoom and translation
        let x = (evt.clientX - rect.left) * scaleX;
        let y = (evt.clientY - rect.top) * scaleY;
        
        // Convert to normalized coordinates that account for zooming and panning
        x = (x - this.state.translateX) / this.state.scale;
        y = (y - this.state.translateY) / this.state.scale;
        
        return { x, y };
    }

    // Get raw mouse position on canvas (not normalized for zooming)
    getRawMousePos(evt) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY
        };
    }

    handleMouseDown(e) {
        // Check if alt key is pressed for panning
        if (e.altKey) {
            this.state.isPanning = true;
            this.state.lastPanPoint = this.getRawMousePos(e);
            this.canvas.classList.add('grabbing');
            return;
        }
        
        const pos = this.getMousePos(e);
        const x = pos.x / this.canvas.width;
        const y = pos.y / this.canvas.height;

        if (this.state.currentMode === 'box') {
            this.state.isDrawing = true;
            this.state.startX = x;
            this.state.startY = y;
        } else if (this.state.currentMode === 'seg') {
            if (!this.state.isDrawingPolygon) {
                this.state.isDrawingPolygon = true;
                this.state.polygonPoints = [x, y];
            } else {
                if (this.state.polygonPoints.length >= 6 && this.isNearFirstPoint(x, y)) {
                    this.completePolygon();
                } else {
                    this.state.polygonPoints.push(x, y);
                }
            }
            this.drawLabels();
            this.drawCurrentPolygon();
        }
    }

    handleMouseMove(e) {
        // Update cursor based on alt key
        if (e.altKey && !this.state.isPanning) {
            this.canvas.classList.add('grabable');
        } else if (!e.altKey && !this.state.isPanning) {
            this.canvas.classList.remove('grabable');
        }

        // If panning is active, handle pan movement
        if (this.state.isPanning) {
            const currentPoint = this.getRawMousePos(e);
            const deltaX = currentPoint.x - this.state.lastPanPoint.x;
            const deltaY = currentPoint.y - this.state.lastPanPoint.y;
            
            this.state.translateX += deltaX;
            this.state.translateY += deltaY;
            this.state.lastPanPoint = currentPoint;
            
            this.redrawWithTransform();
            return;
        }
        
        const pos = this.getMousePos(e);
        const x = pos.x / this.canvas.width;
        const y = pos.y / this.canvas.height;
        this.state.currentMousePos = { x, y };
        this.coordinates.textContent = `X: ${Math.round(x * 100)}%, Y: ${Math.round(y * 100)}%`;

        this.updateCanvasOnMouseMove(pos);
    }

    updateCanvasOnMouseMove(pos) {
        const x = pos.x / this.canvas.width;
        const y = pos.y / this.canvas.height;

        this.redrawWithTransform();

        if (this.state.currentMode === 'box' && this.state.isDrawing) {
            // Save current context and apply transformations
            this.ctx.save();
            // Set the transformation matrix back to what's used in redrawWithTransform
            this.ctx.translate(this.state.translateX, this.state.translateY);
            this.ctx.scale(this.state.scale, this.state.scale);
            
            this.drawPreviewBox(x, y);
            
            this.ctx.restore();
        } else if (this.state.currentMode === 'seg' && this.state.isDrawingPolygon) {
            // Save current context and apply transformations
            this.ctx.save();
            // Set the transformation matrix back to what's used in redrawWithTransform
            this.ctx.translate(this.state.translateX, this.state.translateY);
            this.ctx.scale(this.state.scale, this.state.scale);
            
            this.drawCurrentPolygon();
            
            this.ctx.restore();
        } else if (!this.state.isDrawing) {
            this.drawCrosshairs(pos.x, pos.y);
        }
    }

    handleMouseUp(e) {
        // If was panning, stop panning
        if (this.state.isPanning) {
            this.state.isPanning = false;
            this.canvas.classList.remove('grabbing');
            if (e.altKey) {
                this.canvas.classList.add('grabable');
            }
            return;
        }
        
        if (this.state.currentMode === 'box' && this.state.isDrawing) {
            const pos = this.getMousePos(e);
            const currentX = pos.x / this.canvas.width;
            const currentY = pos.y / this.canvas.height;
            
            const width = Math.abs(currentX - this.state.startX);
            const height = Math.abs(currentY - this.state.startY);
            
            if (width > 0.01 && height > 0.01) {
                const x = Math.min(this.state.startX, currentX) + width/2;
                const y = Math.min(this.state.startY, currentY) + height/2;
                
                this.state.initialLabels.push({
                    class: this.state.currentLabel,
                    x: x,
                    y: y,
                    width: width,
                    height: height,
                    isSegmentation: false
                });
            }
            
            this.state.isDrawing = false;
            this.redrawWithTransform();
            this.updateLabelList();
        }
    }

    handleWheel(e) {
        // Only handle zooming when ctrl key is pressed
        if (e.ctrlKey) {
            e.preventDefault();
            
            // Get mouse position before zoom
            const mousePos = this.getRawMousePos(e);
            
            // Calculate zoom factor
            const delta = e.deltaY > 0 ? -1 : 1;
            const zoom = delta * CONFIG.ZOOM_SPEED;
            const newScale = Math.max(
                CONFIG.MIN_ZOOM,
                Math.min(CONFIG.MAX_ZOOM, this.state.scale + zoom)
            );
            
            // Adjust translation to zoom towards mouse position
            if (newScale !== this.state.scale) {
                const scaleRatio = newScale / this.state.scale;
                
                // Calculate new offsets to zoom towards mouse position
                this.state.translateX = mousePos.x - (mousePos.x - this.state.translateX) * scaleRatio;
                this.state.translateY = mousePos.y - (mousePos.y - this.state.translateY) * scaleRatio;
                
                // Apply new scale
                this.state.scale = newScale;
                
                // Update info in status bar to show zoom level
                const zoomPercent = Math.round(this.state.scale * 100);
                document.getElementById('zoom-info').textContent = `Zoom: ${zoomPercent}%`;
                
                this.redrawWithTransform();
            }
        }
    }

    handleContextMenu(e) {
        e.preventDefault();
        if (this.state.currentMode === 'seg' && this.state.isDrawingPolygon) {
            this.state.isDrawingPolygon = false;
            this.state.polygonPoints = [];
            this.redrawWithTransform();
        }
    }

    handleResize() {
        if (this.state.currentImage) {
            this.resizeCanvas();
            this.redrawWithTransform();
        }
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const containerStyle = window.getComputedStyle(container);
        const maxWidth = container.clientWidth - parseInt(containerStyle.paddingLeft) - parseInt(containerStyle.paddingRight);
        const maxHeight = container.clientHeight - parseInt(containerStyle.paddingTop) - parseInt(containerStyle.paddingBottom);
        
        const imageAspectRatio = this.state.currentImage.width / this.state.currentImage.height;
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

    loadImage(imagePath) {
        if (!imagePath) return;
        
        const img = new Image();
        img.onload = () => {
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            this.resizeCanvas();
            
            // Reset zoom and pan when loading a new image
            this.state.scale = 1;
            this.state.translateX = 0;
            this.state.translateY = 0;
            document.getElementById('zoom-info').textContent = 'Zoom: 100%';
            
            this.redrawWithTransform();
            this.updateLabelList();
        };
        img.src = imagePath;
        this.state.currentImage = img;
    }

    redrawWithTransform() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Save context, apply transformations, draw, then restore
        this.ctx.save();
        this.ctx.translate(this.state.translateX, this.state.translateY);
        this.ctx.scale(this.state.scale, this.state.scale);
        this.ctx.drawImage(this.state.currentImage, 0, 0);
        this.drawLabels();
        this.ctx.restore();
    }

    drawLabels() {
        // No need to clear here as it's done in redrawWithTransform
        
        this.state.initialLabels.forEach((label, index) => {
            const color = CONFIG.COLORS[label.class % CONFIG.COLORS.length];
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            
            if (label.isSegmentation && label.points) {
                this.drawSegmentationLabel(label, color);
            } else {
                this.drawBoundingBoxLabel(label, color);
            }
        });
    }

    drawSegmentationLabel(label, color) {
        // Draw segmentation polygon
        this.ctx.beginPath();
        for (let i = 0; i < label.points.length; i += 2) {
            const x = label.points[i] * this.canvas.width;
            const y = label.points[i + 1] * this.canvas.height;
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.closePath();
        this.ctx.stroke();
        
        // Draw label text if enabled
        if (this.state.showLabels) {
            const text = `${this.state.classNamesList[label.class] || label.class.toString()} (SEG)`;
            const textWidth = this.ctx.measureText(text).width;
            this.ctx.fillStyle = color;
            this.ctx.fillRect(
                label.points[0] * this.canvas.width,
                label.points[1] * this.canvas.height - 20,
                textWidth + 10,
                20
            );
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '14px sans-serif';
            this.ctx.fillText(
                text,
                label.points[0] * this.canvas.width + 5,
                label.points[1] * this.canvas.height - 5
            );
        }
    }

    drawBoundingBoxLabel(label, color) {
        const x = label.x * this.canvas.width;
        const y = label.y * this.canvas.height;
        const width = label.width * this.canvas.width;
        const height = label.height * this.canvas.height;
        
        this.ctx.strokeRect(x - width/2, y - height/2, width, height);
        
        if (this.state.showLabels) {
            const text = `${this.state.classNamesList[label.class] || label.class.toString()} (BOX)`;
            const textWidth = this.ctx.measureText(text).width;
            this.ctx.fillStyle = color;
            this.ctx.fillRect(
                x - width/2,
                y - height/2 - 20,
                textWidth + 10,
                20
            );
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '14px sans-serif';
            this.ctx.fillText(
                text,
                x - width/2 + 5,
                y - height/2 - 5
            );
        }
    }

    drawPreviewBox(currentX, currentY) {
        // Calculate normalized dimensions
        const width = Math.abs(currentX - this.state.startX);
        const height = Math.abs(currentY - this.state.startY);
        const boxX = Math.min(this.state.startX, currentX) + width/2;
        const boxY = Math.min(this.state.startY, currentY) + height/2;
        
        this.ctx.strokeStyle = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        this.ctx.lineWidth = 2 / this.state.scale; // Adjust line width for zoom level
        
        // Draw the rectangle in normalized coordinates
        this.ctx.strokeRect(
            boxX * this.canvas.width - width * this.canvas.width/2,
            boxY * this.canvas.height - height * this.canvas.height/2,
            width * this.canvas.width,
            height * this.canvas.height
        );
    }

    drawCrosshairs(x, y) {
        // Save current transformation, then reset for crosshairs in screen space
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform to draw crosshairs at raw position
        
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        
        // Calculate position in screen space accounting for current zoom and translation
        const screenX = x * this.state.scale + this.state.translateX;
        const screenY = y * this.state.scale + this.state.translateY;
        
        // Draw horizontal line
        this.ctx.beginPath();
        this.ctx.moveTo(0, screenY);
        this.ctx.lineTo(this.canvas.width, screenY);
        this.ctx.stroke();
        
        // Draw vertical line
        this.ctx.beginPath();
        this.ctx.moveTo(screenX, 0);
        this.ctx.lineTo(screenX, this.canvas.height);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    drawCurrentPolygon() {
        if (!this.state.isDrawingPolygon || this.state.polygonPoints.length < 2) return;

        this.ctx.strokeStyle = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        this.ctx.lineWidth = 2 / this.state.scale;
        
        // Draw the complete polygon including the preview line
        this.ctx.beginPath();
        const firstX = this.state.polygonPoints[0] * this.canvas.width;
        const firstY = this.state.polygonPoints[1] * this.canvas.height;
        this.ctx.moveTo(firstX, firstY);
        
        // Draw all existing lines
        for (let i = 2; i < this.state.polygonPoints.length; i += 2) {
            const x = this.state.polygonPoints[i] * this.canvas.width;
            const y = this.state.polygonPoints[i + 1] * this.canvas.height;
            this.ctx.lineTo(x, y);
        }
        
        // Draw preview line
        if (this.state.currentMousePos) {
            const lastX = this.state.polygonPoints[this.state.polygonPoints.length - 2] * this.canvas.width;
            const lastY = this.state.polygonPoints[this.state.polygonPoints.length - 1] * this.canvas.height;
            this.ctx.moveTo(lastX, lastY);

            if (this.isNearFirstPoint(this.state.currentMousePos.x, this.state.currentMousePos.y)) {
                this.ctx.lineTo(firstX, firstY);
            } else {
                this.ctx.lineTo(
                    this.state.currentMousePos.x * this.canvas.width,
                    this.state.currentMousePos.y * this.canvas.height
                );
            }
        }
        
        this.ctx.stroke();
        
        // Draw points
        this.drawPolygonPoints();
    }

    drawPolygonPoints() {
        this.ctx.fillStyle = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        
        // Adjust point size based on zoom level
        const pointRadius = 3 / this.state.scale;
        
        for (let i = 0; i < this.state.polygonPoints.length; i += 2) {
            const x = this.state.polygonPoints[i] * this.canvas.width;
            const y = this.state.polygonPoints[i + 1] * this.canvas.height;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Highlight first point if we have enough points
        if (this.state.polygonPoints.length >= 4) {
            const firstX = this.state.polygonPoints[0] * this.canvas.width;
            const firstY = this.state.polygonPoints[1] * this.canvas.height;
            
            // Draw outer white circle
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2 / this.state.scale;
            this.ctx.beginPath();
            this.ctx.arc(firstX, firstY, 5 / this.state.scale, 0, Math.PI * 2);
            this.ctx.stroke();

            // Draw inner colored circle
            this.ctx.fillStyle = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
            this.ctx.beginPath();
            this.ctx.arc(firstX, firstY, pointRadius, 0, Math.PI * 2);
            this.ctx.fill();

            // Extra highlight when mouse is near
            if (this.state.currentMousePos && 
                this.isNearFirstPoint(this.state.currentMousePos.x, this.state.currentMousePos.y)) {
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 3 / this.state.scale;
                this.ctx.beginPath();
                this.ctx.arc(firstX, firstY, 8 / this.state.scale, 0, Math.PI * 2);
                this.ctx.stroke();
            }
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
            this.state.initialLabels.push({
                class: this.state.currentLabel,
                x: 0,  // These will be calculated from points
                y: 0,
                width: 0,
                height: 0,
                isSegmentation: true,
                points: [...this.state.polygonPoints]  // All values after classId are points
            });
            
            this.state.isDrawingPolygon = false;
            this.state.polygonPoints = [];
            this.redrawWithTransform();
            this.updateLabelList();
        }
    }

    updateLabelList() {
        const labelList = document.getElementById('labelList');
        labelList.innerHTML = '';
        
        this.state.initialLabels.forEach((label, index) => {
            const div = document.createElement('div');
            div.className = 'label-item';
            
            const colorDiv = document.createElement('div');
            colorDiv.className = 'label-color';
            colorDiv.style.backgroundColor = CONFIG.COLORS[label.class % CONFIG.COLORS.length];
            
            const select = document.createElement('select');
            select.className = 'class-select';
            select.innerHTML = this.state.classNamesList.map((name, i) => 
                `<option value="${i}"${i === label.class ? ' selected' : ''}>${name}</option>`
            ).join('');
            select.onchange = () => {
                this.state.initialLabels[index].class = parseInt(select.value);
                colorDiv.style.backgroundColor = CONFIG.COLORS[label.class % CONFIG.COLORS.length];
                this.redrawWithTransform();
            };

            const typeSpan = document.createElement('span');
            typeSpan.className = 'label-type';
            typeSpan.textContent = label.isSegmentation ? 'SEG' : 'BOX';
            
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '×';
            deleteBtn.style.marginLeft = 'auto';
            deleteBtn.onclick = () => {
                this.state.initialLabels.splice(index, 1);
                this.redrawWithTransform();
                this.updateLabelList();
            };
            
            div.appendChild(colorDiv);
            div.appendChild(select);
            div.appendChild(typeSpan);
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
        // If alt key is released and not panning
        if (!e.altKey && !this.state.isPanning) {
            this.canvas.classList.remove('grabable');
        }
    }
}

// UI Manager
class UIManager {
    constructor(state, canvasManager) {
        this.state = state;
        this.canvasManager = canvasManager;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Navigation buttons
        document.getElementById('prevImage').addEventListener('click', () => {
            this.state.vscode.postMessage({ command: 'previous' });
        });

        document.getElementById('nextImage').addEventListener('click', () => {
            this.state.vscode.postMessage({ command: 'next' });
        });

        // Save button
        document.getElementById('saveLabels').addEventListener('click', () => {
            this.state.vscode.postMessage({ command: 'save', labels: this.state.initialLabels });
        });

        // Label mode selector
        document.getElementById('labelMode').addEventListener('change', (e) => {
            this.state.currentMode = e.target.value;
            this.state.polygonPoints = [];
            this.state.isDrawingPolygon = false;
            this.canvasManager.redrawWithTransform();
        });

        // Toggle labels button
        document.getElementById('toggleLabels').addEventListener('click', () => {
            this.state.showLabels = !this.state.showLabels;
            document.getElementById('toggleLabels').classList.toggle('active', this.state.showLabels);
            this.canvasManager.redrawWithTransform();
        });

        // Search functionality
        this.setupSearch();
    }

    setupSearch() {
        const searchInput = document.getElementById('imageSearch');
        const resultsDiv = document.getElementById('searchResults');

        searchInput.addEventListener('input', (e) => {
            clearTimeout(this.state.searchTimeout);
            this.state.searchTimeout = setTimeout(() => {
                this.handleSearch(e.target.value);
            }, CONFIG.DEBOUNCE_DELAY);
        });

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

    handleSearch(query) {
        if (!query) {
            document.getElementById('searchResults').style.display = 'none';
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
        const results = document.getElementById('searchResults');
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
                    this.state.vscode.postMessage({ command: 'loadImage', path: path });
                    results.style.display = 'none';
                    this.state.selectedSearchIndex = -1;
                }
                break;
            case 'Escape':
                results.style.display = 'none';
                this.state.selectedSearchIndex = -1;
                break;
        }
    }

    updateSearchResults(results) {
        const resultsDiv = document.getElementById('searchResults');
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
                div.onclick = () => {
                    this.state.vscode.postMessage({ command: 'loadImage', path: path });
                    resultsDiv.style.display = 'none';
                    this.state.selectedSearchIndex = -1;
                };
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

// Message Handler
class MessageHandler {
    constructor(state, canvasManager) {
        this.state = state;
        this.canvasManager = canvasManager;
        this.setupMessageListener();
    }

    setupMessageListener() {
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'imageList':
                    this.state.allImagePaths = message.paths;
                    break;
                case 'updateImage':
                    this.handleImageUpdate(message);
                    break;
            }
        });
    }

    handleImageUpdate(message) {
        this.state.currentImage = message.imageData;
        this.state.initialLabels = message.labels;
        document.getElementById('imageInfo').textContent = message.imageInfo;
        document.getElementById('imageSearch').value = message.currentPath || '';
        this.canvasManager.loadImage(this.state.currentImage);
    }
}

// Initialize application
const state = new LabelingState();
const canvasManager = new CanvasManager(state);
const uiManager = new UIManager(state, canvasManager);
const messageHandler = new MessageHandler(state, canvasManager);

// Request initial image list
state.vscode.postMessage({ command: 'getImageList' });

// Initialize with current image
if (state.currentImage) {
    canvasManager.loadImage(state.currentImage);
} 