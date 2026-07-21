# ScriptWeaver

> 智能视觉小说（VN）编辑器——在可视化舞台上演角色、立绘、BGM 与分支剧情，一键导出可运行的 Ren'Py 工程。

**状态**：v0.5.0 · 已发布（提供 Windows 安装包与绿色版，支持自动更新）。

## Why This Exists

Galgame / 视觉小说创作门槛高：手写 Ren'Py 脚本要记语法、对坐标、调转场。ScriptWeaver 把"写剧本"变成"搭场景"——时间轴拖拽、立绘摆位、AI 导演自动打点，再导出标准 Ren'Py，让创作者专注故事本身。

## Quick Start

```bash
git clone <repo-url> && cd ScriptWeaver
npm install
npm run dev            # 启动 Vite + Electron 开发环境
```

构建发布包：

```bash
npm run build:win      # 产出 ScriptWeaver-0.5.0-x64.exe / .zip（自动更新索引 latest.yml）
```

## 核心概念

- **剧本行（`LineDelta`）**：对话行或选择支行，是编辑的基本单元。
- **角色（`CharacterConfig`）**：立绘表情、对话色、绑定 CV 音色。
- **素材（`AssetItem`）**：背景 / 立绘 / 音频，经 `sw-asset://` 协议按相对路径流式读取，二进制**不进内存**。
- **全局变量（`GlobalVariable`）**：导出为 Ren'Py `default`，驱动好感度与分支。
- **挂载特效（`MountedEffect`）**：时间轴上给立绘 / 背景挂转场与滤镜，闭环导出。
- **工程文件（`.swproj`）**：JSON 序列化项目，含剧本 / 角色 / 素材 / 变量。

## 技术栈

Electron 31 · React 18 · Vite · Zustand 4 · TypeScript（严格模式，**零 `any`、零 `!` 非空断言**）· Tailwind 3 · Ren'Py 代码生成。

## 文档导航

| 文档 | 用途 | 读者 |
|---|---|---|
| [架构说明](docs/ARCHITECTURE.md) | 主进程 / 渲染进程 / store / 数据模型 / 导出器 | 新成员 / 架构评审 |
| [入门指南](docs/GETTING_STARTED.md) | 从零跑起来的逐步教程 | 首次贡献者 |
| [IPC 与导出参考](docs/IPC_AND_EXPORT.md) | 进程间接口、sw-asset 协议、.swproj 格式、Ren'Py 导出契约 | 集成 / 扩展开发者 |
| [贡献指南](docs/CONTRIBUTING.md) | 分支、规范、测试、PR 流程 | 所有贡献者 |
| [文档规范](docs/DOC_STANDARDS.md) | 文档怎么写（团队 house style） | 所有贡献者 |

## License

见仓库根目录 `LICENSE`。
