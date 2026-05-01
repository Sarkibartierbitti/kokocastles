import { Link } from 'react-router-dom';
import { storage } from '../lib/storage';

export type RequiredKey = 'llm' | 'youtube';

interface Props {
  needs: RequiredKey[];
}

export default function MissingKeyBanner({ needs }: Props) {
  const missing: RequiredKey[] = [];
  if (needs.includes('llm') && (!storage.getLLMKey() || !storage.getLLMProvider())) {
    missing.push('llm');
  }
  if (needs.includes('youtube') && !storage.getYoutubeKey()) {
    missing.push('youtube');
  }
  if (missing.length === 0) return null;

  const labels = missing.map((k) => (k === 'llm' ? 'LLM API' : 'YouTube Data API'));
  const summary =
    labels.length === 1
      ? `${labels[0]} key is missing.`
      : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]} keys are missing.`;

  return (
    <div className="mb-6 rounded-xl ring-1 ring-rose-200 bg-rose-50 p-4 flex items-start gap-3">
      <span aria-hidden className="text-rose-600 font-bold">!</span>
      <div className="flex-1">
        <p className="text-sm font-medium text-rose-900">{summary}</p>
        <p className="text-xs text-rose-800 mt-1">
          Analysis and data fetches won't work until keys are saved.{' '}
          <Link to="/settings" className="underline font-medium">Open Settings</Link>
          {' · '}
          <Link to="/help" className="underline font-medium">How to get keys</Link>
        </p>
      </div>
    </div>
  );
}
