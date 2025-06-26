import { CONFIG } from '../config.js';

/**
 * UIManager - 管理用户界面元素和交互
 */
export class UIManager {
    /**
     * 创建UIManager实例
     * @param {LabelingState} state - 应用状态对象
     * @param {CanvasManager} canvasManager - 画布管理器实例
     */
    constructor(state, canvasManager) {
        this.state = state;
        this.canvasManager = canvasManager;
        
        // 存储DOM元素以提高性能
        this.elements = {
            prevButton: document.getElementById('prevImage'),
            nextButton: document.getElementById('nextImage'),
            saveButton: document.getElementById('saveLabels'),
            modeControl: document.getElementById('modeControl'),
            boxModeButton: document.getElementById('boxMode'),
            segModeButton: document.getElementById('segMode'),
            poseModeButton: document.getElementById('poseMode'),
            toggleLabels: document.getElementById('toggleLabels'),
            searchInput: document.getElementById('imageSearch'),
            searchResults: document.getElementById('searchResults'),
            openImageTabButton: document.getElementById('openImageTab'),
            openTxtTabButton: document.getElementById('openTxtTab'),
            undoButton: this.createUndoRedoButtons(),
            progressBar: document.getElementById('imageProgressBar'),
            progressContainer: document.querySelector('.progress-container')
        };
        
        // 首先初始化进度元素
        this.createProgressElements();
        
        this.setupEventListeners();
        
        // 初始化保存按钮状态
        this.updateSaveButtonState();
        
        // 初始化进度条
        this.updateProgressBar();
        
        // 绑定打开图片/标签按钮事件
        this.setupTabButtons();

        // 初始化模式
        this.updateModeBasedOnLabels();

        // Initialize UI elements
        this.updateCurrentClassStatus();
    }
    
