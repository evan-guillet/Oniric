import { createContext, useContext, useState, type ReactNode } from "react";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { Dialog } from "../../../../ui-kit/Dialog";
import { useDebounced } from "../../../../ui-kit/Form";
import { useProject } from "../../../project/ui/projectContext";
import { fieldHistory, setField } from "../application/workshop";
import { dateFormat, t } from "../../../../core/i18n";

const dates = () => dateFormat({ dateStyle: "medium", timeStyle: "short" });

export interface Workshop {
  fields: Map<string, unknown>;
  help: boolean;
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export const WorkshopContext = createContext<Workshop | null>(null);

export function useWorkshop(): Workshop {
  const w = useContext(WorkshopContext);
  if (!w) throw new Error("hors de l'atelier");
  return w;
}

export function Help({ children }: { children: ReactNode }) {
  const { help } = useWorkshop();
  return help ? <div className="help">{children}</div> : null;
}

function HistoryButton({ k, onRestore }: { k: string; onRestore: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn ghost tiny" onClick={() => setOpen(true)} title={t("fields.previous")}>
        {t("fields.history")}
      </button>
      {open && (
        <FieldHistory
          k={k}
          onClose={() => setOpen(false)}
          onRestore={(v) => {
            onRestore(v);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function FieldHistory({ k, onClose, onRestore }: { k: string; onClose: () => void; onRestore: (v: unknown) => void }) {
  const versions = useLive(() => fieldHistory(k), ["workshop_field_version"], [k]);
  return (
    <Dialog title={t("fields.historyTitle")} wide onCancel={onClose} actions={[{ label: t("common.close"), onClick: onClose }]}>
      {!versions ? (
        <p className="muted">{t("dash.loading")}</p>
      ) : versions.length === 0 ? (
        <p className="muted">{t("fields.none")}</p>
      ) : (
        <ul className="version-list">
          {versions.map((v) => (
            <li key={v.id}>
              <span>
                <strong>{dates().format(new Date(v.createdAt))}</strong>
                <span className="history-text">{typeof v.value === "string" ? v.value : JSON.stringify(v.value)}</span>
              </span>
              <button type="button" className="btn small" onClick={() => onRestore(v.value)}>
                {t("fields.takeBack")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** A text field of the workshop, saved as you type, with its history [ATL-02]. */
export function WText({
  k,
  label,
  help,
  placeholder,
  rows,
  counter,
}: {
  k: string;
  label: string;
  help?: string;
  placeholder?: string;
  /** A multi-line field when given. */
  rows?: number;
  counter?: (text: string) => string;
}) {
  const w = useWorkshop();
  const { notify } = useProject();
  const save = (v: string) => {
    try {
      w.set(k, v);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  const [v, set, flush] = useDebounced<string>(w.get<string>(k, ""), save);
  return (
    <div className="fld wide">
      <span className="fld-label-row">
        <label className="fld-label" htmlFor={`w-${k}`}>
          {label}
        </label>
        {counter && <span className="muted tiny">{counter(v)}</span>}
        <HistoryButton
          k={k}
          onRestore={(old) => {
            const text = typeof old === "string" ? old : "";
            set(text);
            flush();
          }}
        />
      </span>
      {rows ? (
        <textarea id={`w-${k}`} rows={rows} value={v} placeholder={placeholder} onChange={(e) => set(e.target.value)} onBlur={flush} />
      ) : (
        <input id={`w-${k}`} value={v} placeholder={placeholder} onChange={(e) => set(e.target.value)} onBlur={flush} />
      )}
      {help && w.help && <span className="fld-help">{help}</span>}
    </div>
  );
}

export async function persist(key: string, value: unknown): Promise<void> {
  await setField(key, value);
}
