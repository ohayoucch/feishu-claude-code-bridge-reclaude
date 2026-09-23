/**
 * Reports the effort Claude Code actually applied to a run (after any
 * per-model downgrade) via a Stop hook, surfaced in the stream-json output by
 * `--include-hook-events`. `CLAUDE_EFFORT` is unset on models without effort
 * support, which yields no level.
 */
const MARKER = 'lark-channel-effort=';

const LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/** Extra `claude` args that install the probe for one run. */
export const EFFORT_PROBE_ARGS: readonly string[] = [
  '--include-hook-events',
  '--settings',
  JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: `echo "${MARKER}$CLAUDE_EFFORT"` }] }] },
  }),
];

/** Effort level from a Stop hook's stdout, or `undefined` when absent or unknown. */
export function parseEffortProbe(stdout: string | undefined): string | undefined {
  const line = stdout?.split(/\r?\n/).find((l) => l.startsWith(MARKER));
  const level = line?.slice(MARKER.length).trim();
  return level && LEVELS.has(level) ? level : undefined;
}
