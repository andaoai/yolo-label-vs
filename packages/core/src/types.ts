/**
 * 平台无关的共享类型 — VS Code 扩展与 DSH 插件共用
 */

/** 标注工具类型 */
export type ToolType = 'box' | 'seg' | 'pose';

/** 标签（YOLO 归一化坐标） */
export interface Label {
  class: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isSegmentation?: boolean;
  isPose?: boolean;
  /** 分割多边形点 [x1,y1,x2,y2,...]，归一化坐标 */
  points?: number[];
  /** 关键点 [x1,y1,v1,x2,y2,v2,...]，归一化坐标 */
  keypoints?: number[];
  /** [关键点数量, 每个关键点值数] */
  keypointShape?: number[];
  visible?: boolean;
}

/** 宿主侧标签类型别名，与各前端共享同一结构 */
export type BoundingBox = Label;

/** 单个推理检测结果（归一化坐标 0-1） */
export interface Detection {
  class: number;
  className: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 分割多边形点 [x1,y1,x2,y2,...]，归一化坐标，仅 seg 模型有 */
  points?: number[];
}
