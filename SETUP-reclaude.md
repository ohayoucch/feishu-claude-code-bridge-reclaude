# SETUP-reclaude.md —— 在你的机器上部署 `reclaude/0.7.1`

> **这份手册是写给 agent 看的**：把它连同本仓库一起交给你机器上的 AI，让它照着执行。
> 本分支 `reclaude/0.7.1` = 上游 `lark-coding-agent-bridge` **0.7.1** + 4 个补丁，
> 让飞书 bridge 的 daemon spawn **reclaude**（claude 兼容 wrapper）而不是真 `claude`。
> 相对 `reclaude/0.7.0`：合入上游 0.7.1（`@larksuite/channel` 升 0.6.0，会议 bot 改用 SDK 公开事件订阅）、
> 模型选择器加入 Fable 5.1 / Opus 5、COT 过程消息按飞书 4096 字节上限截断。配置与 plist 均无变化。

---

## ⛔ 开始之前，先记住一件事

**不要执行 `npm i -g lark-channel-bridge`。**

上游 README（本仓库的 `README.md` / `README.zh.md` 原样保留）里写的是这条 npm 安装命令。
那装的是**上游包**，本分支的 4 个补丁一个都没有。装完 bot 照样能收发消息，
只是 **reclaude 永远不会被 spawn** —— 静默失败，从表面看不出来。

本分支**只能 clone 后自行 build**（`build` 脚本依赖 pnpm，`npm i -g git+...` 在没装 pnpm 的机器上会失败）。

---

## 这 4 个补丁是什么

上游只在**探测期**读 `LARK_CHANNEL_CLAUDE_BIN`，**运行期**写死 `new ClaudeAdapter({ larkChannel })`，
且 launchd plist 只透传 `PATH` + `LARK_CHANNEL_HOME` —— 所以 wrapper 被探测到却不会被真正 spawn。

| # | 文件 | 作用 |
|---|---|---|
| 1 | `src/runtime/agent-runtime.ts` | 把 `LARK_CHANNEL_CLAUDE_BIN` 透传进 `ClaudeAdapter` 的 `binary` |
| 2 | `src/daemon/launchd.ts` | 把 `LARK_CHANNEL_CLAUDE_BIN` 烤进 plist 的 `EnvironmentVariables` |
| 3 | `src/runtime/supervisor.ts` + `src/bot/channel.ts` + `src/commands/index.ts` | keepalive 强制重连时降级 agent 预检，不因预检抖动而断线 |
| 4 | `src/agent/models.ts` | 模型选择器加入 Fable 5.1 / Fable 5 / Opus 5 |

补丁 1 是可选开关：**不设 `LARK_CHANNEL_CLAUDE_BIN` 就自动退回原生 `claude`**，不装 reclaude 也能用。

### ⚠️ 平台限制
补丁 2 **只覆盖 macOS（launchd）**。`src/daemon/systemd.ts`（Linux）和 `src/daemon/schtasks.ts`（Windows）
没有透传这个变量 —— 在 Linux / Windows 上以 daemon 方式运行时**拿不到 reclaude**。
这两个平台目前只能用前台 `run`（自己 export 环境变量），或自行给对应 unit 文件加环境变量。

---

## 0. 先判断走哪条路

```bash
ls ~/.lark-channel/config.json 2>/dev/null && echo "→ 已有部署，走【B. 升级】" || echo "→ 全新，走【A. 全新安装】"
```

两条路都需要的前提，逐条**验证**，不要假设：

```bash
node -v                    # 需 >= 20.12.0
pnpm -v                    # 必需；没有就 npm i -g pnpm（或 corepack enable pnpm）
which reclaude             # 要用 reclaude 就必须能出路径（通常 ~/.local/bin/reclaude）
```

`which reclaude` 出不来就先装 reclaude，或者接受退回原生 `claude`（功能正常，只是没有 wrapper）。

