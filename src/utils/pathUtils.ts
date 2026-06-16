/** 路径和字符串显示工具 */

/** 获取跨平台路径的文件名 */
export function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

/** 超长字符串截断为前缀 + 省略号 */
export function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.substring(0, maxLength - 3)}...` : text;
}

/** 将图片路径转换为 YOLO 标签 txt 路径 */
export function imagePathToLabelPath(imagePath: string): string {
  return imagePath
    .replace(/[/\\]images[/\\]/i, match => match.replace(/images/i, 'labels'))
    .replace(/\.[^.\\/]+$/, '.txt');
}
