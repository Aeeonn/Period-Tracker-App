import type { ButtonHTMLAttributes } from 'preact';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}

export function Chip({
  class: className,
  onClick,
  onPressedChange,
  pressed,
  type = 'button',
  ...props
}: ChipProps) {
  const classes = ['ui-chip', className].filter(Boolean).join(' ');

  return (
    <button
      {...props}
      type={type}
      class={classes}
      aria-pressed={pressed}
      onClick={(event) => {
        onPressedChange(!pressed);
        onClick?.(event);
      }}
    />
  );
}
