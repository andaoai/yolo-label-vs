/**
 * Agent 模型工具：让 agent 能直接扫描/打开数据集、读写标签、查看统计，
 * 实现人机协同标注（agent 批量检查/修正标签，人在客户端工作台复核）。
 *
 * 通过 ctx.tools.register 注册 ToolDefinition（直接构造，不 import
 * @deepseek-ai/dsh-tools——第三方 bundle 插件运行时不解析该包）。
 * parameters/output 用标准 JSON Schema 子集；参数校验由 operations 层的
 * 绝对路径断言兜底。
 */
import * as fssync from 'node:fs';
import type { Label } from '@yolo-label/core/node';
import { imagePathToLabelPath } from '@yolo-label/core/node';
import {
  scanDatasets,
  openDataset,
  readLabels,
  writeLabels,
  getStats,
  getReader,
  assertAbsolute,
} from './operations.js';
import { runInference } from './inference.js';

const assertAbs = assertAbsolute;

/** 宽松的对象输出 schema（render 负责生成模型可读文本）。 */
const OBJECT_OUTPUT = { type: 'object', additionalProperties: true } as const;

interface ToolSpec {
  name: string;
  description: string;
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  execute: (args: Record<string, any>) => Promise<unknown> | unknown;
}

function registerTool(ctx: any, spec: ToolSpec): void {
  const definition = {
    name: spec.name,
    description: spec.description,
    parameters: {
      type: 'object',
      additionalProperties: true,
      properties: spec.properties,
      required: spec.required ?? [],
    },
    output: {
      schema: OBJECT_OUTPUT,
      render: (_args: unknown, value: unknown) => [
        { type: 'text', text: JSON.stringify(value, null, 2) },
      ],
    },
    execute: async (args: unknown) => spec.execute((args ?? {}) as Record<string, any>),
  };
  ctx.tools.register(definition);
}

const ABS_PATH = (desc: string) => ({
  type: 'string',
  description: `${desc} Must be an absolute filesystem path.`,
});

