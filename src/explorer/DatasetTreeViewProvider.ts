import * as vscode from 'vscode';
import * as path from 'path';
import { DatasetScanner, DatasetStats } from './DatasetScanner';
import { scanImageFiles } from '../yolo/ImageFileScanner';
import { readLabels } from '../yolo/LabelCodec';
import { loadConfig } from '../yolo/ConfigLoader';

/**
 * 树节点类型
 */
type TreeNode =
    | DatasetTreeNode
    | SubsetTreeNode
    | ImageTreeNode
    | InfoTreeNode;

/**
 * 数据集根节点
 */
class DatasetTreeNode extends vscode.TreeItem {
    constructor(
        public readonly stats: DatasetStats,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(path.basename(stats.yamlPath), collapsibleState);
        this.description = `${stats.trainCount + stats.valCount + stats.testCount} 张`;
        this.tooltip = `${stats.yamlPath}\n数据集路径: ${stats.datasetRoot}\n\n💡 点击打开标注面板`;
        this.iconPath = vscode.ThemeIcon.File;
        this.contextValue = 'dataset-item';
        this.command = {
            title: '打开标注面板',
            command: 'yolo-labeling-vs.openLabelingPanel',
            arguments: [{ yamlPath: stats.yamlPath }]
        };
    }
}

/**
 * 子集节点 (train/val/test)
 */
class SubsetTreeNode extends vscode.TreeItem {
    constructor(
        public readonly stats: DatasetStats,
        public readonly subsetName: 'train' | 'val' | 'test',
        public readonly imageFiles: string[],
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        const displayName = subsetName === 'train' ? '训练集' : subsetName === 'val' ? '验证集' : '测试集';
        super(`${displayName} (${subsetName})`, collapsibleState);
        this.description = `${imageFiles.length} 张`;
        this.tooltip = `${displayName} - ${imageFiles.length} 张图片\n💡 点击打开并跳转到该子集第一张`;
        this.iconPath = new vscode.ThemeIcon('file-media');
        this.contextValue = 'subset-item';

        // 如果有图片，点击跳转到第一张
        if (imageFiles.length > 0) {
            this.command = {
                title: '打开标注面板',
                command: 'yolo-labeling-vs.openLabelingPanel',
                arguments: [{ yamlPath: stats.yamlPath, imagePath: imageFiles[0] }]
            };
        }
    }
}

/**
 * 图片文件节点
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
            this.description = `✓ ${labelCount} 个标签`;
            this.iconPath = new vscode.ThemeIcon('check');
        } else {
            this.description = '未标注';
            this.iconPath = new vscode.ThemeIcon('circle-outline');
        }

        this.tooltip = `${imagePath}\n${hasLabels ? `已标注: ${labelCount} 个标签` : '未标注'}\n\n💡 点击打开并跳转到这张图片`;
        this.contextValue = 'image-item';
        this.command = {
            title: '打开并跳转',
            command: 'yolo-labeling-vs.openLabelingPanel',
            arguments: [{ yamlPath: stats.yamlPath, imagePath }]
        };
    }
}

/**
 * 信息/操作节点
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
 * 数据集 TreeView Provider
 */
export class DatasetTreeViewProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null> = new vscode.EventEmitter();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null> = this._onDidChangeTreeData.event;

    private scanner: DatasetScanner = new DatasetScanner();
    private datasets: DatasetStats[] = [];

    // 缓存每个数据集的图片文件
    private datasetImagesCache: Map<string, {
        train: string[],
        val: string[],
        test: string[]
    }> = new Map();

    constructor(private context: vscode.ExtensionContext) {
        // 监听文件变化
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{yaml,yml}');
        watcher.onDidChange(() => this.refresh());
        watcher.onDidCreate(() => this.refresh());
        watcher.onDidDelete(() => this.refresh());
        context.subscriptions.push(watcher);
    }

    /**
     * 刷新树视图
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
            // 根节点：显示所有数据集
            this.datasets = await this.scanner.scanWorkspace();

            if (this.datasets.length === 0) {
                return [
                    new InfoTreeNode(
                        '未找到数据集',
                        '点击打开 YAML 文件',
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
     * 获取数据集的子节点
     */
    private async getDatasetChildren(stats: DatasetStats): Promise<TreeNode[]> {
        const children: TreeNode[] = [];

        // 加载并缓存该数据集的所有图片文件
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

        // 子集节点 (train/val/test)
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

        // 快捷操作
        children.push(new InfoTreeNode(
            '打开 YAML 配置',
            '',
            'go-to-file',
            {
                title: '打开 YAML 配置',
                command: 'vscode.open',
                arguments: [vscode.Uri.file(stats.yamlPath)]
            }
        ));

        return children;
    }

    /**
     * 获取子集的子节点（图片列表）
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
