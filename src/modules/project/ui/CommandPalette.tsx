import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FileText, Search, type LucideIcon } from "lucide-react";
import { useLive } from "../../../core/db/live";
import { loadEntries, loadTypes } from "../../script/bible/application/bible";
import { fold } from "../../script/bible/domain/types";
import { iconOf } from "../../script/bible/ui/typeIcons";

export interface PaletteItem {
  id: string;
  group: string;
  label: string;
  /** Muted text at the right end of the row. */
  detail?: string;
  icon: LucideIcon;
  /** More words that find the item, never shown. */
  keywords?: string;
  /** Only listed once something is typed. */
  searchOnly?: boolean;
  run: () => void;
}

const SHOWN_PER_GROUP = 8;
const GROUPS = ["Vues", "Scènes", "Bible", "Actions"];

/** Every word of the query, accents and case aside, is somewhere in the item; the label's start counts more. */
function score(item: PaletteItem, words: string[]): number {
  const label = fold(item.label);
  const all = `${label} ${fold(item.detail ?? "")} ${fold(item.keywords ?? "")}`;
  if (!words.every((w) => all.includes(w))) return -1;
  return (label.startsWith(words[0]) ? 2 : 0) + (words.every((w) => label.includes(w)) ? 1 : 0);
}

/**
 * Ctrl+K: one field to reach a view, a scene, a bible entry or an action. The arrows move, Enter opens, Escape
 * closes. Scenes and entries come only from a search, so the empty palette stays short.
 */
export function CommandPalette({
  items,
  scenes,
  onScene,
  onEntry,
  onClose,
}: {
  items: PaletteItem[];
  scenes: string[];
  onScene: (index: number) => void;
  onEntry: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const entries = useLive(loadEntries, ["bible_entry"]);
  const types = useLive(loadTypes, ["bible_type"]);

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);

  const all = useMemo(() => {
    const sceneItems: PaletteItem[] = scenes.map((heading, i) => ({
      id: `scene-${i}`,
      group: "Scènes",
      label: heading || "Scène sans en-tête",
      detail: `Scène ${i + 1}`,
      icon: FileText,
      searchOnly: true,
      run: () => onScene(i),
    }));
    const entryItems: PaletteItem[] = (entries ?? [])
      .filter((e) => !e.archivedAt)
      .map((e) => {
        const type = types?.find((t) => t.id === e.type);
        return {
          id: `entry-${e.id}`,
          group: "Bible",
          label: e.name,
          detail: type?.name,
          icon: iconOf(type),
          keywords: e.aliases.join(" "),
          searchOnly: true,
          run: () => onEntry(e.id),
        };
      });
    return [...items, ...sceneItems, ...entryItems];
  }, [items, scenes, entries, types, onScene, onEntry]);

  const shown = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return GROUPS.map((group) => {
      const inGroup = all.filter((i) => i.group === group);
      if (!words.length) return { group, items: inGroup.filter((i) => !i.searchOnly) };
      const ranked = inGroup
        .map((item, order) => ({ item, order, s: score(item, words) }))
        .filter((r) => r.s >= 0)
        .sort((a, b) => b.s - a.s || a.order - b.order);
      return { group, items: ranked.slice(0, SHOWN_PER_GROUP).map((r) => r.item) };
    }).filter((g) => g.items.length);
  }, [all, query]);
  const flat = shown.flatMap((g) => g.items);
  const current = flat[Math.min(active, flat.length - 1)];

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    // Once the dialog has given the focus back, so the action can take it (the editor, a field…).
    requestAnimationFrame(item.run);
  };

  return (
    <dialog
      ref={ref}
      className="palette"
      aria-label="Palette de commandes"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        // A click on the backdrop lands on the dialog itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette-search">
        <Search aria-hidden="true" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={current ? `${id}-${current.id}` : undefined}
          aria-autocomplete="list"
          placeholder="Aller à une vue, une scène, une fiche de la Bible…"
          value={query}
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = flat.length;
              if (n) setActive((a) => (Math.min(a, n - 1) + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(current);
            }
          }}
        />
      </div>
      <div ref={list} id={`${id}-list`} className="palette-list" role="listbox" aria-label="Résultats">
        {shown.map((g) => (
          <div key={g.group} role="group" aria-labelledby={`${id}-g-${g.group}`}>
            <div id={`${id}-g-${g.group}`} className="palette-group" role="presentation">
              {g.group}
            </div>
            {g.items.map((item) => {
              const Icon = item.icon;
              const on = item === current;
              return (
                <div
                  key={item.id}
                  id={`${id}-${item.id}`}
                  role="option"
                  aria-selected={on}
                  className={on ? "palette-item on" : "palette-item"}
                  onMouseMove={() => !on && setActive(flat.indexOf(item))}
                  onClick={() => choose(item)}
                >
                  <Icon aria-hidden="true" />
                  <span className="palette-label">{item.label}</span>
                  {item.detail && <span className="palette-detail">{item.detail}</span>}
                </div>
              );
            })}
          </div>
        ))}
        {!flat.length && <p className="palette-none">Rien ne correspond à « {query.trim()} ».</p>}
      </div>
      <div className="palette-foot" aria-hidden="true">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> choisir
        </span>
        <span>
          <kbd>Entrée</kbd> ouvrir
        </span>
        <span>
          <kbd>Échap</kbd> fermer
        </span>
      </div>
    </dialog>
  );
}
