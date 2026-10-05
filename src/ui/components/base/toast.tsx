import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface ToastWithoutAction {
  actionLabel?: never;
  onAction?: never;
}

interface ToastWithAction {
  actionLabel: string;
  onAction: () => void;
}

export type ToastProps = {
  open: boolean;
  children: ComponentChildren;
  durationMs?: number | null;
  onDismiss: () => void;
} & (ToastWithoutAction | ToastWithAction);

export function Toast({
  actionLabel,
  children,
  durationMs = 5000,
  onAction,
  onDismiss,
  open,
}: ToastProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!open || durationMs === null || hovered || focused) return;

    const timeout = window.setTimeout(onDismiss, Math.max(0, durationMs));
    return () => window.clearTimeout(timeout);
  }, [durationMs, focused, hovered, onDismiss, open]);

  if (!open) return null;

  return (
    <div
      class="ui-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusIn={() => setFocused(true)}
      onFocusOut={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setFocused(false);
        }
      }}
    >
      <div class="ui-toast__message">{children}</div>
      <div class="ui-toast__actions">
        {actionLabel && onAction ? (
          <button
            class="ui-button ui-button--quiet"
            type="button"
            onClick={() => {
              onAction();
              onDismiss();
            }}
          >
            {actionLabel}
          </button>
        ) : null}
        <button class="ui-toast__dismiss" type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
