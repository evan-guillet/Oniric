import { Search } from "lucide-react";

/** A search field with its magnifier inside, at the head of a list it filters as one types. */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** What the field searches, for the screen reader. */
  label: string;
}) {
  return (
    <label className="search-box">
      <Search aria-hidden="true" />
      <input type="search" placeholder={placeholder} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
