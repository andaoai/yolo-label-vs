import { CONFIG } from '../config.js';

/**
 * CanvasManager - 管理画布和绘图操作
 */
export class CanvasManager {
    /**
     * 创建CanvasManager实例
     * @param {LabelingState} state - 应用状态对象
     */
    constructor(state) {
        // 保存状态引用
        this.state = state;
        
        // 获取DOM元素
        this.canvas = document.getElementById('imageCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.coordinates = document.getElementById('coordinates');
        this.imageDimension = document.getElementById('image-dimension');
        this.labelsCount = document.getElementById('labels-count');
        this.zoomInfo = document.getElementById('zoom-info');
        
        // 设置回调函数
        this.state.onRedrawRequested = this.redrawWithTransform.bind(this);
        
        // 初始化虚线动画相关属性
        this.state.dashOffset = 0;
        this.state.dashAnimationActive = false;
        
        // 设置事件监听器
        this.setupEventListeners();
    }

    /**
     * 获取当前VS Code主题背景色
     * @returns {string} 背景色CSS值
     */
    getCurrentBackgroundColor() {
        return getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || CONFIG.BACKGROUND_COLOR;
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 使用bind保持方法引用的可读性
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
        window.addEventListener('resize', this.handleResize.bind(this));
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        window.addEventListener('keyup', this.handleKeyUp.bind(this));
        
        // 使用箭头函数处理鼠标离开事件
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
        
        // 在窗口卸载时清理事件监听器
        window.addEventListener('unload', this.cleanupEventListeners.bind(this));
    }
    
    /**
     * 清理事件监听器以防止内存泄漏
     */
    cleanupEventListeners() {
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
        this.canvas.removeEventListener('wheel', this.handleWheel);
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        
        // 清理脉动动画
        if (this.state.pulsationInterval) {
            clearInterval(this.state.pulsationInterval);
            this.state.pulsationInterval = null;
        }
    }

    /**
     * 更新画布和图像矩形以计算坐标
     */
    updateRects() {
        // 获取当前画布客户端矩形
        this.state.canvasRect = this.canvas.getBoundingClientRect();
        
        // 计算纵横比
        const imageAspectRatio = this.state.originalImageWidth / this.state.originalImageHeight;
        const canvasAspectRatio = this.state.canvasRect.width / this.state.canvasRect.height;
        
        // 计算画布内的图像尺寸
        let imageWidth, imageHeight, imageLeft, imageTop;
        
        if (this.state.scale === 1) {
            // 在标准缩放下，根据纵横比计算图像位置
            if (imageAspectRatio > canvasAspectRatio) {
                // 图像比画布宽
                imageWidth = this.state.canvasRect.width;
                imageHeight = imageWidth / imageAspectRatio;
                imageLeft = 0;
                imageTop = (this.state.canvasRect.height - imageHeight) / 2;
            } else {
                // 图像比画布高
                imageHeight = this.state.canvasRect.height;
                imageWidth = imageHeight * imageAspectRatio;
                imageLeft = (this.state.canvasRect.width - imageWidth) / 2;
                imageTop = 0;
            }
        } else {
            // 缩放时，使用整个画布
            imageWidth = this.state.canvasRect.width;
            imageHeight = this.state.canvasRect.height;
            imageLeft = 0;
            imageTop = 0;
        }
        
        // 存储图像矩形用于计算
        this.state.imageRect = {
            left: imageLeft,
            top: imageTop,
            width: imageWidth,
            height: imageHeight,
            right: imageLeft + imageWidth,
            bottom: imageTop + imageHeight
        };
    }

    /**
     * 将鼠标位置转换为图像坐标
     * @param {MouseEvent} evt - 鼠标事件
     * @returns {Object} 包含x和y的对象
     */
    getMousePos(evt) {
        // 确保矩形已更新
        this.updateRects();
        
        // 计算鼠标在画布元素中的像素位置
        const mouseX = evt.clientX - this.state.canvasRect.left;
        const mouseY = evt.clientY - this.state.canvasRect.top;
        
        // 转换为画布坐标系
        const canvasX = mouseX / this.state.canvasRect.width * this.canvas.width;
        const canvasY = mouseY / this.state.canvasRect.height * this.canvas.height;
        
        // 应用逆变换以获取图像坐标
        const imageX = (canvasX - this.state.translateX) / this.state.scale;
        const imageY = (canvasY - this.state.translateY) / this.state.scale;
        
        return { x: imageX, y: imageY };
    }

    /**
     * 获取原始画布坐标，不考虑缩放/平移
     * @param {MouseEvent} evt - 鼠标事件
     * @returns {Object} 包含x和y的对象
     */
    getRawMousePos(evt) {
        // 确保矩形已更新
        this.updateRects();
        
        // 计算鼠标在画布元素中的位置
        const mouseX = evt.clientX - this.state.canvasRect.left;
        const mouseY = evt.clientY - this.state.canvasRect.top;
        
        // 转换为画布坐标系
        const canvasX = mouseX / this.state.canvasRect.width * this.canvas.width;
        const canvasY = mouseY / this.state.canvasRect.height * this.canvas.height;
        
        return { x: canvasX, y: canvasY };
    }

    /**
     * 处理鼠标按下事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleMouseDown(e) {
        // 确保矩形是最新的
        this.updateRects();
        
        // 检查平移模式（按下alt键）
        if (e.altKey) {
            this.state.isPanning = true;
            this.state.lastPanPoint = this.getRawMousePos(e);
            this.canvas.classList.add('grabbing');
            return;
        }
        
        // 获取归一化的鼠标位置
        const pos = this.getMousePos(e);
        const x = pos.x / this.state.originalImageWidth;
        const y = pos.y / this.state.originalImageHeight;
        
        // 按住Ctrl键时进行拖动操作
        if (e.ctrlKey && e.button === 0) {
            // 首先检查是否点击在某个点上
            const pointUnderCursor = this.findPointUnderCursor(x, y);
            
            if (pointUnderCursor) {
                // 选择点并开始点拖动
                this.state.selectedPoint = pointUnderCursor;
                this.state.isDraggingPoint = true;
                this.state.dragStartPos = { x, y };
                return;
            }
            
            // 如果不是点，检查是否是标签
            if (this.state.hoveredLabel) {
            this.state.isDragging = true;
            this.state.draggedLabel = this.state.hoveredLabel;
            this.state.dragStartPos = { x, y };
            return;
        }
        }
        
        // 如果正在绘制中，不处理其他操作
        if (this.state.isDrawing || this.state.isDrawingPolygon || this.state.isPoseDrawing) {
            if (this.state.currentMode === 'box') {
                this.startBoxDrawing(x, y);
            } else if (this.state.currentMode === 'seg') {
                this.handleSegmentationClick(x, y);
            } else if (this.state.currentMode === 'pose') {
                this.handlePoseClick(e, x, y);
            }
            return;
        }
        
        // 根据当前模式开始绘制
        if (this.state.currentMode === 'box') {
            this.startBoxDrawing(x, y);
        } else if (this.state.currentMode === 'seg') {
            this.handleSegmentationClick(x, y);
        } else if (this.state.currentMode === 'pose') {
            this.handlePoseClick(e, x, y);
        }
    }
    
    /**
     * 处理框的绘制开始
     * @param {number} x - 归一化的X坐标
     * @param {number} y - 归一化的Y坐标
     */
    startBoxDrawing(x, y) {
        this.state.isDrawing = true;
        this.state.startX = x;
        this.state.startY = y;
    }
    
    /**
     * 处理分割模式下的点击
     * @param {number} x - 归一化的X坐标
     * @param {number} y - 归一化的Y坐标
     */
    handleSegmentationClick(x, y) {
        if (!this.state.isDrawingPolygon) {
            // 开始新的多边形
            this.state.isDrawingPolygon = true;
            this.state.polygonPoints = [x, y];
        } else {
            // 检查是否关闭多边形
            if (this.state.polygonPoints.length >= 6 && this.isNearFirstPoint(x, y)) {
                this.completePolygon();
            } else {
                // 添加新点
                this.state.polygonPoints.push(x, y);
            }
        }
        this.state.requestRedraw();
    }

    /**
     * 处理鼠标移动事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleMouseMove(e) {
        if (!this.state.shouldUpdate()) return;
        this.updateRects();
        this.updateCursorStyle(e);
        
        if (this.state.isPanning) {
            this.handlePanning(e);
            return;
        }
        
        const pos = this.getMousePos(e);
        const normalizedX = pos.x / this.state.originalImageWidth;
        const normalizedY = pos.y / this.state.originalImageHeight;
        this.state.currentMousePos = { x: normalizedX, y: normalizedY };

        // 处理点拖动
        if (e.ctrlKey && this.state.isDraggingPoint && this.state.selectedPoint) {
            this.moveSelectedPoint(normalizedX, normalizedY);
            this.state.hasUnsavedChanges = true;
            this.state.requestRedraw();
            this.updateCoordinateDisplay(normalizedX, normalizedY);
            return;
        }

        // 每次鼠标移动时检查点位悬停，不仅在Ctrl键按下时
        const pointUnderCursor = this.findPointUnderCursor(normalizedX, normalizedY);
        
        // 如果鼠标位置变化或新的点被悬停，请求重绘
        if (pointUnderCursor || this.state.hoveredPoint) {
            if (
                (pointUnderCursor && !this.state.hoveredPoint) || 
                (!pointUnderCursor && this.state.hoveredPoint) ||
                (pointUnderCursor && this.state.hoveredPoint && 
                 (pointUnderCursor.label !== this.state.hoveredPoint.label || 
                  pointUnderCursor.type !== this.state.hoveredPoint.type || 
                  pointUnderCursor.pointIndex !== this.state.hoveredPoint.pointIndex ||
                  (pointUnderCursor.type === 'box' && pointUnderCursor.corner !== this.state.hoveredPoint.corner)))
            ) {
                // 更新悬停的点
                this.state.hoveredPoint = pointUnderCursor;
                // 请求重绘
                this.state.requestRedraw();
            }
        }
        
        // 如果按住Ctrl键，设置移动光标
        if (e.ctrlKey && pointUnderCursor) {
            this.canvas.style.cursor = 'move';
        }

        // 处理标签悬停逻辑
        if (!this.state.isDrawing && !this.state.isDrawingPolygon) {
            const label = this.state.findLabelUnderCursor(normalizedX, normalizedY);
            if (this.state.hoveredLabel !== label) {
                this.state.hoveredLabel = label;
                this.state.updateLabelHighlight();
                
                // 如果找到了标签，启动虚线动画
                if (label) {
                    if (!this.state.dashAnimationActive) {
                        this.state.dashAnimationActive = true;
                        this.startDashAnimation();
                    }
                } else {
                    // 如果没有标签被悬停，停止动画
                    this.state.dashAnimationActive = false;
                }
                
                this.state.requestRedraw();
            }
            
            // 只有按住 Ctrl 键时才显示移动光标和允许拖动
            if (!pointUnderCursor) {
                this.canvas.style.cursor = (e.ctrlKey && label) ? 'move' : 'default';
            }
        }

        // 只有Ctrl+拖动才允许移动
        if (e.ctrlKey && this.state.isDragging && this.state.draggedLabel) {
            const dx = normalizedX - this.state.dragStartPos.x;
            const dy = normalizedY - this.state.dragStartPos.y;
            
            if (this.state.draggedLabel.isSegmentation) {
                // 移动分割标签
                for (let i = 0; i < this.state.draggedLabel.points.length; i += 2) {
                    this.state.draggedLabel.points[i] += dx;
                    this.state.draggedLabel.points[i + 1] += dy;
                }
            } else if (this.state.draggedLabel.isPose) {
                // 移动姿态标签
                // 首先移动边界框
                this.state.draggedLabel.x += dx;
                this.state.draggedLabel.y += dy;
                
                // 然后移动所有关键点
                if (this.state.draggedLabel.keypoints && this.state.draggedLabel.keypointShape) {
                    const valuePerPoint = this.state.draggedLabel.keypointShape[1];
                    const numKeypoints = this.state.draggedLabel.keypointShape[0];
                    
                    // 遍历所有关键点并移动它们
                    for (let i = 0; i < numKeypoints; i++) {
                        const baseIndex = i * valuePerPoint;
                        // 只更新x和y坐标，不更改可见性值
                        this.state.draggedLabel.keypoints[baseIndex] += dx;
                        this.state.draggedLabel.keypoints[baseIndex + 1] += dy;
                    }
                }
            } else {
                // 移动普通边界框
                this.state.draggedLabel.x += dx;
                this.state.draggedLabel.y += dy;
            }
            
            this.state.dragStartPos = { x: normalizedX, y: normalizedY };
            this.state.requestRedraw();
            this.state.hasUnsavedChanges = true;
        }
        
        // 驱动点的闪烁效果 - 无论鼠标是否移动，都定期重绘
        if (!this.state.pulsationInterval && 
            (this.state.hoveredPoint || 
             this.state.initialLabels.some(l => l.isPose || l.isSegmentation))) {
            // 启动脉动效果动画
            this.state.pulsationInterval = setInterval(() => {
                if (this.state.shouldUpdate()) {
                    this.state.requestRedraw();
                } else {
                    // 如果不需要更新，清除间隔
                    clearInterval(this.state.pulsationInterval);
                    this.state.pulsationInterval = null;
                }
            }, 50); // 50ms间隔产生流畅的动画
        }
        
        // 如果在多边形绘制过程中，更新预览
        if (this.state.isDrawingPolygon && this.state.polygonPoints.length >= 2) {
            this.state.requestRedraw();
        }
        
        // 如果在预览框绘制过程中
        if (this.state.isDrawing) {
            this.state.requestRedraw();
        }
        
        // 更新坐标显示
        this.updateCoordinateDisplay(normalizedX, normalizedY);
    }
    
    /**
     * 根据当前状态更新光标样式
     * @param {MouseEvent} e - 鼠标事件
     */
    updateCursorStyle(e) {
        const pos = this.getMousePos(e);
        const normalizedX = pos.x / this.state.originalImageWidth;
        const normalizedY = pos.y / this.state.originalImageHeight;
        
        // 如果按住Ctrl键，先检查是否悬停在点上
        if (e.ctrlKey) {
            const pointUnderCursor = this.findPointUnderCursor(normalizedX, normalizedY);
            if (pointUnderCursor) {
                this.canvas.style.cursor = 'move';
                return;
            }
            
            if (this.state.hoveredLabel) {
                this.canvas.style.cursor = 'move';
                return;
            }
        }
        
        // 平移模式的光标样式
        if (e.altKey && !this.state.isPanning) {
            this.canvas.classList.add('grabable');
        } else if (!e.altKey && !this.state.isPanning) {
            this.canvas.classList.remove('grabable');
        }
        
        // 如果不是特殊模式，恢复默认光标
        if (!e.altKey && !e.ctrlKey && !this.state.isPanning) {
            this.canvas.style.cursor = 'default';
        }
    }
    
    /**
     * 处理平移逻辑
     * @param {MouseEvent} e - 鼠标事件
     */
    handlePanning(e) {
        const currentPoint = this.getRawMousePos(e);
        const deltaX = currentPoint.x - this.state.lastPanPoint.x;
        const deltaY = currentPoint.y - this.state.lastPanPoint.y;
        
        this.state.translateX += deltaX;
        this.state.translateY += deltaY;
        this.state.lastPanPoint = currentPoint;
        
        this.state.requestRedraw();
    }
    
    /**
     * 更新状态栏中的坐标显示
     * @param {number} x - 归一化的X坐标
     * @param {number} y - 归一化的Y坐标
     */
    updateCoordinateDisplay(x, y) {
        // 转换为图像坐标（归一化）
        const normalizedX = x.toFixed(3);
        const normalizedY = y.toFixed(3);
        this.coordinates.textContent = `位置: ${normalizedX}, ${normalizedY}`;
        
        // 如果有图像尺寸信息，也显示实际像素位置
        if (this.state.originalImageWidth && this.state.originalImageHeight) {
            const pixelX = Math.round(x * this.state.originalImageWidth);
            const pixelY = Math.round(y * this.state.originalImageHeight);
            this.coordinates.textContent = `位置: ${normalizedX}, ${normalizedY} (${pixelX}px, ${pixelY}px)`;
        }
    }

    /**
     * 处理鼠标松开事件
     * @param {MouseEvent} e - 鼠标事件
     */
    handleMouseUp(e) {
        // 更新矩形
        this.updateRects();
        
        // 处理平移结束
        if (this.state.isPanning) {
            this.state.isPanning = false;
            this.canvas.classList.remove('grabbing');
        }
        
        // 处理点拖动结束
        if (this.state.isDraggingPoint) {
            this.state.isDraggingPoint = false;
            this.state.selectedPoint = null;
            this.state.pushHistory();
        }
        
        // 处理标签拖动结束
        if (this.state.isDragging) {
            this.state.isDragging = false;
            this.state.draggedLabel = null;
            this.state.pushHistory();
        }
        
        // 处理框完成
        if (this.state.currentMode === 'box' && this.state.isDrawing) {
            this.completeBoxDrawing(e);
        }
    }
    
    /**
     * 完成框绘制并添加到标签
     * @param {MouseEvent} e - 鼠标事件
     */
    completeBoxDrawing(e) {
        if (!this.state.isDrawing) return;
        
        this.state.isDrawing = false;
        
        const { startX, startY } = this.state;
        const pos = this.getMousePos(e);
        
        // 计算归一化坐标 (0-1 范围)
        const x = pos.x / this.state.originalImageWidth;
        const y = pos.y / this.state.originalImageHeight;
        
        // 计算宽度和高度（归一化）
        const width = Math.abs(x - startX);
        const height = Math.abs(y - startY);
        
        // 计算左上角坐标
        const boxX = Math.min(startX, x) + width/2;
        const boxY = Math.min(startY, y) + height/2;
        
        // 只有当框足够大时才添加
        if (width > CONFIG.MIN_BOX_SIZE && height > CONFIG.MIN_BOX_SIZE) {
            this.state.initialLabels.push({
                x: boxX,
                y: boxY,
                width,
                height,
                class: parseInt(this.state.currentLabel),
                visible: true
            });
            
            // 更新历史记录
            this.state.pushHistory();
            
            // 更新标签列表和计数
            this.updateLabelList();
            this.updateLabelsCountDisplay();
        }
        
        // 重绘画布
        this.state.requestRedraw();
    }

    /**
     * 处理鼠标滚轮事件
     * @param {WheelEvent} e - 滚轮事件
     */
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
    
    /**
     * 处理使用滚轮进行缩放
     * @param {WheelEvent} e - 滚轮事件
     */
    handleZoom(e) {
        e.preventDefault();
        
        // 更新矩形
        this.updateRects();
        
        // 获取缩放前的鼠标位置
        const mousePos = this.getRawMousePos(e);
        
        // 计算新的缩放比例
        const delta = e.deltaY > 0 ? -1 : 1;
        const zoom = delta * CONFIG.ZOOM_SPEED;
        const newScale = Math.max(
            CONFIG.MIN_ZOOM,
            Math.min(CONFIG.MAX_ZOOM, this.state.scale + zoom)
        );
        
        // 仅在缩放比例实际改变时继续
        if (newScale !== this.state.scale) {
            // 计算向鼠标位置缩放
            const scaleRatio = newScale / this.state.scale;
            
            // 更新平移以向鼠标光标缩放
            this.state.translateX = mousePos.x - (mousePos.x - this.state.translateX) * scaleRatio;
            this.state.translateY = mousePos.y - (mousePos.y - this.state.translateY) * scaleRatio;
            
            // 应用新的缩放比例
            this.state.scale = newScale;
            
            // 更新缩放信息显示
            this.updateZoomDisplay();
            
            // 调整画布大小并重绘
            this.resizeCanvas();
            this.state.requestRedraw();
        }
    }
    
    /**
     * 处理缩放时的滚动
     * @param {WheelEvent} e - 滚轮事件
     */
    handleScroll(e) {
        e.preventDefault();
        
        // 计算滚动距离
        const delta = e.deltaY > 0 ? 1 : -1;
        
        if (e.shiftKey) {
            // 使用shift键进行水平滚动
            this.state.translateX -= delta * CONFIG.SCROLL_SPEED;
        } else {
            // 正常情况下垂直滚动
            this.state.translateY -= delta * CONFIG.SCROLL_SPEED;
        }
        
        // 重绘画布
        this.state.requestRedraw();
    }

    /**
     * 处理上下文菜单事件（右键点击）
     * @param {MouseEvent} e - 鼠标事件
     */
    handleContextMenu(e) {
        e.preventDefault();
        // 在右键点击时取消多边形绘制
        if (this.state.currentMode === 'seg' && this.state.isDrawingPolygon) {
            this.state.isDrawingPolygon = false;
            this.state.polygonPoints = [];
            this.state.requestRedraw();
        }
    }

    /**
     * 处理窗口大小调整事件
     */
    handleResize() {
        if (this.state.image) {
            this.resizeCanvas();
            this.state.requestRedraw();
        }
    }

    /**
     * 处理键盘按下事件
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeyDown(e) {
        // 如果目标是输入元素则跳过
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            return;
        }

        // ESC键取消分割或关键点绘制
        if (e.key === 'Escape') {
            if (this.state.currentMode === 'seg' && this.state.isDrawingPolygon) {
                this.state.isDrawingPolygon = false;
                this.state.polygonPoints = [];
                this.state.requestRedraw();
            } else if (this.state.currentMode === 'pose' && this.state.isPoseDrawing) {
                this.cancelPoseDrawing();
            }
            return;
        }

        // Tab/Shift+Tab 切换标签类型
        if (e.key === 'Tab') {
            e.preventDefault();
            const classCount = this.state.classNamesList.length;
            if (classCount > 0) {
                if (e.shiftKey) {
                    // Shift+Tab，前一个
                    this.state.currentLabel = (this.state.currentLabel - 1 + classCount) % classCount;
                } else {
                    // Tab，后一个
                    this.state.currentLabel = (this.state.currentLabel + 1) % classCount;
                }
                this.updateLabelList();
                
                // Update current class status in UI
                if (window.uiManager) {
                    window.uiManager.updateCurrentClassStatus();
                }
            }
            return;
        }

        // 处理键盘快捷键
        if (e.ctrlKey && !e.shiftKey) {
            if (e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (this.state.undo()) {
                    this.state.requestRedraw();
                    this.updateLabelList();
                }
                return;
            } else if (e.key.toLowerCase() === 's') {
                e.preventDefault();
                // 如果保存按钮启用，则触发保存
                const saveButton = document.getElementById('saveLabels');
                if (!saveButton.disabled && !saveButton.classList.contains('disabled') && window.uiManager) {
                    window.uiManager.saveLabels();
                }
                return;
            }
        }

        // 使用A和D键导航（无修饰符）
        if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
            switch (e.key.toLowerCase()) {
                case 'a':
                    e.preventDefault();
                    console.log("CanvasManager: 按下A键导航到上一张图片");
                    this.state.vscode.postMessage({ command: 'previous' });
                    break;
                case 'd':
                    e.preventDefault();
                    console.log("CanvasManager: 按下D键导航到下一张图片");
                    this.state.vscode.postMessage({ command: 'next' });
                    break;
            }
        }
    }

    /**
     * 处理键盘松开事件
     * @param {KeyboardEvent} e - 键盘事件
     */
    handleKeyUp(e) {
        if (!e.altKey && !this.state.isPanning) {
            this.canvas.classList.remove('grabable');
        }
    }

    /**
     * 调整画布大小
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const maxWidth = container.clientWidth;
        const maxHeight = container.clientHeight;
        
        // 始终填充容器而不保持纵横比
        this.canvas.style.width = `${maxWidth}px`;
        this.canvas.style.height = `${maxHeight}px`;
        
        // 在需要时设置画布尺寸
        if (this.canvas.width !== maxWidth || this.canvas.height !== maxHeight) {
            // 缓存当前画布内容
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.canvas.width;
            tempCanvas.height = this.canvas.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(this.canvas, 0, 0);
            
            // 调整画布大小
            this.canvas.width = maxWidth;
            this.canvas.height = maxHeight;
            
            // 恢复内容
            this.ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 
                              0, 0, this.canvas.width, this.canvas.height);
        }
        
        // 更新矩形以反映新尺寸
        this.updateRects();
    }

    /**
     * 加载图像
     * @param {string} imagePath - 图像的URL路径
     * @returns {Promise} 完成图像加载的Promise
     */
    loadImage(imagePath) {
        if (!imagePath) {
            this.showImageError();
            return Promise.reject("No image path provided");
        }
        
        this.showLoadingState(true);
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                // 存储原始图像尺寸
                this.state.originalImageWidth = img.width;
                this.state.originalImageHeight = img.height;
                this.state.image = img;
                
                // 获取画布容器尺寸
                const container = this.canvas.parentElement;
                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                
                // 设置合适的缩放以适应画布
                const scaleX = containerWidth / img.width;
                const scaleY = containerHeight / img.height;
                
                // 使用较小的缩放比例，确保整个图像都在视口内
                this.state.scale = Math.min(scaleX, scaleY, 1); // 不要超过原始大小
                
                // 计算图片居中位置
                this.state.translateX = (containerWidth - (img.width * this.state.scale)) / 2;
                this.state.translateY = (containerHeight - (img.height * this.state.scale)) / 2;
                
                // 更新矩形区域
                this.updateRects();
                
                // 更新所有状态栏信息
                this.updateImageDimensionDisplay();
                this.updateLabelsCountDisplay();
                this.updateZoomDisplay();
                
                // 更新标签列表
                this.updateLabelList();
                
                // 重绘画布
                this.state.requestRedraw();
                
                this.showLoadingState(false);
                resolve(img);
            };
            
            img.onerror = (err) => {
                this.showImageError();
                console.error("Failed to load image:", err);
                this.showLoadingState(false);
                reject("Failed to load image");
            };
            
            img.src = imagePath;
        });
    }
    
    /**
     * 显示加载状态UI
     * @param {boolean} isLoading - 是否正在加载
     */
    showLoadingState(isLoading) {
        const canvas = this.canvas;
        if (isLoading) {
            canvas.classList.add('loading');
            // 如果需要，可以添加加载动画
        } else {
            canvas.classList.remove('loading');
        }
    }
    
    /**
     * 显示图像加载错误
     */
    showImageError() {
        // 在画布上显示错误消息
        this.ctx.fillStyle = this.getCurrentBackgroundColor();
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#ff5252';
        this.ctx.font = '16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Error loading image', this.canvas.width / 2, this.canvas.height / 2);
    }

    /**
     * 绘制当前姿态边界框（虚线）
     */
    drawCurrentPoseBoundingBox() {
        if (!this.state.currentPoseLabel) return;
        
        // 获取标签颜色
        const colorIndex = this.state.currentPoseLabel.class % CONFIG.COLORS.length;
        const color = CONFIG.COLORS[colorIndex];
        
        // 计算像素坐标
        const x = this.state.currentPoseLabel.x * this.state.originalImageWidth;
        const y = this.state.currentPoseLabel.y * this.state.originalImageHeight;
        const width = this.state.currentPoseLabel.width * this.state.originalImageWidth;
        const height = this.state.currentPoseLabel.height * this.state.originalImageHeight;
        
        // 设置虚线样式
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = CONFIG.LINE_WIDTH / this.state.scale;
        this.ctx.setLineDash([8, 8]);
        this.ctx.lineDashOffset = this.state.dashOffset;
        
        // 绘制框
        this.ctx.strokeRect(x - width/2, y - height/2, width, height);
        
        // 恢复实线样式
        this.ctx.setLineDash([]);
        this.ctx.lineDashOffset = 0;
    }

    /**
     * 使用变换重绘画布
     */
    redrawWithTransform() {
        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制背景
        this.ctx.save();
        this.ctx.fillStyle = this.getCurrentBackgroundColor();
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        
        // 如果在pose模式下标注关键点，需要启动虚线动画
        if (this.state.currentMode === 'pose' && this.state.isPoseDrawing && this.state.poseDrawingStep > 0) {
            if (!this.state.dashAnimationActive) {
                this.state.dashAnimationActive = true;
                this.startDashAnimation();
            }
        } 
        // 如果虚线动画处于活动状态但没有悬停标签或不在pose标注中，停止动画
        else if (this.state.dashAnimationActive && !this.state.hoveredLabel) {
            this.state.dashAnimationActive = false;
        }
        
        // 如果图像已加载，则绘制图像和标注
        if (this.state.image && this.state.image.complete) {
            // 应用变换
            this.ctx.save();
            this.ctx.translate(this.state.translateX, this.state.translateY);
            this.ctx.scale(this.state.scale, this.state.scale);
            
            // 绘制图像
            this.ctx.drawImage(this.state.image, 0, 0);
            
            // 绘制标签
            this.drawLabels();
            
            // 如果在分割模式下并正在绘制多边形，则绘制当前多边形
            if (this.state.currentMode === 'seg' && this.state.isDrawingPolygon) {
                this.drawCurrentPolygon();
            }
            
            // 如果在框模式下并正在绘制，则绘制活动框
            if (this.state.currentMode === 'box' && this.state.isDrawing && this.state.currentMousePos) {
                this.drawPreviewBox(this.state.currentMousePos.x, this.state.currentMousePos.y);
            }
            
            // 如果在关键点模式下绘制，根据步骤显示不同提示
            if (this.state.currentMode === 'pose' && this.state.isPoseDrawing) {
                // 如果正在绘制边界框
                if (this.state.poseDrawingStep === 0 && this.state.isDrawing && this.state.currentMousePos) {
                    this.drawPreviewBox(this.state.currentMousePos.x, this.state.currentMousePos.y);
                    
                    // 在鼠标位置显示"绘制边界框"提示
                    const mouseX = this.state.currentMousePos.x * this.state.originalImageWidth;
                    const mouseY = this.state.currentMousePos.y * this.state.originalImageHeight;
                    this.drawPoseStepIndicator(mouseX, mouseY, "绘制边界框");
                } 
                // 如果正在标注关键点
                else if (this.state.poseDrawingStep > 0 && this.state.currentMousePos) {
                    const mouseX = this.state.currentMousePos.x * this.state.originalImageWidth;
                    const mouseY = this.state.currentMousePos.y * this.state.originalImageHeight;
                    
                    // 当前点的编号 (1-based)
                    const currentPoint = this.state.poseDrawingStep;
                    
                    // 显示关键点标注指示器
                    this.drawPoseStepIndicator(mouseX, mouseY, `点 ${currentPoint}/${this.state.keypointCount}`);
                    
                    // 显示关键点预览
                    this.drawKeypointPreview(mouseX, mouseY);
                    
                    // 绘制当前姿态的边界框（虚线）
                    this.drawCurrentPoseBoundingBox();
                    
                    // 如果已有部分关键点，绘制已标注的关键点
                    if (this.state.currentPoseLabel) {
                        this.drawCurrentPoseKeypoints();
                    }
                }
            }
            
            // 如果有选中的点，绘制它
            if (this.state.selectedPoint) {
                this.drawSelectedPoint(this.state.selectedPoint);
            }
            
            this.ctx.restore();
            
            // 在鼠标位置绘制十字线 - 在恢复之后，以确保它们跨越整个画布
            if (this.state.currentMousePos) {
                const canvasX = this.state.currentMousePos.x * this.state.originalImageWidth * this.state.scale + this.state.translateX;
                const canvasY = this.state.currentMousePos.y * this.state.originalImageHeight * this.state.scale + this.state.translateY;
                this.drawCrosshairs(canvasX, canvasY);
            }
        }
    }

    /**
     * 绘制所有标签
     */
    drawLabels() {
        if (!this.state.initialLabels) return;
        
        // 获取类别颜色列表
        const colorList = CONFIG.COLORS;
        
        // 遍历并绘制每个标签
        for (let i = 0; i < this.state.initialLabels.length; i++) {
            const label = this.state.initialLabels[i];
            
            // 跳过不可见的标签
            if (label.visible === false) continue;
            
            // 获取标签颜色
            const colorIndex = label.class % colorList.length;
            const color = colorList[colorIndex];
            
            // 检查是否应高亮显示
            const isHighlighted = this.state.hoveredLabel === label;

            // 根据标签类型调用不同的绘制方法
            if (label.isSegmentation) {
                this.drawSegmentationLabel(label, color, isHighlighted);
            } else if (label.isPose) {
                this.drawPoseLabel(label, color, isHighlighted);
            } else {
                this.drawBoundingBoxLabel(label, color, isHighlighted);
            }
        }
    }

    /**
     * 绘制分割标签
     * @param {Object} label - 标签对象
     * @param {string} color - 标签颜色
     * @param {boolean} isHighlighted - 是否高亮
     */
    drawSegmentationLabel(label, color, isHighlighted) {
        // 设置样式
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = (isHighlighted ? 3 : CONFIG.LINE_WIDTH) / this.state.scale;
        this.ctx.fillStyle = `${color}33`; // 添加透明度
        
        if (isHighlighted) {
            this.ctx.setLineDash([10, 6]);
            this.ctx.lineDashOffset = this.state.dashOffset;
        } else {
            this.ctx.setLineDash([]);
            this.ctx.lineDashOffset = 0;
        }
        
        // 绘制多边形
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
        this.ctx.setLineDash([]);
        this.ctx.lineDashOffset = 0;
        
        // 绘制分割多边形的点
        this.drawLabelPoints(label, 'segmentation', color, isHighlighted);
        
        // 如果启用，则绘制标签文本
        if (this.state.showLabels && label.points.length >= 2) {
            const labelX = label.points[0] * this.state.originalImageWidth;
            const labelY = label.points[1] * this.state.originalImageHeight;
            
            // Get the class name from classNamesList if available, otherwise use the class number
            const className = this.state.classNamesList && this.state.classNamesList[label.class] 
                ? this.state.classNamesList[label.class] 
                : `Class ${label.class}`;
            
            const text = `${className} (SEG)`;
            this.drawLabelText(text, labelX, labelY, color);
        }
    }

    /**
     * 绘制边界框标签
     * @param {Object} label - 标签对象
     * @param {string} color - 标签颜色
     * @param {boolean} isHighlighted - 是否高亮
     */
    drawBoundingBoxLabel(label, color, isHighlighted) {
        if (label.visible === false) return;
        
        // 计算像素坐标
        const x = label.x * this.state.originalImageWidth;
        const y = label.y * this.state.originalImageHeight;
        const width = label.width * this.state.originalImageWidth;
        const height = label.height * this.state.originalImageHeight;
        
        // 绘制框
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = (isHighlighted ? 3 : CONFIG.LINE_WIDTH) / this.state.scale;
        
        // 设置线型
        if (isHighlighted) {
            this.ctx.setLineDash([10, 6]);
            this.ctx.lineDashOffset = this.state.dashOffset;
        } else if (label.aiDetected) {
            // 如果是AI检测的标签，使用虚线边框
            this.ctx.setLineDash([5, 5]);
            this.ctx.lineDashOffset = this.state.dashOffset;
        } else {
            this.ctx.setLineDash([]);
            this.ctx.lineDashOffset = 0;
        }
        
        this.ctx.strokeRect(x - width/2, y - height/2, width, height);
        this.ctx.setLineDash([]);
        this.ctx.lineDashOffset = 0;
        
        // 绘制边界框的四个点
        this.drawLabelPoints(label, 'box', color, isHighlighted);
        
        // 如果启用，则绘制标签文本
        if (this.state.showLabels) {
            // Get the class name from classNamesList if available, otherwise use the class number
            const className = this.state.classNamesList && this.state.classNamesList[label.class] 
                ? this.state.classNamesList[label.class] 
                : `Class ${label.class}`;
            
            // 如果是AI检测的标签，添加"AI:"前缀
            const text = label.aiDetected 
                ? `AI: ${className} (BOX)` 
                : `${className} (BOX)`;
                
            this.drawLabelText(text, x - width/2, y - height/2 - CONFIG.LABEL_HEIGHT / this.state.scale, color);
        }
    }
    
    /**
     * 绘制标签文本的辅助方法
     * @param {string} text - 要显示的文本
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {string} color - 文本颜色
     */
    drawLabelText(text, x, y, color) {
        // 根据缩放设置字体大小
        const fontSize = CONFIG.LABEL_FONT_SIZE / Math.max(1, this.state.scale);
        this.ctx.font = `${fontSize}px sans-serif`;
        
        // 测量文本宽度
        const textWidth = this.ctx.measureText(text).width;
        
        // 绘制文本背景
        this.ctx.fillStyle = color;
        this.ctx.fillRect(
            x,
            y,
            textWidth + (CONFIG.LABEL_PADDING * 2) / this.state.scale,
            CONFIG.LABEL_HEIGHT / this.state.scale
        );
        
        // 绘制文本
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(
            text,
            x + CONFIG.LABEL_PADDING / this.state.scale,
            y + (CONFIG.LABEL_HEIGHT - CONFIG.LABEL_PADDING) / this.state.scale
        );
    }

    /**
     * 绘制预览框
     * @param {number} currentX - 当前X坐标
     * @param {number} currentY - 当前Y坐标
     */
    drawPreviewBox(currentX, currentY) {
        // 计算归一化尺寸
        const width = Math.abs(currentX - this.state.startX);
        const height = Math.abs(currentY - this.state.startY);
        
        // 计算盒子中心坐标
        const boxX = Math.min(this.state.startX, currentX) + width/2;
        const boxY = Math.min(this.state.startY, currentY) + height/2;
        
        // 设置样式
        this.ctx.strokeStyle = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        this.ctx.lineWidth = CONFIG.LINE_WIDTH / this.state.scale;
        
        // 转换为像素坐标
        const boxLeft = (boxX - width/2) * this.state.originalImageWidth;
        const boxTop = (boxY - height/2) * this.state.originalImageHeight;
        const boxWidth = width * this.state.originalImageWidth;
        const boxHeight = height * this.state.originalImageHeight;
        
        // 绘制矩形
        this.ctx.strokeRect(boxLeft, boxTop, boxWidth, boxHeight);
    }

    /**
     * 绘制十字线
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     */
    drawCrosshairs(x, y) {
        // 现在x,y参数已经在画布坐标空间中
        // 所以我们不需要转换它们
        
        // 在画布坐标空间中绘制
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // 设置十字线样式
        this.ctx.strokeStyle = 'rgba(76, 217, 100, 0.8)'; // 绿色，0.8透明度
        this.ctx.lineWidth = 1.5; // 增加线宽以提高可见度
        this.ctx.setLineDash([5, 5]);
        
        // 绘制水平线
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.canvas.width, y);
        this.ctx.stroke();
        
        // 绘制垂直线
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.canvas.height);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    /**
     * 绘制当前多边形
     */
    drawCurrentPolygon() {
        if (!this.state.isDrawingPolygon || this.state.polygonPoints.length < 2) return;

        const color = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = CONFIG.LINE_WIDTH / this.state.scale;
        
        // 绘制现有多边形线条
        this.ctx.beginPath();
        
        // 获取第一个点
        const firstX = this.state.polygonPoints[0] * this.state.originalImageWidth;
        const firstY = this.state.polygonPoints[1] * this.state.originalImageHeight;
        this.ctx.moveTo(firstX, firstY);
        
        // 绘制连接线
        for (let i = 2; i < this.state.polygonPoints.length; i += 2) {
            const x = this.state.polygonPoints[i] * this.state.originalImageWidth;
            const y = this.state.polygonPoints[i + 1] * this.state.originalImageHeight;
            this.ctx.lineTo(x, y);
        }
        
        this.ctx.stroke();
        
        // 如果鼠标位置可用，则绘制预览线
        if (this.state.currentMousePos) {
            this.drawPreviewLine(firstX, firstY, color);
        }
        
        // 绘制点
        this.drawPolygonPoints();
    }
    
    /**
     * 从最后一个点绘制预览线到当前鼠标或第一个点（如果正在关闭）
     * @param {number} firstX - 第一个点的X坐标
     * @param {number} firstY - 第一个点的Y坐标
     * @param {string} color - 线条颜色
     */
    drawPreviewLine(firstX, firstY, color) {
        const lastX = this.state.polygonPoints[this.state.polygonPoints.length - 2] * this.state.originalImageWidth;
        const lastY = this.state.polygonPoints[this.state.polygonPoints.length - 1] * this.state.originalImageHeight;
        
        this.ctx.beginPath();
        this.ctx.moveTo(lastX, lastY);
        
        if (this.isNearFirstPoint(this.state.currentMousePos.x, this.state.currentMousePos.y)) {
            // 如果接近第一个点，将预览线贴合到第一个点
            this.ctx.lineTo(firstX, firstY);
        } else {
            // 否则绘制到当前鼠标位置
            this.ctx.lineTo(
                this.state.currentMousePos.x * this.state.originalImageWidth,
                this.state.currentMousePos.y * this.state.originalImageHeight
            );
        }
        
        this.ctx.strokeStyle = color;
        this.ctx.stroke();
    }

    /**
     * 绘制多边形点
     */
    drawPolygonPoints() {
        const color = CONFIG.COLORS[this.state.currentLabel % CONFIG.COLORS.length];
        this.ctx.fillStyle = color;
        
        // 根据缩放计算点半径
        const pointRadius = CONFIG.POINT_RADIUS / this.state.scale;
        
        // 绘制所有点
        for (let i = 0; i < this.state.polygonPoints.length; i += 2) {
            const x = this.state.polygonPoints[i] * this.state.originalImageWidth;
            const y = this.state.polygonPoints[i + 1] * this.state.originalImageHeight;
            this.ctx.beginPath();
            this.ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // 如果我们有足够的点，则高亮显示第一个点
        if (this.state.polygonPoints.length >= 4) {
            this.highlightFirstPoint(color, pointRadius);
        }
    }
    
    /**
     * 高亮显示多边形的第一个点
     * @param {string} color - 点的颜色
     * @param {number} pointRadius - 点的半径
     */
    highlightFirstPoint(color, pointRadius) {
        const firstX = this.state.polygonPoints[0] * this.state.originalImageWidth;
        const firstY = this.state.polygonPoints[1] * this.state.originalImageHeight;
        
        // 绘制外部白色圆圈
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = CONFIG.LINE_WIDTH / this.state.scale;
        this.ctx.beginPath();
        this.ctx.arc(firstX, firstY, CONFIG.HIGHLIGHT_RADIUS / this.state.scale, 0, Math.PI * 2);
        this.ctx.stroke();

        // 绘制内部彩色圆圈
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(firstX, firstY, pointRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // 当鼠标靠近时添加额外高亮
        if (this.state.currentMousePos && 
            this.isNearFirstPoint(this.state.currentMousePos.x, this.state.currentMousePos.y)) {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 3 / this.state.scale;
            this.ctx.beginPath();
            this.ctx.arc(firstX, firstY, CONFIG.CLOSE_HIGHLIGHT_RADIUS / this.state.scale, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }

    /**
     * 检查点是否接近第一个点
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @returns {boolean} 如果点接近第一个点则为true
     */
    isNearFirstPoint(x, y) {
        if (this.state.polygonPoints.length < 2) return false;
        
        const firstX = this.state.polygonPoints[0];
        const firstY = this.state.polygonPoints[1];
        const distance = Math.sqrt(Math.pow(x - firstX, 2) + Math.pow(y - firstY, 2));
        
        return distance < CONFIG.CLOSE_POINT_THRESHOLD;
    }

    /**
     * 完成多边形
     */
    completePolygon() {
        if (this.state.polygonPoints.length >= 6) {
            // 从多边形点计算边界框
            const bbox = this.calculateBoundingBoxFromPolygon(this.state.polygonPoints);
            
            // 添加新的分割标签
            const newLabel = {
                class: this.state.currentLabel,
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height,
                isSegmentation: true,
                points: [...this.state.polygonPoints],
                visible: true
            };
            this.state.initialLabels.push(newLabel);
            
            // 添加到历史记录
            this.state.pushHistory();
            
            // 重置多边形状态
            this.state.isDrawingPolygon = false;
            this.state.polygonPoints = [];
            
            // 更新UI
            this.state.requestRedraw();
            this.updateLabelList();
        }
    }

    /**
     * 从多边形点计算边界框
     * @param {Array<number>} points - 多边形点的数组
     * @returns {Object} 包含x, y, width, height的对象
     */
    calculateBoundingBoxFromPolygon(points) {
        if (points.length < 4) return { x: 0, y: 0, width: 0, height: 0 };
        
        // 初始化最小/最大值
        let minX = points[0];
        let minY = points[1];
        let maxX = points[0];
        let maxY = points[1];
        
        // 查找x和y坐标的最小/最大值
        for (let i = 0; i < points.length; i += 2) {
            const x = points[i];
            const y = points[i + 1];
            
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
        
        // 计算宽度和高度
        const width = maxX - minX;
        const height = maxY - minY;
        
        // 返回具有中心点、宽度和高度的框（YOLO格式）
        return {
            x: minX + width / 2,
            y: minY + height / 2,
            width: width,
            height: height
        };
    }

    /**
     * 更新标签列表
     */
    updateLabelList() {
        const labelListContainer = document.getElementById('labelList');
        if (!labelListContainer) return;
        
        // 刷新当前class状态栏
        if (window.uiManager) {
            window.uiManager.updateCurrentClassStatus();
        }
        
        labelListContainer.innerHTML = '';
        
        if (!this.state.initialLabels || this.state.initialLabels.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-label-message';
            emptyMessage.textContent = '无标签 - 点击并拖动添加';
            labelListContainer.appendChild(emptyMessage);
            
            // 更新标签计数
            this.updateLabelsCountDisplay();
            return;
        }
        
        this.state.initialLabels.forEach((label, index) => {
            const div = document.createElement('div');
            div.className = 'label-item';
            
            // 创建颜色指示器
            const colorDiv = document.createElement('div');
            colorDiv.className = 'label-color';
            colorDiv.style.backgroundColor = CONFIG.COLORS[label.class % CONFIG.COLORS.length];
            
            // 创建类别选择器
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

            // 创建类型指示器
            const typeSpan = document.createElement('span');
            typeSpan.className = 'label-type';
            if (label.isPose) {
                typeSpan.textContent = 'POSE';
            } else if (label.isSegmentation) {
                typeSpan.textContent = 'SEG';
            } else {
                typeSpan.textContent = 'BOX';
            }
            
            // 创建可见性切换按钮（眼睛图标）
            const visibilityBtn = document.createElement('button');
            visibilityBtn.className = 'visibility-button';
            visibilityBtn.title = label.visible !== false ? 'Hide label' : 'Show label';
            visibilityBtn.innerHTML = label.visible !== false ? 
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : 
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            
            visibilityBtn.style.marginLeft = '4px';
            visibilityBtn.onclick = () => {
                // 切换可见性
                label.visible = label.visible === false ? true : false;
                
                // 更新按钮外观
                visibilityBtn.title = label.visible ? 'Hide label' : 'Show label';
                visibilityBtn.innerHTML = label.visible ? 
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' : 
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                
                // 显示/隐藏标签不影响未保存状态
                // 暂存当前的未保存状态
                const currentUnsavedState = this.state.hasUnsavedChanges;
                
                // 更新标签计数显示
                this.updateLabelsCountDisplay();
                
                // 重绘画布
                this.state.requestRedraw();
                
                // 恢复之前的未保存状态
                this.state.hasUnsavedChanges = currentUnsavedState;
                
                // 如果uiManager存在，更新保存按钮状态
                if (window.uiManager) {
                    window.uiManager.updateSaveButtonState();
                }
            };
            
            // 创建删除按钮
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
            
            // 组装标签项
            div.appendChild(colorDiv);
            div.appendChild(select);
            div.appendChild(typeSpan);
            div.appendChild(visibilityBtn);
            div.appendChild(deleteBtn);
            labelListContainer.appendChild(div);
            
            // 添加鼠标悬停事件，使画布上相应的标签高亮
            div.addEventListener('mouseenter', () => {
                if (label.visible !== false) {
                    this.state.hoveredLabel = label;
                    this.state.updateLabelHighlight();
                    
                    // 启动虚线动画
                    if (!this.state.dashAnimationActive) {
                        this.state.dashAnimationActive = true;
                        this.startDashAnimation();
                    }
                    
                    this.state.requestRedraw();
                }
            });
            
            div.addEventListener('mouseleave', () => {
                if (this.state.hoveredLabel === label) {
                    this.state.hoveredLabel = null;
                    this.state.updateLabelHighlight();
                    
                    // 如果没有悬停的标签，停止动画
                    if (!this.state.hoveredLabel) {
                        this.state.dashAnimationActive = false;
                    }
                    
                    this.state.requestRedraw();
                }
            });
        });
        
        // 更新标签计数显示
        this.updateLabelsCountDisplay();
    }

    /**
     * 更新缩放信息显示
     */
    updateZoomDisplay() {
        const zoomPercent = Math.round(this.state.scale * 100);
        this.zoomInfo.textContent = `缩放: ${zoomPercent}%`;
    }

    /**
     * 更新图像尺寸显示
     */
    updateImageDimensionDisplay() {
        if (this.state.originalImageWidth && this.state.originalImageHeight) {
            this.imageDimension.textContent = `尺寸: ${this.state.originalImageWidth} x ${this.state.originalImageHeight}`;
        } else {
            this.imageDimension.textContent = '尺寸: - x -';
        }
    }

    /**
     * 更新标签数量显示
     */
    updateLabelsCountDisplay() {
        const visibleLabels = this.state.initialLabels.filter(label => label.visible !== false).length;
        this.labelsCount.textContent = `标签: ${visibleLabels}`;
    }

    updateLabelHighlight() {
        // Update the hoveredLabel in the state
        if (this.state.hoveredLabel) {
            // Find the corresponding label item in the sidebar
            const labelItems = document.querySelectorAll('.label-item');
            labelItems.forEach((item, index) => {
                // Remove highlight from all items first
                item.classList.remove('highlighted');
                
                // Add highlight class to the matching item
                if (index < this.state.initialLabels.length && 
                    this.state.initialLabels[index] === this.state.hoveredLabel) {
                    item.classList.add('highlighted');
                }
            });
        } else {
            // Remove highlight from all items when no label is hovered
            const labelItems = document.querySelectorAll('.label-item');
            labelItems.forEach(item => {
                item.classList.remove('highlighted');
            });
        }
    }

    /**
     * 启动虚线动画
     */
    startDashAnimation() {
        if (!this.state.dashAnimationActive) return;
        
        // 更新虚线偏移，使用更大的步长使动画更明显
        this.state.dashOffset -= 1.5;
        
        // 循环偏移值以避免数值过大
        if (this.state.dashOffset < -100) {
            this.state.dashOffset = 0;
        }
        
        // 重绘画布以显示动画效果
        this.state.requestRedraw();
        
        // 使用requestAnimationFrame创建平滑动画
        requestAnimationFrame(() => this.startDashAnimation());
    }

    /**
     * 绘制关键点标注步骤指示器
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     * @param {string} text - 提示文本
     */
    drawPoseStepIndicator(x, y, text) {
        // 偏移量，让提示显示在鼠标右侧
        const offsetX = 20 / this.state.scale;
        const offsetY = 0;
        
        // 设置字体大小
        const fontSize = CONFIG.LABEL_FONT_SIZE / Math.max(1, this.state.scale);
        this.ctx.font = `${fontSize}px sans-serif`;
        
        // 测量文本宽度
        const textWidth = this.ctx.measureText(text).width;
        const padding = CONFIG.LABEL_PADDING / this.state.scale;
        
        // 绘制文本背景
        this.ctx.fillStyle = '#4285f4'; // 蓝色背景
        this.ctx.fillRect(
            x + offsetX,
            y + offsetY,
            textWidth + padding * 2,
            fontSize + padding * 2
        );
        
        // 绘制文本
        this.ctx.fillStyle = '#ffffff'; // 白色文本
        this.ctx.fillText(
            text,
            x + offsetX + padding,
            y + offsetY + fontSize + padding / 2
        );
    }

    /**
     * 绘制关键点预览
     * @param {number} x - X坐标（像素）
     * @param {number} y - Y坐标（像素）
     */
    drawKeypointPreview(x, y) {
        const radius = 5 / this.state.scale;
        
        // 获取当前标签颜色
        const colorIndex = this.state.currentLabel % CONFIG.COLORS.length;
        const color = CONFIG.COLORS[colorIndex];
        const darkerColor = this.getDarkerColor(color);
        
        // 绘制外圈
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = `${color}4D`; // 添加30%透明度 (4D in hex = ~30%)
        this.ctx.fill();
        
        // 绘制内圈
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius / 2, 0, 2 * Math.PI);
        this.ctx.fillStyle = color; // 使用标签原色
        this.ctx.fill();
        this.ctx.strokeStyle = darkerColor; // 使用更深色的标签颜色作为边框
        this.ctx.lineWidth = 1 / this.state.scale;
        this.ctx.stroke();
    }

    /**
     * 绘制当前已标注的关键点
     */
    drawCurrentPoseKeypoints() {
        if (!this.state.currentPoseLabel || !this.state.currentPoseLabel.keypoints) return;
        
        const keypoints = this.state.currentPoseLabel.keypoints;
        const valuePerPoint = this.state.keypointValueCount;
        const numKeypoints = this.state.poseDrawingStep - 1; // 到目前为止已标注的点数量
        
        // 获取标签颜色
        const colorIndex = this.state.currentPoseLabel.class % CONFIG.COLORS.length;
        const color = CONFIG.COLORS[colorIndex];
        const darkerColor = this.getDarkerColor(color);
        
        // 绘制已标注的点
        for (let i = 0; i < numKeypoints; i++) {
            const baseIndex = i * valuePerPoint;
            
            // 获取坐标
            const x = keypoints[baseIndex] * this.state.originalImageWidth;
            const y = keypoints[baseIndex + 1] * this.state.originalImageHeight;
            
            // 获取可见性（如果有）
            let visibility = 1; // 默认可见
            if (valuePerPoint >= 3) {
                visibility = keypoints[baseIndex + 2];
            }
            
            // 根据可见性绘制不同样式
            const radius = 5 / this.state.scale;
            
            if (visibility === 1) {
                // 可见点 - 使用标签颜色
                this.ctx.beginPath();
                this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
                this.ctx.fillStyle = color; // 使用标签颜色
                this.ctx.fill();
                this.ctx.strokeStyle = darkerColor; // 使用更深色的标签颜色作为边框
                this.ctx.lineWidth = 1 / this.state.scale;
                this.ctx.stroke();
            } else if (visibility === 2) {
                // 被遮挡点 - 使用标签颜色的半透明版本
                this.ctx.beginPath();
                this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
                this.ctx.fillStyle = `${color}B3`; // 添加70%透明度 (B3 in hex = ~70%)
                this.ctx.fill();
                this.ctx.strokeStyle = darkerColor; // 使用更深色的标签颜色作为边框
                this.ctx.lineWidth = 1 / this.state.scale;
                this.ctx.stroke();
            } else {
                // 不可见点 - 带X的半透明深灰色圆
                this.ctx.beginPath();
                this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
                this.ctx.fillStyle = 'rgba(80, 80, 80, 0.5)'; // 半透明深灰色
                this.ctx.fill();
                this.ctx.strokeStyle = darkerColor; // 使用更深色的标签颜色作为边框
                this.ctx.lineWidth = 1 / this.state.scale;
                this.ctx.stroke();
                
                // 绘制X
                this.ctx.beginPath();
                this.ctx.moveTo(x - radius/2, y - radius/2);
                this.ctx.lineTo(x + radius/2, y + radius/2);
                this.ctx.moveTo(x + radius/2, y - radius/2);
                this.ctx.lineTo(x - radius/2, y + radius/2);
                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 1.5 / this.state.scale;
                this.ctx.stroke();
            }
            
            // 绘制点的编号
            this.ctx.font = `${8 / this.state.scale}px sans-serif`;
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${i + 1}`, x, y - (radius + 2 / this.state.scale));
            this.ctx.textAlign = 'start'; // 重置为默认
        }
    }

    /**
     * 绘制关键点/姿态标签
     * @param {Object} label - 标签对象
     * @param {string} color - 标签颜色
     * @param {boolean} isHighlighted - 是否高亮
     */
    drawPoseLabel(label, color, isHighlighted) {
        // 绘制边界框部分(保留绘制框，但不绘制标签文本)
        // 计算像素坐标
        const x = label.x * this.state.originalImageWidth;
        const y = label.y * this.state.originalImageHeight;
        const width = label.width * this.state.originalImageWidth;
        const height = label.height * this.state.originalImageHeight;
        
        // 绘制框
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = (isHighlighted ? 3 : CONFIG.LINE_WIDTH) / this.state.scale;
        if (isHighlighted) {
            this.ctx.setLineDash([10, 6]);
            this.ctx.lineDashOffset = this.state.dashOffset;
        } else {
            this.ctx.setLineDash([]);
            this.ctx.lineDashOffset = 0;
        }
        this.ctx.strokeRect(x - width/2, y - height/2, width, height);
        this.ctx.setLineDash([]);
        this.ctx.lineDashOffset = 0;
        
        // 如果没有关键点数据，则直接返回
        if (!label.keypoints || !label.keypointShape) return;
        
        // 绘制姿态关键点
        this.drawLabelPoints(label, 'pose', color, isHighlighted);
        
        // 如果可见，绘制标签文本
        if (this.state.showLabels) {
            // 获取边界框左上角位置
            const labelX = x - width/2;
            const labelY = y - height/2 - CONFIG.LABEL_HEIGHT / this.state.scale;
            
            // 获取类名
            const className = this.state.classNamesList && this.state.classNamesList[label.class] 
                ? this.state.classNamesList[label.class] 
                : `Class ${label.class}`;
            
            // 绘制带有POSE标识的文本
            const text = `${className} (POSE)`;
            this.drawLabelText(text, labelX, labelY, color);
        }
    }

    /**
     * 处理姿态/关键点模式下的点击
     * @param {MouseEvent} e - 鼠标事件
     * @param {number} x - 归一化的X坐标
     * @param {number} y - 归一化的Y坐标
     */
    handlePoseClick(e, x, y) {
        // 如果按了右键
        if (e.button === 2) {
            if (this.state.isPoseDrawing && this.state.poseDrawingStep > 0) {
                // 右键表示点不可见(可见性设为2 - 被遮挡)
                this.addPoseKeypoint(x, y, 2);
            }
            return;
        }
        
        // 处理左键点击
        if (e.button === 0) {
            if (!this.state.isPoseDrawing) {
                // 开始新的姿态标注，首先绘制边界框
                this.state.isPoseDrawing = true;
                this.state.poseDrawingStep = 0;
                this.startBoxDrawing(x, y);
            } else if (this.state.poseDrawingStep === 0) {
                // 如果正在绘制边界框，则完成边界框绘制
                this.completePoseBoxDrawing(x, y);
            } else {
                // 否则添加关键点(左键是完全可见的点，可见性设为1)
                this.addPoseKeypoint(x, y, 1);
            }
        }
    }

    /**
     * 完成关键点标注的边界框绘制
     * @param {number} x - 归一化的X坐标
     * @param {number} y - 归一化的Y坐标
     */
    completePoseBoxDrawing(x, y) {
        if (!this.state.isPoseDrawing) return;
        
        const { startX, startY } = this.state;
        
        // 计算宽度和高度（归一化）
        const width = Math.abs(x - startX);
        const height = Math.abs(y - startY);
        
        // 计算中心点坐标
        const boxX = Math.min(startX, x) + width/2;
        const boxY = Math.min(startY, y) + height/2;
        
        // 只有当框足够大时才继续
        if (width > CONFIG.MIN_BOX_SIZE && height > CONFIG.MIN_BOX_SIZE) {
            // 从YAML配置获取关键点数和值类型
            let keypointCount = 17;  // 默认使用COCO的17个关键点
            let valuePerKeypoint = 3; // 默认每个关键点有3个值(x,y,v)
            
            // 尝试从配置中读取
            if (window.kptShape && Array.isArray(window.kptShape) && window.kptShape.length >= 2) {
                keypointCount = window.kptShape[0];
                valuePerKeypoint = window.kptShape[1];
            }
            
            // 创建空的关键点数组
            const keypoints = new Array(keypointCount * valuePerKeypoint).fill(0);
            
            // 创建新的关键点标签
            this.state.currentPoseLabel = {
                class: parseInt(this.state.currentLabel),
                x: boxX,
                y: boxY,
                width: width,
                height: height,
                isPose: true,
                keypoints: keypoints,
                keypointShape: [keypointCount, valuePerKeypoint],
                visible: true
            };
            
            // 更新状态
            this.state.keypointCount = keypointCount;
            this.state.keypointValueCount = valuePerKeypoint;
            this.state.poseDrawingStep = 1;  // 开始标注第1个关键点
            
            // 重置绘制框状态
            this.state.isDrawing = false;
            
            // 重绘画布
            this.state.requestRedraw();
        } else {
            // 框太小，取消绘制
            this.cancelPoseDrawing();
        }
    }

    /**
     * 添加姿态关键点
     * @param {number} x - 归一化的X坐标
     * @param {number} y - 归一化的Y坐标
     * @param {number} visibility - 可见性状态 (0=不可见, 1=可见, 2=被遮挡但可见)
     */
    addPoseKeypoint(x, y, visibility) {
        if (!this.state.isPoseDrawing || !this.state.currentPoseLabel) return;
        
        const currentKeypoint = this.state.poseDrawingStep - 1;
        const valuePerPoint = this.state.keypointValueCount;
        
        // 检查是否超出了关键点数量
        if (currentKeypoint >= this.state.keypointCount) {
            this.completePoseDrawing();
            return;
        }
        
        // 设置当前关键点的值
        const baseIndex = currentKeypoint * valuePerPoint;
        this.state.currentPoseLabel.keypoints[baseIndex] = x;
        this.state.currentPoseLabel.keypoints[baseIndex + 1] = y;
        
        // 如果支持可见性值，则设置可见性
        if (valuePerPoint >= 3) {
            this.state.currentPoseLabel.keypoints[baseIndex + 2] = visibility;
        }
        
        // 移动到下一个关键点
        this.state.poseDrawingStep++;
        
        // 如果已经标注完所有关键点，则完成整个标注
        if (this.state.poseDrawingStep - 1 >= this.state.keypointCount) {
            this.completePoseDrawing();
        } else {
            // 否则继续绘制下一个点
            this.state.requestRedraw();
        }
    }

    /**
     * 完成整个姿态标注过程
     */
    completePoseDrawing() {
        if (!this.state.isPoseDrawing || !this.state.currentPoseLabel) return;
        
        // 添加标签到列表
        this.state.initialLabels.push(this.state.currentPoseLabel);
        
        // 更新历史记录
        this.state.pushHistory();
        
        // 更新标签列表和计数
        this.updateLabelList();
        this.updateLabelsCountDisplay();
        
        // 重置状态
        this.cancelPoseDrawing();
        
        // 重绘画布
        this.state.requestRedraw();
    }

    /**
     * 取消当前姿态标注过程
     */
    cancelPoseDrawing() {
        this.state.isPoseDrawing = false;
        this.state.poseDrawingStep = 0;
        this.state.currentPoseLabel = null;
        this.state.isDrawing = false;
        this.state.requestRedraw();
    }

    /**
     * 检测鼠标下是否有可选择的点
     * @param {number} x - 归一化的X坐标
     * @param {number} y - 归一化的Y坐标
     * @returns {Object|null} 包含点信息的对象或null
     */
    findPointUnderCursor(x, y) {
        if (!this.state.initialLabels || this.state.initialLabels.length === 0) return null;
        
        // 设置点的选择阈值（根据缩放调整）
        const threshold = CONFIG.CLOSE_POINT_THRESHOLD / this.state.scale;
        
        // 从后向前遍历（后添加的标签优先）
        for (let i = this.state.initialLabels.length - 1; i >= 0; i--) {
            const label = this.state.initialLabels[i];
            
            // 跳过不可见的标签
            if (label.visible === false) continue;
            
            if (label.isSegmentation) {
                // 检查分割多边形的各个点
                for (let j = 0; j < label.points.length; j += 2) {
                    const pointX = label.points[j];
                    const pointY = label.points[j + 1];
                    const distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
                    
                    if (distance < threshold) {
                        return {
                            label,
                            type: 'segmentation',
                            pointIndex: j,
                            x: pointX,
                            y: pointY
                        };
                    }
                }
            } else if (label.isPose && label.keypoints) {
                // 检查姿态关键点
                const valuePerPoint = label.keypointShape ? label.keypointShape[1] : 3;
                const numKeypoints = label.keypointShape ? label.keypointShape[0] : 0;
                
                for (let j = 0; j < numKeypoints; j++) {
                    const baseIndex = j * valuePerPoint;
                    const pointX = label.keypoints[baseIndex];
                    const pointY = label.keypoints[baseIndex + 1];
                    
                    // 如果点有可见性值且不可见，则跳过
                    if (valuePerPoint >= 3 && label.keypoints[baseIndex + 2] === 0) continue;
                    
                    const distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
                    
                    if (distance < threshold) {
                        return {
                            label,
                            type: 'pose',
                            pointIndex: baseIndex,
                            x: pointX,
                            y: pointY
                        };
                    }
                }
            } else {
                // 检查边界框的四个角点
                const halfWidth = label.width / 2;
                const halfHeight = label.height / 2;
                
                // 左上角
                let pointX = label.x - halfWidth;
                let pointY = label.y - halfHeight;
                let distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
                
                if (distance < threshold) {
                    return {
                        label,
                        type: 'box',
                        corner: 'top-left',
                        x: pointX,
                        y: pointY
                    };
                }
                
                // 右上角
                pointX = label.x + halfWidth;
                pointY = label.y - halfHeight;
                distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
                
                if (distance < threshold) {
                    return {
                        label,
                        type: 'box',
                        corner: 'top-right',
                        x: pointX,
                        y: pointY
                    };
                }
                
                // 左下角
                pointX = label.x - halfWidth;
                pointY = label.y + halfHeight;
                distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
                
                if (distance < threshold) {
                    return {
                        label,
                        type: 'box',
                        corner: 'bottom-left',
                        x: pointX,
                        y: pointY
                    };
                }
                
                // 右下角
                pointX = label.x + halfWidth;
                pointY = label.y + halfHeight;
                distance = Math.sqrt(Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2));
                
                if (distance < threshold) {
                    return {
                        label,
                        type: 'box',
                        corner: 'bottom-right',
                        x: pointX,
                        y: pointY
                    };
                }
            }
        }
        
        return null;
    }

    /**
     * 绘制选中的点
     * @param {Object} selectedPoint - 选中的点信息
     */
    drawSelectedPoint(selectedPoint) {
        if (!selectedPoint) return;
        
        // 获取点的像素坐标
        const x = selectedPoint.x * this.state.originalImageWidth;
        const y = selectedPoint.y * this.state.originalImageHeight;
        
        // 绘制高亮效果
        const radius = 6 / this.state.scale;
        
        // 获取标签颜色
        const label = selectedPoint.label;
        const colorIndex = label.class % CONFIG.COLORS.length;
        const color = CONFIG.COLORS[colorIndex];
        
        // 创建更深色版本的标签颜色
        const darkerColor = this.getDarkerColor(color);
        
        // 外部高亮圆
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.fill();
        
        // 内部点
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fill();
        this.ctx.strokeStyle = darkerColor; // 使用更深色版本的标签颜色，而不是黑色
        this.ctx.lineWidth = 1.5 / this.state.scale;
        this.ctx.stroke();
    }

    /**
     * 移动选中的点
     * @param {number} x - 归一化的X坐标
     * @param {number} y - 归一化的Y坐标
     */
    moveSelectedPoint(x, y) {
        if (!this.state.selectedPoint) return;
        
        const selectedPoint = this.state.selectedPoint;
        const dx = x - this.state.dragStartPos.x;
        const dy = y - this.state.dragStartPos.y;
        
        // 更新拖动开始位置
        this.state.dragStartPos = { x, y };
        
        // 根据点的类型进行不同的处理
        if (selectedPoint.type === 'segmentation') {
            // 更新分割多边形的点
            const pointIndex = selectedPoint.pointIndex;
            selectedPoint.label.points[pointIndex] = x;
            selectedPoint.label.points[pointIndex + 1] = y;
            
            // 更新选中点的位置信息
            selectedPoint.x = x;
            selectedPoint.y = y;
        } else if (selectedPoint.type === 'pose') {
            // 更新姿态关键点
            const pointIndex = selectedPoint.pointIndex;
            selectedPoint.label.keypoints[pointIndex] = x;
            selectedPoint.label.keypoints[pointIndex + 1] = y;
            
            // 更新选中点的位置信息
            selectedPoint.x = x;
            selectedPoint.y = y;
        } else if (selectedPoint.type === 'box') {
            // 更新边界框角点
            const label = selectedPoint.label;
            const halfWidth = label.width / 2;
            const halfHeight = label.height / 2;
            
            // 根据拖动的角点更新框的位置和大小
            if (selectedPoint.corner === 'top-left') {
                // 移动左上角 - 影响 x, y, width, height
                const newX = label.x + dx * 0.5;
                const newY = label.y + dy * 0.5;
                const newWidth = label.width - dx;
                const newHeight = label.height - dy;
                
                // 确保宽度和高度不为负
                if (newWidth > 0 && newHeight > 0) {
                    label.x = newX;
                    label.y = newY;
                    label.width = newWidth;
                    label.height = newHeight;
                    
                    // 更新选中点位置
                    selectedPoint.x = label.x - label.width / 2;
                    selectedPoint.y = label.y - label.height / 2;
                }
            } else if (selectedPoint.corner === 'top-right') {
                // 移动右上角 - 影响 x, y, width, height
                const newX = label.x + dx * 0.5;
                const newY = label.y + dy * 0.5;
                const newWidth = label.width + dx;
                const newHeight = label.height - dy;
                
                // 确保宽度和高度不为负
                if (newWidth > 0 && newHeight > 0) {
                    label.x = newX;
                    label.y = newY;
                    label.width = newWidth;
                    label.height = newHeight;
                    
                    // 更新选中点位置
                    selectedPoint.x = label.x + label.width / 2;
                    selectedPoint.y = label.y - label.height / 2;
                }
            } else if (selectedPoint.corner === 'bottom-left') {
                // 移动左下角 - 影响 x, y, width, height
                const newX = label.x + dx * 0.5;
                const newY = label.y + dy * 0.5;
                const newWidth = label.width - dx;
                const newHeight = label.height + dy;
                
                // 确保宽度和高度不为负
                if (newWidth > 0 && newHeight > 0) {
                    label.x = newX;
                    label.y = newY;
                    label.width = newWidth;
                    label.height = newHeight;
                    
                    // 更新选中点位置
                    selectedPoint.x = label.x - label.width / 2;
                    selectedPoint.y = label.y + label.height / 2;
                }
            } else if (selectedPoint.corner === 'bottom-right') {
                // 移动右下角 - 影响 x, y, width, height
                const newX = label.x + dx * 0.5;
                const newY = label.y + dy * 0.5;
                const newWidth = label.width + dx;
                const newHeight = label.height + dy;
                
                // 确保宽度和高度不为负
                if (newWidth > 0 && newHeight > 0) {
                    label.x = newX;
                    label.y = newY;
                    label.width = newWidth;
                    label.height = newHeight;
                    
                    // 更新选中点位置
                    selectedPoint.x = label.x + label.width / 2;
                    selectedPoint.y = label.y + label.height / 2;
                }
            }
        }
    }

    // 添加新方法：统一绘制标签的点
    drawLabelPoints(label, type, color, isHighlighted) {
        // 检查是否有点在鼠标下
        const hoveredPoint = this.state.currentMousePos ? 
            this.findPointUnderCursor(this.state.currentMousePos.x, this.state.currentMousePos.y) : null;
        
        // 设置点的大小和闪烁效果
        const basePointRadius = (isHighlighted ? 5 : 3) / this.state.scale;
        // 闪烁效果 - 使用时间戳创建脉动效果
        const pulseOffset = Math.sin(Date.now() * 0.01) * 0.2 + 0.8;
        
        if (type === 'box') {
            // 绘制边界框的四个角点
            const halfWidth = label.width / 2;
            const halfHeight = label.height / 2;
            
            // 左上角
            let pointX = label.x - halfWidth;
            let pointY = label.y - halfHeight;
            this.drawPoint(label, type, 'top-left', pointX, pointY, color, 
                isHoveredPoint(hoveredPoint, label, type, 'top-left'), basePointRadius, pulseOffset);
            
            // 右上角
            pointX = label.x + halfWidth;
            pointY = label.y - halfHeight;
            this.drawPoint(label, type, 'top-right', pointX, pointY, color, 
                isHoveredPoint(hoveredPoint, label, type, 'top-right'), basePointRadius, pulseOffset);
            
            // 左下角
            pointX = label.x - halfWidth;
            pointY = label.y + halfHeight;
            this.drawPoint(label, type, 'bottom-left', pointX, pointY, color, 
                isHoveredPoint(hoveredPoint, label, type, 'bottom-left'), basePointRadius, pulseOffset);
            
            // 右下角
            pointX = label.x + halfWidth;
            pointY = label.y + halfHeight;
            this.drawPoint(label, type, 'bottom-right', pointX, pointY, color, 
                isHoveredPoint(hoveredPoint, label, type, 'bottom-right'), basePointRadius, pulseOffset);
        } 
        else if (type === 'segmentation') {
            // 绘制分割多边形的所有点
            for (let i = 0; i < label.points.length; i += 2) {
                const pointX = label.points[i];
                const pointY = label.points[i + 1];
                this.drawPoint(label, type, i, pointX, pointY, color, 
                    isHoveredPoint(hoveredPoint, label, type, i), basePointRadius, pulseOffset);
            }
        } 
        else if (type === 'pose') {
            // 绘制姿态关键点
            const numKeypoints = label.keypointShape[0];
            const valuePerPoint = label.keypointShape[1]; // 通常是2或3
            
            for (let i = 0; i < numKeypoints; i++) {
                const baseIndex = i * valuePerPoint;
                
                // 获取关键点坐标和可见性
                const pointX = label.keypoints[baseIndex];
                const pointY = label.keypoints[baseIndex + 1];
                
                // 如果有可见性值（valuePerPoint=3），则检查可见性
                let visibility = 1; // 默认可见
                if (valuePerPoint >= 3) {
                    visibility = label.keypoints[baseIndex + 2];
                    // 如果可见性为0，跳过这个关键点
                    if (visibility === 0) continue;
                }
                
                // 根据可见性调整透明度
                let opacity = 1;
                if (valuePerPoint >= 3 && visibility === 2) {
                    opacity = 0.5; // 被遮挡但可见
                }
                
                this.drawPoint(label, type, baseIndex, pointX, pointY, color, 
                    isHoveredPoint(hoveredPoint, label, type, baseIndex), basePointRadius, pulseOffset, opacity);
            }
        }
        
        // 辅助函数：检查是否是当前悬停的点
        function isHoveredPoint(hoveredPoint, checkLabel, checkType, checkIndex) {
            if (!hoveredPoint) return false;
            
            if (hoveredPoint.label === checkLabel && hoveredPoint.type === checkType) {
                if (checkType === 'box') {
                    return hoveredPoint.corner === checkIndex;
                } else {
                    return hoveredPoint.pointIndex === checkIndex;
                }
            }
            return false;
        }
    }

    // 添加新方法：绘制单个点
    drawPoint(label, type, index, x, y, baseColor, isHovered, baseRadius, pulseOffset = 1, opacity = 1) {
        // 转换为画布坐标
        const canvasX = x * this.state.originalImageWidth;
        const canvasY = y * this.state.originalImageHeight;
        
        // 计算实际半径（考虑悬停状态和脉动效果）
        let radius = baseRadius;
        if (isHovered) {
            // 悬停时放大并添加脉动效果
            radius = baseRadius * 1.8 * pulseOffset;
        }
        
        // 为边框创建更深色版本的标签颜色
        const darkerColor = this.getDarkerColor(baseColor);
        
        // 绘制点的外圈（使用更深色的标签颜色作为边框）
        this.ctx.beginPath();
        this.ctx.arc(canvasX, canvasY, radius * 1.2, 0, 2 * Math.PI);
        this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
        this.ctx.fill();
        
        // 绘制点的内圈（使用标签颜色）
        this.ctx.beginPath();
        this.ctx.arc(canvasX, canvasY, radius, 0, 2 * Math.PI);
        
        // 设置填充颜色（根据悬停状态调整）
        if (isHovered) {
            // 悬停时使用明亮的颜色
            this.ctx.fillStyle = baseColor;
        } else {
            // 非悬停时使用半透明颜色
            this.ctx.fillStyle = `${baseColor}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
        }
        
        this.ctx.fill();
        
        // 为点添加边框，使用深色版本的标签颜色而不是黑色
        this.ctx.strokeStyle = isHovered ? '#ffffff' : darkerColor;
        this.ctx.lineWidth = (isHovered ? 2 : 1) / this.state.scale;
        this.ctx.stroke();
    }

    // 添加辅助方法：获取颜色的深色版本
    getDarkerColor(hexColor) {
        // 移除可能的 # 前缀
        const color = hexColor.replace('#', '');
        
        // 确保我们有一个有效的颜色
        if (!/^[0-9A-Fa-f]{6}$/.test(color)) {
            return '#000000'; // 如果无效则返回黑色
        }
        
        // 解析RGB通道
        const r = parseInt(color.substr(0, 2), 16);
        const g = parseInt(color.substr(2, 2), 16);
        const b = parseInt(color.substr(4, 2), 16);
        
        // 将每个通道变暗（乘以0.7）
        const darkerR = Math.floor(r * 0.7);
        const darkerG = Math.floor(g * 0.7);
        const darkerB = Math.floor(b * 0.7);
        
        // 转换回十六进制并格式化
        return `#${darkerR.toString(16).padStart(2, '0')}${darkerG.toString(16).padStart(2, '0')}${darkerB.toString(16).padStart(2, '0')}`;
    }
} 