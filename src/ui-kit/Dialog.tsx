import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";

export interface DialogAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A click on a modal's backdrop closes it, as Escape does. The backdrop is the <dialog> itself, outside its box;
 * the press must start there too, so a selection dragged out of a field never closes it.
 */
export function useBackdropClose(onClose?: () => void) {
  const pressed = useRef(false);
  const outside = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target !== e.currentTarget) return false;
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  return {
    onMouseDown: (e: MouseEvent<HTMLDialogElement>) => {
      pressed.current = outside(e);
    },
    onClick: (e: MouseEvent<HTMLDialogElement>) => {
      if (pressed.current && outside(e)) onClose?.();
      pressed.current = false;
    },
  };
}

/** Modal dialog on the native <dialog> element: focus trap, Escape and screen readers come with it; a click outside cancels. */
export function Dialog({
  title,
  children,
  actions,
  onCancel,
  wide,
  className,
}: {
  title: string;
  children: ReactNode;
  actions: DialogAction[];
  onCancel?: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdrop = useBackdropClose(onCancel);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    // showModal focuses the first control; React's autoFocus can't act sooner, the dialog is hidden until now.
    d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={["dialog", wide && "wide", className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel?.();
      }}
      {...backdrop}
    >
      <h2 id={titleId}>{title}</h2>
      <div className="dialog-body">{children}</div>
      <div className="dialog-actions">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className={["btn", a.primary && "primary", a.danger && "danger"].filter(Boolean).join(" ")}
            onClick={a.onClick}
            disabled={a.disabled}
            autoFocus={a.primary}
          >
            {a.label}
          </button>
        ))}
      </div>
    </dialog>
  );
}

export interface ChoiceRequest {
  title: string;
  text: ReactNode;
  choices: { label: string; value: string; primary?: boolean; danger?: boolean }[];
  cancel?: string;
}

/** Every deletion goes through here: a dialog that names what goes, resolving true once the red button is pressed. */
export async function confirmRemoval(
  ask: (r: ChoiceRequest) => Promise<string | null>,
  { title, text, label = "Supprimer" }: { title: string; text: ReactNode; label?: string },
) {
  return (await ask({ title, text: typeof text === "string" ? <p>{text}</p> : text, cancel: "Annuler", choices: [{ label, value: "y", danger: true }] })) === "y";
}

/** `ask({...})` shows a dialog and resolves with the chosen value, or null when cancelled. */
export function useChoice(): [ReactNode, (r: ChoiceRequest) => Promise<string | null>] {
  const [request, setRequest] = useState<(ChoiceRequest & { resolve: (v: string | null) => void }) | null>(null);
  const ask = (r: ChoiceRequest) => new Promise<string | null>((resolve) => setRequest({ ...r, resolve }));
  const answer = (v: string | null) => {
    request?.resolve(v);
    setRequest(null);
  };
  const element = request && (
    <Dialog
      title={request.title}
      onCancel={() => answer(null)}
      actions={[
        ...(request.cancel ? [{ label: request.cancel, onClick: () => answer(null) }] : []),
        ...request.choices.map((c) => ({ label: c.label, primary: c.primary, danger: c.danger, onClick: () => answer(c.value) })),
      ]}
    >
      {request.text}
    </Dialog>
  );
  return [element, ask];
}
