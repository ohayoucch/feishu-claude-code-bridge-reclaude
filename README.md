# lark-channel-bridge-reclaude

> **Fork of [zarazhangrui/feishu-claude-code-bridge](https://github.com/zarazhangrui/feishu-claude-code-bridge)** with out-of-the-box support for the [reclaude](https://reclaude.ai) Anthropic auth proxy.
>
> Upstream PR: [#23](https://github.com/zarazhangrui/feishu-claude-code-bridge/pull/23). This fork will be archived once that merges.

A lightweight bot that bridges Feishu / Lark messenger with your local Claude Code — **routed through reclaude** so you skip the HTTPS_PROXY / CA-cert hell that breaks cc-connect / Claude-to-IM style tools. One command starts a daemon, scan a QR to bind a Lark app, runs at boot.

[中文 README](./README.zh.md) · [demo doc](https://larkcommunity.feishu.cn/docx/OaRIdFIRFoLM3xxTmKwcetHqn5e)

## Diff vs upstream

| Change | Upstream | This fork |
|---|---|---|
| Spawned binary | Hardcoded `claude` | `preferences.agent.binary` (any wrapper) |
| reclaude detection | ❌ | ✅ Wizard runs `which reclaude`; presets `agent.binary='reclaude'` if found |
| Config merge | Wizard wipes `preferences` | `persistEncrypted` deep-merges existing preferences, never clobbers hand-edited fields |

## What it does (inherited from upstream)

- Forwards Feishu / Lark messages (DM directly, or `@bot` in a group) to your local `claude` CLI, running in a working directory you control.
- **Streaming card**: Claude's text and tool calls update on a single Lark card in real time — no waiting for the final reply.
- **Per-chat sessions**: each chat keeps its own Claude session, so conversations resume where they left off.
- **Preempt + batch**: a new message interrupts the running run; rapid-fire messages get coalesced into one request.
- **Multiple workspaces**: `/ws` switches between named project directories, with sessions tracked per workspace.
- **Images and files**: send them to the bot directly — Claude reads the locally downloaded paths.
- **Interactive cards**: `/help`, `/ws list`, `/status` return cards with buttons you can click.

## Prerequisites

- macOS (launchd for daemon) or Linux (systemd)
- Node.js **>= 20**
- **reclaude installed and logged in** — see https://reclaude.ai (verify with `reclaude status` showing `daemon_running: true`)
- The real `claude` CLI installed (reclaude execs it automatically) — see https://docs.anthropic.com/en/docs/claude-code/quickstart

## Install & run (4 steps)

```bash
# 1. clone
git clone https://github.com/ohayoucch/feishu-claude-code-bridge-reclaude.git
cd feishu-claude-code-bridge-reclaude

# 2. install + build
npm install
npm run build

# 3. first run (foreground + QR scan + auto-detect reclaude)
node dist/cli.js run
# Terminal renders a QR → scan it with the Feishu app → pick / create a PersonalAgent
# → credentials land in ~/.lark-channel/config.json. If reclaude is on PATH you'll see:
# "Wrapper: 检测到 reclaude，已预设 preferences.agent.binary"
# Ctrl+C once you see "ws client ready" and the bot name.

# 4. install as boot-time daemon
node dist/cli.js start
# Drops a launchd plist (~/Library/LaunchAgents/ai.lark-channel-bridge.bot.plist).
# Auto-starts at login, restarts if it crashes, survives terminal close / reboot.
```

Daily use: just DM the bot in Feishu, or invite it to a group and `@`-mention it.

## Don't use reclaude?

You can. **reclaude is optional**:
- reclaude installed → wizard presets it, bridge spawns it
- reclaude missing → wizard skips, bridge spawns plain `claude`
- installed but don't want to use → delete `preferences.agent.binary` from `~/.lark-channel/config.json`

Bridge isn't reclaude-specific — `agent.binary` accepts any claude-compatible wrapper (absolute path or PATH-resolvable name).

## Commands

### Host CLI

> Commands below assume running from source with `node dist/cli.js`. If you `npm install -g .` it globally, replace `node dist/cli.js` with `lark-channel-bridge-reclaude` in every line.

**Process-level** (run the bridge directly in your shell):

```
node dist/cli.js run [-c <config>]     Run the bot in the foreground
node dist/cli.js ps                    List all running bridge processes on this machine
node dist/cli.js kill <id|#>           Kill a bridge process (SIGTERM, SIGKILL after 2s)
node dist/cli.js --help                List all commands
```

**Service-level** (run the bridge as a background OS-managed daemon):

> ⚠️ The daemon's launchd plist / systemd unit hard-codes the path to `dist/cli.js`. Don't move the repo after running `start` — if you do, run `unregister` first, move, then `start` again to regenerate the plist.

```
node dist/cli.js start                 Install (if needed) and start the daemon
node dist/cli.js stop                  Stop the daemon and disable autostart
node dist/cli.js restart               Restart the daemon in place
node dist/cli.js status                Show daemon status (pid, log paths, last exit)
node dist/cli.js unregister            Remove the service definition and stop
```

The daemon auto-restarts on crash and on user login. Platform mapping:
- **macOS** → `launchd` user agent at `~/Library/LaunchAgents/ai.lark-channel-bridge.bot.plist`
- **Linux** → `systemd` user unit at `~/.config/systemd/user/lark-channel-bridge.bot.service`. For the daemon to survive logout, run `loginctl enable-linger $USER` once.
- **Windows** → Task Scheduler task `LarkChannelBridge.Bot`, triggered ONLOGON. Launcher script at `~/.lark-channel/daemon-launcher.cmd`.

Daemon logs go to `~/.lark-channel/logs/daemon-stdout.log` and `daemon-stderr.log` alongside the bridge's per-day structured logs.

> When the same app is started multiple times, Lark's open platform routes events to one of the live WebSocket connections at random. `run` detects existing processes for the same app and (in a TTY) prompts: `[c]ontinue / [k]ill old / [a]bort`. In non-TTY mode it warns and continues.

### Slash commands inside Feishu / Lark

| Command | Effect |
|---|---|
| `/new`, `/reset` | Clear the current chat's session |
| `/cd <path>` | Switch working directory (resets session) |
| `/ws list` | List named workspaces (card + buttons) |
| `/ws save <name>` | Save current cwd as a named workspace |
| `/ws use <name>` | Switch to a named workspace |
| `/ws remove <name>` | Delete a named workspace |
| `/status` | Current cwd / session / agent (card + buttons) |
| `/config` | Adjust preferences (reply style, tool-call display, ...) |
| `/stop` | Stop the run in progress (also the `⏹` button on the card) |
| `/timeout [N\|off\|default]` | Idle-watchdog (minutes) for the current session. `/config` sets the global default. See FAQ below. |
| `/ps` | List all `start` processes on this host, marking the one replying |
| `/exit <id\|#>` | Stop a `start` process (your own → graceful; another's → SIGTERM) |
| `/reconnect` | Force a WebSocket reconnect (use when the bot stops responding after a network blip) |
| `/doctor [description]` | Feed recent logs and your description back to Claude for self-diagnosis |
| `/help` | Help card |
| Any other `/xxx` | Forwarded verbatim to Claude |

**Reply policy**: in a DM, the bot replies to anything. In a **group (including topic groups), the bot only replies when `@`-mentioned** (default since 0.1.22); unmentioned messages are ignored. `@all` is never answered. Cloud-doc comments must mention the bot. To restore the older "always answer in groups" behaviour: `/config` → "Require @bot in groups" → No.

## Data directories

| Path | Content |
|---|---|
| `~/.lark-channel/config.json` | App credentials (App ID / Secret), mode 600 |
| `~/.lark-channel/sessions.json` | Claude session id + cwd per chat / topic (+ optional `/timeout` override) |
| `~/.lark-channel/workspaces.json` | Named-workspace map |
| `~/.lark-channel/processes.json` | Process registry for live `start` instances (used by `ps`/`stop`); dead PIDs are auto-pruned |
| `~/.lark-channel/media/<chatId>/` | Downloaded images / files, cleaned up after 24h |
| `~/.lark-channel/logs/YYYY-MM-DD.log` | Structured run logs (JSONL), rotated daily; older than 7 days are pruned at startup (`LARK_CHANNEL_LOG_DAYS` env var overrides). `/doctor` reads these. |

> Migrating from upstream `lark-channel-bridge`? Data directory `~/.lark-channel/` is fully compatible — just run `node dist/cli.js run` and existing config / sessions / workspaces are picked up as-is.

## Running through a wrapper binary (e.g. reclaude)

By default the bridge spawns `claude` (resolved via PATH). To swap in a **claude-compatible wrapper** — for example a local MITM auth proxy like [reclaude](https://reclaude.ai) — add this to `~/.lark-channel/config.json`:

```json
{
  "preferences": {
    "agent": {
      "binary": "reclaude"
    }
  }
}
```

Absolute paths work too: `"binary": "/Users/me/.local/bin/reclaude"`.

The bridge only spawns the binary with claude's standard flags (`-p`, `--output-format stream-json`, `--resume`, `--model`, `--permission-mode`, `--append-system-prompt`). The wrapper is responsible for injecting any env it needs (HTTPS_PROXY / NODE_EXTRA_CA_CERTS / ANTHROPIC_AUTH_TOKEN, etc.) before exec'ing the real claude — bridge stays out of that.

At startup `agent.isAvailable()` runs `<binary> --version`; the wrapper must exit 0 and accept claude's CLI args.

## Access control (optional)

Out of the box the bot is **open**: anyone who can find it can DM it, any group member can `@`-mention it to trigger a run, and commands like `/account` or `/cd` are usable by all. **That's fine for personal use** — but for a shared team setup, or anywhere you don't want strangers calling `/cd /`, you can tighten three allowlists by sending `/config` inside Feishu.

### Common scenarios

**Just me**

In the `/config` form:
- **Allowed users**: your own `open_id`
- Leave the other two blank

Messages from anyone else are silently dropped — no denial reply, since that would just confirm the bot exists to outsiders.

**A small team**

- **Allowed users**: comma-separated `open_id`s of team members
- Other two blank

**Bot only responds in specific work groups**

DMs are unaffected; only listed groups trigger responses:
- **Allowed chats**: comma-separated `chat_id`s of the groups
- DMs are **always** exempt from this list — so you can always DM the bot to change config later.

**Anyone can chat with the bot, but only I can change settings**

- **Admins**: your own `open_id`
- Other two blank

Others running `/account`, `/config`, `/exit`, `/reconnect`, `/doctor`, `/cd`, or `/ws` get a `❌ 此命令仅管理员可用` reply. Normal conversation (asking the bot to do things) is unaffected.

**Lock everything down**

Fill all three. The `/config` form catches common mistakes — e.g. if your admin list doesn't include yourself, or your chat allowlist doesn't include the chat you're submitting from, the submit is rejected with a message explaining why, so you can't accidentally lock yourself out.

### Finding `open_id` and `chat_id`

Easiest path: have the target user send the bot a message (or `@`-mention it in the target group), then in your terminal:

```bash
grep '"event":"enter"' ~/.lark-channel/logs/$(date +%Y-%m-%d).log | tail -5
```

Every line carries `chatId` (group or DM id) and `senderId` (the user's `open_id`). Copy them from there.

The Feishu open-platform "Get user info" API also works but needs the `contact:user` scope, which is overkill if you just need a couple of IDs.

### Worth knowing

- Changes take effect on the **next message** — no restart needed.
- An empty field means **unrestricted**, not "nobody allowed".
- To revert a restricted list back to fully open, clear that field in `/config` and submit.
- DMs are deliberately exempt from the chat allowlist — meaning if you ever accidentally restrict the bot out of every group, **DM the bot and send `/config`** to recover.

### Advanced: editing the config file directly

The `/config` form writes to `~/.lark-channel/config.json` under `preferences.access`:

```json
{
  "preferences": {
    "access": {
      "allowedUsers": ["ou_xxxxxxxxxxxxx"],
      "allowedChats": ["oc_xxxxxxxxxxxxx"],
      "admins":       ["ou_xxxxxxxxxxxxx"]
    }
  }
}
```

After a manual edit, **restart the bridge** or send **`/reconnect`** from any allowed chat to pick up the changes. The form is usually faster; direct edits make sense mostly for deployment scripts where you want to pre-seed access policy.

## FAQ

**The bot stays silent / Claude never replies.** Usually the `claude` CLI itself is not logged in, or the session points to a cwd that no longer exists. Send `/status` to inspect; `/new` to start a fresh session.

**Claude subprocess looks frozen (card stuck on the last frame).** Since 0.1.20 there's an idle watchdog: if Claude emits nothing for N minutes the process is killed and the card is annotated `⏱ N min no response, auto-terminated`. Disabled by default. Enable with `/config` (global, in minutes), or `/timeout 10` to set it on the current session; `/timeout off` disables for the session; `/timeout default` clears the session override.

**Claude says it can't see the image I sent.** Upgrade to the latest version — releases before 0.1.0 had a filename-dedup bug.

## License

[MIT](./LICENSE)
