import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../../src/agent/types.js';
import { renderCard } from '../../../src/card/run-renderer.js';
import { displayModel, runMetaLine } from '../../../src/card/run-meta.js';
import { initialState, markInterrupted, reduce } from '../../../src/card/run-state.js';
import { renderMarkdownCard, renderText } from '../../../src/card/text-renderer.js';

const stateFrom = (events: AgentEvent[]) => events.reduce(reduce, initialState);
const meta: AgentEvent[] = [
  { type: 'system', sessionId: 'sess-1', model: 'claude-opus-5-5[1m]' },
  { type: 'system', effort: 'max' },
];
const cardFooter =
  "<text_tag color='indigo'>Opus 5.5</text_tag> <text_tag color='red'>Max</text_tag>";

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
    expect(runMetaLine(state)).toBe('`Opus 5.5` `Max`');
    expect(runMetaLine(state, { card: true })).toBe(cardFooter);
    expect(runMetaLine({ model: 'claude-haiku-4-5' })).toBe('`Haiku 4.5`');
    expect(runMetaLine({ effort: 'max' })).toBe('');
  });

  it('colors card tags by model family and effort strength', () => {
    const tags = (model: string, effort?: string) =>
      runMetaLine({ model, effort }, { card: true }).match(/color='\w+'>[^<]+/g);
    expect(tags('claude-fable-5-1', 'max')).toEqual(["color='purple'>Fable 5.1", "color='red'>Max"]);
    expect(tags('claude-opus-5-5', 'xhigh')).toEqual(["color='indigo'>Opus 5.5", "color='orange'>xHigh"]);
    expect(tags('claude-sonnet-5', 'high')).toEqual(["color='blue'>Sonnet 5", "color='yellow'>High"]);
    expect(tags('claude-haiku-4-5', 'medium')).toEqual(["color='wathet'>Haiku 4.5", "color='lime'>Medium"]);
    expect(tags('claude-haiku-4-5', 'low')).toEqual(["color='wathet'>Haiku 4.5", "color='neutral'>Low"]);
    expect(tags('gpt-5-codex')).toEqual(["color='neutral'>gpt-5-codex"]);
  });

  it('appends the footer to finished replies with content only', () => {
    const answer: AgentEvent = { type: 'text', delta: 'answer' };
    const done: AgentEvent = { type: 'done', terminationReason: 'normal' };
    const finished = stateFrom([...meta, answer, done]);
    expect(renderText(finished)).toBe('answer\n\n`Opus 5.5` `Max`');
    expect(renderText(finished, { card: true })).toBe(`answer\n\n${cardFooter}`);
    expect(JSON.stringify(renderCard(finished))).toContain(cardFooter);

    const running = stateFrom([...meta, answer]);
    expect(renderText(running)).not.toContain('Opus 5.5');
    expect(renderText(markInterrupted(running))).not.toContain('Opus 5.5');
    expect(renderText(stateFrom([...meta, done]))).toBe('');
  });

  it('carries the colored footer into the plain markdown card, previewed by its opening text', () => {
    const done: AgentEvent = { type: 'done', terminationReason: 'normal' };
    expect(renderMarkdownCard(stateFrom([...meta, { type: 'text', delta: 'answer' }, done]))).toEqual({
      schema: '2.0',
      config: { summary: { content: 'answer `Opus 5.5` `Max`' } },
      body: { elements: [{ tag: 'markdown', content: `answer\n\n${cardFooter}` }] },
    });

    const long = stateFrom([...meta, { type: 'text', delta: 'x'.repeat(60) }, done]);
    expect(renderMarkdownCard(long)).toMatchObject({
      config: { summary: { content: `${'x'.repeat(49)}…` } },
    });
  });
});
