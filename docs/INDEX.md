# 文档导航（ScriptWeaver）

> 这是 `docs/` 的总入口。新成员从 [入门指南](GETTING_STARTED.md) 开始。

## 按读者找文档

| 我是… | 该读 | 目的 |
|---|---|---|
| 第一次接触项目 | [../README.md](../README.md) → [GETTING_STARTED](GETTING_STARTED.md) | 5 秒了解是什么，15 分钟跑起来 |
| 要理解"为什么这样设计" | [ARCHITECTURE](ARCHITECTURE.md) | 主进程 / 渲染进程 / store / 数据模型 / 导出器 |
| 要对接 IPC / 扩展导出器 | [IPC_AND_EXPORT](IPC_AND_EXPORT.md) | 进程间接口、sw-asset 协议、.swproj 格式、Ren'Py 导出契约 |
| 准备提代码 | [CONTRIBUTING](CONTRIBUTING.md) | 分支、架构红线、测试、PR 流程 |
| 写 / 审文档的人 | [DOC_STANDARDS](DOC_STANDARDS.md) | 文档怎么写（house style） |

## 按 Divio 类型

- **Tutorial**：[GETTING_STARTED](GETTING_STARTED.md)
- **Explanation**：[ARCHITECTURE](ARCHITECTURE.md)
- **Reference**：[IPC_AND_EXPORT](IPC_AND_EXPORT.md)
- **How-to**：（待补 `how-to/`）
- **Process**：[CONTRIBUTING](CONTRIBUTING.md) · [DOC_STANDARDS](DOC_STANDARDS.md)

## 维护

- 任何文档改动随功能 PR 一起提交。
- 对安全 / 版本 / 弃用类内容设季度复核。
- 文档版本与软件版本对齐；破坏性变更先出迁移说明。
