import { logger } from './logger';

export interface MemoryStats {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  rssFormatted: string;
  heapUsedFormatted: string;
  heapUsedPercent: number;
}

export function getMemoryStats(): MemoryStats {
  const memUsage = process.memoryUsage();

  return {
    rss: memUsage.rss,
    heapTotal: memUsage.heapTotal,
    heapUsed: memUsage.heapUsed,
    external: memUsage.external,
    arrayBuffers: memUsage.arrayBuffers,
    rssFormatted: formatBytes(memUsage.rss),
    heapUsedFormatted: formatBytes(memUsage.heapUsed),
    heapUsedPercent: (memUsage.heapUsed / memUsage.heapTotal) * 100,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function startMemoryMonitoring(intervalMs: number = 60000, warnThresholdMB: number = 500): NodeJS.Timeout {
  const interval = setInterval(() => {
    const stats = getMemoryStats();

    logger.debug(
      {
        rss: stats.rssFormatted,
        heapUsed: stats.heapUsedFormatted,
        heapPercent: stats.heapUsedPercent.toFixed(1),
      },
      'Memory usage'
    );

    // Warn if memory usage is high
    const rssInMB = stats.rss / (1024 * 1024);
    if (rssInMB > warnThresholdMB) {
      logger.warn(
        {
          rss: stats.rssFormatted,
          heapUsed: stats.heapUsedFormatted,
          threshold: `${warnThresholdMB} MB`,
        },
        'High memory usage detected'
      );
    }
  }, intervalMs);

  return interval;
}

export function stopMemoryMonitoring(interval: NodeJS.Timeout): void {
  clearInterval(interval);
}
