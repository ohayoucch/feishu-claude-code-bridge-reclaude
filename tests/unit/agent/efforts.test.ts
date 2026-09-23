import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EFFORT,
  effortLabel,
  normalizeEffortSelection,
  resolveEffortArg,
  supportedEfforts,
} from '../../../src/agent/efforts.js';

describe('agent effort catalog', () => {
  it('offers the Claude Code levels led by the default sentinel, and none for Codex', () => {
    expect(supportedEfforts('claude').map((e) => e.value)).toEqual([
      DEFAULT_EFFORT,
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
    expect(supportedEfforts('codex')).toEqual([]);
  });

  it('resolves the --effort argument, omitting it for default, unknown and Codex values', () => {
    expect(resolveEffortArg('claude', 'xhigh')).toBe('xhigh');
    expect(resolveEffortArg('claude', DEFAULT_EFFORT)).toBeUndefined();
    expect(resolveEffortArg('claude', undefined)).toBeUndefined();
    expect(resolveEffortArg('claude', 'ultracode')).toBeUndefined();
    expect(resolveEffortArg('codex', 'high')).toBeUndefined();
  });

  it('normalizes and labels stored values for the picker', () => {
    expect(normalizeEffortSelection('claude', 'max')).toBe('max');
    expect(normalizeEffortSelection('claude', 'bogus')).toBe(DEFAULT_EFFORT);
    expect(effortLabel('claude', 'max')).toBe('max');
    expect(effortLabel('claude', undefined)).toContain('跟随默认');
  });
});