> **飞书 app 唯一性**：同一个飞书 app 不能同时有两个 daemon 保持长连接，会互相抢消息、丢消息。
> 如果这台机器是要**替换**某个 app 的旧部署，没问题；要和别处**并存**，请先在飞书开放平台另建一个 PersonalAgent 应用。

---

## A. 全新安装

### A1. 取代码并 build

```bash
NEW=~/projects/lark-bridge-reclaude          # 路径任选，但不要有空格；start 之后不要再移动它
git clone -b reclaude/0.7.1 \
  https://github.com/ohayoucch/feishu-claude-code-bridge-reclaude.git "$NEW"
cd "$NEW"
pnpm install                                  # 会自动触发 prepare → build
```

中国网络加镜像：

```bash
export NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
pnpm install --registry=https://registry.npmmirror.com
```

验证补丁确实进了 bundle：

```bash
grep -c LARK_CHANNEL_CLAUDE_BIN dist/cli.js   # 应 >= 4；为 0 说明 build 没成功或 clone 错了分支
```

### A2. 首次运行（扫码授权）

```bash
node dist/cli.js run
```

终端会渲染二维码 → 用飞书 App 扫 → 选择或创建 PersonalAgent 应用 → 按提示选 agent。
成功后配置写入 `~/.lark-channel/config.json`。

已经有 app 的话可以跳过建应用流程（会提示输入 App Secret）：

```bash
node dist/cli.js run --app-id cli_xxxxxxxx    # 国际版 Lark 加 --tenant lark
```

**在飞书里给 bot 发一条消息确认能收发**，然后 `Ctrl-C` 停掉前台进程。

### A3. 转后台 daemon

```bash
export LARK_CHANNEL_CLAUDE_BIN=reclaude       # ← 关键！不设则 plist 不带它 → 退回真 claude
node dist/cli.js start
```

跳到 **【C. 验收】**。

---

## B. 从 `reclaude/0.2.2` 或 `reclaude/0.7.0` 升级

好消息：两个起点都是**就地升级**，不需要 `migrate`，不需要重新扫码。

| | 0.2.2 | 0.7.0 | 0.7.1 |
|---|---|---|---|
| `config.json` 的 `schemaVersion` | 2 | 2 | 2（不变） |
| launchd plist label | `ai.lark-channel-bridge.bot.<profile>` | 不变 | 不变 |
| profile 配置字段 | — | **新增** `mode`、`meeting` | 无变化 |

所以旧 plist 不用删、旧 config 不用动。

### B0. 先摸清旧部署在哪

plist 和 `secrets-getter` 里都烤了旧 repo 的绝对路径，先读出来：

```bash
grep -o "[^']*dist/cli\.js" ~/.lark-channel/secrets-getter    # → 旧 repo 路径
OLD=$(grep -o "[^']*/dist/cli\.js" ~/.lark-channel/secrets-getter | sed 's#/dist/cli.js##')
echo "$OLD"
node "$OLD/dist/cli.js" status                                 # 确认旧 daemon 在跑
```

### B1. 备份

```bash
BAK=~/.lark-channel.bak-$(date +%Y%m%d)
cp -Rp ~/.lark-channel "$BAK" && echo "备份完成：$BAK"
```

### B2. 升级 —— 二选一

**方式一：原地升级（推荐）**，在旧 repo 目录直接切分支重建。plist 里的路径不变，因此
可以用 `restart`，**plist 不会被重写，reclaude 的环境变量自动保住**：

```bash
cd "$OLD"
# set-branches 是为了兼容当初用 --single-branch clone 的情况，否则 fetch 不到新分支
git remote set-branches --add origin reclaude/0.7.1
git fetch origin reclaude/0.7.1
git checkout reclaude/0.7.1
pnpm install                                   # 自动重新 build；依赖有更新，需联网（中国网络加 --registry）
grep -c LARK_CHANNEL_CLAUDE_BIN dist/cli.js    # 应 >= 4
node dist/cli.js restart
```

