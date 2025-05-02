import { CacheItem, CacheableData } from './types';

/**
 * 缓存配置接口
 */
export interface CacheConfig {
  maxSize: number;       // 最大缓存大小(KB)
  maxItems: number;      // 最大缓存项数
  ttl: number;           // 缓存项生存时间(ms)
}

/**
 * 通用类型安全的缓存管理器
 */
export class CacheManager<T extends CacheableData> {
  private cache: Map<string, CacheItem<T>> = new Map();
  private totalSize: number = 0;
  private readonly defaultConfig: CacheConfig = {
    maxSize: 10 * 1024,  // 10MB
    maxItems: 20,
    ttl: 5 * 60 * 1000   // 5分钟
  };
  private config: CacheConfig;

  /**
   * 创建缓存管理器
   * @param config 缓存配置
   */
  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * 估计数据大小(KB)
   * @param data 要估计大小的数据
   */
  private estimateSize(data: T): number {
    if (typeof data === 'string') {
      // 对于base64图片数据
      return Math.round(data.length / 1.33 / 1024);
    } else if (Array.isArray(data)) {
      // 对于数组数据，如标签数组
      return Math.round(JSON.stringify(data).length / 1024);
    } else {
      // 对于对象数据
      return Math.round(JSON.stringify(data).length / 1024);
    }
  }

  /**
   * 设置缓存项
   * @param key 缓存键
   * @param data 缓存数据
   */
  public set(key: string, data: T): void {
    const size = this.estimateSize(data);
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      size
    };

    // 如果键已存在，先移除旧数据的大小
    if (this.cache.has(key)) {
      this.totalSize -= this.cache.get(key)!.size;
    }

    // 添加新数据
    this.cache.set(key, item);
    this.totalSize += size;

    // 如果超过最大大小或最大数量，清理缓存
    this.cleanup();
  }

  /**
   * 获取缓存项
   * @param key 缓存键
   * @returns 缓存数据或undefined(如果未找到或过期)
   */
  public get(key: string): T | undefined {
    const item = this.cache.get(key);
    
    if (!item) {
      return undefined;
    }

    // 检查是否过期
    if (this.isExpired(item)) {
      this.delete(key);
      return undefined;
    }

    // 更新访问时间戳
    item.timestamp = Date.now();
    return item.data;
  }

  /**
   * 检查缓存项是否存在
   * @param key 缓存键
   * @returns 是否存在且未过期
   */
  public has(key: string): boolean {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }

    // 检查是否过期
    if (this.isExpired(item)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 删除缓存项
   * @param key 缓存键
   */
  public delete(key: string): boolean {
    const item = this.cache.get(key);
    
    if (item) {
      this.totalSize -= item.size;
      return this.cache.delete(key);
    }
    
    return false;
  }

  /**
   * 清空缓存
   */
  public clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }

  /**
   * 获取缓存大小(KB)
   */
  public getSize(): number {
    return this.totalSize;
  }

  /**
   * 获取缓存项数量
   */
  public getCount(): number {
    return this.cache.size;
  }

  /**
   * 清理过期和超额的缓存项
   */
  private cleanup(): void {
    // 先删除过期项
    this.removeExpired();

    // 如果仍然超过限制，按LRU删除
    this.enforceSizeLimits();
  }

  /**
   * 检查缓存项是否过期
   */
  private isExpired(item: CacheItem<T>): boolean {
    return (Date.now() - item.timestamp) > this.config.ttl;
  }

  /**
   * 删除所有过期项
   */
  private removeExpired(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if ((now - item.timestamp) > this.config.ttl) {
        this.totalSize -= item.size;
        this.cache.delete(key);
      }
    }
  }

  /**
   * 强制执行大小限制
   */
  private enforceSizeLimits(): void {
    // 如果超过最大项数，删除最旧的
    if (this.cache.size > this.config.maxItems) {
      const sortedItems = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      while (this.cache.size > this.config.maxItems) {
        const [key, item] = sortedItems.shift()!;
        this.totalSize -= item.size;
        this.cache.delete(key);
      }
    }

    // 如果超过最大大小，删除最旧的
    if (this.totalSize > this.config.maxSize) {
      const sortedItems = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      while (this.totalSize > this.config.maxSize && sortedItems.length > 0) {
        const [key, item] = sortedItems.shift()!;
        this.totalSize -= item.size;
        this.cache.delete(key);
      }
    }
  }
}