# ScriptWeaver 项目长期记忆

## 环境约束（重要运营事实）
- **Agent 会话隔离**：WorkBuddy 的 Bash / 后台任务运行在独立的会话 + 网络命名空间里。
  - 由 Agent 启动的 GUI（如 Electron `npm run dev` 弹出的窗口）渲染在用户**看不到**的会话中（explorer/dwm 虽在 Console 1，但 agent 起的 GUI 不可见）。
  - 后台 dev server 绑定的 `localhost`（如 vite 5173）处于容器命名空间，**用户本机浏览器连不到**（宿主侧 curl 直接 connection-refused，exit 7）；沙箱内 curl 也因命名空间隔离拿 000。
- **结论 / 规范**：任何「启动运行窗口供用户验收」的需求，**不要**试图由 Agent 弹出 Electron 窗口或预览 localhost——用户看不到也连不上。正确做法：把启动交还用户本机终端（`cd D:\ScriptWeaver && npm run dev`），Agent 只负责把磁盘状态准备好（清 userData 白板 / 升版本号 / 跑通 tsc+测试）。
- `browser-use` CLI 在本环境未安装（不可用）；Playwright 曾用过（`_pw_*.png`）但非当前依赖。

## 封包铁律（用户 0.6.0 指令）
1. 打包前必须白板归零：清 Electron `userData`（`%APPDATA%/scriptweaver` 全量，含 `session-assets/`、`Local Storage/` 即 DRAFT_KEY 草稿、各类缓存；保留 `ai-config.json` 用户密钥）、清仓库临时物（`_*.txt`/`_npm*.log`/`_tsc*.txt`/`dev_*.log`/`_pw_*.png`/`dist`/`dist-electron`/`screenshots`/`shots`），保留 `src/assets/rb3/node_modules`。
2. **先运行窗口验收，后打包**：严禁直接 final build，等用户回复「OK」才 `build:win`。
3. 验收后写面向用户 Release Notes：禁技术黑话（tsc/重构文件/修复报错）、Markdown 严格校验（避路径单引号/转义导致排版崩塌）。

## 技术栈与持久化
- React18 + Electron31 + Zustand4 + Tailwind v3 + lucide-react；Ren'Py Codegen 可视化 Galgame 引擎。未引入 framer/gsap。
- 渲染端经 `window.electronAPI`（preload 注入）调 IPC；大量调用带 web 降级兜底（`if (!api) return` / Blob 下载），故纯浏览器可渲染 UI（文件导入导出需真实 Electron）。
- 草稿自动存 `localStorage[DRAFT_KEY]`（draftStorage.ts）→ 不清则打开带测试工程。
- 真实 AI 密钥在主进程 `userData/ai-config.json`（Electron 模式走主进程，不进渲染端）。
