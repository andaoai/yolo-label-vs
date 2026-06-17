import * as path from 'path';
import { YoloConfig, resolveDatasetPath, loadConfig } from '../yolo/ConfigLoader';
import { scanImageFiles, scanImageFilesByFolder } from '../yolo/ImageFileScanner';
import { readLabels } from '../yolo/LabelCodec';

/**
 * Chart data for visualization
 */
export interface ChartData {
    // Labels per image histogram
    labelsPerImage: { counts: number[]; maxLabels: number };

    // Class distribution
    classCounts: number[];
    classNames: string[];

    // Box statistics for charts
    boxSizes: { w: number; h: number }[];       // normalized width/height
    boxAreas: number[];                         // normalized area (w*h)
    boxCenterX: number[];                       // normalized center x
    boxCenterY: number[];                       // normalized center y

    // Box aspect ratio distribution
    aspectRatios: number[];
}

/**
 * Detailed statistics for a dataset
 */
export interface DatasetStatistics {
    yamlPath: string;
    datasetName: string;
    datasetRoot: string;
    config: YoloConfig;
    datasetType: 'detection' | 'segmentation' | 'keypoint';

    // Basic counts
    totalImages: number;
    trainImages: number;
    valImages: number;
    testImages: number;

    // Label statistics
    labeledImages: number;
    unlabeledImages: number;
    totalLabels: number;
    averageLabelsPerImage: number;

    // Class distribution (sorted)
    classDistribution: { className: string; count: number; percentage: number }[];

    // Class distribution by subset (train/val/test)
    classCountsBySubset: {
        train: number[];
        val: number[];
        test: number[];
    };

    // Labels per image distribution (histogram)
    labelsPerImage: { range: string; count: number }[];

    // Box statistics summary
    boxStats: {
        avgWidth: number;
        avgHeight: number;
        avgArea: number;
        avgAspectRatio: number;
    };

    // Chart data for visualization
    chartData: ChartData;

    // Keypoint statistics (if applicable)
    keypointStats?: {
        hasKeypoints: boolean;
        kptShape: number[];
        totalKeypoints: number;
        averageKeypointsPerLabel: number;
    };

    // Folder distribution
    folderDistribution: { folder: string; count: number }[];

    // Processing time
    processingTime: number;
}

/**
 * Service for calculating detailed dataset statistics
 */
