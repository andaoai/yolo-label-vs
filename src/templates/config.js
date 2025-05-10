// Constants and Configuration
export const CONFIG = {
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
    BACKGROUND_COLOR: getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-background') || '#1e1e1e',
    LABEL_FONT_SIZE: 14,
    LABEL_PADDING: 5,
    LABEL_HEIGHT: 20
}; 