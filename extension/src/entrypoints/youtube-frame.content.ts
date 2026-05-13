import { defineContentScript } from 'wxt/utils/define-content-script';

interface CaptureOk { ok: true; dataUrl: string }
interface CaptureFail { ok: false; message: string }

export default defineContentScript({
  matches: ['https://www.youtube.com/watch*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message) => {
      const msg = message as { type?: string; t?: number };
      if (msg.type !== 'capture-frame') return undefined;
      const t = Math.max(0, msg.t ?? 2);
      return new Promise<CaptureOk | CaptureFail>((resolve) => {
        const video = document.querySelector('video') as HTMLVideoElement | null;
        if (!video) return resolve({ ok: false, message: 'no <video> element on page' });
        const timer = setTimeout(() => {
          video.removeEventListener('seeked', onSeeked);
          resolve({ ok: false, message: 'seek timeout' });
        }, 8000);
        function onSeeked() {
          clearTimeout(timer);
          video!.removeEventListener('seeked', onSeeked);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = video!.videoWidth || 320;
            canvas.height = video!.videoHeight || 180;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve({ ok: false, message: 'no 2d context' });
            ctx.drawImage(video!, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve({ ok: true, dataUrl });
          } catch (e) {
            resolve({ ok: false, message: e instanceof Error ? e.message : String(e) });
          }
        }
        video.addEventListener('seeked', onSeeked, { once: true });
        try {
          video.muted = true;
          video.currentTime = t;
        } catch (e) {
          clearTimeout(timer);
          video.removeEventListener('seeked', onSeeked);
          resolve({ ok: false, message: `currentTime set failed: ${e instanceof Error ? e.message : String(e)}` });
        }
      });
    });
  },
});
