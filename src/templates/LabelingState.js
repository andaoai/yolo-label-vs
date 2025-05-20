/**
 * LabelingState - 管理整个标注应用的状态
 * 负责维护当前状态、历史记录、标签和画布的转换
 */
export class LabelingState {
    constructor() {
        // 获取VS Code API
        this.vscode = acquireVsCodeApi();
        
        // 图像状态
        this.image = null;
        this.originalImageWidth = 0;
        this.originalImageHeight = 0;
        this.currentPath = '';
        this.currentImage = '';
        this.allImagePaths = [];
        this.imagePreviews = [];
        
        // 标签状态
        this.initialLabels = [];
        this.currentLabel = 0;
        this.classNamesList = ['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat'];
        this.showLabels = true;
        
        // 初始化来自window变量的值
        if (typeof window !== 'undefined') {
            // 初始化类名列表
            if (window.classNames && Array.isArray(window.classNames)) {
                this.classNamesList = window.classNames;
            }
            
            // 初始化标签
            if (window.initialLabels && Array.isArray(window.initialLabels)) {
                this.initialLabels = window.initialLabels;
            }
            
            // 初始化当前路径
            if (window.currentPath && typeof window.currentPath === 'string') {
                this.currentPath = window.currentPath;
                console.log('Initialized with currentPath:', this.currentPath);
            }
        }
        
        // 画布变换状态
        this.scale = 1.0;
        this.translateX = 0;
        this.translateY = 0;
        this.canvasRect = null;
        this.imageRect = null;
    
        // 绘图状态
        this.currentMode = 'box';  // 'box', 'seg', 或 'pose'
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.currentMousePos = null;
        this.hoveredLabel = null;
        this.hoveredPoint = null;  // 当前鼠标悬停的点
        this.lastPanPoint = null;
        this.isPanning = false;
        this.isDragging = false;
        this.draggedLabel = null;
        this.dragStartPos = null;
    
        // 多边形绘制状态
        this.isDrawingPolygon = false;
        this.polygonPoints = [];
        
        // 关键点绘制状态
        this.isPoseDrawing = false;     // 是否正在绘制关键点
        this.poseDrawingStep = 0;       // 0 = 绘制box, 1+ = 绘制关键点
        this.currentPoseLabel = null;   // 当前正在绘制的关键点标签
        this.keypointCount = 0;         // 需要标注的关键点数量
        this.keypointValueCount = 3;    // 每个关键点有几个值(x,y,v)
        
        // 动画状态
        this.dashOffset = 0;
        this.animationFrameId = null;
        this.dashAnimationActive = false;
        this.pulsationInterval = null;  // 用于点的闪烁动画
        
        // 历史记录状态
        this.imageHistories = new Map();
        this.hasUnsavedChanges = false;
        this.savedState = null;
        
        // 搜索状态
        this.searchTimeout = null;
        this.selectedSearchIndex = -1;
        
        // 回调函数
        this.onRedrawRequested = null;
    
        // 开始动画循环
        this.startAnimationLoop();
    }
    
    /**
     * 请求重绘画布
     * @param {boolean} [fullRedraw=true] - 是否进行完整重绘，包括十字线
     */
    requestRedraw(fullRedraw = true) {
        if (this.onRedrawRequested) {
            this.onRedrawRequested(fullRedraw);
        }
    }
    
    /**
     * 检查是否应该更新绘图状态
     * @returns {boolean} 是否应该更新
     */
    shouldUpdate() {
        // 如果无图像，则不更新
        if (!this.image) return false;
        
        // 每16ms更新一次绘图状态
        return true;
    }
    
    /**
     * 开始动画循环以更新虚线偏移
     */
    startAnimationLoop() {
        const animate = () => {
            this.dashOffset = (this.dashOffset + 0.5) % 16;
            
            if (this.hoveredLabel) {
                this.requestRedraw();
            }
            
            this.animationFrameId = requestAnimationFrame(animate);
        };
        
        this.animationFrameId = requestAnimationFrame(animate);
    }
    
    /**
     * 停止动画循环
     */
    stopAnimationLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    /**
     * 查找光标下的标签
     * @param {number} x - 归一化的X坐标
     * @param {number} y - 归一化的Y坐标
     * @returns {Object|null} 找到的标签或null
     */
    findLabelUnderCursor(x, y) {
        if (!this.initialLabels || this.initialLabels.length === 0) return null;
        
        // 从后向前遍历（后添加的标签优先）
        for (let i = this.initialLabels.length - 1; i >= 0; i--) {
            const label = this.initialLabels[i];
            
            // 跳过不可见的标签
            if (label.visible === false) continue;
            
            if (label.isSegmentation) {
                // 检查点是否在多边形内
                if (this.isPointInPolygon(x, y, label.points)) {
                    return label;
                }
            } else if (label.isPose) {
                // 检查点是否在边界框内
                const halfWidth = label.width / 2;
                const halfHeight = label.height / 2;
                
                if (x >= (label.x - halfWidth) && 
                    x <= (label.x + halfWidth) && 
                    y >= (label.y - halfHeight) && 
                    y <= (label.y + halfHeight)) {
                    return label;
                }
            } else {
                // 检查点是否在边界框内
                const halfWidth = label.width / 2;
                const halfHeight = label.height / 2;
                
                if (x >= (label.x - halfWidth) && 
                    x <= (label.x + halfWidth) && 
                    y >= (label.y - halfHeight) && 
                    y <= (label.y + halfHeight)) {
                    return label;
                }
            }
        }
        
        return null;
    }
    
