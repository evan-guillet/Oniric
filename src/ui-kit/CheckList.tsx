import { Check } from "lucide-react";

export interface CheckItem<T extends string> {
  id: T;
  label: string;
  /** A muted second line that says what the option does. */
  hint?: string;
  checked: boolean;
}

/** Options to switch on and off, each with its box, laid out in a panel: a click on the row ticks or unticks it. */
export function CheckList<T extends string>({
  label,
  items,
  onToggle,
}: {
  label: string;
  items: CheckItem<T>[];
  onToggle: (id: T) => void;
}) {
  return (
    <div className="check-list" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="checkbox"
          aria-checked={item.checked}
          onClick={() => onToggle(item.id)}
        >
          <span className="check-box" aria-hidden="true">
            {item.checked && <Check />}
          </span>
          <span className="more-item">
            {item.label}
            {item.hint && <span className="more-item-hint">{item.hint}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
