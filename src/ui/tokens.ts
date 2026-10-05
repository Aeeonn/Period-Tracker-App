export type UiTheme = 'light' | 'dark';

export const colorTokens = {
  canvas: 'var(--color-canvas)',
  surface: 'var(--color-surface)',
  raisedSurface: 'var(--color-surface-raised)',
  text: 'var(--color-text)',
  mutedText: 'var(--color-text-muted)',
  border: 'var(--color-border)',
  accent: 'var(--color-accent)',
  onAccent: 'var(--color-on-accent)',
  subtleAccent: 'var(--color-accent-subtle)',
  focus: 'var(--color-focus)',
} as const;

export const typographyTokens = {
  family: 'var(--font-family-body)',
  sizeXs: 'var(--font-size-xs)',
  sizeSm: 'var(--font-size-sm)',
  sizeMd: 'var(--font-size-md)',
  sizeLg: 'var(--font-size-lg)',
  sizeXl: 'var(--font-size-xl)',
  size2xl: 'var(--font-size-2xl)',
  lineHeightTight: 'var(--line-height-tight)',
  lineHeightBody: 'var(--line-height-body)',
} as const;

export const spacingTokens = {
  0: 'var(--space-0)',
  1: 'var(--space-1)',
  2: 'var(--space-2)',
  3: 'var(--space-3)',
  4: 'var(--space-4)',
  5: 'var(--space-5)',
  6: 'var(--space-6)',
  8: 'var(--space-8)',
  10: 'var(--space-10)',
  12: 'var(--space-12)',
} as const;

export const radiusTokens = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  sheet: 'var(--radius-sheet)',
  pill: 'var(--radius-pill)',
} as const;
