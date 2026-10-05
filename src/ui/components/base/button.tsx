import type { ButtonHTMLAttributes } from 'preact';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  class: className,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  const classes = ['ui-button', `ui-button--${variant}`, className].filter(Boolean).join(' ');

  return <button {...props} type={type} class={classes} />;
}
