import * as vscode from 'vscode';
import * as path from 'path';
import { DatasetScanner, DatasetStats } from './DatasetScanner';
import { scanImageFiles } from '../yolo/ImageFileScanner';
import { readLabels } from '../yolo/LabelCodec';
import { loadConfig } from '../yolo/ConfigLoader';

/**
 * Tree node types
 */
type TreeNode =
    | DatasetTreeNode
    | SubsetTreeNode
    | ImageTreeNode
    | InfoTreeNode;

/**
 * Dataset root node
 */
class DatasetTreeNode extends vscode.TreeItem {
    constructor(
        public readonly stats: DatasetStats,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(path.basename(stats.yamlPath), collapsibleState);
        this.description = `${stats.trainCount + stats.valCount + stats.testCount} images`;
        this.tooltip = `${stats.yamlPath}\nDataset root: ${stats.datasetRoot}\n\n💡 Click to open labeling panel`;
        this.iconPath = vscode.ThemeIcon.File;
        this.contextValue = 'dataset-item';
        this.command = {
            title: 'Open labeling panel',
            command: 'yolo-labeling-vs.openLabelingPanel',
            arguments: [{ yamlPath: stats.yamlPath }]
        };
    }
}

/**
 * Subset node (train/val/test)
 */
class SubsetTreeNode extends vscode.TreeItem {
    constructor(
        public readonly stats: DatasetStats,
        public readonly subsetName: 'train' | 'val' | 'test',
        public readonly imageFiles: string[],
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(subsetName, collapsibleState);
        this.description = `${imageFiles.length} images`;
        this.tooltip = `${subsetName} - ${imageFiles.length} images\n💡 Click to open first image in this subset`;
        this.iconPath = new vscode.ThemeIcon('file-media');
        this.contextValue = 'subset-item';

        // If there are images, click jumps to first image
        if (imageFiles.length > 0) {
            this.command = {
                title: 'Open labeling panel',
                command: 'yolo-labeling-vs.openLabelingPanel',
                arguments: [{ yamlPath: stats.yamlPath, imagePath: imageFiles[0] }]
            };
        }
    }
}

/**
 * Image file node
 */
class ImageTreeNode extends vscode.TreeItem {
    constructor(
        public readonly stats: DatasetStats,
        public readonly imagePath: string,
        public readonly hasLabels: boolean,
        public readonly labelCount: number
    ) {
        super(path.basename(imagePath), vscode.TreeItemCollapsibleState.None);

        if (hasLabels) {
            this.description = `✓ ${labelCount} labels`;
            this.iconPath = new vscode.ThemeIcon('check');
        } else {
            this.description = 'Unlabeled';
            this.iconPath = new vscode.ThemeIcon('circle-outline');
        }

        this.tooltip = `${imagePath}\n${hasLabels ? `Labeled: ${labelCount} labels` : 'Unlabeled'}\n\n💡 Click to open and jump to this image`;
        this.contextValue = 'image-item';
        this.command = {
            title: 'Open and jump',
            command: 'yolo-labeling-vs.openLabelingPanel',
            arguments: [{ yamlPath: stats.yamlPath, imagePath }]
        };
    }
}

/**
 * Info/action node
 */
class InfoTreeNode extends vscode.TreeItem {
    constructor(
        label: string,
        description: string,
        icon: string = 'info',
        command?: vscode.Command
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.command = command;
    }
}

/**
 * Dataset TreeView Provider
 */
export class DatasetTreeViewProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null> = new vscode.EventEmitter();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null> = this._onDidChangeTreeData.event;

    private scanner: DatasetScanner = new DatasetScanner();
    private datasets: DatasetStats[] = [];

    // Cache image files for each dataset
    private datasetImagesCache: Map<string, {
        train: string[],
        val: string[],
        test: string[]
    }> = new Map();

    constructor(private context: vscode.ExtensionContext) {
        // Watch for file changes
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{yaml,yml}');
        watcher.onDidChange(() => this.refresh());
        watcher.onDidCreate(() => this.refresh());
        watcher.onDidDelete(() => this.refresh());
        context.subscriptions.push(watcher);
    }

    /**
     * Refresh tree view
     */
    refresh(): void {
        this.scanner.clearCache();
        this.datasetImagesCache.clear();
        this._onDidChangeTreeData.fire(null);
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!element) {
            // Root node: show all datasets
            this.datasets = await this.scanner.scanWorkspace();

            if (this.datasets.length === 0) {
                return [
                    new InfoTreeNode(
                        'No datasets found',
                        'Click to open YAML file',
                        'folder'
                    )
                ];
            }

            return this.datasets.map(ds =>
                new DatasetTreeNode(ds, vscode.TreeItemCollapsibleState.Collapsed)
            );
        }

        if (element instanceof DatasetTreeNode) {
            return this.getDatasetChildren(element.stats);
        }

        if (element instanceof SubsetTreeNode) {
            return this.getSubsetChildren(element.stats, element.subsetName, element.imageFiles);
        }

        return [];
    }

    /**
     * Get dataset child nodes
     */
    private async getDatasetChildren(stats: DatasetStats): Promise<TreeNode[]> {
        const children: TreeNode[] = [];

        // Load and cache all image files for this dataset
        if (!this.datasetImagesCache.has(stats.yamlPath)) {
            const config = loadConfig(stats.yamlPath, true);
            const trainFiles = scanImageFiles(stats.datasetRoot, { train: config.train });
            const valFiles = scanImageFiles(stats.datasetRoot, { val: config.val });
            const testFiles = scanImageFiles(stats.datasetRoot, { test: config.test });

            this.datasetImagesCache.set(stats.yamlPath, {
                train: trainFiles,
                val: valFiles,
                test: testFiles
            });
        }

        const images = this.datasetImagesCache.get(stats.yamlPath)!;

        // Subset nodes (train/val/test)
        if (images.train.length > 0) {
            children.push(new SubsetTreeNode(
                stats, 'train', images.train,
                vscode.TreeItemCollapsibleState.Collapsed
            ));
        }

        if (images.val.length > 0) {
            children.push(new SubsetTreeNode(
                stats, 'val', images.val,
                vscode.TreeItemCollapsibleState.Collapsed
            ));
        }

        if (images.test.length > 0) {
            children.push(new SubsetTreeNode(
                stats, 'test', images.test,
                vscode.TreeItemCollapsibleState.Collapsed
            ));
        }

        // Quick actions
        children.push(new InfoTreeNode(
            'Open YAML Config',
            '',
            'go-to-file',
            {
                title: 'Open YAML configuration',
                command: 'vscode.open',
                arguments: [vscode.Uri.file(stats.yamlPath)]
            }
        ));

        return children;
    }

    /**
     * Get subset child nodes (image list)
     */
    private getSubsetChildren(stats: DatasetStats, _subsetName: string, imageFiles: string[]): TreeNode[] {
        return imageFiles.map(imagePath => {
            const labels = readLabels(imagePath, stats.config.kpt_shape);
            return new ImageTreeNode(
                stats,
                imagePath,
                labels.length > 0,
                labels.length
            );
        });
    }
}
