// Import configuration
import { CONFIG } from './config.js';

// State Management - Using ES6+ class fields
export class LabelingState {
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
    currentPath = window.currentPath || '';
    selectedSearchIndex = -1;
    currentMousePos = null;
    searchTimeout = null;
    hasUnsavedChanges = false;
    
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
    
    // Store histories for each image path
    imageHistories = new Map();
    
    hoveredLabel = null;
    isDragging = false;
    dragStartPos = { x: 0, y: 0 };
    draggedLabel = null;
    
    dashOffset = 0; // 虚线动画偏移
    dashAnimationId = null; // 虚线动画定时器
    
    constructor() {
        // Ensure all labels have a visibility property
        if (this.initialLabels) {
            this.initialLabels.forEach(label => {
                if (label.visible === undefined) {
                    label.visible = true;
                }
            });
        }
        
        // Initialize history for the initial path if it exists
        if (this.currentPath) {
            this.imageHistories.set(this.currentPath, {
                history: [],
                historyIndex: -1,
                lastSavedIndex: -1  // Track the last saved history index
            });
            // Store initial labels in history
            this.pushHistory();
        }
    }
    
    // Add undo/redo functionality
    pushHistory() {
        // Get or initialize history for current image
        if (!this.imageHistories.has(this.currentPath)) {
            this.imageHistories.set(this.currentPath, {
                history: [],
                historyIndex: -1,
                lastSavedIndex: -1
            });
        }
        
        const currentHistory = this.imageHistories.get(this.currentPath);
        
        // Remove any future history if we're in the middle of the history stack
        if (currentHistory.historyIndex < currentHistory.history.length - 1) {
            currentHistory.history = currentHistory.history.slice(0, currentHistory.historyIndex + 1);
        }
        
        // Clone current labels for history
        const labelsCopy = JSON.parse(JSON.stringify(this.initialLabels));
        
        // Add to history
        currentHistory.history.push(labelsCopy);
        
        // Limit history size
        if (currentHistory.history.length > this.maxHistorySize) {
            currentHistory.history.shift();
            currentHistory.lastSavedIndex = Math.max(-1, currentHistory.lastSavedIndex - 1);
        }
        
        // Update index
        currentHistory.historyIndex = currentHistory.history.length - 1;
        
        // Update the state's imageHistories
        this.imageHistories.set(this.currentPath, currentHistory);
        
        // Check if we have unsaved changes
        this.checkUnsavedChanges();
        
        // Update save button state if UI manager exists
        if (window.uiManager) {
            window.uiManager.updateSaveButtonState();
        }
    }
    
    undo() {
        if (!this.imageHistories.has(this.currentPath)) {
            return false;
        }
        
        const currentHistory = this.imageHistories.get(this.currentPath);
        
        if (currentHistory.historyIndex > 0) {
            currentHistory.historyIndex--;
            this.initialLabels = JSON.parse(JSON.stringify(currentHistory.history[currentHistory.historyIndex]));
            
            // Update the state's imageHistories
            this.imageHistories.set(this.currentPath, currentHistory);
            
            // Check if we have unsaved changes
            this.checkUnsavedChanges();
            
            // Update save button state if UI manager exists
            if (window.uiManager) {
                window.uiManager.updateSaveButtonState();
            }
            
            return true;
        }
        return false;
    }
    
    // Mark changes as saved
    markChangesSaved() {
        if (this.imageHistories.has(this.currentPath)) {
            const currentHistory = this.imageHistories.get(this.currentPath);
            currentHistory.lastSavedIndex = currentHistory.historyIndex;
            this.imageHistories.set(this.currentPath, currentHistory);
        }
        
        this.hasUnsavedChanges = false;
        
        // Update save button state if UI manager exists
        if (window.uiManager) {
            window.uiManager.updateSaveButtonState();
        }
    }
    
