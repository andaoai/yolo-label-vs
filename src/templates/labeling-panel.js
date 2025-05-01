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
        
        // 原始图像尺寸 - 用于坐标计算
        this.originalImageWidth = 0;
        this.originalImageHeight = 0;
        
        // 新增: 画布与图像之间的关系
        this.canvasRect = null;
        this.imageRect = null;
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

    // 新增: 更新画布与图像的关系矩形
    updateRects() {
        // 获取当前画布的客户端矩形
        this.state.canvasRect = this.canvas.getBoundingClientRect();
        
        // 计算图像在画布中的实际显示区域
        const imageAspectRatio = this.state.originalImageWidth / this.state.originalImageHeight;
        const canvasAspectRatio = this.state.canvasRect.width / this.state.canvasRect.height;
        
        let imageWidth, imageHeight, imageLeft, imageTop;
        
        if (this.state.scale === 1) {
            // 标准缩放下，计算图像在画布中的实际位置和尺寸
            if (imageAspectRatio > canvasAspectRatio) {
                // 图像比画布更宽
                imageWidth = this.state.canvasRect.width;
                imageHeight = imageWidth / imageAspectRatio;
                imageLeft = 0;
                imageTop = (this.state.canvasRect.height - imageHeight) / 2;
            } else {
                // 图像比画布更高
                imageHeight = this.state.canvasRect.height;
                imageWidth = imageHeight * imageAspectRatio;
                imageLeft = (this.state.canvasRect.width - imageWidth) / 2;
                imageTop = 0;
            }
        } else {
            // 缩放时，使用整个画布区域
            imageWidth = this.state.canvasRect.width;
            imageHeight = this.state.canvasRect.height;
            imageLeft = 0;
            imageTop = 0;
        }
        
        this.state.imageRect = {
            left: imageLeft,
            top: imageTop,
            width: imageWidth,
            height: imageHeight,
            right: imageLeft + imageWidth,
            bottom: imageTop + imageHeight
        };
    }

    // 修改: 获取鼠标位置转换为图像坐标的算法
    getMousePos(evt) {
        // 确保已更新矩形信息
        this.updateRects();
        
        // 计算鼠标在画布元素中的像素位置
        const mouseX = evt.clientX - this.state.canvasRect.left;
        const mouseY = evt.clientY - this.state.canvasRect.top;
        
        // 转换为画布坐标系统中的位置
        let canvasX, canvasY;
        
        if (this.state.scale === 1) {
            // 标准缩放下，需要考虑图像可能不填满画布的情况
            // 调整相对于图像显示区域的坐标
            canvasX = (mouseX - this.state.imageRect.left) / this.state.imageRect.width * this.canvas.width;
            canvasY = (mouseY - this.state.imageRect.top) / this.state.imageRect.height * this.canvas.height;
        } else {
            // 缩放时，直接使用画布比例
            canvasX = mouseX / this.state.canvasRect.width * this.canvas.width;
            canvasY = mouseY / this.state.canvasRect.height * this.canvas.height;
        }
        
        // 应用缩放和平移的逆变换得到图像坐标
        const imageX = (canvasX - this.state.translateX) / this.state.scale;
        const imageY = (canvasY - this.state.translateY) / this.state.scale;
        
        return { 
            x: imageX, 
            y: imageY 
        };
    }

    // 获取未考虑缩放和平移的原始画布坐标
    getRawMousePos(evt) {
        // 确保已更新矩形信息
        this.updateRects();
        
        // 计算鼠标在Canvas元素上的位置，并转换为Canvas内部坐标
        const mouseX = evt.clientX - this.state.canvasRect.left;
        const mouseY = evt.clientY - this.state.canvasRect.top;
        
        let canvasX, canvasY;
        
        if (this.state.scale === 1) {
            // 标准缩放下，考虑图像可能不填满画布
            canvasX = (mouseX - this.state.imageRect.left) / this.state.imageRect.width * this.canvas.width;
            canvasY = (mouseY - this.state.imageRect.top) / this.state.imageRect.height * this.canvas.height;
        } else {
            // 缩放时，直接使用画布比例
            canvasX = mouseX / this.state.canvasRect.width * this.canvas.width;
            canvasY = mouseY / this.state.canvasRect.height * this.canvas.height;
        }
        
        return {
            x: canvasX,
            y: canvasY
        };
    }

    handleMouseDown(e) {
        // 确保矩形信息最新
        this.updateRects();
        
        // Check if alt key is pressed for panning
        if (e.altKey) {
            this.state.isPanning = true;
            this.state.lastPanPoint = this.getRawMousePos(e);
            this.canvas.classList.add('grabbing');
            return;
        }
        
        // Get mouse position in image coordinates
        const pos = this.getMousePos(e);
        
        // Calculate normalized coordinates (0-1 range)
        const x = pos.x / this.state.originalImageWidth;
        const y = pos.y / this.state.originalImageHeight;

        if (this.state.currentMode === 'box') {
            this.state.isDrawing = true;
            this.state.startX = x;
            this.state.startY = y;
        } else if (this.state.currentMode === 'seg') {
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
            this.redrawWithTransform();
        }
    }

    handleMouseMove(e) {
        // 确保矩形信息最新
        this.updateRects();
        
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
        
        // Get mouse position in image coordinates
        const pos = this.getMousePos(e);
        
        // Calculate normalized coordinates (0-1 range for display)
        const normalizedX = pos.x / this.state.originalImageWidth;
        const normalizedY = pos.y / this.state.originalImageHeight;
        
        // Store current mouse position for drawing
        this.state.currentMousePos = { x: normalizedX, y: normalizedY };
        
        // Update coordinate display in status bar
        this.coordinates.textContent = `X: ${Math.round(normalizedX * 100)}%, Y: ${Math.round(normalizedY * 100)}%`;

        // Update canvas with current mouse position
        this.updateCanvasOnMouseMove(pos);
    }

    updateCanvasOnMouseMove(pos) {
        // Calculate normalized coordinates (0-1 range)
        const x = pos.x / this.state.originalImageWidth;
        const y = pos.y / this.state.originalImageHeight;

        // Always redraw to ensure clean canvas
        this.redrawWithTransform();
        
        // Save current context and apply transformations
        this.ctx.save();
        this.ctx.translate(this.state.translateX, this.state.translateY);
        this.ctx.scale(this.state.scale, this.state.scale);

        if (this.state.currentMode === 'box' && this.state.isDrawing) {
            this.drawPreviewBox(x, y);
        } else if (this.state.currentMode === 'seg' && this.state.isDrawingPolygon) {
            this.drawCurrentPolygon();
            
            // Highlight if near first point
            if (this.state.polygonPoints.length >= 6 && 
                this.isNearFirstPoint(x, y)) {
                const firstX = this.state.polygonPoints[0] * this.state.originalImageWidth;
                const firstY = this.state.polygonPoints[1] * this.state.originalImageHeight;
                
                this.ctx.strokeStyle = '#ffffff';
                this.ctx.lineWidth = 3 / this.state.scale;
                this.ctx.beginPath();
                this.ctx.arc(firstX, firstY, 8 / this.state.scale, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }
        
        // Draw crosshairs at mouse position (using raw image coordinates)
        this.drawCrosshairs(pos.x, pos.y);
        
        this.ctx.restore();
    }

    handleMouseUp(e) {
        // 确保矩形信息最新
        this.updateRects();
        
        if (this.state.isPanning) {
            this.state.isPanning = false;
            this.canvas.classList.remove('grabbing');
            return;
        }
        
        if (this.state.currentMode === 'box' && this.state.isDrawing) {
            const pos = this.getMousePos(e);
            
            // Calculate normalized coordinates (0-1 range)
            const x = pos.x / this.state.originalImageWidth;
            const y = pos.y / this.state.originalImageHeight;
            
            // Only create a box if there's a minimum size
            const width = Math.abs(x - this.state.startX);
            const height = Math.abs(y - this.state.startY);
            
            // Minimum size check (0.01 = 1% of image size)
            if (width > 0.01 && height > 0.01) {
                // Calculate the center of the box
                const boxX = Math.min(this.state.startX, x) + width/2;
                const boxY = Math.min(this.state.startY, y) + height/2;
                
                // Add the new bounding box to labels
                this.state.initialLabels.push({
                    class: this.state.currentLabel,
                    x: boxX,
                    y: boxY,
                    width: width,
                    height: height,
                    isSegmentation: false
                });
                
                // Update the UI
                this.updateLabelList();
            }
            
            this.state.isDrawing = false;
            this.redrawWithTransform();
        }
    }

    handleWheel(e) {
        // Only handle zooming when ctrl key is pressed
        if (e.ctrlKey) {
            e.preventDefault();
            
            // 确保矩形信息最新
            this.updateRects();
            
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
                
                // 调整画布大小以充分利用空间
                this.resizeCanvas();
                
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
        
        // 直接获取容器的完整尺寸，不减去内边距（因为我们已经将内边距设置为0）
        const maxWidth = container.clientWidth;
        const maxHeight = container.clientHeight;
        
        // 使用画布大小而不是图像大小，使缩放时可以充分利用空间
        // 当缩放比例不为1时，不保持原始宽高比，而是填充整个容器
        if (this.state.scale !== 1) {
            // 放大时，直接使用容器的最大尺寸，不保持宽高比
            this.canvas.style.width = `${maxWidth}px`;
            this.canvas.style.height = `${maxHeight}px`;
            
            // 设置canvas的原生宽高为容器宽高
            if (this.canvas.width !== maxWidth || this.canvas.height !== maxHeight) {
                // 保存当前画布内容
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = this.canvas.width;
                tempCanvas.height = this.canvas.height;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(this.canvas, 0, 0);
                
                // 调整canvas尺寸
                this.canvas.width = maxWidth;
                this.canvas.height = maxHeight;
                
                // 恢复画布内容
                this.ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 
                                  0, 0, this.canvas.width, this.canvas.height);
            }
        } else {
            // 正常比例时，保持图像宽高比
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
        
        // 更新矩形信息以反映新的尺寸
        this.updateRects();
    }

    loadImage(imagePath) {
        if (!imagePath) return;
        
        const img = new Image();
        img.onload = () => {
            const container = this.canvas.parentElement;
            const maxWidth = container.clientWidth;
            const maxHeight = container.clientHeight;
            
            // 保存原始图像尺寸
            this.state.originalImageWidth = img.width;
            this.state.originalImageHeight = img.height;
            
            // 使用图像的尺寸作为canvas的基础尺寸
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            
            // 同时将canvas显示尺寸调整为容器尺寸
            this.canvas.style.width = `${maxWidth}px`;
            this.canvas.style.height = `${maxHeight}px`;
            
            // Reset zoom and pan when loading a new image
            this.state.scale = 1;
            this.state.translateX = 0;
            this.state.translateY = 0;
            document.getElementById('zoom-info').textContent = 'Zoom: 100%';
            
            // 调用resizeCanvas以确保画布尺寸正确
            this.resizeCanvas();
            
            // 更新矩形信息
            this.updateRects();
            
            this.redrawWithTransform();
            this.updateLabelList();
        };
        img.src = imagePath;
        this.state.currentImage = img;
    }

    redrawWithTransform() {
        // Clear the entire canvas to prevent ghosting effects
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background (fill entire canvas area)
        this.ctx.save();
        this.ctx.fillStyle = '#1e1e1e'; // Use background color
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        
        // Only draw the image and labels if we have a valid image
        if (this.state.currentImage && this.state.currentImage.complete) {
            // Save context, apply transformations, draw, then restore
            this.ctx.save();
            this.ctx.translate(this.state.translateX, this.state.translateY);
            this.ctx.scale(this.state.scale, this.state.scale);
            
            // Draw the image
            this.ctx.drawImage(this.state.currentImage, 0, 0);
            
            // Draw all labels
            if (this.state.showLabels) {
                this.drawLabels();
            }
            
            // Draw current polygon if in polygon mode
            if (this.state.currentMode === 'seg' && this.state.isDrawingPolygon) {
                this.drawCurrentPolygon();
            }
            
            this.ctx.restore();
        }
    }

    drawLabels() {
        if (!this.state.initialLabels || this.state.initialLabels.length === 0) {
            return;
        }
        
        this.state.initialLabels.forEach((label, index) => {
            const color = CONFIG.COLORS[label.class % CONFIG.COLORS.length];
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2 / this.state.scale;
            
            if (label.isSegmentation && label.points) {
                this.drawSegmentationLabel(label, color);
            } else {
                this.drawBoundingBoxLabel(label, color);
            }
        });
    }

    drawSegmentationLabel(label, color) {
        // Set appropriate line styles
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2 / this.state.scale;
        this.ctx.fillStyle = `${color}33`; // Add transparency to fill color
        
        // Draw segmentation polygon
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
        this.ctx.stroke();
        this.ctx.fill(); // Add semi-transparent fill
        
        // Draw the label text if enabled
        if (this.state.showLabels && label.points.length >= 2) {
            // Find a good position for the label (use the first point)
            const labelX = label.points[0] * this.state.originalImageWidth;
            const labelY = label.points[1] * this.state.originalImageHeight;
            
            const text = `${this.state.classNamesList[label.class] || label.class.toString()} (SEG)`;
            
            // Adjust font size for zoom level
            this.ctx.font = `${14 / Math.max(1, this.state.scale)}px sans-serif`;
            const textWidth = this.ctx.measureText(text).width;
            
            // Draw text background
            this.ctx.fillStyle = color;
            this.ctx.fillRect(
                labelX,
                labelY - 20 / this.state.scale,
                textWidth + 10 / this.state.scale,
                20 / this.state.scale
            );
            
            // Draw text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillText(
                text,
                labelX + 5 / this.state.scale,
                labelY - 5 / this.state.scale
            );
        }
    }

    drawBoundingBoxLabel(label, color) {
        // Calculate pixel positions using normalized coordinates and image dimensions
        const x = label.x * this.state.originalImageWidth;
        const y = label.y * this.state.originalImageHeight;
        const width = label.width * this.state.originalImageWidth;
        const height = label.height * this.state.originalImageHeight;
        
        // Draw the bounding box
        this.ctx.strokeRect(x - width/2, y - height/2, width, height);
        
        // Draw the label text if enabled
        if (this.state.showLabels) {
            const text = `${this.state.classNamesList[label.class] || label.class.toString()} (BOX)`;
            
            // Measure text and set font size based on zoom level
            this.ctx.font = `${14 / Math.max(1, this.state.scale)}px sans-serif`;
            const textWidth = this.ctx.measureText(text).width;
            
            // Draw text background
            this.ctx.fillStyle = color;
            this.ctx.fillRect(
                x - width/2,
                y - height/2 - 20 / this.state.scale,
                textWidth + 10 / this.state.scale,
                20 / this.state.scale
            );
            
            // Draw text
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillText(
                text,
                x - width/2 + 5 / this.state.scale,
                y - height/2 - 5 / this.state.scale
            );
        }
    }

    drawPreviewBox(currentX, currentY) {
        // Calculate normalized dimensions for the preview box
        const width = Math.abs(currentX - this.state.startX);
        const height = Math.abs(currentY - this.state.startY);
        
        // Calculate the box center coordinates
        const boxX = Math.min(this.state.startX, currentX) + width/2;
        const boxY = Math.min(this.state.startY, currentY) + height/2;
        
        // Set stroke style based on current label
        this.ctx.strokeStyle = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        this.ctx.lineWidth = 2 / this.state.scale; // Adjust line width for zoom level
        
        // Calculate pixel positions using the image dimensions
        const boxLeft = (boxX - width/2) * this.state.originalImageWidth;
        const boxTop = (boxY - height/2) * this.state.originalImageHeight;
        const boxWidth = width * this.state.originalImageWidth;
        const boxHeight = height * this.state.originalImageHeight;
        
        // Draw the rectangle
        this.ctx.strokeRect(boxLeft, boxTop, boxWidth, boxHeight);
    }

    drawCrosshairs(x, y) {
        // 计算图像坐标对应的Canvas上的位置（考虑缩放和平移）
        const canvasX = x * this.state.scale + this.state.translateX;
        const canvasY = y * this.state.scale + this.state.translateY;
        
        // 在Canvas坐标系中绘制十字线
        this.ctx.save();
        // 重置变换矩阵，确保在Canvas空间中绘制
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        
        // 绘制水平线
        this.ctx.beginPath();
        this.ctx.moveTo(0, canvasY);
        this.ctx.lineTo(this.canvas.width, canvasY);
        this.ctx.stroke();
        
        // 绘制垂直线
        this.ctx.beginPath();
        this.ctx.moveTo(canvasX, 0);
        this.ctx.lineTo(canvasX, this.canvas.height);
        this.ctx.stroke();
        
        // 在交叉点绘制小圆圈
        this.ctx.beginPath();
        this.ctx.arc(canvasX, canvasY, 3, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    drawCurrentPolygon() {
        if (!this.state.isDrawingPolygon || this.state.polygonPoints.length < 2) return;

        this.ctx.strokeStyle = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        this.ctx.lineWidth = 2 / this.state.scale;
        
        // Draw the complete polygon including the preview line
        this.ctx.beginPath();
        const firstX = this.state.polygonPoints[0] * this.state.originalImageWidth;
        const firstY = this.state.polygonPoints[1] * this.state.originalImageHeight;
        this.ctx.moveTo(firstX, firstY);
        
        // Draw all existing lines
        for (let i = 2; i < this.state.polygonPoints.length; i += 2) {
            const x = this.state.polygonPoints[i] * this.state.originalImageWidth;
            const y = this.state.polygonPoints[i + 1] * this.state.originalImageHeight;
            this.ctx.lineTo(x, y);
        }
        
        // Draw preview line
        if (this.state.currentMousePos) {
            const lastX = this.state.polygonPoints[this.state.polygonPoints.length - 2] * this.state.originalImageWidth;
            const lastY = this.state.polygonPoints[this.state.polygonPoints.length - 1] * this.state.originalImageHeight;
            this.ctx.moveTo(lastX, lastY);

            if (this.isNearFirstPoint(this.state.currentMousePos.x, this.state.currentMousePos.y)) {
                this.ctx.lineTo(firstX, firstY);
            } else {
                this.ctx.lineTo(
                    this.state.currentMousePos.x * this.state.originalImageWidth,
                    this.state.currentMousePos.y * this.state.originalImageHeight
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
            const x = this.state.polygonPoints[i] * this.state.originalImageWidth;
            const y = this.state.polygonPoints[i + 1] * this.state.originalImageHeight;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Highlight first point if we have enough points
        if (this.state.polygonPoints.length >= 4) {
            const firstX = this.state.polygonPoints[0] * this.state.originalImageWidth;
            const firstY = this.state.polygonPoints[1] * this.state.originalImageHeight;
            
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

// Initialize the application
const state = new LabelingState();
const canvasManager = new CanvasManager(state);
const uiManager = new UIManager(state, canvasManager);
new MessageHandler(state, canvasManager);

// Initialize UI elements
document.addEventListener('DOMContentLoaded', () => {
    // Initialize toggle button state
    document.getElementById('toggleLabels').classList.toggle('active', state.showLabels);
    
    // Initialize label mode selector
    document.getElementById('labelMode').value = state.currentMode;
    
    // Initialize zoom info
    document.getElementById('zoom-info').textContent = 'Zoom: 100%';
    
    // 初始化时更新矩形信息
    canvasManager.updateRects();
});

// Request initial image list
state.vscode.postMessage({ command: 'getImageList' });

// Initialize with current image if available
if (state.currentImage) {
    canvasManager.loadImage(state.currentImage);
} 