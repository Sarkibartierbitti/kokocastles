import type { PlatformId } from '../../types';
import type { PlatformAdapter } from './types';
import { youtubeAdapter } from './youtube';
import { instagramAdapter } from './instagram';
import { tiktokAdapter } from './tiktok';
import { storage } from '../storage';

const registry: Partial<Record<PlatformId, PlatformAdapter>> = {
  youtube: youtubeAdapter,
  instagram: instagramAdapter,
  tiktok: tiktokAdapter,
};

export function getAdapter(platform: PlatformId): PlatformAdapter {
  const a = registry[platform];
  if (!a) throw new Error(`platform not supported in v1: ${platform}`);
  return a;
}

export function listSupportedPlatforms(): PlatformId[] {
  return Object.keys(registry) as PlatformId[];
}

/** Like listSupportedPlatforms but filters experimental adapters by feature-flag. */
export function listEnabledPlatforms(): PlatformId[] {
  const flags = storage.getPlatformsEnabled();
  const all = listSupportedPlatforms();
  return all.filter((p) => {
    if (p === 'instagram') return flags.instagram;
    if (p === 'tiktok') return flags.tiktok;
    return true; // youtube always on
  });
}
