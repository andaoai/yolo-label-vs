/**
 * MessageHandler - 处理与VS Code扩展的通信
 */
export class MessageHandler {
    /**
     * 创建MessageHandler实例
     * @param {LabelingState} state - 应用状态对象
     * @param {CanvasManager} canvasManager - 画布管理器实例
     * @param {UIManager} uiManager - UI管理器实例
     */
    constructor(state, canvasManager, uiManager) {
        this.state = state;
        this.canvasManager = canvasManager;
        this.uiManager = uiManager;
        this.setupMessageListener();
    }

    /**
     * 设置消息监听器
     */
    setupMessageListener() {
        window.addEventListener('message', this.handleMessage.bind(this));
    }
    
    /**
     * 处理接收到的消息
     * @param {MessageEvent} event - 消息事件
     */
    handleMessage(event) {
        const message = event.data;
        
        switch (message.command) {
            case 'imageList':
                this.handleImageList(message);
                break;
            case 'updateImage':
                // 检查是否是新的图片路径
                const isNewImage = message.currentPath !== this.state.currentPath;
                if (isNewImage) {
                    console.log('MessageHandler: 加载新图片:', message.currentPath);
                }
                
                // 处理图像更新
                this.uiManager.handleImageUpdate(message);
                break;
            case 'error':
                this.handleError(message);
                break;
            case 'imagePreviews':
                this.handleImagePreviews(message);
                break;
        }
    }
    
    /**
     * 处理图像列表消息
     * @param {Object} message - 消息对象
     */
    handleImageList(message) {
        console.log('Received image list:', message.paths?.length || 0, 'images');
        
        this.state.allImagePaths = message.paths || [];
        
        // 请求列表的图像预览
        this.state.vscode.postMessage({ 
            command: 'getImagePreviews',
            paths: this.state.allImagePaths
        });
        
        // 如果当前图像路径可用，则使用它更新搜索输入
        if (this.state.currentPath && document.getElementById('imageSearch')) {
            document.getElementById('imageSearch').value = this.state.currentPath;
            console.log('Current path already set:', this.state.currentPath);
        }
        
        // 如果我们有UIManager实例，更新按钮状态
        if (this.uiManager && typeof this.uiManager.updateButtonStates === 'function') {
            this.uiManager.updateButtonStates();
        }
        
        // 图片列表更新后，刷新底部图片信息和进度条
        if (this.uiManager && typeof this.uiManager.updateImageInfo === 'function') {
            this.uiManager.updateImageInfo();
        }
        
        // 如果有图像列表但没有当前图像，则自动加载第一张图像
        if (this.state.allImagePaths.length > 0 && !this.state.currentPath) {
            const firstImagePath = this.state.allImagePaths[0];
            console.log('MessageHandler: 加载第一张图片:', firstImagePath);
            // 显示加载状态
            if (this.canvasManager) {
                this.canvasManager.showLoadingState(true);
            }
            this.state.vscode.postMessage({ command: 'loadImage', path: firstImagePath });
        } else if (!this.state.allImagePaths.length) {
            console.log('没有图片在列表中');
        } else {
            console.log('不加载第一张图片，当前路径已设置:', this.state.currentPath);
        }

        // After loading images, refresh any highlighted labels
        if (this.state.hoveredLabel) {
            this.state.updateLabelHighlight();
        }
    }

    /**
     * 处理图像预览消息
     * @param {Object} message - 消息对象
     */
    handleImagePreviews(message) {
        // 在状态中存储图像预览
        this.state.imagePreviews = message.previews || [];
    }

    /**
     * 处理错误消息
     * @param {Object} message - 消息对象
     */
    handleError(message) {
        console.error('Error from extension:', message.error);
        this.showErrorMessage(message.error);
    }
    
    /**
     * 向用户显示错误消息
     * @param {string} errorMessage - 错误消息
     */
    showErrorMessage(errorMessage) {
        // 创建或更新错误容器
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
            
            // 添加关闭按钮
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
            
            // 添加重新加载按钮
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
            // 如果容器被隐藏，则显示它
            errorContainer.style.display = 'block';
        }
        
        // 更新错误消息
        const errorMessageElement = document.getElementById('error-message');
        errorMessageElement.textContent = errorMessage || 'An error occurred';
    }
} 