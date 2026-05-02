import type { PlatformId } from '../../types';
import type { PlatformAdapter } from './types';
import { youtubeAdapter } from './youtube';

const registry: Partial<Record<PlatformId, PlatformAdapter>> = {
  youtube: youtubeAdapter,
};

export function getAdapter(platform: PlatformId): PlatformAdapter {
  const a = registry[platform];
  if (!a) throw new Error(`platform not supported in v1: ${platform}`);
  return a;
}

export function listSupportedPlatforms(): PlatformId[] {
  return Object.keys(registry) as PlatformId[];
}
