; ScriptWeaver NSIS 安装向导 — Windows 高分屏 DPI 适配
; 必须在任何窗口/控件创建前（.onInit/PREINIT）把进程标记为 DPI 感知，
; 否则 Windows 会对安装界面做位图拉伸（高分屏下整体模糊、字体有毛边）。
;
; 关键：SetProcessDPIAware() 只是「系统级」感知，在 125%/150% 缩放屏上
; 仍会被 DWM 整体放大 → 依旧糊。必须升到「每显示器感知 Per-Monitor v2」，
; 让安装向导按真实缩放比原生渲染。下面按能力从高到低回退。
!macro NSIS_HOOK_PREINIT
  ; 1) Per-Monitor v2（Win10 1607+）：多屏不同缩放下均原生渲染，最清晰
  System::Call 'user32::SetProcessDpiAwarenessContext(i -4)'
  ; 2) Per-Monitor（Win8.1+）：单屏高缩放下清晰
  System::Call 'SHCore::SetProcessDpiAwareness(i 2)'
  ; 3) 系统级（Win Vista+）兜底，至少避免 XP 式拉伸
  System::Call 'user32::SetProcessDPIAware()'
!macroend
