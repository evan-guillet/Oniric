import { useCallback, useState, type ReactNode } from "react";
import { t } from "../core/i18n";
import { Dialog } from "./Dialog";

export interface PromptRequest {
  title: string;
  label: string;
  value: string;
  resolve: (v: string | null) => void;
}

/** A dialog asking for one line of text; resolves with the trimmed text, or null when cancelled. */
export function PromptDialog({ req, onDone }: { req: PromptRequest; onDone: () => void }) {
  const [value, setValue] = useState(req.value);
  const answer = (v: string | null) => {
    req.resolve(v);
    onDone();
  };
  const ok = () => value.trim() && answer(value.trim());
  return (
    <Dialog
      title={req.title}
      onCancel={() => answer(null)}
      actions={[
        { label: t("common.cancel"), onClick: () => answer(null) },
        {
          label: t("common.confirm"),
          onClick: ok,
          primary: true,
          disabled: !value.trim(),
        },
      ]}
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          ok();
        }}
      >
        <label className="field">
          <span>{req.label}</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
        </label>
      </form>
    </Dialog>
  );
}

/** The dialog to render, and the function that opens it. */
export function usePrompt(): [ReactNode, (title: string, label: string, initial?: string) => Promise<string | null>] {
  const [req, setReq] = useState<PromptRequest | null>(null);
  const prompt = useCallback(
    (title: string, label: string, initial = "") => new Promise<string | null>((resolve) => setReq({ title, label, value: initial, resolve })),
    [],
  );
  return [req && <PromptDialog req={req} onDone={() => setReq(null)} />, prompt];
}
