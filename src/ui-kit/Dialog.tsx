import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface DialogAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

/** Modal dialog on the native <dialog> element: focus trap, Escape and screen readers come with it. */
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
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
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
