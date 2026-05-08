interface ComingSoonProps {
  kind: string;
  phase?: number;
  description?: string;
}

export default function ComingSoon({ kind, phase, description }: ComingSoonProps) {
  return (
    <div className="koko-card p-8 max-w-2xl mx-auto text-center space-y-3">
      <h1 className="text-xl font-display font-semibold capitalize">{kind}</h1>
      {phase !== undefined ? (
        <span className="inline-block px-3 py-1 rounded-full bg-koko-pink/40 text-slate-700 text-xs font-medium">
          Coming in phase {phase}
        </span>
      ) : null}
      <p className="text-sm text-slate-500">
        {description ?? `The ${kind} surface is scaffolded but not yet wired. Track progress in docs/superpowers/plans/.`}
      </p>
    </div>
  );
}
