import type { LucideIcon } from "lucide-react";

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
}) {
  return (
    <div className={compact ? "segmented compact" : "segmented"} role="group" aria-label={label}>
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
