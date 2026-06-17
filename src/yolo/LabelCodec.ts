import * as fs from 'fs';
import * as path from 'path';
import { BoundingBox } from '../model/types';
import { ErrorHandler, ErrorType } from '../ErrorHandler';
import { imagePathToLabelPath } from '../utils/pathUtils';

/**
 * 标签格式解析策略接口
 */
interface LabelParser {
    canParse(parts: string[], kptShape?: number[]): boolean;
    parse(parts: string[], kptShape?: number[]): BoundingBox | null;
}

/**
 * Detection 格式解析: class x y w h
 */
const detectParser: LabelParser = {
    canParse(parts): boolean {
        return parts.length === 5 || parts.length === 6;
    },
    parse(parts): BoundingBox | null {
        const classIndex = parseInt(parts[0], 10);
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const width = parseFloat(parts[3]);
        const height = parseFloat(parts[4]);

        // 6th field as confidence: must be in [0, 1]
        let valid = !isNaN(classIndex) && !isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height);
        if (valid && parts.length === 6) {
            const conf = parseFloat(parts[5]);
            valid = !isNaN(conf) && conf >= 0 && conf <= 1;
        }

        if (valid) {
            return {
                class: classIndex,
                x, y, width, height,
                visible: true
            };
        }
        return null;
    }
};

/**
 * Pose 格式解析: class x y w h [x1,y1,v1, ...]
 */
const poseParser: LabelParser = {
    canParse(parts, kptShape): boolean {
        return !!kptShape && parts.length === 5 + (kptShape[0] * kptShape[1]);
    },
    parse(parts, kptShape): BoundingBox | null {
        const classIndex = parseInt(parts[0], 10);
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const width = parseFloat(parts[3]);
        const height = parseFloat(parts[4]);
        const keypoints = parts.slice(5).map(p => parseFloat(p));

        if (!isNaN(classIndex) && !isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height) &&
            keypoints.every(p => !isNaN(p))) {
            return {
                class: classIndex,
                x, y, width, height,
                isPose: true,
                keypoints: keypoints,
                keypointShape: kptShape!,
                visible: true
            };
        }
        return null;
    }
};

/**
 * Segmentation 格式解析: class x1 y1 x2 y2 ...
 */
const segmentationParser: LabelParser = {
    canParse(parts, kptShape): boolean {
        return parts.length > 6 && !kptShape;
    },
    parse(parts): BoundingBox | null {
        const classIndex = parseInt(parts[0], 10);
        const points = parts.slice(1).map(p => parseFloat(p));

        if (!isNaN(classIndex) && points.every(p => !isNaN(p))) {
            // Calculate bounding box from polygon points
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            for (let i = 0; i < points.length; i += 2) {
                const px = points[i];
                const py = points[i + 1];
                minX = Math.min(minX, px);
                maxX = Math.max(maxX, px);
                minY = Math.min(minY, py);
                maxY = Math.max(maxY, py);
            }

            const width = maxX - minX;
            const height = maxY - minY;
            const cx = minX + width / 2;
            const cy = minY + height / 2;

            return {
                class: classIndex,
                x: cx, y: cy, width, height,
                isSegmentation: true,
                points: points,
                visible: true
            };
        }
        return null;
    }
};

/**
 * 解析策略列表（按优先级排列）
 */
const PARSERS = [detectParser, poseParser, segmentationParser];

/**
 * 解析标签行
 * @param line 标签文件中的一行
 * @param kptShape 关键点形状配置（如果是 pose 格式）
 * @returns 解析后的 BoundingBox，如果解析失败返回 null
 */
function parseLabelLine(line: string, kptShape?: number[]): BoundingBox | null {
    const parts = line.trim().split(/\s+/);

    for (const parser of PARSERS) {
        if (parser.canParse(parts, kptShape)) {
            return parser.parse(parts, kptShape);
        }
    }

    return null;
}

/**
 * 格式化标签为字符串
 * @param label 标签对象
 * @returns 格式化后的标签行（YOLO 格式）
 */
function formatLabel(label: BoundingBox): string {
    if (label.isSegmentation && label.points && label.points.length > 0) {
        // Segmentation format: class [points...]
        const formattedPoints = label.points.map(p => p.toFixed(6));
        return `${label.class} ${formattedPoints.join(' ')}\n`;
    } else if (label.isPose && label.keypoints && label.keypoints.length > 0) {
        // Pose format: class x y width height [keypoints...]
        let content = `${label.class} ${label.x.toFixed(6)} ${label.y.toFixed(6)} ${label.width.toFixed(6)} ${label.height.toFixed(6)}`;
        for (const kp of label.keypoints) {
            content += ` ${kp.toFixed(6)}`;
        }
        return content + '\n';
    } else {
        // Standard format: class x y width height
        return `${label.class} ${label.x.toFixed(6)} ${label.y.toFixed(6)} ${label.width.toFixed(6)} ${label.height.toFixed(6)}\n`;
    }
}

/**
 * 读取图片对应的标签文件
 * @param imagePath 图片文件路径
 * @param kptShape 关键点形状配置
 * @returns 标签数组
 */
export function readLabels(imagePath: string, kptShape?: number[]): BoundingBox[] {
    try {
        const labelPath = imagePathToLabelPath(imagePath);
        if (!fs.existsSync(labelPath)) {
            return [];
        }

        const content = fs.readFileSync(labelPath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim() !== '');

        const labels: BoundingBox[] = [];
        for (const line of lines) {
            const label = parseLabelLine(line, kptShape);
            if (label) {
                labels.push(label);
            }
        }

        return labels;
    } catch (error: any) {
        ErrorHandler.handleError(
            error,
            'Failed to read label file',
            {
                type: ErrorType.LABEL_PARSE_ERROR,
                filePath: imagePath
            }
        );
        return [];
    }
}

/**
 * 保存标签到文件
 * @param imagePath 图片文件路径（用于计算标签文件路径）
 * @param labels 标签数组
 */
export function saveLabels(imagePath: string, labels: BoundingBox[]): void {
    try {
        const labelPath = imagePathToLabelPath(imagePath);

        // Format the labels according to YOLO format
        let content = '';
        for (const label of labels) {
            content += formatLabel(label);
        }

        // Ensure the directory exists
        const labelDir = path.dirname(labelPath);
        if (!fs.existsSync(labelDir)) {
            fs.mkdirSync(labelDir, { recursive: true });
        }

        fs.writeFileSync(labelPath, content);
    } catch (error: any) {
        ErrorHandler.handleError(
            error,
            'Failed to save label file',
            {
                type: ErrorType.LABEL_SAVE_ERROR,
                filePath: imagePath
            }
        );
        throw error;
    }
}
