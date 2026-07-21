# 入门指南（ScriptWeaver）

> 面向：首次克隆仓库、要从零把应用跑起来的贡献者。预计 15 分钟内完成。

## 前置条件

- **Node.js** 18+（推荐 20+）
- **npm** 9+
- （仅打包 Windows 安装包时需要）Windows 环境 + `electron-builder` 依赖

## 步骤 1：克隆并安装

```bash
git clone <repo-url> && cd ScriptWeaver
npm install
```

## 步骤 2：启动开发环境

```bash
npm run dev
```

这条命令通过 `vite-plugin-electron` **同时** 拉起 Vite（渲染进程）与 Electron（主进程）。首次会下载 Electron 二进制，稍等片刻，应用窗口会自动弹出。

> 窗口右上角有开发工具；点窗口 X 默认**只隐藏到托盘**（进程常驻），从托盘菜单「退出」才真正关闭。

## 步骤 3：验证一切正常

```bash
npm run test        # Vitest 单元 / 逻辑测试（覆盖 src/**/__tests__）
```

构建产物校验：

```bash
npm run build        # tsc 类型检查 + vite build
```

## 步骤 4：打开 / 新建一个工程

- 启动后从菜单「打开工程」选择 `.swproj`，或「新建」开始创作。
- AI 功能：在应用内「AI 设置」填写 API Key——**密钥只存主进程安全区（`userData/ai-config.json`），界面与渲染进程永远看不到明文**。

## 步骤 5（可选）：打包发布包

```bash
npm run build:win     # → ScriptWeaver-0.5.0-x64.exe（安装包）
                       # → ScriptWeaver-0.5.0-x64.zip（绿色版）
                       # 自动更新索引 latest.yml 与增量块
```

跨平台用 `build:mac` / `build:linux` / `build:all`。

## 下一步

- 想理解主进程 / 渲染进程 / store / 导出器 → [架构说明](ARCHITECTURE.md)
- 想对接进程间接口或扩展导出器 → [IPC 与导出参考](IPC_AND_EXPORT.md)
- 准备提 PR → [贡献指南](CONTRIBUTING.md)
