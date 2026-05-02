import { Link } from 'react-router-dom';
import { PROVIDERS } from '~/lib/llm/providers';

export default function Help() {
  return (
    <div className="space-y-6">
      <section className="koko-card p-6 space-y-4">
        <h1 className="text-2xl font-display font-semibold">How to use kokocastles</h1>
        <p className="text-sm text-slate-600">
          kokocastles is a bring-your-own-keys app. Your API keys live exclusively in your
          browser's localStorage and are never sent to our server. The Settings page has a single{' '}
          <em>LLM API key</em> field — paste a key from any of the {PROVIDERS.length} supported
          providers below and the app auto-detects the provider from the key's prefix where
          possible. Then pick a model from that provider's catalog.
        </p>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">LLM API key — pick any provider</h2>
        <p className="text-sm text-slate-600">
          Paste any of these keys into the LLM key field. Provider auto-detected from key prefix
          where unambiguous; otherwise pick from the dropdown.
        </p>
        <ul className="space-y-3">
          {PROVIDERS.map((p) => (
            <li key={p.id} className="border-t border-sky-100 pt-3 first:border-t-0 first:pt-0">
              <div className="font-semibold">{p.label}</div>
              <div className="text-xs text-slate-500">
                {p.apiStyle === 'anthropic-native'
                  ? 'Anthropic Messages API'
                  : p.apiStyle === 'gemini-native'
                  ? 'Google Gemini API'
                  : `OpenAI-compatible · ${p.baseURL}`}
                {' · '}
                {p.models.length} model{p.models.length === 1 ? '' : 's'}
              </div>
              <a
                className="text-sm text-sky-700 underline"
                href={p.consoleUrl}
                target="_blank"
                rel="noreferrer"
              >
                {p.consoleUrl}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">YouTube Data API key</h2>
        <p className="text-sm text-slate-600">
          Get yours at{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-700 underline"
          >
            console.cloud.google.com/apis/credentials
          </a>
          .
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
          <li>Create a Google Cloud project (or pick an existing one).</li>
          <li>Enable <strong>YouTube Data API v3</strong> in the API library.</li>
          <li>Go to <strong>Credentials → Create Credentials → API key</strong>.</li>
          <li>Paste it into the dedicated YouTube field in Settings (separate from the LLM key).</li>
        </ol>
        <p className="text-sm text-slate-600">
          <strong>Quota:</strong> free 10,000 units/day per Google Cloud project.
        </p>
        <div className="text-sm text-slate-600 space-y-1 border-t border-sky-100 pt-3">
          <p className="font-semibold">Optional: automatic transcript fetch</p>
          <p>
            Transcript fetching requires a small Cloudflare Worker (CORS bypass). Without it the
            app still works — you can paste a transcript manually on the video page.
          </p>
          <p>To deploy the worker:</p>
          <ol className="list-decimal list-inside space-y-0.5 pl-1">
            <li>Run <code className="bg-slate-100 px-1 rounded">cd proxy &amp;&amp; npx wrangler deploy</code></li>
            <li>Copy the <code className="bg-slate-100 px-1 rounded">workers.dev</code> URL from the output.</li>
            <li>Create <code className="bg-slate-100 px-1 rounded">.env.local</code> at the repo root with:<br />
              <code className="bg-slate-100 px-1 rounded">VITE_PROXY_URL=https://&lt;your-worker&gt;.workers.dev</code>
            </li>
            <li>Restart <code className="bg-slate-100 px-1 rounded">npm run dev</code>.</li>
          </ol>
        </div>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Privacy</h2>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
          <li>Keys are stored only in your browser's localStorage on this device.</li>
          <li>No backend account, no sync, no telemetry.</li>
          <li>API calls go directly from your browser to the provider.</li>
          <li>Clearing your browser data removes the keys.</li>
        </ul>
      </section>

      <section className="koko-card p-6 space-y-3">
        <h2 className="text-lg font-display font-semibold">Sidebar on right side</h2>
        <p className="text-sm text-slate-600">
          Firefox controls sidebar position globally — extensions cannot force it. To move
          the kokocastles sidebar to the right edge of the window:
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
          <li>Right-click anywhere on the sidebar header</li>
          <li>Click <strong>Move Sidebar to Right</strong></li>
        </ol>
        <p className="text-xs text-slate-500">
          Available in Firefox 106+. The setting persists across browser restarts.
        </p>
      </section>

      <section className="koko-card p-6 space-y-3">
        <h2 className="text-lg font-display font-semibold">Active-tab integration</h2>
        <p className="text-sm text-slate-600">
          When you're on a YouTube channel page (e.g. <code>youtube.com/@MrBeast</code>) or
          a search results page, the sidebar shows an "active tab" card. Clicking the
          button scrapes the page from your residential IP — no YouTube Data API quota
          burned, works without an API key.
        </p>
        <p className="text-sm text-slate-600">
          Inside a Channel route, when the same channel is also open in another browser
          tab, a <strong>"Refresh from active tab"</strong> button appears next to "Triage hooks".
          Use it to re-pull uploads quota-free.
        </p>
      </section>

      <section className="koko-card p-6 space-y-3">
        <h2 className="text-lg font-display font-semibold">Activity panel</h2>
        <p className="text-sm text-slate-600">
          The bar pinned at the bottom of the sidebar tracks every LLM call: provider,
          model, in-flight status, estimated cost (when pricing is known). Click to
          expand. Persists last 50 calls across reloads.
        </p>
      </section>

      <div>
        <Link to="/settings" className="koko-btn">Go to Settings</Link>
      </div>
    </div>
  );
}
