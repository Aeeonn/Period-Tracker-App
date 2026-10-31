import type { Theme } from '../../../../contracts/enums.ts';

export function applyThemePreference(theme: Theme): void {
  if (typeof document === 'undefined') return;
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
    return;
  }
  document.documentElement.setAttribute('data-theme', theme);
}
