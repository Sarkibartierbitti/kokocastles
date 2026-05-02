import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import HookPanel from '../components/HookPanel';
import MissingKeyBanner from '../components/MissingKeyBanner';
import StructurePanel from '../components/StructurePanel';
import { analyzeDeep, imageUrlToBase64 } from '../lib/llm/tasks';
import { getAdapter } from '../lib/platforms';
import type { DeepAnalysis, PlatformId, TranscriptSegment, Video } from '../types';

function platformVideoUrl(platform: PlatformId, videoId: string): string {
  switch (platform) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${videoId}`;
    case 'tiktok':
      return `https://www.tiktok.com/video/${videoId}`;
    case 'instagram':
      return `https://www.instagram.com/reel/${videoId}/`;
  }
}

export default function VideoAnalysis() {
  const { platform, videoId } = useParams<{ platform: PlatformId; videoId: string }>();
  const [video, setVideo] = useState<Video | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [transcriptErr, setTranscriptErr] = useState<string | null>(null);
  const [manualTranscript, setManualTranscript] = useState('');
  const [analysis, setAnalysis] = useState<DeepAnalysis | null>(null);
  const [speculative, setSpeculative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!platform || !videoId) return;
    let cancelled = false;
    const adapter = getAdapter(platform);
    adapter.videoDetails([videoId]).then((vs) => {
      if (!cancelled) setVideo(vs[0] ?? null);
    }).catch((e) => !cancelled && setErr(e instanceof Error ? e.message : String(e)));
    adapter.transcript(videoId)
      .then((tx) => !cancelled && setTranscript(tx))
      .catch((e) => !cancelled && setTranscriptErr(e instanceof Error ? e.message : String(e)));
    return () => { cancelled = true; };
  }, [platform, videoId]);

  async function run() {
    if (!video || !platform) return;
    setBusy(true);
    setErr(null);
    setSpeculative(false);
    try {
      const adapter = getAdapter(platform);
      const thumb = await imageUrlToBase64(adapter.thumbnail(video.videoId)).catch(() =>
        imageUrlToBase64(video.thumbnailUrl)
      );
      const tx: TranscriptSegment[] = transcript ?? (manualTranscript.trim()
        ? [{ start: 0, dur: 0, text: manualTranscript.trim() }]
        : []);
      const wasSpeculative = tx.length === 0;
      const r = await analyzeDeep(video, thumb, tx);
      setSpeculative(wasSpeculative);
      setAnalysis(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!video) {
    return <div className="koko-card p-6">{err ?? 'loading…'}</div>;
  }

  return (
    <div className="space-y-6">
      <MissingKeyBanner needs={['llm', 'youtube']} />
      <section className="koko-card p-5 grid sm:grid-cols-[16rem_1fr] gap-5">
        <a
          href={platformVideoUrl(video.platform, video.videoId)}
          target="_blank"
          rel="noreferrer"
          className="block"
          title="Open on platform"
        >
          <img src={video.thumbnailUrl} alt="" className="w-full rounded-xl ring-1 ring-sky-200" />
        </a>
        <div>
          <h2 className="text-lg font-display font-semibold">
            <a
              href={platformVideoUrl(video.platform, video.videoId)}
              target="_blank"
              rel="noreferrer"
              className="hover:text-koko-pink-deep underline-offset-2 hover:underline"
            >
              {video.title} ↗
            </a>
          </h2>
          <div className="text-sm text-slate-500 mt-1">
            {video.channelTitle} · {video.viewCount.toLocaleString()} views · {new Date(video.publishedAt).toLocaleDateString()}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={run} disabled={busy} className="koko-btn">
              {busy ? 'analyzing…' : analysis ? 're-analyze' : 'Analyze'}
            </button>
            {transcript == null && transcriptErr ? (
              <span className="text-xs text-amber-700">transcript unavailable — paste below</span>
            ) : null}
          </div>
          {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}
        </div>
      </section>

      {transcript == null && transcriptErr ? (
        <section className="koko-card p-5 space-y-2">
          <h3 className="font-display font-semibold">Paste transcript (fallback)</h3>
          {transcriptErr === 'VITE_PROXY_URL not configured' ? (
            <div className="text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-amber-700">Transcript proxy not configured — automatic fetch disabled.</p>
              <p>To enable it:</p>
              <ol className="list-decimal list-inside space-y-0.5 pl-1">
                <li>Deploy the worker: <code className="bg-slate-100 px-1 rounded">cd proxy &amp;&amp; npx wrangler deploy</code></li>
                <li>Copy the <code className="bg-slate-100 px-1 rounded">workers.dev</code> URL from the output.</li>
                <li>Create <code className="bg-slate-100 px-1 rounded">.env.local</code> at the repo root with:<br />
                  <code className="bg-slate-100 px-1 rounded">VITE_PROXY_URL=https://&lt;your-worker&gt;.workers.dev</code>
                </li>
                <li>Restart <code className="bg-slate-100 px-1 rounded">npm run dev</code>.</li>
              </ol>
              <p className="text-slate-400">Until then, paste the transcript manually below.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">{transcriptErr}</p>
          )}
          <textarea
            className="koko-input min-h-[8rem] font-mono text-xs"
            placeholder="paste captions / transcript here"
            value={manualTranscript}
            onChange={(e) => setManualTranscript(e.target.value)}
          />
        </section>
      ) : null}

      {analysis ? (
        <div className="grid lg:grid-cols-2 gap-5">
          <HookPanel hook={analysis.hook} speculative={speculative} />
          <StructurePanel analysis={analysis} speculative={speculative} />
        </div>
      ) : null}
    </div>
  );
}
