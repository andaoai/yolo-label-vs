import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { YoloInferenceConfig } from './YoloInferenceService';

/**
 * Default values for YOLO configuration
 */
const DEFAULT_CONFIG: YoloInferenceConfig = {
    modelPath: '',
    inputWidth: 640,
    inputHeight: 640,
    scoreThreshold: 0.45,
    nmsThreshold: 0.45,
    confidenceThreshold: 0.45,
    classNames: []
};

/**
 * Service to handle YOLOv5 configuration
 */
export class YoloConfigurationService {
    private static readonly CONFIG_KEY = 'yoloLabeling.inference';
    private static readonly MODEL_PATH_KEY = 'yoloLabeling.inference.modelPath';
    private static readonly INPUT_WIDTH_KEY = 'yoloLabeling.inference.inputWidth';
    private static readonly INPUT_HEIGHT_KEY = 'yoloLabeling.inference.inputHeight';
    private static readonly SCORE_THRESHOLD_KEY = 'yoloLabeling.inference.scoreThreshold';
    private static readonly NMS_THRESHOLD_KEY = 'yoloLabeling.inference.nmsThreshold';
    private static readonly CONFIDENCE_THRESHOLD_KEY = 'yoloLabeling.inference.confidenceThreshold';
    
    /**
     * Get YOLO inference configuration from settings
     * @param classNames Class names for the model
     * @returns YoloInferenceConfig
     */
    public static getConfig(classNames: string[] = []): YoloInferenceConfig {
        const config = vscode.workspace.getConfiguration();
        
        return {
            modelPath: config.get<string>(this.MODEL_PATH_KEY, DEFAULT_CONFIG.modelPath),
            inputWidth: config.get<number>(this.INPUT_WIDTH_KEY, DEFAULT_CONFIG.inputWidth),
            inputHeight: config.get<number>(this.INPUT_HEIGHT_KEY, DEFAULT_CONFIG.inputHeight),
            scoreThreshold: config.get<number>(this.SCORE_THRESHOLD_KEY, DEFAULT_CONFIG.scoreThreshold),
            nmsThreshold: config.get<number>(this.NMS_THRESHOLD_KEY, DEFAULT_CONFIG.nmsThreshold),
            confidenceThreshold: config.get<number>(this.CONFIDENCE_THRESHOLD_KEY, DEFAULT_CONFIG.confidenceThreshold),
            classNames: classNames
        };
    }
    
    /**
     * Save YOLO inference configuration to settings
     * @param config Configuration to save
     */
    public static async saveConfig(config: Partial<YoloInferenceConfig>): Promise<void> {
        const vsconfig = vscode.workspace.getConfiguration();
        
        if (config.modelPath !== undefined) {
            await vsconfig.update(this.MODEL_PATH_KEY, config.modelPath, vscode.ConfigurationTarget.Global);
        }
        
        if (config.inputWidth !== undefined) {
            await vsconfig.update(this.INPUT_WIDTH_KEY, config.inputWidth, vscode.ConfigurationTarget.Global);
        }
        
        if (config.inputHeight !== undefined) {
            await vsconfig.update(this.INPUT_HEIGHT_KEY, config.inputHeight, vscode.ConfigurationTarget.Global);
        }
        
        if (config.scoreThreshold !== undefined) {
            await vsconfig.update(this.SCORE_THRESHOLD_KEY, config.scoreThreshold, vscode.ConfigurationTarget.Global);
        }
        
        if (config.nmsThreshold !== undefined) {
            await vsconfig.update(this.NMS_THRESHOLD_KEY, config.nmsThreshold, vscode.ConfigurationTarget.Global);
        }
        
        if (config.confidenceThreshold !== undefined) {
            await vsconfig.update(this.CONFIDENCE_THRESHOLD_KEY, config.confidenceThreshold, vscode.ConfigurationTarget.Global);
        }
    }
    
    /**
     * Show a dialog to configure YOLOv5 inference
     * @param currentConfig Current configuration
     */
    public static async showConfigurationDialog(
        currentConfig: YoloInferenceConfig = DEFAULT_CONFIG
    ): Promise<YoloInferenceConfig | undefined> {
        // 选择模型文件
        const modelPath = await this.promptForModelPath(currentConfig.modelPath);
        if (!modelPath) {
            return undefined;
        }
        
        // 配置参数
        const inputWidth = await this.promptForNumber(
            'Input Width',
            'Width of the input image for the model',
            currentConfig.inputWidth
        );
        if (inputWidth === undefined) {
            return undefined;
        }
        
        const inputHeight = await this.promptForNumber(
            'Input Height',
            'Height of the input image for the model',
            currentConfig.inputHeight
        );
        if (inputHeight === undefined) {
            return undefined;
        }
        
        const scoreThreshold = await this.promptForNumber(
            'Score Threshold',
            'Threshold for detection scores (0-1)',
            currentConfig.scoreThreshold,
            0,
            1,
            0.05
        );
        if (scoreThreshold === undefined) {
            return undefined;
        }
        
        const nmsThreshold = await this.promptForNumber(
            'NMS Threshold',
            'Threshold for Non-Maximum Suppression (0-1)',
            currentConfig.nmsThreshold,
            0,
            1,
            0.05
        );
        if (nmsThreshold === undefined) {
            return undefined;
        }
        
        const confidenceThreshold = await this.promptForNumber(
            'Confidence Threshold',
            'Threshold for box confidence (0-1)',
            currentConfig.confidenceThreshold,
            0,
            1,
            0.05
        );
        if (confidenceThreshold === undefined) {
            return undefined;
        }
        
        // Create and return the new configuration
        return {
            modelPath,
            inputWidth,
            inputHeight,
            scoreThreshold,
            nmsThreshold,
            confidenceThreshold,
            classNames: currentConfig.classNames
        };
    }
    
    /**
     * Prompt user to select a model file
     * @param currentPath Current model path
     */
    private static async promptForModelPath(currentPath: string): Promise<string | undefined> {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Select ONNX Model',
            filters: {
                'ONNX Models': ['onnx']
            }
        };
        
        // Use current path as starting point if it exists
        if (currentPath && fs.existsSync(currentPath)) {
            options.defaultUri = vscode.Uri.file(path.dirname(currentPath));
        }
        
        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri.length > 0) {
            return fileUri[0].fsPath;
        }
        
        return undefined;
    }
    
    /**
     * Prompt user for a numeric value
     * @param title Dialog title
     * @param prompt Prompt text
     * @param defaultValue Default value
     * @param min Minimum value
     * @param max Maximum value
     * @param step Step value
     */
    private static async promptForNumber(
        title: string,
        prompt: string,
        defaultValue: number,
        min?: number,
        max?: number,
        step?: number
    ): Promise<number | undefined> {
        const options: vscode.InputBoxOptions = {
            title,
            prompt,
            value: defaultValue.toString(),
            validateInput: (value) => {
                const num = parseFloat(value);
                if (isNaN(num)) {
                    return 'Please enter a valid number';
                }
                
                if (min !== undefined && num < min) {
                    return `Value must be at least ${min}`;
                }
                
                if (max !== undefined && num > max) {
                    return `Value must be at most ${max}`;
                }
                
                return null;
            }
        };
        
        const result = await vscode.window.showInputBox(options);
        if (result === undefined) {
            return undefined;
        }
        
        return parseFloat(result);
    }
} 