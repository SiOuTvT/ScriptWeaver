// ── GitHub 链接集中管理 ──────────────────────────────────────────
// 改这一处即可全局生效。所有"社区反馈 / 帮助 / 关于"页面的 GitHub 入口均引用此常量。
//
// 仅收录当前仓库真实可用、已验证的入口：
//   repo / issues / 新建 Issue（反馈与建议统一走 Issues，仓库未开启 Discussions 与 Wiki）
// 不收录未启用的功能（Discussions、Wiki 当前 404/无效），避免跳转到错误页。
export const GITHUB_REPO = 'https://github.com/SiOuTvT/ScriptWeaver'

export const GITHUB_LINKS = {
  /** 仓库主页 */
  repo: GITHUB_REPO,
  /** Issues 列表 */
  issues: `${GITHUB_REPO}/issues`,
  /** 新建 Issue（Bug 反馈统一走这里，仓库未配置 Issue 模板，故不带 template 参数） */
  newBug: `${GITHUB_REPO}/issues/new?title=%5BBug%5D%20`,
  /** 新建 Issue（功能建议统一走这里） */
  newFeature: `${GITHUB_REPO}/issues/new?title=%5B%E5%8A%9F%E8%83%BD%E5%BB%BA%E8%AE%AE%5D%20`,
  /** Releases 版本发布 */
  releases: `${GITHUB_REPO}/releases`,
  /** 源代码（等同仓库主页） */
  source: GITHUB_REPO,
} as const

export type GitHubLinkKey = keyof typeof GITHUB_LINKS