    // Check if there are unsaved changes
    checkUnsavedChanges() {
        if (!this.imageHistories.has(this.currentPath)) {
            this.hasUnsavedChanges = false;
            return;
        }
        
        const currentHistory = this.imageHistories.get(this.currentPath);
        this.hasUnsavedChanges = currentHistory.historyIndex !== currentHistory.lastSavedIndex;
    }
    
    // Request animation frame for efficient rendering
    requestRedraw() {
        this.needsRedraw = true;
        if (!this.animationFrameId) {
            this.animationFrameId = requestAnimationFrame(() => {
                if (this.needsRedraw) {
                    this.needsRedraw = false;
                    this.animationFrameId = null;
                    this.dashOffset = (this.dashOffset + 2) % 40; // 控制虚线流动速度
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

    // Add method to check if point is inside box
    isPointInBox(x, y, label) {
        if (label.labelType === 'seg') return false;
        
        const boxLeft = (label.x - label.width/2);
        const boxRight = (label.x + label.width/2);
        const boxTop = (label.y - label.height/2);
        const boxBottom = (label.y + label.height/2);
        
        return x >= boxLeft && x <= boxRight && y >= boxTop && y <= boxBottom;
    }

    // Add method to check if point is inside polygon
    isPointInPolygon(x, y, label) {
        if (label.labelType !== 'seg' || !label.points) return false;
        
        // Ray casting algorithm for point in polygon
        let inside = false;
        for (let i = 0, j = label.points.length - 2; i < label.points.length; i += 2) {
            const xi = label.points[i];
            const yi = label.points[i + 1];
            const xj = label.points[j];
            const yj = label.points[j + 1];
            
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
            j = i;
        }
        return inside;
    }

    // Add method to check if point is near polygon edge
    isPointNearPolygonEdge(x, y, label, threshold = 0.02) {
        if (label.labelType !== 'seg' || !label.points || label.points.length < 6) return false;
        
        // Check distance to each line segment
        for (let i = 0; i < label.points.length; i += 2) {
            const x1 = label.points[i];
            const y1 = label.points[i + 1];
            const x2 = label.points[(i + 2) % label.points.length];
            const y2 = label.points[(i + 3) % label.points.length];
            
            const distance = this.distanceToLineSegment(x, y, x1, y1, x2, y2);
            if (distance < threshold) return true;
        }
        return false;
    }

    // Add method to find label under cursor
    findLabelUnderCursor(x, y) {
        if (!this.initialLabels) return null;
        
        for (let i = this.initialLabels.length - 1; i >= 0; i--) {
            const label = this.initialLabels[i];
            if (!label.visible) continue;
            
            if (label.labelType === 'seg') {
                if (this.isPointInPolygon(x, y, label) || this.isPointNearPolygonEdge(x, y, label)) return label;
            } else {
                if (this.isPointInBox(x, y, label)) return label;
            }
        }
        return null;
    }

    // Update method to update label highlight in sidebar
    updateLabelHighlight() {
        const labelItems = document.querySelectorAll('.label-item');
        let hasHighlight = false;
        labelItems.forEach((item, index) => {
            if (this.hoveredLabel === this.initialLabels[index]) {
                item.classList.add('highlighted');
                hasHighlight = true;
            } else {
                item.classList.remove('highlighted');
            }
        });
        if (hasHighlight) {
            this.startDashAnimation();
        } else {
            this.stopDashAnimation();
        }
    }

    // 新增方法：高亮时自动动画
    startDashAnimation() {
        if (this.dashAnimationId) return;
        const animate = () => {
            if (this.hoveredLabel) {
                this.requestRedraw();
                this.dashAnimationId = requestAnimationFrame(animate);
            } else {
                this.stopDashAnimation();
            }
        };
        this.dashAnimationId = requestAnimationFrame(animate);
    }

    stopDashAnimation() {
        if (this.dashAnimationId) {
            cancelAnimationFrame(this.dashAnimationId);
            this.dashAnimationId = null;
        }
    }
} 