export function registerTools(ctx: any): void {
  registerTool(ctx, {
    name: 'yolo_scan_datasets',
    description:
      'Recursively scan a directory for YOLO dataset manifests (data.yaml / data.yml). '
      + 'Returns each dataset\'s yamlPath, datasetRoot, name, class count, and keypoint shape. '
      + 'Use this first to discover available datasets before opening one.',
    properties: {
      root: ABS_PATH('Directory to scan recursively for YOLO datasets.'),
    },
    required: ['root'],
    execute: (args) => {
      const datasets = scanDatasets(args.root);
      return { count: datasets.length, datasets };
    },
  });

  registerTool(ctx, {
    name: 'yolo_open_dataset',
    description:
      'Open a YOLO dataset by its data.yaml path. Returns class names, keypoint shape (pose), '
      + 'total image count, and the list of image absolute paths (optionally capped by imageLimit). '
      + 'The returned image paths are used with yolo_read_labels / yolo_write_labels.',
    properties: {
      yamlPath: ABS_PATH('Absolute path to the dataset data.yaml.'),
      workspaceRoot: ABS_PATH('Optional workspace root used to resolve a relative `path:` in the yaml.'),
      imageLimit: {
        type: 'number',
        description: 'Optional cap on the number of image paths returned (for very large datasets).',
      },
    },
    required: ['yamlPath'],
    execute: (args) =>
      openDataset(args.yamlPath, args.workspaceRoot, typeof args.imageLimit === 'number' ? args.imageLimit : undefined),
  });

  registerTool(ctx, {
    name: 'yolo_read_labels',
    description:
      'Read the YOLO labels for one image. Returns the image path and labels array; each label has '
      + '`class` (class index), `x`,`y`,`width`,`height` (normalized 0-1 center box), and for '
      + 'segmentation `isSegmentation:true` + `points` ([x1,y1,...] normalized), for pose `isPose:true` '
      + '+ `keypoints`. Missing label file returns an empty labels array.',
    properties: {
      yamlPath: ABS_PATH('Absolute path to the dataset data.yaml.'),
      imagePath: ABS_PATH('Absolute path to the image (from yolo_open_dataset).'),
    },
    required: ['yamlPath', 'imagePath'],
    execute: (args) => readLabels(args.yamlPath, args.imagePath),
  });

  registerTool(ctx, {
    name: 'yolo_write_labels',
    description:
      'Write (overwrite) the YOLO label file for one image. Provide the full labels array in the same '
      + 'shape returned by yolo_read_labels: each item needs `class` and `x`,`y`,`width`,`height` '
      + '(normalized center box); segmentation adds `isSegmentation:true` + `points`; pose adds '
      + '`isPose:true` + `keypoints` (+ `keypointShape`). Coordinates must be normalized 0-1. '
      + 'Writes a 6-decimal YOLO .txt next to the image. Returns the saved count.',
    properties: {
      yamlPath: ABS_PATH('Absolute path to the dataset data.yaml.'),
      imagePath: ABS_PATH('Absolute path to the image whose labels are written.'),
      labels: {
        type: 'array',
        description:
          'Full label array to write. Each item: { class:number, x,y,width,height:number (0-1), '
          + 'isSegmentation?, points?:number[], isPose?, keypoints?:number[], keypointShape?:number[] }.',
        items: { type: 'object', additionalProperties: true },
      },
    },
    required: ['yamlPath', 'imagePath', 'labels'],
    execute: (args) => writeLabels(args.yamlPath, args.imagePath, args.labels as Label[]),
  });

  registerTool(ctx, {
    name: 'yolo_infer_image',
    description:
      'Run a YOLO ONNX model on ONE image and return detections (read-only, writes nothing). '
      + 'Boxes (and segmentation polygons for seg models) come back in normalized 0-1 coords: each '
      + 'detection has class, className, confidence, x,y,width,height (top-left + size), and points '
      + 'for segmentation. Use to preview model quality before batch labeling. Model input is letterboxed '
      + 'to 640 automatically.',
    properties: {
      modelPath: ABS_PATH('Absolute path to the .onnx YOLO model (YOLOv8/YOLO11 det or seg).'),
      imagePath: ABS_PATH('Absolute path to the image to infer.'),
      yamlPath: ABS_PATH('Optional dataset data.yaml; its class names are used to label detection classes.'),
      conf: { type: 'number', description: 'Confidence threshold 0-1 (default 0.25).' },
      iou: { type: 'number', description: 'NMS IoU threshold 0-1 (default 0.45).' },
    },
    required: ['modelPath', 'imagePath'],
    execute: async (args) => {
      assertAbs(args.modelPath, 'modelPath');
      assertAbs(args.imagePath, 'imagePath');
      const classNames = args.yamlPath ? getReader(args.yamlPath).getClassNames() : [];
      const dets = await runInference(
        args.modelPath, args.imagePath, classNames,
        typeof args.conf === 'number' ? args.conf : 0.25,
        typeof args.iou === 'number' ? args.iou : 0.45,
      );
      return { image: args.imagePath, count: dets.length, detections: dets };
    },
  });

  registerTool(ctx, {
    name: 'yolo_auto_label',
    description:
      'Batch pre-label images with a YOLO ONNX model and (by default) WRITE the YOLO label .txt files. '
      + 'By default skips images that already have a non-empty label file (pass overwrite:true to redo them). '
      + 'Detections map to labels: class index + normalized center box (x,y,width,height); segmentation models '
      + 'also write isSegmentation + polygon points. Use yolo_open_dataset first to get image paths, then call this '
      + 'to pre-label; a human reviews/corrects in the labeling workbench. Class indices align with the dataset names.',
    properties: {
      yamlPath: ABS_PATH('Absolute path to the dataset data.yaml.'),
      modelPath: ABS_PATH('Absolute path to the .onnx YOLO model.'),
      images: {
        type: 'array',
        description: 'Optional explicit list of image absolute paths to label. Defaults to the first `limit` dataset images.',
        items: { type: 'string' },
      },
      limit: { type: 'number', description: 'Max images to label when `images` is omitted (default 20).' },
      conf: { type: 'number', description: 'Confidence threshold 0-1 (default 0.25).' },
      iou: { type: 'number', description: 'NMS IoU threshold 0-1 (default 0.45).' },
      overwrite: { type: 'boolean', description: 'Re-label images that already have labels (default false = skip).' },
      write: { type: 'boolean', description: 'Write label files (default true). Set false to dry-run and only report what would be written.' },
    },
    required: ['yamlPath', 'modelPath'],
    execute: async (args) => {
      assertAbs(args.yamlPath, 'yamlPath');
      assertAbs(args.modelPath, 'modelPath');
      const conf = typeof args.conf === 'number' ? args.conf : 0.25;
      const iou = typeof args.iou === 'number' ? args.iou : 0.45;
      const overwrite = args.overwrite === true;
      const doWrite = args.write !== false;
      const reader = getReader(args.yamlPath);
      const classNames = reader.getClassNames();

      let targets: string[];
      if (Array.isArray(args.images) && args.images.length > 0) {
        targets = args.images.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0);
      } else {
        const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.floor(args.limit) : 20;
        targets = reader.getAllImages().slice(0, limit);
      }

      const results: Array<{ image: string; status: string; detections: number }> = [];
      let written = 0, skipped = 0, empty = 0;

      for (const imagePath of targets) {
        const labelPath = imagePathToLabelPath(imagePath);
        const hasLabels = fssync.existsSync(labelPath) && fssync.statSync(labelPath).size > 0;
        if (hasLabels && !overwrite) {
          skipped++;
          results.push({ image: imagePath, status: 'skipped-existing', detections: 0 });
          continue;
        }
        const dets = await runInference(args.modelPath, imagePath, classNames, conf, iou);
        const labels: Label[] = dets.map((d) => ({
          class: d.class,
          x: d.x + d.width / 2,
          y: d.y + d.height / 2,
          width: d.width,
          height: d.height,
          ...(d.points && d.points.length >= 6 ? { isSegmentation: true, points: d.points } : {}),
        }));
        if (labels.length === 0) {
          empty++;
          results.push({ image: imagePath, status: 'no-detection', detections: 0 });
          continue;
        }
        if (doWrite) reader.saveLabels(imagePath, labels);
        written++;
        results.push({ image: imagePath, status: doWrite ? 'written' : 'dry-run', detections: labels.length });
      }

      return {
        model: args.modelPath,
        total: targets.length,
        written,
        skipped,
        empty,
        dryRun: !doWrite,
        results: results.slice(0, 100),
      };
    },
  });

  registerTool(ctx, {
    name: 'yolo_dataset_stats',
    description:
      'Compute dataset statistics for a YOLO dataset: per-class instance distribution, box size '
      + 'histogram, and train/val/test split counts. Use to audit class balance or labeling progress.',
    properties: {
      yamlPath: ABS_PATH('Absolute path to the dataset data.yaml.'),
    },
    required: ['yamlPath'],
    execute: async (args) => getStats(args.yamlPath),
  });

  console.log('[yolo-label-dsh] registered 7 model tools (scan/open/read/write/stats/infer/auto-label)');
}