export class DatasetStatisticsService {
    /**
     * Calculate detailed statistics for a dataset
     */
    static async calculateStatistics(yamlPath: string, workspaceRoot?: string): Promise<DatasetStatistics> {
        const startTime = Date.now();

        const config = loadConfig(yamlPath);
        const yamlDir = path.dirname(yamlPath);
        const datasetRoot = resolveDatasetPath(config, yamlDir, workspaceRoot);

        const trainFiles = scanImageFiles(datasetRoot, { train: config.train });
        const valFiles = scanImageFiles(datasetRoot, { val: config.val });
        const testFiles = scanImageFiles(datasetRoot, { test: config.test });
        const allFiles = [...trainFiles, ...valFiles, ...testFiles];

        // Scan by folder
        const trainByFolder = scanImageFilesByFolder(datasetRoot, config.train, 'train');
        const valByFolder = scanImageFilesByFolder(datasetRoot, config.val, 'val');
        const testByFolder = scanImageFilesByFolder(datasetRoot, config.test, 'test');
        const allFolders = { ...trainByFolder, ...valByFolder, ...testByFolder };

        // Initialize counters
        let labeledImages = 0;
        let totalLabels = 0;
        const classCounts: number[] = new Array(config.names.length).fill(0);
        const trainClassCounts: number[] = new Array(config.names.length).fill(0);
        const valClassCounts: number[] = new Array(config.names.length).fill(0);
        const testClassCounts: number[] = new Array(config.names.length).fill(0);
        const labelCountHistogram: number[] = [];
        let totalKeypoints = 0;
        let labelsWithKeypoints = 0;
        let hasSegmentation = false;

        // Chart data collection
        const boxSizes: { w: number; h: number }[] = [];
        const boxAreas: number[] = [];
        const boxCenterX: number[] = [];
        const boxCenterY: number[] = [];
        const aspectRatios: number[] = [];

        // Aggregate box stats
        let totalBoxWidth = 0;
        let totalBoxHeight = 0;
        let totalBoxArea = 0;
        let totalBoxAspectRatio = 0;

        // Image resolution tracking removed - keep it fast

        // Helper function to process image files for a specific subset
        const processSubsetFiles = (files: string[], subsetClassCounts: number[]) => {
            for (const imagePath of files) {
                const labels = readLabels(imagePath, config.kpt_shape);

                if (labels.length > 0) {
                    labeledImages++;
                    totalLabels += labels.length;

                    // Count labels per image for histogram
                    labelCountHistogram.push(labels.length);

                    // Count class distribution and collect box statistics
                    for (const label of labels) {
                        classCounts[label.class] = (classCounts[label.class] || 0) + 1;
                        subsetClassCounts[label.class] = (subsetClassCounts[label.class] || 0) + 1;

                        // Detect segmentation format
                        if ((label as any).isSegmentation) {
                            hasSegmentation = true;
                        }

                        // YOLO format: class x_center y_center width height (normalized)
                        const x = label.x; // already normalized by readLabels
                        const y = label.y;
                        const w = label.width;
                        const h = label.height;

                        // Add to chart data (already normalized 0-1)
                        boxSizes.push({ w, h });
                        boxAreas.push(w * h);
                        boxCenterX.push(x);
                        boxCenterY.push(y);
                        aspectRatios.push(w / (h || 0.001));

                        // Aggregate for averages
                        totalBoxWidth += w;
                        totalBoxHeight += h;
                        totalBoxArea += w * h;
                        totalBoxAspectRatio += w / (h || 0.001);

                        // Count keypoints (flat array format: [x1,y1,v1,x2,y2,v2,...])
                        if (label.keypoints && label.keypoints.length > 0) {
                            let visibleCount = 0;
                            for (let i = 2; i < label.keypoints.length; i += 3) {
                                if (label.keypoints[i] > 0) {
                                    visibleCount++;
                                }
                            }
                            totalKeypoints += visibleCount;
                            labelsWithKeypoints++;
                        }
                    }
                }
            }
        };

        // Process each subset separately for per-subset class distribution
        processSubsetFiles(trainFiles, trainClassCounts);
        processSubsetFiles(valFiles, valClassCounts);
        processSubsetFiles(testFiles, testClassCounts);

        // Build class distribution (sorted by count)
        const classDistribution = config.names.map((className, index) => ({
            className,
            count: classCounts[index] || 0,
            percentage: totalLabels > 0 ? (classCounts[index] || 0) / totalLabels * 100 : 0
        })).sort((a, b) => b.count - a.count);

        // Build labels per image histogram
        const labelsPerImage = this.buildHistogram(labelCountHistogram);

        // Build folder distribution
        const folderDistribution = Object.entries(allFolders).map(([folder, files]) => ({
            folder,
            count: files.length
        })).sort((a, b) => b.count - a.count);

        // Build labels per image chart data
        const maxLabels = labelCountHistogram.length > 0 ? Math.max(...labelCountHistogram) : 0;
        const labelsPerImageCounts = new Array(maxLabels + 1).fill(0);
        labelCountHistogram.forEach(count => {
            labelsPerImageCounts[count]++;
        });

        const processingTime = Date.now() - startTime;

        return {
            yamlPath,
            datasetName: path.basename(yamlPath, '.yaml'),
            datasetRoot,
            config,

            totalImages: allFiles.length,
            trainImages: trainFiles.length,
            valImages: valFiles.length,
            testImages: testFiles.length,

            labeledImages,
            unlabeledImages: allFiles.length - labeledImages,
            totalLabels,
            averageLabelsPerImage: labeledImages > 0 ? totalLabels / labeledImages : 0,

            classDistribution,
            classCountsBySubset: {
                train: trainClassCounts,
                val: valClassCounts,
                test: testClassCounts
            },
            labelsPerImage,

            // Box statistics summary
            boxStats: {
                avgWidth: totalLabels > 0 ? totalBoxWidth / totalLabels : 0,
                avgHeight: totalLabels > 0 ? totalBoxHeight / totalLabels : 0,
                avgArea: totalLabels > 0 ? totalBoxArea / totalLabels : 0,
                avgAspectRatio: totalLabels > 0 ? totalBoxAspectRatio / totalLabels : 0
            },

            // Chart data for visualization
            chartData: {
                labelsPerImage: { counts: labelsPerImageCounts, maxLabels },
                classCounts,
                classNames: config.names,
                boxSizes,
                boxAreas,
                boxCenterX,
                boxCenterY,
                aspectRatios
            },

            keypointStats: config.kpt_shape ? {
                hasKeypoints: true,
                kptShape: config.kpt_shape,
                totalKeypoints,
                averageKeypointsPerLabel: labelsWithKeypoints > 0 ? totalKeypoints / labelsWithKeypoints : 0
            } : undefined,

            // Determine dataset type
            datasetType: config.kpt_shape ? 'keypoint' : (hasSegmentation ? 'segmentation' : 'detection'),

            folderDistribution,
            processingTime
        };
    }

    /**
     * Build histogram from raw data
     */
    private static buildHistogram(data: number[]): { range: string; count: number }[] {
        if (data.length === 0) {
            return [{ range: '0', count: 0 }];
        }

        const max = Math.max(...data);
        const bucketCount = Math.min(10, max + 1);
        const bucketSize = Math.ceil((max + 1) / bucketCount);

        const histogram: { range: string; count: number }[] = [];

        for (let i = 0; i < bucketCount; i++) {
            const start = i * bucketSize;
            const end = (i + 1) * bucketSize - 1;
            const range = start === end ? `${start}` : `${start}-${end}`;
            const count = data.filter(x => x >= start && x <= end).length;

            if (count > 0 || i === 0) {
                histogram.push({ range, count });
            }
        }

        return histogram;
    }
}