    /**
     * 判断点是否在多边形内
     * @param {number} x - 点的X坐标
     * @param {number} y - 点的Y坐标
     * @param {Array<number>} points - 多边形点的数组[x1,y1,x2,y2,...]
     * @returns {boolean} 点是否在多边形内
     */
    isPointInPolygon(x, y, points) {
        let inside = false;
        
        for (let i = 0, j = points.length - 2; i < points.length; i += 2) {
            const xi = points[i];
            const yi = points[i + 1];
            const xj = points[j];
            const yj = points[j + 1];
            
            const intersect = ((yi > y) !== (yj > y)) && 
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                
            if (intersect) inside = !inside;
            
            j = i;
        }
        
        return inside;
    }
    
    /**
     * 更新标签高亮状态
     */
    updateLabelHighlight() {
        // Delegate to CanvasManager's updateLabelHighlight if it exists
        if (window.canvasManager && typeof window.canvasManager.updateLabelHighlight === 'function') {
            window.canvasManager.updateLabelHighlight();
        }
    }
    
    /**
     * 将当前标签状态推入历史记录
     */
    pushHistory() {
        if (!this.currentPath) return;
        
        // 确保该图像的历史记录存在
        if (!this.imageHistories.has(this.currentPath)) {
            this.imageHistories.set(this.currentPath, {
                history: [],
                historyIndex: -1
            });
        }
        
        const imageHistory = this.imageHistories.get(this.currentPath);
        
        // 创建当前标签状态的深拷贝
        const currentState = JSON.parse(JSON.stringify(this.initialLabels || []));
        
        // 如果当前索引不是历史记录的最后一项，则移除之后的历史记录
        if (imageHistory.historyIndex < imageHistory.history.length - 1) {
            imageHistory.history = imageHistory.history.slice(0, imageHistory.historyIndex + 1);
        }
        
        // 添加当前状态到历史记录
        imageHistory.history.push(currentState);
        imageHistory.historyIndex = imageHistory.history.length - 1;
        
        // 标记为有未保存的更改
        this.hasUnsavedChanges = true;
        
        // 如果uiManager存在，则更新保存按钮状态
        if (window.uiManager) {
            window.uiManager.updateSaveButtonState();
        }
    }
    
    /**
     * 撤销上一步操作
     * @returns {boolean} 是否成功撤销
     */
    undo() {
        if (!this.currentPath) return false;
        
        // 确保有历史记录
        if (!this.imageHistories.has(this.currentPath)) return false;
        
        const imageHistory = this.imageHistories.get(this.currentPath);
        
        // 检查是否可以撤销
        if (imageHistory.historyIndex <= 0) return false;
        
        // 移动到上一个历史记录
        imageHistory.historyIndex--;
        
        // 恢复状态
        this.initialLabels = JSON.parse(
            JSON.stringify(imageHistory.history[imageHistory.historyIndex])
        );
            
        // 标记为有未保存的更改
        this.hasUnsavedChanges = true;
            
            return true;
        }
    
    /**
     * 重做上一步撤销的操作
     * @returns {boolean} 是否成功重做
     */
    redo() {
        if (!this.currentPath) return false;
    
        // 确保有历史记录
        if (!this.imageHistories.has(this.currentPath)) return false;
        
        const imageHistory = this.imageHistories.get(this.currentPath);
        
        // 检查是否可以重做
        if (imageHistory.historyIndex >= imageHistory.history.length - 1) return false;
        
        // 移动到下一个历史记录
        imageHistory.historyIndex++;
        
        // 恢复状态
        this.initialLabels = JSON.parse(
            JSON.stringify(imageHistory.history[imageHistory.historyIndex])
        );
        
        // 标记为有未保存的更改
        this.hasUnsavedChanges = true;
        
        return true;
    }
    
    /**
     * 标记当前状态为已保存
     */
    markChangesSaved() {
        this.hasUnsavedChanges = false;
        this.savedState = JSON.stringify(this.initialLabels || []);
        
        // 如果uiManager存在，则更新保存按钮状态
        if (window.uiManager) {
            window.uiManager.updateSaveButtonState();
        }
    }
    
    /**
     * 检查是否有未保存的更改
     */
    checkUnsavedChanges() {
        if (!this.savedState) {
            this.hasUnsavedChanges = this.initialLabels.length > 0;
            return;
        }
        
        const currentState = JSON.stringify(this.initialLabels || []);
        this.hasUnsavedChanges = this.savedState !== currentState;
        
        // 如果uiManager存在，则更新保存按钮状态
        if (window.uiManager) {
            window.uiManager.updateSaveButtonState();
        }
    }
    
    /**
     * 重置保存状态到当前标签
     * 在切换图片时使用，确保savedState与当前图片一致
     */
    resetSavedState() {
        this.savedState = JSON.stringify(this.initialLabels || []);
        this.hasUnsavedChanges = false;
        
        // 如果uiManager存在，则更新保存按钮状态
        if (window.uiManager) {
            window.uiManager.updateSaveButtonState();
        }
    }
} 