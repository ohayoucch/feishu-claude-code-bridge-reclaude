import { effortLabel } from '../agent/efforts';
import type { RunState } from './run-state';

/**
 * Tag colors by strength, strongest first: model families run deep to light
 * through purples and blues, efforts hot to cold from red down to grey, so
 * the two tags read apart at a glance. Anything unlisted is neutral.
 */
const MODEL_COLORS: Record<string, string> = {
  Fable: 'purple',
  Opus: 'indigo',
  Sonnet: 'blue',
  Haiku: 'wathet',
};
const EFFORT_COLORS: Record<string, string> = {
  max: 'red',
  xhigh: 'orange',
  high: 'yellow',
  medium: 'lime',
  low: 'neutral',
};

/**
 * Reply footer naming the model and effort the run actually used. Cards show
 * them as `<text_tag>`s colored by strength; Feishu post markdown has no
 * colored tags, so posts get inline code "tags" instead. Empty when the model
 * is unknown.
 */
export function runMetaLine(
  state: Pick<RunState, 'model' | 'effort'>,
  { card = false }: { card?: boolean } = {},
): string {
  if (!state.model) return '';
  const tag = (text: string, color = 'neutral') =>
    card ? `<text_tag color='${color}'>${text}</text_tag>` : `\`${text}\``;
  const model = displayModel(state.model);
  const parts = [tag(model, MODEL_COLORS[model.split(' ')[0] ?? ''])];
  // Only Claude reports an effort (see agent/claude/effort-probe.ts).
  if (state.effort) parts.push(tag(effortLabel('claude', state.effort), EFFORT_COLORS[state.effort]));
  return parts.join(' ');
}

/** `claude-opus-5-5[1m]` → `Opus 5.5`; ids of any other shape are shown as-is. */
export function displayModel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+(?:-\d{1,2})?)(?:-\d{8})?(?:\[[^\]]*\])?$/.exec(id);
  const family = m?.[1];
  const version = m?.[2];
  if (!family || !version) return id;
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version.replace('-', '.')}`;
}
