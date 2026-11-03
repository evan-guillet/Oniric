import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { dateFormat, t } from "../../../core/i18n";
import { Segmented, type SegmentedOption } from "../../../ui-kit/Segmented";
import { useProject } from "../../project/ui/projectContext";
import { MediaImage } from "../../shared/media";
import { initials } from "../domain/contacts";
import { parseDay } from "../domain/schedule";

/** The displays of a view, in the header where every view keeps its own choice. */
export function HeaderTabs<T extends string>({ label, options, value, onChange }: { label: string; options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void }) {
  const { headerActions } = useProject();
  if (!headerActions) return null;
  return createPortal(<Segmented label={label} options={options} value={value} onChange={onChange} compact />, headerActions);
}

/** A photo, or the initials of the name on a tint of its own. */
export function Avatar({ name, photo, size = 28 }: { name: string; photo?: string | null; size?: number }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <span className="pr-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), "--hue": hue } as React.CSSProperties} aria-hidden="true">
      {photo ? <MediaImage path={photo} alt="" /> : initials(name)}
    </span>
  );
}

/**
 * A field saved when it is left or with Enter (Ctrl + Enter in a long text); Escape gives back what it held. What is
 * being typed is not overwritten by the saved value coming back.
 */
export function Field({
  label,
  value,
  onCommit,
  type = "text",
  multiline,
  placeholder,
  className,
  hideLabel,
  normalize,
  autoFocus,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  type?: "text" | "date" | "time" | "number" | "email" | "tel" | "datetime-local";
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  hideLabel?: boolean;
  normalize?: (v: string) => string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    if (draft === null) return;
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    const next = normalize ? normalize(draft) : draft;
    setDraft(null);
    if (next !== value) onCommit(next);
  };
  const common = {
    value: draft ?? value,
    placeholder,
    autoFocus,
    "aria-label": hideLabel ? label : undefined,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onFocus: () => setDraft(value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Escape" && draft !== null && draft !== value) {
        cancelled.current = true;
        e.currentTarget.blur();
        e.stopPropagation();
      } else if (e.key === "Enter" && (!multiline || e.ctrlKey)) {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
  };
  const control = multiline ? <textarea rows={2} {...common} /> : <input type={type} {...common} />;
  if (hideLabel) return <span className={`pr-field bare ${className ?? ""}`}>{control}</span>;
  return (
    <label className={`pr-field ${className ?? ""}`}>
      <span>{label}</span>
      {control}
    </label>
  );
}

/** A group of fields under its title. */
export function Section({ title, children, aside, className }: { title: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={`pr-section ${className ?? ""}`}>
      <header className="pr-section-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** « lun. 16 mars », or « lun. 16 mars 2027 » in another year than this one. */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = parseDay(iso);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return dateFormat({ weekday: "short", day: "numeric", month: "short", ...(thisYear ? {} : { year: "numeric" }) }).format(d);
}

/** « du 3 au 28 mars », « à partir du 3 mars », « jusqu'au 28 mars ». */
export function dateRange(start: string | null, end: string | null): string {
  const f = (iso: string) => dateFormat({ day: "numeric", month: "short" }).format(parseDay(iso));
  if (start && end) return start === end ? f(start) : t("team.range", { start: f(start), end: f(end) });
  if (start) return t("team.from", { date: f(start) });
  if (end) return t("team.until", { date: f(end) });
  return "";
}

/** Writes a file the user picked as text, or null when they picked none. */
export function useFilePick(accept: string, onText: (text: string, name: string) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={accept}
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void f.text().then((text) => onText(text, f.name));
      }}
    />
  );
  return [input, () => ref.current?.click()] as const;
}

