import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../core/i18n";

/** A value saved a moment after the last keystroke, and at once when the field loses focus. */
export function useDebounced<T>(value: T, save: (v: T) => void, delay = 600): [T, (v: T) => void, () => void] {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ v: T } | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!pending.current) setLocal(value);
  }, [value]);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) saveRef.current(p.v);
  };
  const set = (v: T) => {
    setLocal(v);
    pending.current = { v };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };
  useEffect(() => flush, []);
  return [local, set, flush];
}

export function Labeled({ label, help, children, wide }: { label: string; help?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "fld wide" : "fld"}>
      <span className="fld-label">{label}</span>
      {children}
      {help && <span className="fld-help">{help}</span>}
    </label>
  );
}

export function TextInput({
  value,
  onSave,
  label,
  help,
  placeholder,
  wide,
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  help?: string;
  placeholder?: string;
  wide?: boolean;
}) {
  const [v, set, flush] = useDebounced(value, onSave);
  return (
    <Labeled label={label} help={help} wide={wide}>
      <input value={v} placeholder={placeholder} onChange={(e) => set(e.target.value)} onBlur={flush} />
    </Labeled>
  );
}

export function TextArea({
  value,
  onSave,
  label,
  help,
  placeholder,
  rows = 3,
  wide = true,
  extra,
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  help?: string;
  placeholder?: string;
  rows?: number;
  wide?: boolean;
  extra?: ReactNode;
}) {
  const [v, set, flush] = useDebounced(value, onSave);
  return (
    <Labeled label={label} help={help} wide={wide}>
      <textarea value={v} placeholder={placeholder} rows={rows} onChange={(e) => set(e.target.value)} onBlur={flush} />
      {extra}
    </Labeled>
  );
}

export function TagInput({
  value,
  onChange,
  label,
  placeholder = t("common.addEllipsis"),
  suggestions = [],
  help,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
  placeholder?: string;
  suggestions?: string[];
  help?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (t: string) => {
    const tag = t.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };
  const listId = useRef(`tags-${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="fld wide">
      <span className="fld-label">{label}</span>
      <div className="tags">
        {value.map((t) => (
          <span key={t} className="tag">
            {t}
            <button type="button" aria-label={`Retirer ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          value={draft}
          placeholder={placeholder}
          list={suggestions.length ? listId : undefined}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
        />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.filter((s) => !value.includes(s)).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
      {help && <span className="fld-help">{help}</span>}
    </div>
  );
}

/** Toggle buttons for a multiple choice. */
/** `labelOf` names a stored option on screen (the stored value stays as it is). */
export function Chips({
  options,
  value,
  onChange,
  label,
  labelOf = (o) => o,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
  labelOf?: (option: string) => string;
}) {
  return (
    <fieldset className="fld wide">
      <legend className="fld-label">{label}</legend>
      <div className="chips">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button key={o} type="button" className={on ? "chip on" : "chip"} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>
              {labelOf(o)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
