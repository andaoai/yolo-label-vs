/**
 * 应用程序配置常量
 */
export const CONFIG = {
    // 颜色设置
    COLORS: [
        '#ff3b30', // 红
        '#4cd964', // 绿
        '#007aff', // 蓝
        '#ff9500', // 橙
        '#5856d6', // 紫
        '#ffcc00', // 黄
        '#34c759', // 草绿
        '#ff2d55', // 粉红
        '#5ac8fa', // 浅蓝
        '#af52de'  // 紫红
    ],
    CROSSHAIR_COLOR: 'rgba(76, 217, 100, 0.8)', // 绿色，0.8透明度
    CROSSHAIR_CENTER_COLOR: '#4cd964', // 绿色
    BACKGROUND_COLOR: '#1e1e1e', // 默认背景色，会被VS Code主题覆盖

    // 绘图设置
    LINE_WIDTH: 2,
    POINT_RADIUS: 5,
    HIGHLIGHT_RADIUS: 8,
    CLOSE_HIGHLIGHT_RADIUS: 12,
    LABEL_HEIGHT: 20,
    LABEL_FONT_SIZE: 14,
    LABEL_PADDING: 5,
    
    // 缩放设置
    MIN_ZOOM: 0.1,
    MAX_ZOOM: 10,
    ZOOM_SPEED: 0.1,
    SCROLL_SPEED: 20,
    
    // 多边形设置
    CLOSE_POINT_THRESHOLD: 0.02, // 关闭多边形的距离阈值（归一化值）
    
    // 边界框设置
    MIN_BOX_SIZE: 0.01, // 最小边界框大小（归一化值）
    
    // 防抖和节流
    DEBOUNCE_DELAY: 300,
    
    // 搜索设置
    MAX_SEARCH_RESULTS: 10,
} 