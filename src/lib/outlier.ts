import type { OutlierFlag, Video } from '../types';

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function flagOutliers(videos: Video[], multiplier = 3): OutlierFlag[] {
  if (videos.length === 0) return [];
  const m = median(videos.map((v) => v.viewCount));
  const baseline = Math.max(m, 1);
  return videos.map((v) => ({
    video: v,
    isOutlier: v.viewCount >= baseline * multiplier,
    ratio: v.viewCount / baseline,
  }));
}
