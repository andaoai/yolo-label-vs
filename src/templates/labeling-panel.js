// Import core modules
import { CONFIG } from './config.js';
import { LabelingState } from './LabelingState.js';
import { CanvasManager } from './managers/CanvasManager.js';
import { UIManager } from './managers/UIManager.js';
import { MessageHandler } from './handlers/MessageHandler.js';

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    try {
        // 确保在DOM内容加载后更新背景色配置
        CONFIG.BACKGROUND_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || '#1e1e1e';
        
        const state = new LabelingState();
        const canvasManager = new CanvasManager(state);
        const uiManager = new UIManager(state, canvasManager);
        const messageHandler = new MessageHandler(state, canvasManager, uiManager);
        
        // 保存实例为全局变量，以便其他类能够访问
        window.uiManager = uiManager;
        window.canvasManager = canvasManager;
        window.state = state; // 添加状态到全局以便更好地处理键盘事件
        window.messageHandler = messageHandler;
        
        // Initialize UI states
        document.getElementById('toggleLabels').classList.toggle('active', state.showLabels);
        
        // 加载初始图像（如果提供）
        if (window.initialImageData && state.currentPath) {
            console.log('Loading initial image data for:', state.currentPath);
            const img = new Image();
            img.onload = () => {
                state.image = img;
                state.originalImageWidth = img.width;
                state.originalImageHeight = img.height;
                
                // 获取画布容器尺寸
                const container = canvasManager.canvas.parentElement;
                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                
                // 设置合适的缩放以适应画布
                const scaleX = containerWidth / img.width;
                const scaleY = containerHeight / img.height;
                
                // 使用较小的缩放比例，确保整个图像都在视口内
                state.scale = Math.min(scaleX, scaleY, 1); // 不要超过原始大小
                
                // 计算图片居中位置
                state.translateX = (containerWidth - (img.width * state.scale)) / 2;
                state.translateY = (containerHeight - (img.height * state.scale)) / 2;
                
                // 更新画布视图
                canvasManager.resizeCanvas();
                canvasManager.updateRects();
                canvasManager.updateImageDimensionDisplay();
                canvasManager.updateLabelsCountDisplay();
                canvasManager.updateZoomDisplay();
                canvasManager.updateLabelList();
                
                // 重绘画布
                state.requestRedraw();
            };
            img.src = window.initialImageData;
        }
        
        // 请求初始图像列表
        state.vscode.postMessage({ command: 'getImageList' });
        
        // 添加窗口大小调整事件（使用节流）
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                canvasManager.handleResize();
            }, 100);
        });
        
        // 添加全局键盘快捷键
        window.addEventListener('keydown', (event) => {
            // Ctrl+S 保存快捷键
            if (event.ctrlKey && event.key.toLowerCase() === 's') {
                event.preventDefault(); // 阻止浏览器默认保存行为
                
                // Remove this check, as updateSaveButtonState will handle it
                // const saveButton = document.getElementById('saveLabels');
                // if (!saveButton.disabled && !saveButton.classList.contains('disabled')) {
                    uiManager.saveLabels();
                // }
            }
            
            // 注意：a和d键的导航由CanvasManager.handleKeyDown处理，这里不需要重复处理
        });
        
        // 监听VS Code主题变化
        const observer = new MutationObserver(() => {
            // VS Code主题变化时重绘画布
            state.requestRedraw();
        });
        
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'style']
        });
        
        // 添加全局错误处理
        window.addEventListener('error', (event) => {
            console.error('Uncaught error:', event.error);
            if (messageHandler) {
                messageHandler.showErrorMessage('An unexpected error occurred: ' + event.error.message);
            }
        });

        // 初始化模式选择器
        initializeModeSelector();
    } catch (error) {
        console.error('Error initializing application:', error);
        
        // 显示阻止初始化的关键错误
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

// 初始化模式选择器
function initializeModeSelector() {
    const modeControl = document.getElementById('modeControl');
    const boxMode = document.getElementById('boxMode');
    const segMode = document.getElementById('segMode');
    const poseMode = document.getElementById('poseMode');
    
    // 检查是否配置了kptShape，显示或隐藏姿态标注模式
    if (window.kptShape && Array.isArray(window.kptShape) && window.kptShape.length >= 2) {
        poseMode.style.display = 'inline-block';
    } else {
        poseMode.style.display = 'none';
    }
    
    // 初始设置基于当前模式（如果UIManager已初始化，让它来处理）
    if (window.uiManager && window.state && window.state.currentMode) {
        window.uiManager.resetModeButtons(window.state.currentMode);
    } else if (window.state && window.state.currentMode) {
        // 移除所有按钮的活动状态
        const buttons = modeControl.querySelectorAll('.segmented-button');
        buttons.forEach(btn => btn.classList.remove('active'));
        
        // 根据当前模式设置活动按钮
        const activeBtn = document.getElementById(`${window.state.currentMode}Mode`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        } else {
            // 默认选择框模式
            boxMode.classList.add('active');
        }
    } else {
        // 默认选择框模式
        boxMode.classList.add('active');
    }
    
    if (modeControl) {
        modeControl.addEventListener('click', (e) => {
            if (!e.target.classList.contains('segmented-button')) return;
            
            // 让UIManager处理模式变更（如果可用）
            if (window.uiManager) {
                // 委托给UIManager
                window.uiManager.changeMode(e);
            } else {
                // 移除所有活动类
                for (const button of modeControl.querySelectorAll('.segmented-button')) {
                    button.classList.remove('active');
                }
                
                // 添加活动类到被点击的按钮
                e.target.classList.add('active');
                
                // 更新当前模式
                const mode = e.target.dataset.mode;
                state.currentMode = mode;
                
                // 如果需要，取消任何正在进行的绘制
                if (state.isDrawing || state.isDrawingPolygon || state.isPoseDrawing) {
                    state.isDrawing = false;
                    state.isDrawingPolygon = false;
                    state.isPoseDrawing = false;
                    state.poseDrawingStep = 0;
                    state.currentPoseLabel = null;
                    state.polygonPoints = [];
                    state.requestRedraw();
                }
            }
        });
    }
} 