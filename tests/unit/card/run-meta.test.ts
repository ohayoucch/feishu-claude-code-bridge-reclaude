import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../../src/agent/types.js';
import { renderCard } from '../../../src/card/run-renderer.js';
import { displayModel, runMetaLine } from '../../../src/card/run-meta.js';
import { initialState, markInterrupted, reduce } from '../../../src/card/run-state.js';
import { renderText } from '../../../src/card/text-renderer.js';

const stateFrom = (events: AgentEvent[]) => events.reduce(reduce, initialState);
const meta: AgentEvent[] = [
  { type: 'system', sessionId: 'sess-1', model: 'claude-opus-5-5[1m]' },
  { type: 'system', effort: 'max' },
];

describe('reply footer', () => {
  it('names Claude model ids by family and version, leaving other ids as-is', () => {
    expect(displayModel('claude-opus-5-5[1m]')).toBe('Opus 5.5');
    expect(displayModel('claude-fable-5-1')).toBe('Fable 5.1');
    expect(displayModel('claude-opus-5')).toBe('Opus 5');
    expect(displayModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
    expect(displayModel('claude-sonnet-4-20250514')).toBe('Sonnet 4');
    expect(displayModel('gpt-5-codex')).toBe('gpt-5-codex');
  });

  it('collects model and effort from system events', () => {
    const state = stateFrom(meta);
    expect(state).toMatchObject({ model: 'claude-opus-5-5[1m]', effort: 'max' });
    expect(runMetaLine(state)).toBe('`Opus 5.5` `max`');
    expect(runMetaLine({ model: 'claude-haiku-4-5' })).toBe('`Haiku 4.5`');
    expect(runMetaLine({ effort: 'max' })).toBe('');
  });

  it('appends the footer to finished replies with content only', () => {
    const answer: AgentEvent = { type: 'text', delta: 'answer' };
    const done: AgentEvent = { type: 'done', terminationReason: 'normal' };
    const finished = stateFrom([...meta, answer, done]);
    expect(renderText(finished)).toBe('answer\n\n`Opus 5.5` `max`');
    expect(JSON.stringify(renderCard(finished))).toContain('`Opus 5.5` `max`');

    const running = stateFrom([...meta, answer]);
    expect(renderText(running)).not.toContain('Opus 5.5');
    expect(renderText(markInterrupted(running))).not.toContain('Opus 5.5');
    expect(renderText(stateFrom([...meta, done]))).toBe('');
  });
});
