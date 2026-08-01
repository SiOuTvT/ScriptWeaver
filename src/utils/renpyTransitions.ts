/**
 * Ren'Py 内建过渡（with <transition>）到预览动画的映射。
 *
 * 导入 .rpy 工程时，scene / show 语句上的 with 子句会被解析并保留到
 * background.transition / CharacterDelta.transition；本模块负责把这些官方过渡名
 * 还原成舞台预览中真实播放的动画类（定义在 src/index.css 的 sw-tr-* 规则）。
 *
 * 命名与语义严格对齐 Ren'Py 官方 Transitions 文档：
 *  · wipe 系列按「擦除动作的行进方向」命名，wipeleft 即由右向左揭开新画面；
 *  · push / slide 系列按「旧画面被推走的方向」命名，pushleft 表示旧画面向左退出，
 *    因此新画面是从右侧进入的；
 *  · moveout / slideaway 等以旧画面退出为主体的过渡，在只呈现新画面的预览语境下
 *    退化为溶解，避免做出与引擎相反的位移。
 */

/** 过渡名（小写基名）→ 预览动画类 */
const TRANSITION_CLASS: Record<string, string> = {
  // 溶解与淡入淡出
  dissolve: 'sw-tr-dissolve',
  fade: 'sw-tr-fade',
  ease: 'sw-tr-dissolve',
  easein: 'sw-tr-dissolve',
  easeout: 'sw-tr-dissolve',

  // 像素化 / 方块
  pixellate: 'sw-tr-pixellate',
  squares: 'sw-tr-pixellate',

  // 位移入场：新画面自指定方向移入
  moveinleft: 'sw-tr-in-left',
  moveinright: 'sw-tr-in-right',
  moveintop: 'sw-tr-in-top',
  moveinbottom: 'sw-tr-in-bottom',
  easeinleft: 'sw-tr-in-left',
  easeinright: 'sw-tr-in-right',
  easeintop: 'sw-tr-in-top',
  easeinbottom: 'sw-tr-in-bottom',

  // 位移出场：主体是旧画面离开，预览中退化为溶解
  move: 'sw-tr-dissolve',
  moveoutleft: 'sw-tr-dissolve',
  moveoutright: 'sw-tr-dissolve',
  moveouttop: 'sw-tr-dissolve',
  moveoutbottom: 'sw-tr-dissolve',
  easeoutleft: 'sw-tr-dissolve',
  easeoutright: 'sw-tr-dissolve',
  easeouttop: 'sw-tr-dissolve',
  easeoutbottom: 'sw-tr-dissolve',
  zoomin: 'sw-tr-pixellate',
  zoomout: 'sw-tr-pixellate',
  zoominout: 'sw-tr-pixellate',

  // 擦除：按擦除行进方向揭开新画面
  wipeleft: 'sw-tr-wipe-left',
  wiperight: 'sw-tr-wipe-right',
  wipeup: 'sw-tr-wipe-up',
  wipedown: 'sw-tr-wipe-down',

  // 推入 / 滑入：命名取旧画面退出方向，故新画面自反向进入
  pushleft: 'sw-tr-in-right',
  pushright: 'sw-tr-in-left',
  pushup: 'sw-tr-in-bottom',
  pushdown: 'sw-tr-in-top',
  slideleft: 'sw-tr-in-right',
  slideright: 'sw-tr-in-left',
  slideup: 'sw-tr-in-bottom',
  slidedown: 'sw-tr-in-top',
  slideawayleft: 'sw-tr-dissolve',
  slideawayright: 'sw-tr-dissolve',
  slideawayup: 'sw-tr-dissolve',
  slideawaydown: 'sw-tr-dissolve',

  // 光圈
  irisin: 'sw-tr-iris',
  irisout: 'sw-tr-iris',
  circleirisin: 'sw-tr-iris',
  circleirisout: 'sw-tr-iris',

  // 震动
  hpunch: 'sw-tr-hpunch',
  vpunch: 'sw-tr-vpunch',

  // 百叶窗
  blinds: 'sw-tr-blinds',
}

/**
 * 退场方向的过渡类。
 * hide X with dissolve 在引擎里是「淡出后才消失」，预览若直接抹掉画面就与引擎不符，
 * 因此每个过渡都配一条时间反演的退场动画；出场方向的位移取「离开的方向」。
 */
