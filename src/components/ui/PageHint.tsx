/**
 * 页面大白话提示条：在页面顶部用一句话告诉用户「这页是干嘛的、下一步做什么」。
 * 新手也能一眼看懂，不依赖任何术语。
 */
export default function PageHint({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-edge/10 bg-surface-1 px-4 py-2">
      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
        这页干嘛
      </span>
      <p className="min-w-0 text-[12px] leading-relaxed text-fg-subtle">
        <span className="font-medium text-fg">{title}：</span>
        {desc}
      </p>
    </div>
  )
}