**方式二：clone 到新目录**。此时 plist 和 `secrets-getter` 都还指向旧 repo，
必须用 `start` 重写它们 —— 而 `start` 会按**当前 shell 的环境变量**重建 plist：

```bash
NEW=~/projects/lark-bridge-reclaude
git clone -b reclaude/0.7.1 \
  https://github.com/ohayoucch/feishu-claude-code-bridge-reclaude.git "$NEW"
cd "$NEW" && pnpm install
node "$OLD/dist/cli.js" stop                   # 先停旧的
export LARK_CHANNEL_CLAUDE_BIN=reclaude        # ← 必须！否则升级完悄悄退回真 claude
node dist/cli.js start                         # 重写 plist + 自愈 secrets-getter
```

---

## C. 验收

四步都要过，前三步是静态检查，第四步才能证明 reclaude 真的在跑。

```bash
# 1. plist 带上了 reclaude，且开机自启
P=~/Library/LaunchAgents/ai.lark-channel-bridge.bot.claude.plist
grep -A1 CLAUDE_BIN "$P"        # 应为 reclaude；没有这两行 = 补丁没生效或 start 时没 export
grep -A1 RunAtLoad "$P"         # 应为 true

# 2. secrets-getter 指向当前 repo（换过目录时尤其要看）
grep -o "[^']*dist/cli\.js" ~/.lark-channel/secrets-getter

# 3. daemon 在跑
node dist/cli.js status
```

**第 4 步：在飞书里给 bot 发一句话**（比如 `1+1`），然后看日志：

```bash
# 查最近两个日志文件：日志按 UTC+8 日期命名，可能和本机时区差一天
grep -h -m1 "同步配置" $(ls -t ~/.lark-channel/profiles/claude/logs/bridge-*.jsonl | head -2)
```

出现 `{"phase":"agent","event":"stderr",...,"line":"同步配置…"}` 即证明 spawn 的是 **reclaude**。
`同步配置` 是 reclaude 二进制独有的字符串，真 `claude` 里没有，可以自行对照：

```bash
grep -ac 同步配置 $(which reclaude)   # >= 1
grep -ac 同步配置 $(which claude)     # 0
```

grep 不到就是**退回了真 claude**：检查第 1 步的 plist，重新 `export` 后 `start`。

---

## 关键坑

1. **`start` / `restart` / 重启机器，三者行为不同**
   - `start` —— **会按当前 shell 的环境变量重写 plist**，所以执行前**必须** `export LARK_CHANNEL_CLAUDE_BIN=reclaude`
   - `restart` —— 走 `launchctl kickstart`（`src/daemon/service-adapter.ts:94`），**不重写 plist**，环境变量保留，可随便用
   - 关机 / 重启机器 —— launchd 按 `RunAtLoad` 读现成 plist 拉起，环境变量从文件取，**不用做任何事**
2. **别装上游 npm 包**（见文首）。
3. **plist 和 `secrets-getter` 都烤了 repo 绝对路径** —— `start` 之后不要移动或重命名 repo 目录；确实要移动就重新 `start`。
4. **同一个飞书 app 不能两个 daemon 并存**（见前提）。
5. **secrets keystore 不能跨机拷贝** —— 密钥是 `PBKDF2(hostname + username + salt)` 派生的（`src/config/keystore.ts`），
   把 `~/.lark-channel` 搬到另一台机器解不开 `secrets.enc`，新机器必须重新走扫码或重新输入 App Secret。
6. **Linux / Windows 的 daemon 拿不到 reclaude**（见平台限制）。

---

## 回滚

```bash
node dist/cli.js stop
rm -rf ~/.lark-channel && mv "$BAK" ~/.lark-channel     # 还原备份
cd "$OLD" && git checkout <升级前的分支> && pnpm install   # 回到旧分支重建，如 reclaude/0.7.0
node dist/cli.js start                                   # 注意先 export LARK_CHANNEL_CLAUDE_BIN
```

确认新版稳定之前，**不要删**备份 `$BAK`。
