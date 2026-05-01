import { Link } from 'react-router-dom';

export default function Help() {
  return (
    <div className="space-y-6">
      <section className="koko-card p-6 space-y-4">
        <h1 className="text-2xl font-display font-semibold">How to use kokocastles</h1>
        <p className="text-sm text-slate-600">
          kokocastles is a bring-your-own-keys app. Your API keys live exclusively in your
          browser's localStorage and are never sent to our server. The Settings page has a single
          <em> LLM API key</em> field — paste a key from Anthropic, OpenAI, or Google Gemini and the
          app auto-detects the provider from the key's prefix.
        </p>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Anthropic (Claude) API key</h2>
        <p className="text-sm text-slate-600">
          Get yours at{' '}
          <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
            console.anthropic.com
          </a>
          .
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
          <li>Sign up or log in.</li>
          <li>Open <strong>API Keys</strong> in the sidebar.</li>
          <li>Click <strong>Create Key</strong>, name it anything.</li>
          <li>Copy the key (starts with <code>sk-ant-</code>) and paste it into Settings.</li>
        </ol>
        <p className="text-sm text-slate-600">
          <strong>Cost:</strong> pay-per-token. Eco tier uses Haiku — the cheapest model. Max tier
          uses Opus for synthesis only.
        </p>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">OpenAI API key</h2>
        <p className="text-sm text-slate-600">
          Get yours at{' '}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
            platform.openai.com/api-keys
          </a>
          .
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
          <li>Sign up or log in.</li>
          <li>Add a payment method (OpenAI requires prepaid credits).</li>
          <li>Click <strong>Create new secret key</strong>.</li>
          <li>Copy the key (starts with <code>sk-</code> or <code>sk-proj-</code>) and paste it into Settings.</li>
        </ol>
        <p className="text-sm text-slate-600">
          <strong>Cost:</strong> pay-per-token. Eco tier uses GPT-5.4 nano (cheapest); Max tier uses
          full GPT-5.4 for synthesis.
        </p>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Google Gemini API key</h2>
        <p className="text-sm text-slate-600">
          Get yours at{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
            aistudio.google.com/apikey
          </a>
          .
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1">
          <li>Sign in with a Google account.</li>
          <li>Click <strong>Create API key</strong>.</li>
          <li>Copy the key (starts with <code>AIza</code>) and paste it into Settings.</li>
          <li>Settings will ask you to confirm "Gemini" — Gemini and YouTube keys share the same prefix.</li>
        </ol>
        <p className="text-sm text-slate-600">
          <strong>Cost:</strong> generous free tier on Flash; Pro is paid. Eco tier uses Flash Lite.
        </p>
      </section>

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">YouTube Data API key</h2>
        <p className="text-sm text-slate-600">
          Get yours at{' '}
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">
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

      <section className="koko-card p-6 space-y-4">
        <h2 className="text-lg font-display font-semibold">Tips</h2>
        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
          <li>Start in Eco tier to keep spend low while exploring.</li>
          <li>YouTube quota resets daily at midnight Pacific time.</li>
          <li>Switch providers any time by pasting a different key — the model tier maps automatically.</li>
        </ul>
      </section>

      <div>
        <Link to="/settings" className="koko-btn">Go to Settings</Link>
      </div>
    </div>
  );
}
