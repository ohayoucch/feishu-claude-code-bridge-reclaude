import { describe, expect, it } from 'vitest';
import { configFormCard, configSavedCard, type ConfigFormOpts } from '../../../src/card/config-card';

const base: ConfigFormOpts = {
  agentKind: 'claude',
  mode: 'personal',
  model: 'default',
  effort: 'default',
  messageReply: 'markdown',
  showToolCalls: false,
  cotMessages: 'off',
  maxConcurrentRuns: 1,
  runIdleTimeoutMinutes: 0,
  requireMentionInGroup: false,
  larkCliIdentity: 'bot-only',
  allowedUsers: [],
  allowedChats: [],
  admins: [],
  knownChats: [],
};

describe('configFormCard console URL', () => {
  it('shows the web console URL when one is running', () => {
    const url = 'http://127.0.0.1:53219/?token=abc123';
    const card = configFormCard({ ...base, consoleUrl: url });
    expect(JSON.stringify(card)).toContain(url);
    expect(JSON.stringify(card)).toContain('Web 控制台');
  });

  it('omits the console section when no console is running', () => {
    const card = configFormCard(base);
    expect(JSON.stringify(card)).not.toContain('Web 控制台');
  });
});

describe('configFormCard effort picker', () => {
  it('offers the effort levels for Claude with the current selection preselected', () => {
    const json = JSON.stringify(configFormCard({ ...base, effort: 'xhigh' }));
    expect(json).toContain('"name":"effort"');
    expect(json).toContain('"initial_option":"xhigh"');
    expect(json).toContain('"value":"max"');
  });

  it('hides the effort picker for Codex', () => {
    const json = JSON.stringify(configFormCard({ ...base, agentKind: 'codex' }));
    expect(json).not.toContain('"name":"effort"');
  });

  it('shows the saved effort in the confirmation card', () => {
    expect(JSON.stringify(configSavedCard({ ...base, effort: 'max' }))).toContain('Effort 推理强度**:`Max`');
  });
});
