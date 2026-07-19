; ScriptWeaver NSIS 安装向导 — Windows 高分屏 DPI 适配
; 在安装/卸载初始化前将进程标记为 DPI 感知，
; 阻止 Windows 对安装界面做位图拉伸（否则高分屏下模糊、字体有毛边）。
!macro NSIS_HOOK_PREINIT
  System::Call 'user32::SetProcessDPIAware()'
!macroend