    /**
     * 创建撤销/重做按钮并添加到工具栏
     * @returns {Object} 包含按钮的对象
     */
    createUndoRedoButtons() {
        const toolbar = document.querySelector('.right-controls');
        
        // 创建撤销按钮
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
        
        // 将按钮添加到工具栏
        toolbar.insertBefore(undoButton, toolbar.firstChild);
        
        return { undo: undoButton };
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 添加带有绑定方法的侦听器以更好地组织
        this.setupNavigationListeners();
        this.setupModeListeners();
        this.setupActionListeners();
        this.setupProgressBarListeners();
        this.setupSearch();

        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data; // The JSON data from the extension
            switch (message.command) {
                case 'saveSuccess':
                    this.state.markChangesSaved();
                    break;
                // Add other cases if you have more messages from extension to webview
            }
        });
    }
    
    /**
     * 设置导航监听器
     */
    setupNavigationListeners() {
        // 上一个和下一个按钮
        this.elements.prevButton.addEventListener('click', this.navigatePrevious.bind(this));
        this.elements.nextButton.addEventListener('click', this.navigateNext.bind(this));
    }
    
    /**
     * 设置模式监听器
     */
    setupModeListeners() {
        // 模式控制按钮
        const segmentedButtons = this.elements.modeControl.querySelectorAll('.segmented-button');
        segmentedButtons.forEach(button => {
            button.addEventListener('click', this.changeMode.bind(this));
        });
        
        // 切换标签按钮
        this.elements.toggleLabels.addEventListener('click', this.toggleLabels.bind(this));
    }
    
    /**
     * 设置操作监听器
     */
    setupActionListeners() {
        // 保存按钮
        this.elements.saveButton.addEventListener('click', this.saveLabels.bind(this));
        
        // 撤销按钮
        this.elements.undoButton.undo.addEventListener('click', this.handleUndo.bind(this));
    }
    
    /**
     * 导航处理程序 - 上一个
     */
    navigatePrevious() {
        this.state.vscode.postMessage({ command: 'previous' });
    }
    
    /**
     * 导航处理程序 - 下一个
     */
    navigateNext() {
        this.state.vscode.postMessage({ command: 'next' });
    }
    
    /**
     * 模式更改处理程序
     * @param {Event} e - 点击事件
     */
    changeMode(e) {
        const button = e.currentTarget;
        const mode = button.dataset.mode;
        
        // 清除所有模式按钮的活动状态并设置当前选择的按钮
        this.resetModeButtons(mode);
        
        // 更新状态
        this.state.currentMode = mode;
        this.state.polygonPoints = [];
        this.state.isDrawingPolygon = false;
        this.state.requestRedraw();
    }
    
    /**
     * 重置所有模式按钮，只保留指定模式的活动状态
     * @param {string} activeMode - 要保持活动状态的模式
     */
    resetModeButtons(activeMode) {
        // 移除所有按钮的活动状态
        this.elements.modeControl.querySelectorAll('.segmented-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // 设置指定模式的按钮为活动状态
        if (activeMode === 'box') {
            this.elements.boxModeButton.classList.add('active');
        } else if (activeMode === 'seg') {
            this.elements.segModeButton.classList.add('active');
        } else if (activeMode === 'pose') {
            this.elements.poseModeButton?.classList.add('active');
        }
    }
    
    /**
     * 切换标签显示
     */
    toggleLabels() {
        this.state.showLabels = !this.state.showLabels;
        this.elements.toggleLabels.classList.toggle('active', this.state.showLabels);
        this.state.requestRedraw();
    }
    
    /**
     * 保存标签
     */
    saveLabels() {
        this.state.vscode.postMessage({ command: 'save', labels: this.state.initialLabels });
    }
    
    /**
     * 撤销处理程序
     */
    handleUndo() {
        if (this.state.undo()) {
            this.state.requestRedraw();
            this.canvasManager.updateLabelList();
        }
    }

    /**
     * 设置搜索功能
     */
    setupSearch() {
        const searchInput = this.elements.searchInput;
        const resultsDiv = this.elements.searchResults;

        // 使用防抖事件处理程序以提高性能
        searchInput.addEventListener('input', this.debounce(this.handleSearchInput.bind(this), CONFIG.DEBOUNCE_DELAY));
        searchInput.addEventListener('keydown', this.handleSearchKeydown.bind(this));

        // 点击外部时关闭搜索结果
        document.addEventListener('click', (e) => {
            const searchBox = document.querySelector('.search-box');
            if (!searchBox.contains(e.target)) {
                resultsDiv.style.display = 'none';
                this.state.selectedSearchIndex = -1;
            }
        });
    }
    
    /**
     * 防抖函数以限制事件处理频率
     * @param {Function} func - 要防抖的函数
     * @param {number} delay - 延迟毫秒数
     * @returns {Function} 防抖函数
     */
    debounce(func, delay) {
        return (e) => {
            clearTimeout(this.state.searchTimeout);
            this.state.searchTimeout = setTimeout(() => func(e), delay);
        };
    }
    
    /**
     * 处理搜索输入
     * @param {Event} e - 输入事件
     */
    handleSearchInput(e) {
        this.handleSearch(e.target.value);
    }

    /**
     * 处理搜索
     * @param {string} query - 搜索查询
     */
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

    /**
     * 处理搜索按键事件
     * @param {KeyboardEvent} e - 键盘事件
     */
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
    
    /**
     * 加载图像
     * @param {string} path - 图像路径
     */
    loadImage(path) {
        // 检查是否是不同的图像路径
        const isNewImage = path !== this.state.currentPath;
        
        // 通知扩展加载图像
        this.state.vscode.postMessage({ command: 'loadImage', path: path });
        
        // 隐藏搜索结果
        this.elements.searchResults.style.display = 'none';
        this.state.selectedSearchIndex = -1;
        
        // 如果是新图像，则需要确保在handleImageUpdate中重置保存状态
        if (isNewImage) {
            console.log('Loading new image, path will change from:', 
                this.state.currentPath, 'to:', path);
        }
    }

    /**
     * 更新搜索结果
     * @param {Array<string>} results - 结果路径数组
     */
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

    /**
     * 更新选定的搜索结果
     * @param {HTMLCollection} items - 结果项元素集合
     */
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

    /**
     * 设置选项卡按钮
     */
    setupTabButtons() {
        // 添加打开图片新标签页的按钮事件
        this.elements.openImageTabButton.addEventListener('click', () => {
            var currentPath = this.elements.searchInput.value || this.state.currentPath;
            if (currentPath) {
                this.state.vscode.postMessage({ 
                    command: 'openImageInNewTab', 
                    path: currentPath 
                });
            }
        });

        // 添加打开文本文件新标签页的按钮事件
        this.elements.openTxtTabButton.addEventListener('click', () => {
            var currentPath = this.elements.searchInput.value || this.state.currentPath;
            if (currentPath) {
                // 将图片路径转换为对应的txt文件路径
                var txtPath = this.convertToTxtPath(currentPath);
                this.state.vscode.postMessage({
                    command: 'openTxtInNewTab',
                    path: txtPath
                });
            }
        });

        // 监听搜索框变化和图片加载，更新按钮状态
        this.elements.searchInput.addEventListener('input', this.updateButtonStates.bind(this));

        // 初始化按钮状态
        this.updateButtonStates();
    }

    /**
     * 更新按钮状态
     */
    updateButtonStates() {
        var hasPath = !!this.elements.searchInput.value || !!this.state.currentPath;
        
        if (hasPath) {
            this.elements.openImageTabButton.removeAttribute('disabled');
            this.elements.openTxtTabButton.removeAttribute('disabled');
            this.elements.openImageTabButton.classList.remove('disabled');
            this.elements.openTxtTabButton.classList.remove('disabled');
        } else {
            this.elements.openImageTabButton.setAttribute('disabled', 'disabled');
            this.elements.openTxtTabButton.setAttribute('disabled', 'disabled');
            this.elements.openImageTabButton.classList.add('disabled');
            this.elements.openTxtTabButton.classList.add('disabled');
        }
    }

    /**
     * 将图片路径转换为对应的txt文件路径
     * @param {string} imagePath - 图像路径
     * @returns {string} 对应的txt文件路径
     */
    convertToTxtPath(imagePath) {
        if (!imagePath) return null;
        
        // 处理路径分隔符，确保跨平台兼容性
        var normalizedPath = imagePath.replace(/\\/g, '/');
        
        // 方法1: 检查路径中是否有/images/目录
        var imagesPattern = /\/images\//i;
        if (imagesPattern.test(normalizedPath)) {
            // 如果包含/images/目录，将其替换为/labels/目录
            return normalizedPath.replace(imagesPattern, '/labels/').replace(/\.(jpg|jpeg|png|gif|bmp|webp)$/i, '.txt');
        }
        
        // 方法2: 检查路径是否包含images子目录
        var pathParts = normalizedPath.split('/');
        var imagesIndex = pathParts.findIndex(function(part) { 
            return part.toLowerCase() === 'images'; 
        });
        
        if (imagesIndex >= 0) {
            // 找到了images目录，替换为labels
            pathParts[imagesIndex] = 'labels';
            // 替换文件扩展名为.txt
            var filename = pathParts[pathParts.length - 1];
            var dotIndex = filename.lastIndexOf('.');
            if (dotIndex > 0) {
                pathParts[pathParts.length - 1] = filename.substring(0, dotIndex) + '.txt';
            } else {
                pathParts[pathParts.length - 1] = filename + '.txt';
            }
            return pathParts.join('/');
        }
        
        // 方法3: 如果以上方法都未成功，只替换扩展名
        var lastDotIndex = normalizedPath.lastIndexOf('.');
        var lastSlashIndex = normalizedPath.lastIndexOf('/');
        
        // 确保有扩展名且不是路径的一部分
        if (lastDotIndex > lastSlashIndex && lastDotIndex > 0) {
            return normalizedPath.substring(0, lastDotIndex) + '.txt';
        }
        
        // 如果没有扩展名，直接添加.txt
        return normalizedPath + '.txt';
    }

    /**
     * 根据是否有未保存的更改更新保存按钮状态
     */
    updateSaveButtonState() {
        const saveButton = this.elements.saveButton;
        
        if (this.state.hasUnsavedChanges) {
            saveButton.removeAttribute('disabled');
            saveButton.classList.remove('disabled');
        } else {
            saveButton.setAttribute('disabled', 'disabled');
            saveButton.classList.add('disabled');
        }
    }

    /**
     * 设置进度条监听器
     */
    setupProgressBarListeners() {
        // 进度条现在只是用于显示，不需要点击处理
    }

    /**
     * 更新进度条
     */
    updateProgressBar() {
        const { progressBar } = this.elements;
        if (!progressBar) return;
        const currentIndex = this.state.allImagePaths?.indexOf(this.state.currentPath) ?? -1;
        const totalImages = this.state.allImagePaths?.length ?? 0;
        if (currentIndex >= 0 && totalImages > 0) {
            const progress = ((currentIndex + 1) / totalImages) * 100;
            progressBar.style.width = `${progress}%`;
        } else {
            progressBar.style.width = '0%';
        }
    }

    /**
     * 处理图像更新
     * @param {Object} message - 消息对象
     */
    handleImageUpdate(message) {
        // 更新UI
        document.getElementById('imageInfo').textContent = message.imageInfo || '';
        
        // 保存旧路径，用于检测图片变更
        const oldPath = this.state.currentPath;
        
        // 保存当前图片路径
        this.state.currentPath = message.currentPath || '';
        this.state.initialLabels = message.labels || [];
        
        // 检测是否切换了图片
        const isNewImage = oldPath !== this.state.currentPath;
        
        // 更新搜索框显示当前图片路径
        if (this.elements.searchInput) {
            this.elements.searchInput.value = this.state.currentPath;
        }
        
        // 更新进度条
        this.updateProgressBar();
        
        // 为此图像初始化历史记录（如果不存在）
        if (!this.state.imageHistories.has(this.state.currentPath)) {
            // 将初始状态推送到历史记录
            this.state.pushHistory();
            // 新加载的图像没有未保存的更改
            this.state.markChangesSaved();
        } else {
            // 确保标签来自此图像的最新历史记录
            const currentHistory = this.state.imageHistories.get(this.state.currentPath);
            if (currentHistory.history.length > 0) {
                // 使用此图像的最新历史记录条目
                this.state.initialLabels = JSON.parse(
                    JSON.stringify(currentHistory.history[currentHistory.historyIndex])
                );
                
                // 如果是切换到新图片，需要重置savedState
                if (isNewImage) {
                    // 将当前状态标记为已保存状态
                    this.state.resetSavedState();
                } else {
                    // 检查当前状态是否与保存的状态匹配
                    this.state.checkUnsavedChanges();
                }
                this.updateSaveButtonState();
            }
        }

        // 更新模式
        this.updateModeBasedOnLabels();
        
        // 设置图像对象并加载
        const img = new Image();
        img.onload = () => {
            // 设置图像尺寸
            this.state.originalImageWidth = img.width;
            this.state.originalImageHeight = img.height;
            this.state.image = img;
            
            // 获取画布容器尺寸
            const container = this.canvasManager.canvas.parentElement;
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            
            // 设置合适的缩放以适应画布
            const scaleX = containerWidth / img.width;
            const scaleY = containerHeight / img.height;
            
            // 使用较小的缩放比例，确保整个图像都在视口内
            this.state.scale = Math.min(scaleX, scaleY, 1); // 不要超过原始大小
            
            // 计算居中位置
            this.state.translateX = (containerWidth - (img.width * this.state.scale)) / 2;
            this.state.translateY = (containerHeight - (img.height * this.state.scale)) / 2;
            
            this.canvasManager.resizeCanvas();
            this.canvasManager.updateRects();
            this.canvasManager.updateImageDimensionDisplay();
            this.canvasManager.updateLabelsCountDisplay();
            this.canvasManager.updateZoomDisplay();
            this.canvasManager.updateLabelList();
            this.state.requestRedraw();
            
            // 如果存在UI管理器实例，更新按钮状态
            const uiManager = window.uiManager;
            if (uiManager && typeof uiManager.updateButtonStates === 'function') {
                uiManager.updateButtonStates();
            }
        };
        
        img.onerror = (error) => {
            console.error('Error loading image:', error);
            // 显示错误信息
            this.canvasManager.showImageError();
        };
        
        // 设置图像源
        img.src = message.imageData;

        // 更新底部图片信息和进度条
        this.updateImageInfo();
    }

    /**
     * 更新图像信息
     */
    updateImageInfo() {
        const currentIndex = this.state.allImagePaths.indexOf(this.state.currentPath);
        const totalImages = this.state.allImagePaths.length || 1;
        const displayIndex = currentIndex >= 0 ? currentIndex + 1 : 1;
        // 更新底部状态栏
        document.getElementById('imageInfo').textContent = `Image: ${displayIndex} of ${totalImages}`;
        // 更新进度条
        this.updateProgressBar();
    }

    /**
     * 根据当前标签类型更新模式
     */
    updateModeBasedOnLabels() {
        if (!this.state.initialLabels || this.state.initialLabels.length === 0) {
            // 如果没有标签，默认使用box模式
            this.state.currentMode = 'box';
            this.resetModeButtons('box');
            return;
        }

        // 检查最后一个标签的类型
        const lastLabel = this.state.initialLabels[this.state.initialLabels.length - 1];
        let mode = 'box'; // 默认为box模式
        
        if (lastLabel.isSegmentation) {
            mode = 'seg';
        } else if (lastLabel.isPose) {
            mode = 'pose';
        }
        
        // 更新状态和UI
        this.state.currentMode = mode;
        this.resetModeButtons(mode);
    }

    /**
     * 创建进度元素
     */
    createProgressElements() {
        if (!this.elements.progressContainer) return;

        // 只创建预览，不创建marker
        const preview = document.createElement('div');
        preview.className = 'progress-preview';
        preview.innerHTML = `
            <img src="" alt="Preview">
            <div class="preview-info"></div>
        `;
        this.elements.progressContainer.appendChild(preview);
        this.elements.progressPreview = preview;

        // 添加事件监听器
        this.setupProgressBarEvents();
    }

    /**
     * 设置进度条事件
     */
    setupProgressBarEvents() {
        const container = this.elements.progressContainer;
        const preview = this.elements.progressPreview;
        const progressBar = this.elements.progressBar;
        if (!container || !preview || !progressBar) return;

        const PLACEHOLDER_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

        container.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            const position = (e.clientX - rect.left) / rect.width;
            const index = Math.floor(position * (this.state.allImagePaths?.length || 0));

            if (index >= 0 && index < (this.state.allImagePaths?.length || 0)) {
                progressBar.style.width = `${position * 100}%`;
                preview.style.left = `${position * 100}%`;

                const img = preview.querySelector('img');
                const info = preview.querySelector('.preview-info');
                if (img && info) {
                    if (this.state.imagePreviews?.[index]) {
                        img.src = `data:image/png;base64,${this.state.imagePreviews[index]}`;
                        img.alt = 'Preview';
                    } else {
                        img.src = PLACEHOLDER_IMG;
                        img.alt = 'No Preview';
                    }
                    info.textContent = `Image ${index + 1} of ${this.state.allImagePaths.length}`;
                }
            }
        });

        container.addEventListener('click', (e) => {
            const rect = container.getBoundingClientRect();
            const position = (e.clientX - rect.left) / rect.width;
            const index = Math.floor(position * (this.state.allImagePaths?.length || 0));
            if (index >= 0 && index < (this.state.allImagePaths?.length || 0)) {
                const imagePath = this.state.allImagePaths[index];
                this.state.vscode.postMessage({ 
                    command: 'loadImage', 
                    path: imagePath 
                });
            }
        });

        container.addEventListener('mouseleave', () => {
            if (preview) preview.style.display = 'none';
            this.updateProgressBar();
        });

        container.addEventListener('mouseenter', () => {
            if (preview) preview.style.display = 'block';
        });
    }

    /**
     * 更新当前类状态显示
     */
    updateCurrentClassStatus() {
        const classStatus = document.getElementById('currentClassStatus');
        if (classStatus && this.state.classNamesList.length > 0) {
            const currentClassName = this.state.classNamesList[this.state.currentLabel] || `Class ${this.state.currentLabel}`;
            classStatus.textContent = `当前标签类型: ${currentClassName} (${this.state.currentLabel + 1}/${this.state.classNamesList.length})`;
        }
    }
} 