import { useEffect, useState } from 'react';
import { storage } from '~/lib/storage';
import type { Persona } from '~/types';

const NICHE_MAX = 5000;
const CONTEXT_MAX = 5000;
const STYLE_MAX = 3000;

export default function PersonaRoute() {
  const [niche, setNiche] = useState('');
  const [context, setContext] = useState('');
  const [styleSample, setStyleSample] = useState('');
  const [attachedDatabankIds, setAttachedDatabankIds] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = storage.getPersona();
    setNiche(p.niche);
    setContext(p.context);
    setStyleSample(p.styleSample);
    setAttachedDatabankIds(p.attachedDatabankIds);
  }, []);

  async function save() {
    const p: Persona = { niche, context, styleSample, attachedDatabankIds };
    await storage.setPersona(p);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-xl font-display font-semibold">Persona</h1>
        <p className="text-sm text-slate-500">Share information about your brand to personalize analysis and script generation.</p>
      </header>

      <Card
        title="Content niche"
        badge="Research"
        badgeTone="sky"
        helpText="Describe your content niche. Used to personalize channel discovery and idea analysis."
        value={niche}
        onChange={setNiche}
        max={NICHE_MAX}
        labelId="persona-niche"
        ariaLabel="Content niche"
        placeholder="e.g. 'Generative AI product releases'"
      />

      <Card
        title="Brand context"
        badge="Scripting"
        badgeTone="pink"
        helpText="Describe your business or brand. The system injects this in all future scripts."
        value={context}
        onChange={setContext}
        max={CONTEXT_MAX}
        labelId="persona-context"
        ariaLabel="Brand context"
        placeholder="e.g. 'I'm a content creator for a startup called Kokocastles'"
      />

      <Card
        title="Writing style"
        badge="Scripting"
        badgeTone="pink"
        helpText="Provide a writing sample for the system to emulate. Don't include instructions — only a script you want to sound like."
        value={styleSample}
        onChange={setStyleSample}
        max={STYLE_MAX}
        labelId="persona-style"
        ariaLabel="Writing style"
        placeholder=""
      />

      <div className="flex items-center gap-3">
        <button onClick={save} className="koko-btn">Save</button>
        {saved ? <span className="text-sm text-koko-pink-deep font-medium">saved ✓</span> : null}
      </div>
    </div>
  );
}

interface CardProps {
  title: string;
  badge: string;
  badgeTone: 'sky' | 'pink';
  helpText: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  labelId: string;
  ariaLabel: string;
  placeholder: string;
}

function Card(props: CardProps) {
  const toneClass = props.badgeTone === 'sky'
    ? 'bg-koko-sky/40 text-slate-700'
    : 'bg-koko-pink/40 text-slate-700';
  return (
    <section className="koko-card p-5 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-display font-semibold">{props.title}</h2>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${toneClass}`}>{props.badge}</span>
      </header>
      <p className="text-xs text-slate-500">{props.helpText}</p>
      <textarea
        id={props.labelId}
        aria-label={props.ariaLabel}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        maxLength={props.max}
        placeholder={props.placeholder}
        className="w-full min-h-[140px] rounded-lg border border-sky-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-koko-sky-deep"
      />
      <div className="text-right text-xs text-slate-400">{props.value.length} / {props.max}</div>
    </section>
  );
}
