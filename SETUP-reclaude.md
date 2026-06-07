# SETUP-reclaude.md —— 把已有旧 0.1.32 的 Mac 迁移到 0.2.2 + reclaude

> 给在另一台 Mac 上执行迁移的 agent 看的手册。本分支 `reclaude/0.2.2` =
> 上游 `lark-coding-agent-bridge` **0.2.2** + 2 个补丁，让飞书 bridge 的
> daemon spawn **reclaude**(claude 兼容 wrapper）而不是真 `claude`。
> 本手册描述的迁移流程已在一台同构 Mac 实测通过（2026-06-07）。

## 这两个补丁是什么（已 commit 在本分支）
上游 0.2.2 只在**探测期**读 `LARK_CHANNEL_CLAUDE_BIN`，**运行期**写死
`new ClaudeAdapter({ larkChannel })`，且 launchd plist 只透传 `PATH`+`LARK_CHANNEL_HOME`。
所以 wrapper 被探测到却不会被真正 spawn。补丁修这两处：
1. `src/cli/commands/start.ts` `createRuntimeAgent()` —— 把 `LARK_CHANNEL_CLAUDE_BIN` 透传进 `ClaudeAdapter` 的 `binary`
2. `src/daemon/launchd.ts` `buildPlist/writePlist` —— 把 `LARK_CHANNEL_CLAUDE_BIN` 烤进 plist 的 `EnvironmentVariables`

---

## 适用前提（先逐条验证，别假设）
- 该机**已经在跑旧 0.1.32**（旧 daemon + `~/.lark-channel` 是 v1 config）。全新装请走另一套流程，本手册是**迁移**。
- 该机**已装 reclaude**：`which reclaude` 能出路径（通常 `~/.local/bin/reclaude`）。出不来先装 reclaude。
- 中国网络：装依赖用 npmmirror（见下）。
- ⚠️ **飞书 app 唯一性**：确认该机 `~/.lark-channel/config.json` 里的 `appId` **没有被别的机器上的另一个 live daemon 同时占用**——同一个飞书 app 同时两个 daemon 长连接会互相抢、丢消息。若这台是要**替换**某个 app 的旧部署，OK；若想跟别处**并存**，请先换一个飞书 app。

---

## 0. 先摸清现状（不要硬编码路径，去发现）
```bash
which reclaude                                   # reclaude 在不在 PATH
ls ~/Library/LaunchAgents/ | grep -i lark        # 旧 plist 文件名（旧版通常 ai.lark-channel-bridge.bot.plist）
cat ~/.lark-channel/secrets-getter               # 这行的 cli.js 路径 = 旧 repo 位置，记下来 → 设 OLD=
node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.HOME+"/.lark-channel/config.json")).accounts?.app?.id || JSON.parse(require("fs").readFileSync(process.env.HOME+"/.lark-channel/config.json")).app?.id)'  # appId
```
从 `secrets-getter` 里读出旧 repo 路径，设成变量后续用：
```bash
OLD=/path/to/old/feishu-claude-code-bridge-reclaude    # ← 换成上一步看到的实际路径
node "$OLD/dist/cli.js" status                          # 确认旧 daemon 在跑
```

## 1. 取本分支并 build（China mirror）
```bash
# 放 /Users/Shared 下，避开某些 home 带特殊字符导致的 Claude Code 路径解析坑
NEW=/Users/Shared/projects-cc/lark-coding-agent-bridge-upstream
git -c http.version=HTTP/1.1 clone -b reclaude/0.2.2 \
  https://github.com/ohayoucch/feishu-claude-code-bridge-reclaude.git "$NEW"
cd "$NEW"
export NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
pnpm install --registry=https://registry.npmmirror.com   # 装依赖+自动 build
pnpm typecheck && pnpm build                              # 再确保 dist 最新
grep -c LARK_CHANNEL_CLAUDE_BIN dist/cli.js               # 应 ≥2（补丁进了 bundle）
```
要求：Node ≥20.12、pnpm（`packageManager` 指定 pnpm@10.x）。

## 2. 迁移（分阶段，每步验证，全程可回滚）

### Stage A —— 停旧 + 全备份
```bash
node "$OLD/dist/cli.js" stop                     # 停旧 daemon（必须停，否则下一步 migrate 会被 active-bridge 拦）
BAK=~/.lark-channel.bak-0.1.32-$(date +%Y%m%d)
cp -Rp ~/.lark-channel "$BAK"                     # 整目录备份 = 回滚点
for f in config.json secrets.enc .keystore.salt secrets-getter; do [ -e "$BAK/$f" ] && echo "✓ $f" || echo "✗ 缺 $f"; done
ls ~/Library/LaunchAgents/ai.lark-channel-bridge.bot.plist   # 旧 plist 先留着（失败可秒回滚）
```

### Stage B —— v1→v2 就地迁移
```bash
node dist/cli.js migrate                          # 就地把 ~/.lark-channel 升级成 v2 profile 布局
ls ~/.lark-channel/config.json.bak                # 迁移自带的旧 config 备份
ls ~/.lark-channel/profiles/claude/               # 应有 secrets.enc / sessions.json 等
node -e 'const c=require(process.env.HOME+"/.lark-channel/config.json");console.log("activeProfile:",c.activeProfile,"agentKind:",c.profiles?.[c.activeProfile]?.agentKind)'
```
> 若 migrate 报 “active bridge process blocks v2 migration”：确认旧 daemon 真停了，并删掉 `~/.lark-channel/processes.json` 里指向 live PID 的残留后重试。
> 注意 migrate 会把 `secrets.enc` 挪进 `profiles/claude/`；旧 `secrets-getter` 此刻仍指向旧 repo，**先别手动取 secret**，下一步 start 会自动自愈。

### Stage C —— 删旧 plist + 用 reclaude env 启新
新版 plist label 是 `ai.lark-channel-bridge.bot.claude`（**带 `.claude` 后缀，跟旧版不同文件**），两个都留着的话重启会双加载，所以删旧的：
```bash
launchctl bootout "gui/$(id -u)/ai.lark-channel-bridge.bot" 2>/dev/null
rm -f ~/Library/LaunchAgents/ai.lark-channel-bridge.bot.plist
export LARK_CHANNEL_CLAUDE_BIN=reclaude           # ← 关键！必须设，否则 plist 不带它 → 退回真 claude
node dist/cli.js start                            # 注册新 plist(烤入 env) + 自愈 getter + 连接
```

### Stage D —— 验收
```bash
# plist 检查
P=~/Library/LaunchAgents/ai.lark-channel-bridge.bot.claude.plist
grep -A1 CLAUDE_BIN "$P"                           # 应 = reclaude
grep -A1 RunAtLoad "$P"                            # 应 true（开机自启）
# getter 自愈检查（应指向新 repo）
grep -o "$(basename "$NEW")" ~/.lark-channel/secrets-getter
node dist/cli.js status                           # 应“正在后台运行”
```
然后**在飞书里给 bot 发一句**（如 `1+1`），看结构化日志确认 spawn 的是 reclaude：
```bash
JL=$(ls -t ~/.lark-channel/profiles/claude/logs/bridge-*.jsonl | head -1)
grep -E '"event":"spawn"|"event":"completed"|同步配置|Syncing config' "$JL" | tail -8
```
日志里出现 **`同步配置…`**（或英文 `Syncing config…`）即证明跑的是 **reclaude**——这是 reclaude 二进制独有字符串，真 claude 没有（可 `grep -ac 同步配置 $(which reclaude)` 对比验证，真 claude 命中 0）。

---

## 关键坑（今天踩过的，照抄即可避开）
1. **`start` vs `restart` vs 重启 Mac**：
   - **只有 `node dist/cli.js start` 会按当前 shell env 重写 plist** → start 前**必须** `export LARK_CHANNEL_CLAUDE_BIN=reclaude`。
   - `restart`（kickstart）**不重写 plist**，env 保留，**随便用**。
   - 关机/重启 Mac → launchd 读现成 plist（RunAtLoad）拉起，env 从文件取，**安全，什么都不用做**。
2. **China 网络**：install 必须带 `--registry=npmmirror` + `NODEJS_ORG_MIRROR`；git push/clone 报 HTTP2 就加 `-c http.version=HTTP/1.1`。
3. **同一飞书 app 不能两个 daemon 并存**（见前提）。
4. **secrets keystore**：密钥 = PBKDF2(hostname+username+salt)，同机同用户拷贝目录可解密；跨机不可直接搬密文。

## 回滚（迁移后若不对劲）
切换后 config 变 v2 + keystore 挪位 + getter 重指，**回滚 ≠ 直接重启旧 daemon**：
```bash
node dist/cli.js stop                              # 停新
rm -rf ~/.lark-channel && mv "$BAK" ~/.lark-channel # 还原 v1 全套
node "$OLD/dist/cli.js" start                       # 旧 repo 重新拉起（重建旧 plist + 旧 getter）
```
确认新版稳定前，**别删** 备份 `$BAK` 和旧 repo `$OLD`。
