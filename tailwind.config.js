/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // 主题切换：依据 <html data-theme="dark"> 触发 dark: 变体（主要用于边缘微调，主色走语义 token）
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // 保留原 brand 调色板，过渡期不破坏尚未重构的组件
        brand: {
          50: '#f0f4ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          300: '#91a7ff',
          400: '#748ffc',
          500: '#5c7cfa',
          600: '#4c6ef5',
          700: '#4263eb',
          800: '#3b5bdb',
          900: '#364fc7',
          950: '#2b3fa0',
        },

        // ===== 语义化设计 token（双主题共用，值由 CSS 变量驱动） =====
        'on-primary': 'rgb(var(--c-on-primary) / <alpha-value>)',

        // 背景层级（墨/纸 明度差制造纵深）
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          '1': 'rgb(var(--c-surface-1) / <alpha-value>)',
          '2': 'rgb(var(--c-surface-2) / <alpha-value>)',
          '3': 'rgb(var(--c-surface-3) / <alpha-value>)',
          hover: 'rgb(var(--c-surface-hover) / <alpha-value>)',
          active: 'rgb(var(--c-surface-active) / <alpha-value>)',
        },

        // 边框（低透明，靠 alpha 控制强弱）
        edge: {
          DEFAULT: 'rgb(var(--c-edge) / <alpha-value>)',
          strong: 'rgb(var(--c-edge-strong) / <alpha-value>)',
        },

        // 文字
        fg: {
          DEFAULT: 'rgb(var(--c-fg) / <alpha-value>)',
          muted: 'rgb(var(--c-fg-muted) / <alpha-value>)',
          subtle: 'rgb(var(--c-fg-subtle) / <alpha-value>)',
          faint: 'rgb(var(--c-fg-faint) / <alpha-value>)',
        },

        // 品牌主色「紫毫 Violet」
        primary: {
          DEFAULT: 'rgb(var(--c-primary) / <alpha-value>)',
          hover: 'rgb(var(--c-primary-hover) / <alpha-value>)',
          active: 'rgb(var(--c-primary-active) / <alpha-value>)',
          soft: 'rgb(var(--c-primary-soft) / 0.14)',
        },

        // 签名信号色「琥珀 Signal」—— 仅作指示/描边，不做大块填充
        signal: {
          DEFAULT: 'rgb(var(--c-signal) / <alpha-value>)',
          soft: 'rgb(var(--c-signal-soft) / 0.14)',
        },

        // 辅色「青 Cyan」
        accent: {
          DEFAULT: 'rgb(var(--c-accent) / <alpha-value>)',
          soft: 'rgb(var(--c-accent-soft) / 0.12)',
        },

        // 语义状态色
        success: { DEFAULT: 'rgb(var(--c-success) / <alpha-value>)', soft: 'rgb(var(--c-success-soft) / 0.12)' },
        warning: { DEFAULT: 'rgb(var(--c-warning) / <alpha-value>)', soft: 'rgb(var(--c-warning-soft) / 0.12)' },
        danger: { DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)', soft: 'rgb(var(--c-danger-soft) / 0.12)' },
        info: { DEFAULT: 'rgb(var(--c-info) / <alpha-value>)', soft: 'rgb(var(--c-info-soft) / 0.12)' },
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        '1': 'var(--shadow-1)',
        '2': 'var(--shadow-2)',
        '3': 'var(--shadow-3)',
        'inset-top': 'var(--shadow-inset-top)',
      },
      fontFamily: {
        sans: [
          'Noto Sans',
          'Noto Sans SC',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'shimmer': 'shimmer 1.8s linear infinite',
        'pulse-signal': 'pulseSignal 2s ease-in-out infinite',
      },
      letterSpacing: {
        eyebrow: '0.18em',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        pulseSignal: {
          '0%, 100%': { boxShadow: '0 0 0 3px rgb(var(--c-signal) / 0.16)', opacity: '1' },
          '50%': { boxShadow: '0 0 0 5px rgb(var(--c-signal) / 0.06)', opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}
