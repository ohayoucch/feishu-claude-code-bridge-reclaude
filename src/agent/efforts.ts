import type { AgentKind } from '../config/profile-schema';

/** Sentinel selection meaning "don't pass `--effort`" (see `DEFAULT_MODEL`). */
export const DEFAULT_EFFORT = 'default';

export interface EffortOption {
  /** Stored in `preferences.effort` and forwarded to the agent's `--effort`. */
  value: string;
  /** Human-facing label shown in the `/config` picker. */
  label: string;
}

/**
 * Claude Code `--effort` levels. The CLI lowers a level the model can't run
 * and ignores it on models without effort support, so every level is safe
 * to pass.
 */
const CLAUDE_EFFORTS: EffortOption[] = [
  { value: DEFAULT_EFFORT, label: '跟随默认（不指定）' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'xHigh' },
  { value: 'max', label: 'Max' },
];

/** Effort picker options for a profile's agent kind; empty when unsupported. */
export function supportedEfforts(agentKind: AgentKind): EffortOption[] {
  return agentKind === 'claude' ? CLAUDE_EFFORTS : [];
}

/** Coerce a stored effort into one of the current picker values. */
export function normalizeEffortSelection(
  agentKind: AgentKind,
  value: string | undefined,
): string {
  return value !== undefined && supportedEfforts(agentKind).some((e) => e.value === value)
    ? value
    : DEFAULT_EFFORT;
}

/** The `--effort` value to hand the agent, or `undefined` to omit the flag. */
export function resolveEffortArg(
  agentKind: AgentKind,
  value: string | undefined,
): string | undefined {
  const normalized = normalizeEffortSelection(agentKind, value);
  return normalized === DEFAULT_EFFORT ? undefined : normalized;
}

/** Picker label for a stored value, for display in the saved-config card. */
export function effortLabel(agentKind: AgentKind, value: string | undefined): string {
  const normalized = normalizeEffortSelection(agentKind, value);
  return supportedEfforts(agentKind).find((e) => e.value === normalized)?.label ?? normalized;
}