const TRANSITION_OUT_CLASS: Record<string, string> = {
  dissolve: 'sw-tro-dissolve',
  fade: 'sw-tro-fade',
  ease: 'sw-tro-dissolve',
  easein: 'sw-tro-dissolve',
  easeout: 'sw-tro-dissolve',

  pixellate: 'sw-tro-pixellate',
  squares: 'sw-tro-pixellate',

  // 入场类过渡用于退场时，反向退出画面
  moveinleft: 'sw-tro-out-left',
  moveinright: 'sw-tro-out-right',
  moveintop: 'sw-tro-out-top',
  moveinbottom: 'sw-tro-out-bottom',
  easeinleft: 'sw-tro-out-left',
  easeinright: 'sw-tro-out-right',
  easeintop: 'sw-tro-out-top',
  easeinbottom: 'sw-tro-out-bottom',

  // 出场类过渡本就描述「旧画面往哪走」，退场时可以逐字还原
  move: 'sw-tro-dissolve',
  moveoutleft: 'sw-tro-out-left',
  moveoutright: 'sw-tro-out-right',
  moveouttop: 'sw-tro-out-top',
  moveoutbottom: 'sw-tro-out-bottom',
  easeoutleft: 'sw-tro-out-left',
  easeoutright: 'sw-tro-out-right',
  easeouttop: 'sw-tro-out-top',
  easeoutbottom: 'sw-tro-out-bottom',
  zoomin: 'sw-tro-pixellate',
  zoomout: 'sw-tro-pixellate',
  zoominout: 'sw-tro-pixellate',

  wipeleft: 'sw-tro-wipe-left',
  wiperight: 'sw-tro-wipe-right',
  wipeup: 'sw-tro-wipe-up',
  wipedown: 'sw-tro-wipe-down',

  pushleft: 'sw-tro-out-left',
  pushright: 'sw-tro-out-right',
  pushup: 'sw-tro-out-top',
  pushdown: 'sw-tro-out-bottom',
  slideleft: 'sw-tro-out-left',
  slideright: 'sw-tro-out-right',
  slideup: 'sw-tro-out-top',
  slidedown: 'sw-tro-out-bottom',
  slideawayleft: 'sw-tro-out-left',
  slideawayright: 'sw-tro-out-right',
  slideawayup: 'sw-tro-out-top',
  slideawaydown: 'sw-tro-out-bottom',

  irisin: 'sw-tro-iris',
  irisout: 'sw-tro-iris',
  circleirisin: 'sw-tro-iris',
  circleirisout: 'sw-tro-iris',

  hpunch: 'sw-tr-hpunch',
  vpunch: 'sw-tr-vpunch',

  blinds: 'sw-tro-blinds',
}

/** 未识别的过渡统一退化为溶解：写了 with 就说明期望有过渡，不应静默无动画 */
const FALLBACK_CLASS = 'sw-tr-dissolve'
const FALLBACK_OUT_CLASS = 'sw-tro-dissolve'

/**
 * 取过渡对应的预览动画类。
 * 兼容 `Dissolve(0.5)` 这类工厂写法（取基名），无过渡时返回空串。
 * dir 为 'out' 时返回退场方向的动画（hide / 清场用）。
 */
export function getTransitionClass(
  name: string | undefined | null,
  dir: 'in' | 'out' = 'in',
): string {
  if (!name) return dir === 'out' ? FALLBACK_OUT_CLASS : ''
  const base = name.trim().replace(/\(.*$/, '').trim().toLowerCase()
  if (!base || base === 'none') return dir === 'out' ? FALLBACK_OUT_CLASS : ''
  return dir === 'out'
    ? TRANSITION_OUT_CLASS[base] ?? FALLBACK_OUT_CLASS
    : TRANSITION_CLASS[base] ?? FALLBACK_CLASS
}

/** 该过渡名是否为 Ren'Py 官方内建（用于区分工程自定义过渡） */
export function isBuiltinTransition(name: string | undefined | null): boolean {
  if (!name) return false
  const base = name.trim().replace(/\(.*$/, '').trim().toLowerCase()
  return base in TRANSITION_CLASS
}
