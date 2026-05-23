# lark-channel-bridge-reclaude

Feishu / Lark ↔ local Claude Code, routed through [reclaude](https://reclaude.ai).

## Requirements

- macOS (launchd) or Linux (systemd)
- Node.js ≥ 20
- `reclaude` installed and `reclaude status` shows `daemon_running: true`
- `claude` CLI installed

## Install

```bash
git clone https://github.com/ohayoucch/feishu-claude-code-bridge-reclaude.git
cd feishu-claude-code-bridge-reclaude
npm install
npm run build

# 1. Foreground + QR-code wizard (required first time)
node dist/cli.js run
# QR renders in terminal → scan with Feishu app → pick/create a PersonalAgent
# → credentials land in ~/.lark-channel/config.json
# Ctrl+C once you see "ws client ready" + the bot name

# 2. Install as daemon (auto-start at login, auto-restart on crash)
node dist/cli.js start
```

DM the bot in Feishu, or invite it to a group and `@`-mention it.

## Daemon management

```bash
node dist/cli.js status      # state + log paths
node dist/cli.js restart     # restart
node dist/cli.js stop        # stop (keep plist)
node dist/cli.js unregister  # fully uninstall
```

## Settings

`~/.lark-channel/config.json` → `preferences.agent.binary`. The wizard auto-detects reclaude on PATH and presets `"reclaude"`. To use a different wrapper or fall back to `"claude"`, edit here and `restart`.

## Logs

```
~/.lark-channel/logs/daemon-stdout.log
~/.lark-channel/logs/daemon-stderr.log
~/.lark-channel/logs/YYYY-MM-DD.log   # structured daily
```

## Notes

- **Don't move the repo**: the daemon plist hardcodes `dist/cli.js` absolute path. To move: `unregister` → move → `start`.
- **From 2026-06-15 `claude -p` bills against an independent monthly pool**: Pro $20 / Max5x $100 / Max20x $200, doesn't roll over.

---

[中文](./README.zh.md) · Fork of [zarazhangrui/feishu-claude-code-bridge](https://github.com/zarazhangrui/feishu-claude-code-bridge) (upstream PR [#23](https://github.com/zarazhangrui/feishu-claude-code-bridge/pull/23); will be archived once merged) · MIT
