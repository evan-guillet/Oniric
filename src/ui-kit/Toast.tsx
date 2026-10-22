import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "info" | "warning" | "error";
  actions?: { label: string; onClick: () => void }[];
  /** Milliseconds before it disappears; never for errors. */
  timeout?: number;
}

export function Toasts({ messages, onDismiss, dismissLabel }: { messages: ToastMessage[]; onDismiss: (id: number) => void; dismissLabel: string }) {
  const host = useTopDialog();
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {messages.map((m) => (
        <Toast key={m.id} message={m} onDismiss={() => onDismiss(m.id)} dismissLabel={dismissLabel} />
      ))}
    </div>,
    host,
  );
}

/** The open modal dialog on top, or the body: toasts live there so that a modal does not hide them or make them inert. */
function useTopDialog(): Element {
  const [host, setHost] = useState<Element>(document.body);
  useEffect(() => {
    const pick = () => setHost([...document.querySelectorAll("dialog[open]")].at(-1) ?? document.body);
    pick();
    const observer = new MutationObserver(pick);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, []);
  return host;
}

function Toast({ message, onDismiss, dismissLabel }: { message: ToastMessage; onDismiss: () => void; dismissLabel: string }) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const ms = message.timeout ?? (message.tone === "error" ? 0 : 8000);
    if (!ms) return;
    const t = setTimeout(() => dismiss.current(), ms);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <div className={`toast ${message.tone ?? "info"}`}>
      <p>{message.text}</p>
      {message.actions?.map((a) => (
        <button key={a.label} type="button" className="btn small" onClick={a.onClick}>
          {a.label}
        </button>
      ))}
      <button type="button" className="toast-close" aria-label={dismissLabel} onClick={onDismiss}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
