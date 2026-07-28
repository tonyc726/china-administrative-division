/**
 * 站标 —— 全站叙事的最小图形。
 *
 * 一个县级单位的方块，右上角那一块改了颜色：赤陶（县）→ 松松绿（区）。
 * territory 没有移动，只是名册上的身份变了 —— 这正是 641 个县的去向，
 * 也复用曲线图已经建立的颜色语义，不引入第三套符号（Occam's Razor）。
 *
 * 外框是暖纸底 + 细边的圆角方格：名册上的一格，也是一枚印面。
 *
 * ⚠️ public/favicon.svg 是同一图形的静态副本，改这里请同步改那里。
 */
interface Props {
  /** CSS 尺寸类，默认 36px 见方（页眉） */
  className?: string;
}

export function BrandMark({ className = 'h-9 w-9' }: Props): JSX.Element {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7"
        style={{ fill: 'var(--color-paper)', stroke: 'var(--color-line-2)' }}
      />
      {/* 县：被切走右上一角的主体 */}
      <path d="M6 6 H17 V15 H26 V26 H6 Z" style={{ fill: 'var(--color-clay)' }} />
      {/* 区：那一角，原地改姓 */}
      <rect
        x="18.5"
        y="6"
        width="7.5"
        height="7.5"
        rx="1"
        style={{ fill: 'var(--color-pine)' }}
      />
    </svg>
  );
}
