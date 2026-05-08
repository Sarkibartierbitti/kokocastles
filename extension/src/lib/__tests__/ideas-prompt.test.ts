import { describe, it, expect } from 'vitest';
import { ideasSchema } from '../prompts';

describe('ideasSchema', () => {
  it('accepts 8–12 well-formed ideas', () => {
    const ideas = Array.from({ length: 10 }, (_, i) => ({
      title: `Idea ${i + 1}`,
      rationale: 'because reasons',
      score: 0.5,
    }));
    expect(() => ideasSchema.parse({ ideas })).not.toThrow();
  });

  it('rejects empty list', () => {
    expect(() => ideasSchema.parse({ ideas: [] })).toThrow();
  });

  it('rejects scores outside 0..1', () => {
    expect(() =>
      ideasSchema.parse({
        ideas: [{ title: 'X', rationale: 'why', score: 1.5 }],
      })
    ).toThrow();
  });
});
