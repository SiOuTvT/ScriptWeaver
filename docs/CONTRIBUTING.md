# 贡献指南（ScriptWeaver）

> 面向：所有准备提交代码的贡献者。提交 PR 前请通读本文件。

## 分支与流程

1. 从 `main` 切功能分支：`feat/xxx`、`fix/xxx`、`chore/xxx`。
2. 本地自测通过（见下）后提 PR 到 `main`。
3. PR 需通过 CI（类型检查 + 单测 + 构建）；文档类改动同样需通过链接/格式检查。

## 工程红线（违反将被打回）

- **TypeScript 严格模式**：全仓库**零 `any`、零 `!` 非空断言**（现有审计确认全量达标）。新增代码不得破坏此纪律。
- **单一数据源**：所有可展示状态来自 `src/stores/appStore.ts`；派生态（`resolvedStates`）**只在同一个 `set` 内由 `reducer` 重算**，禁止在别处存派生态、禁止存陈旧派生。
- **纯函数边界**：`src/core/reducer.ts`、`src/utils/rpyExporter.ts`、`src/utils/aiDirector.ts` 的编排纯函数**不得 import Zustand store 或 React**，只读快照、无副作用；唯一的 I/O 边界（落盘 / 打包 / IPC）集中在末尾。
- **密钥 custody**：AI Key 等敏感数据**只存主进程** `userData/ai-config.json`；渲染进程永远拿不到明文。新增敏感能力放主进程，渲染端只发指令收结果。
- **资产访问**：一律经 `sw-asset://` 协议 + `resolveAssetSrc()`，**绝不**把图/音频 base64 内联进 store 或 DOM。
- **变量求值 / 代码生成**：所有"文件 / AI / 用户输入 → 内部状态 / 外部代码"的入口必须有**边界校验与降级**（这是历史严重问题的共性根因）。导出器须保证生成**语法正确**的 `.rpy`。
- **无死代码**：不留注释掉的废弃分支、无 `TODO`/`FIXME` 占位。

## 测试

```bash
npm run test        # Vitest 单元 / 逻辑（覆盖 src/**/__tests__）
npm run build       # tsc 严格类型检查 + vite build
```

- 纯函数（`reducer` / `rpyExporter` / `varRuntime` / `aiDirector`）务必补单测；**导出器必须有"语法正确性"单测**（非法变量名、特殊字符台词、所有转场名）。
- 每次 PR **必须** 跑通 `test` + `build`。

## 提交信息

约定式提交：`feat:` / `fix:` / `docs:` / `refactor:` / `chore:` + 简短描述。

## 文档义务

代码与文档同 PR 交付：

- 主进程 / 渲染进程 / store 改动 → 同步 [架构说明](ARCHITECTURE.md)。
- 新增 / 修改 IPC 通道、资产协议、导出契约 → 同步 [IPC 与导出参考](IPC_AND_EXPORT.md)。
- 破坏性变更 → PR 描述写明迁移步骤。
- 新人 onboarding 受影响 → 同步 [入门指南](GETTING_STARTED.md)。

## 安全自查（涉及求值 / 导出 / 加载时必做）

- 变量求值器（`varRuntime`）是否避免 `new Function` 执行未过滤表达式？接入 AI 生成表达式时尤其要 AST / 受限标识符求值。
- 导出器是否对标识符、显示名、台词换行做转义与校验？是否引用真实 Ren'Py 转场名？
- 加载 `.swproj` 时是否对 `LineDelta` 做 `normalizeDelta` 校验，避免缺字段直接崩？
- `deleteAsset` 等是否释放 `blobUrl`（防内存泄漏）？
