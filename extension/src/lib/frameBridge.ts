import type { BgToSidebar, SidebarToBg } from './messaging';

export async function captureFrameViaBackground(videoId: string): Promise<string> {
  const reply = (await browser.runtime.sendMessage({
    type: 'capture-frame-bg',
    videoId,
  } satisfies SidebarToBg)) as BgToSidebar;
  if (reply?.type === 'frame-ok') return reply.dataUrl;
  if (reply?.type === 'frame-err') throw new Error(reply.message);
  throw new Error('unexpected reply from background');
}
