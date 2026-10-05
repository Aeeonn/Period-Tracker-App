import { useEffect, useId, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export interface SheetProps {
  open: boolean;
  title: string;
  children?: ComponentChildren;
  closeLabel?: string;
  onOpenChange: (open: boolean) => void;
}

export function Sheet({ children, closeLabel = 'Close', onOpenChange, open, title }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      class="ui-sheet"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
    >
      <div class="ui-sheet__content">
        <header class="ui-sheet__header">
          <h2 class="ui-sheet__title" id={titleId}>
            {title}
          </h2>
          <button class="ui-sheet__close" type="button" onClick={() => onOpenChange(false)}>
            {closeLabel}
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
