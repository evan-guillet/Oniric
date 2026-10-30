import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  hint?: string;
}

/** A choice among a few views, pressed buttons in one track: the chosen one is a small surface set in it. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  compact,
  disabled,
  lead,
}: {
  label: string;
  options: SegmentedOption<T>[];
  /** null: none is chosen, as with tabs over a view that has none of its own. */
  value: T | null;
  onChange: (v: T) => void;
  /** Labels are dropped under 1180px, the icons stay. */
  compact?: boolean;
  /** The choice does not apply to what is shown; it is kept for when it does again. */
  disabled?: boolean;
  /** A toggle of its own at the head of the track (`.seg`), set like the other buttons. */
  lead?: ReactNode;
}) {
  return (
    <div className={compact ? "segmented compact" : "segmented"} role="group" aria-label={label}>
      {lead}
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={o.id === value ? "seg on" : "seg"}
          aria-pressed={o.id === value}
          title={o.hint}
          disabled={disabled}
          onClick={() => onChange(o.id)}
        >
          {o.icon && <o.icon aria-hidden="true" />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
