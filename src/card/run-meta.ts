import type { RunState } from './run-state';

/**
 * Reply footer naming the model and effort the run actually used, as inline
 * code "tags": the only tag-like styling that both Feishu post markdown and
 * card markdown render. Empty when the model is unknown.
 */
export function runMetaLine(state: Pick<RunState, 'model' | 'effort'>): string {
  if (!state.model) return '';
  return [displayModel(state.model), state.effort]
    .filter((part): part is string => Boolean(part))
    .map((part) => `\`${part}\``)
    .join(' ');
}

/** `claude-opus-5-5[1m]` → `Opus 5.5`; ids of any other shape are shown as-is. */
export function displayModel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+(?:-\d{1,2})?)(?:-\d{8})?(?:\[[^\]]*\])?$/.exec(id);
  const family = m?.[1];
  const version = m?.[2];
  if (!family || !version) return id;
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version.replace('-', '.')}`;
}
