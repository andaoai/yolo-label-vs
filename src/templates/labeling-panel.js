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
        
        // 获取VS Code API
        const vscode = acquireVsCodeApi();
        window.vscode = vscode;
        
        // 通知函数，用于显示消息提示
        function showNotification(message, type = 'info') {
            if (window.messageHandler && typeof window.messageHandler.showNotification === 'function') {
                window.messageHandler.showNotification(message, type);
            } else {
                // 后备方案：简单显示控制台消息
                console.log(`[${type}] ${message}`);
                
                // 如果没有messageHandler，创建一个简易的通知元素
                const notificationContainer = document.getElementById('notification-container') || (() => {
                    const container = document.createElement('div');
                    container.id = 'notification-container';
                    container.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        max-width: 300px;
                        z-index: 9999;
                    `;
                    document.body.appendChild(container);
                    return container;
                })();
                
                const notification = document.createElement('div');
                notification.style.cssText = `
                    background-color: ${type === 'error' ? '#f14c4c' : type === 'success' ? '#14ae5c' : '#0098ff'};
                    color: white;
                    padding: 12px 16px;
                    margin-bottom: 10px;
                    border-radius: 4px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                    opacity: 0;
                    transition: opacity 0.3s ease;
                `;
                notification.textContent = message;
                
                notificationContainer.appendChild(notification);
                
                // 淡入效果
                setTimeout(() => {
                    notification.style.opacity = '1';
                }, 10);
                
                // 3秒后自动关闭
                setTimeout(() => {
                    notification.style.opacity = '0';
                    setTimeout(() => {
                        notification.remove();
                    }, 300);
                }, 3000);
            }
        }
        
        // 使showNotification全局可用
        window.showNotification = showNotification;
        
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
                
                // 只有在保存按钮启用时才触发保存
                const saveButton = document.getElementById('saveLabels');
                if (!saveButton.disabled && !saveButton.classList.contains('disabled')) {
                    uiManager.saveLabels();
                }
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

        // 初始化AI相关变量
        let aiConfigured = false;
        let aiModelPath = '';
        let pendingAiLabels = [];

        // 空格键检测AI按钮快捷键
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
                e.preventDefault(); // 防止页面滚动
                if (aiConfigured) {
                    runAiInference();
                } else {
                    showAiConfigModal();
                }
            }
        });

        // AI助手按钮点击事件
        document.getElementById('aiAssistant').addEventListener('click', () => {
            if (aiConfigured) {
                runAiInference();
            } else {
                showAiConfigModal();
            }
        });

        // 显示AI配置对话框
        function showAiConfigModal() {
            const modal = document.getElementById('aiConfigModal');
            modal.style.display = 'block';
            
            // 设置焦点到模型路径输入框
            setTimeout(() => {
                document.getElementById('modelPath').focus();
            }, 100);
        }

        // 关闭AI配置对话框
        document.getElementById('closeAiConfigModal').addEventListener('click', () => {
            document.getElementById('aiConfigModal').style.display = 'none';
        });

        document.getElementById('cancelAiConfig').addEventListener('click', () => {
            document.getElementById('aiConfigModal').style.display = 'none';
        });

        // 更新滑块值显示
        function updateSliderValue(sliderId, valueId) {
            const slider = document.getElementById(sliderId);
            const valueDisplay = document.getElementById(valueId);
            
            valueDisplay.textContent = slider.value;
            
            slider.addEventListener('input', () => {
                valueDisplay.textContent = slider.value;
            });
        }

        // 初始化滑块值显示
        updateSliderValue('scoreThreshold', 'scoreThresholdValue');
        updateSliderValue('nmsThreshold', 'nmsThresholdValue');
        updateSliderValue('confidenceThreshold', 'confidenceThresholdValue');

        // 浏览按钮点击事件（打开文件选择器）
        document.getElementById('browseModelButton').addEventListener('click', async () => {
            // 这个消息需要在扩展端处理
            vscode.postMessage({
                command: 'browseFile',
                filter: '*.onnx'
            });
        });

        // 提交AI配置表单
        document.getElementById('aiConfigForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const modelPath = document.getElementById('modelPath').value;
            const scoreThreshold = parseFloat(document.getElementById('scoreThreshold').value);
            const nmsThreshold = parseFloat(document.getElementById('nmsThreshold').value);
            const confidenceThreshold = parseFloat(document.getElementById('confidenceThreshold').value);
            
            // 更新状态显示
            const aiStatus = document.getElementById('aiStatus');
            aiStatus.textContent = '正在配置和测试AI模型...';
            
            // 发送配置消息到扩展
            vscode.postMessage({
                command: 'configureAi',
                modelPath,
                scoreThreshold,
                nmsThreshold,
                confidenceThreshold
            });
        });

        // 运行AI推理
        function runAiInference() {
            if (!aiConfigured) {
                showAiConfigModal();
                return;
            }
            
            // 发送推理请求到扩展
            vscode.postMessage({
                command: 'runAiInference'
            });
            
            // 显示加载状态
            showNotification('正在进行AI推理...', 'info');
        }

        // 在消息处理中添加AI相关的消息处理
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                // ... 保留原有的消息处理 ...
                
                case 'aiConfigured':
                    handleAiConfigured(message);
                    break;
                    
                case 'aiInferenceResult':
                    handleAiInferenceResult(message);
                    break;
                    
                case 'fileBrowseResult':
                    handleFileBrowseResult(message);
                    break;
            }
        });

        // 处理AI配置结果
        function handleAiConfigured(message) {
            const aiStatus = document.getElementById('aiStatus');
            
            if (message.success) {
                aiConfigured = true;
                aiModelPath = message.modelPath;
                aiStatus.textContent = 'AI模型配置成功！按空格键进行推理。';
                
                // 更新AI按钮样式，表示已配置
                document.getElementById('aiAssistant').classList.add('configured');
                
                // 默认自动运行一次推理
                setTimeout(() => {
                    runAiInference();
                    // 关闭对话框
                    document.getElementById('aiConfigModal').style.display = 'none';
                }, 1000);
            } else {
                aiConfigured = false;
                aiStatus.textContent = message.message || 'AI模型配置失败，请检查路径和参数。';
            }
        }

        // 处理AI推理结果
        function handleAiInferenceResult(message) {
            if (message.labels && message.labels.length > 0) {
                pendingAiLabels = message.labels;
                showNotification(`AI检测完成，发现 ${message.labels.length} 个对象。按空格键应用结果。`, 'success');
                
                // 在画布上预览AI结果
                previewAiDetections(message.labels);
            } else {
                showNotification(message.message || 'AI未检测到任何对象', 'warning');
            }
        }

        // 预览AI检测结果
        function previewAiDetections(detections) {
            // 清除之前的预览
            clearAiPreviews();
            
            // 检查画布管理器是否可用
            if (!window.canvasManager) {
                console.error('Canvas manager not available');
                return;
            }
            
            // 获取必要的DOM元素和变量
            const canvas = document.getElementById('imageCanvas');
            const canvasContainer = document.querySelector('.canvas-container');
            if (!canvas || !canvasContainer) {
                console.error('Canvas or canvas container not found');
                return;
            }

            // 获取类名列表
            const classNames = window.classNames || state.classNamesList;
            
            // 绘制预览
            detections.forEach(box => {
                const previewBox = document.createElement('div');
                previewBox.className = 'box-label ai-preview';
                
                // 归一化坐标
                const normalizedX = box.x;
                const normalizedY = box.y;
                const normalizedWidth = box.width;
                const normalizedHeight = box.height;
                
                // 应用画布变换以获取正确的位置
                // 获取画布尺寸
                const canvasWidth = canvas.width;
                const canvasHeight = canvas.height;
                
                // 计算像素坐标（考虑缩放和平移）
                const x = (normalizedX * canvasWidth * state.scale) + state.translateX;
                const y = (normalizedY * canvasHeight * state.scale) + state.translateY;
                const width = normalizedWidth * canvasWidth * state.scale;
                const height = normalizedHeight * canvasHeight * state.scale;
                
                // 计算预览盒子在屏幕上的位置
                const canvasRect = canvas.getBoundingClientRect();
                const pixelRatioX = canvasRect.width / canvasWidth;
                const pixelRatioY = canvasRect.height / canvasHeight;
                
                // 设置位置和大小
                previewBox.style.left = `${x * pixelRatioX}px`;
                previewBox.style.top = `${y * pixelRatioY}px`;
                previewBox.style.width = `${width * pixelRatioX}px`;
                previewBox.style.height = `${height * pixelRatioY}px`;
                previewBox.style.border = '2px dashed #FF8C00';
                previewBox.style.position = 'absolute';
                previewBox.style.pointerEvents = 'none';
                previewBox.style.boxSizing = 'border-box';
                previewBox.style.zIndex = '100';
                
                // 添加类别标签
                const labelText = document.createElement('div');
                labelText.className = 'box-label-text';
                labelText.style.position = 'absolute';
                labelText.style.top = '0';
                labelText.style.left = '0';
                labelText.style.padding = '2px 5px';
                labelText.style.background = '#FF8C00';
                labelText.style.color = 'white';
                labelText.style.fontSize = '12px';
                labelText.style.borderRadius = '2px 0 2px 0';
                labelText.style.fontWeight = 'bold';
                labelText.style.whiteSpace = 'nowrap';
                labelText.textContent = `AI: ${classNames[box.class] || `Class ${box.class}`}`;
                previewBox.appendChild(labelText);
                
                // 添加到容器
                canvasContainer.appendChild(previewBox);
            });
        }

        // 清除AI预览
        function clearAiPreviews() {
            const previews = document.querySelectorAll('.ai-preview');
            previews.forEach(preview => preview.remove());
        }

        // 应用AI检测结果
        function applyAiDetections() {
            if (pendingAiLabels.length === 0) {
                return;
            }
            
            // 添加到当前标签
            const aiLabels = pendingAiLabels.slice();
            pendingAiLabels = [];
            
            // 清除预览
            clearAiPreviews();
            
            // 检查状态是否可用
            if (!window.state || !window.state.initialLabels) {
                console.error('State not available');
                return;
            }
            
            // 在应用之前记录原始标签数量
            const originalLabelCount = window.state.initialLabels.length;
            
            // 将AI检测结果添加到当前标签
            aiLabels.forEach(box => {
                // 创建新标签对象
                const newLabel = {
                    x: box.x || 0,
                    y: box.y || 0,
                    width: box.width || 0,
                    height: box.height || 0,
                    class: box.class || 0,
                    aiDetected: true, // 标记为AI检测
                    visible: true
                };
                
                // 添加到状态中的标签列表
                window.state.initialLabels.push(newLabel);
            });
            
            // 推送历史记录
            if (typeof window.state.pushHistory === 'function') {
                window.state.pushHistory();
            }
            
            // 更新标签列表UI
            if (window.canvasManager && typeof window.canvasManager.updateLabelList === 'function') {
                window.canvasManager.updateLabelList();
            }
            
            // 请求重绘画布
            if (typeof window.state.requestRedraw === 'function') {
                window.state.requestRedraw();
            }
            
            // 验证是否成功添加了标签
            const addedCount = window.state.initialLabels.length - originalLabelCount;
            
            // 显示通知
            showNotification(`已应用 ${addedCount} 个AI检测结果`, 'success');
        }

        // 监听空格键应用AI结果
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && pendingAiLabels.length > 0 && document.activeElement.tagName !== 'INPUT') {
                e.preventDefault();
                applyAiDetections();
            }
        });

        // 在添加标签函数中处理AI标签特殊样式
        function addLabel(labelData) {
            if (!window.state || !window.state.initialLabels) {
                console.error('State or initialLabels not available');
                return;
            }
            
            // 创建新标签对象
            const newLabel = {
                x: labelData.x || 0,
                y: labelData.y || 0,
                width: labelData.width || 0,
                height: labelData.height || 0,
                class: labelData.class || 0,
                aiDetected: true, // 标记为AI检测
                visible: true
            };
            
            // 如果是关键点或分割标注，添加额外数据
            if (labelData.keypoints) {
                newLabel.keypoints = labelData.keypoints;
                newLabel.isPose = true;
            }
            
            if (labelData.points) {
                newLabel.points = labelData.points;
                newLabel.isSegmentation = true;
            }
            
            // 添加到状态中的标签列表
            window.state.initialLabels.push(newLabel);
            
            // 如果有历史记录功能，推送到历史记录
            if (typeof window.state.pushHistory === 'function') {
                window.state.pushHistory();
            }
            
            // 请求重绘
            if (typeof window.state.requestRedraw === 'function') {
                window.state.requestRedraw();
            }
            
            return newLabel;
        }

        // 处理文件浏览结果
        function handleFileBrowseResult(message) {
            if (message.path) {
                document.getElementById('modelPath').value = message.path;
            }
        }
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