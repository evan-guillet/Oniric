import { Archive, ArrowLeft, CalendarDays, Car, Check, ChevronDown, FileText, Flag, Landmark, Lightbulb, ListFilter, MapPin, Package, PawPrint, Plus, ScanSearch, Shapes, UserRound, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { Dialog } from "../../../../ui-kit/Dialog";
import { EmptyState } from "../../../../ui-kit/Form";
import { MediaImage } from "../../../shared/media";
import { useProject } from "../../../project/ui/projectContext";
import { useScenes } from "../../screenplay/application/scriptSession";
import { createEntries, createEntry, loadEntries, loadTypes, type Entry } from "../application/bible";
import { sceneTexts } from "../application/sceneTexts";
import { detect, prettyName } from "../domain/appearances";
import { fold, type EntryType } from "../domain/types";
import { EntryEditor } from "./EntryEditor";
import { TypeEditor } from "./TypeEditor";

const TYPE_ICONS: Record<string, LucideIcon> = {
  character: UserRound,
  location: MapPin,
  object: Package,
  vehicle: Car,
  faction: Flag,
  event: CalendarDays,
  culture: Landmark,
  concept: Lightbulb,
  creature: PawPrint,
};
const typeIcon = (type: string) => TYPE_ICONS[type] ?? FileText;

type Pane = { kind: "entry"; id: string } | { kind: "detect" } | { kind: "types" } | { kind: "none" };

/** `home` changes each time the Bible is chosen in the side bar, which brings back the cards of all the entries. */
export function BibleView({ selected, onSelected, home }: { selected: string | null; onSelected: (id: string | null) => void; home: number }) {
  const { session, notify, headerActions } = useProject();
  const entries = useLive(loadEntries, ["bible_entry"]) ?? [];
  const types = useLive(loadTypes, ["bible_type"]) ?? [];
  const [filter, setFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [pane, setPane] = useState<Pane>({ kind: "none" });
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    setPane({ kind: "none" });
  }, [home]);

  useEffect(() => {
    if (selected) setPane({ kind: "entry", id: selected });
  }, [selected]);

  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? id;
  const visible = entries.filter(
    (e) =>
      (filter.size === 0 || filter.has(e.type)) &&
      !!e.archivedAt === archived &&
      (!search || [e.name, ...e.aliases, ...e.tags].some((n) => fold(n).includes(fold(search)))),
  );
  const counts = new Map<string, number>();
  for (const e of entries) if (!!e.archivedAt === archived) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
  const newEntry = () => setCreating(filter.size === 1 ? [...filter][0] : "character");

  const open = (id: string) => {
    setPane({ kind: "entry", id });
    onSelected(id);
  };

  const create = async (type: string, name: string) => {
    try {
      const id = await createEntry(type, name);
      setCreating(null);
      open(id);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const current = pane.kind === "entry" ? entries.find((e) => e.id === pane.id) : undefined;

  return (
    <div className="view bible-view">
      {headerActions &&
        createPortal(
          <div className="header-tools" role="search" aria-label="Filtrer les fiches">
            {pane.kind !== "none" && (
              <button type="button" className="btn" onClick={() => setPane({ kind: "none" })}>
                <ArrowLeft aria-hidden="true" />
                Toutes les fiches
              </button>
            )}
            <input type="search" className="header-search" placeholder="Rechercher une fiche…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher une fiche" />
            <TypeFilter types={types} counts={counts} filter={filter} onFilter={setFilter} archived={archived} onArchived={setArchived} />
            <button type="button" className={pane.kind === "detect" ? "btn on" : "btn"} onClick={() => setPane({ kind: "detect" })}>
              <ScanSearch aria-hidden="true" />
              Détecter
            </button>
            <button type="button" className={pane.kind === "types" ? "btn on" : "btn"} onClick={() => setPane({ kind: "types" })}>
              <Shapes aria-hidden="true" />
              Types de fiches
            </button>
          </div>,
          headerActions,
        )}
      <main className={pane.kind === "none" && entries.length > 0 ? "view-main wide" : "view-main"}>
        {pane.kind === "entry" && current && <EntryEditor key={current.id} entry={current} entries={entries} types={types} />}
        {pane.kind === "detect" && <Detection entries={entries} onCreated={() => setPane({ kind: "none" })} />}
        {pane.kind === "types" && <TypeEditor types={types} />}
        {(pane.kind === "none" || (pane.kind === "entry" && !current)) && entries.length > 0 && (
          <EntryCards entries={visible} typeName={typeName} onOpen={open} onNew={newEntry} />
        )}
        {(pane.kind === "none" || (pane.kind === "entry" && !current)) && entries.length === 0 && (
          <EmptyState title="La bible du film">
            <p className="muted">
              Personnages, lieux, objets, véhicules, événements… Tout ce qui fait le monde du film. Dans le scénario et les documents, tapez{" "}
              <kbd>@</kbd> ou <kbd>[[</kbd> pour lier une fiche.
            </p>
            <p className="empty-actions">
              <button type="button" className="btn primary" onClick={newEntry}>
                <Plus aria-hidden="true" />
                Nouvelle fiche
              </button>
              <button type="button" className="btn" onClick={() => setPane({ kind: "detect" })}>
                Retrouver les personnages et les lieux du scénario
              </button>
            </p>
            {session.editor === null && <p className="muted small">Le scénario se charge…</p>}
          </EmptyState>
        )}
      </main>
      {creating !== null && <NewEntryDialog types={types} type={creating} onCancel={() => setCreating(null)} onCreate={create} />}
    </div>
  );
}

function EntryCards({
  entries,
  typeName,
  onOpen,
  onNew,
}: {
  entries: Entry[];
  typeName: (id: string) => string;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <ul className="entry-cards">
      <li>
        <button type="button" className="entry-card new" onClick={onNew}>
          <span className="entry-card-media">
            <Plus aria-hidden="true" />
          </span>
          <span className="entry-card-text">
            <span className="entry-name">Nouvelle fiche</span>
            <span className="entry-card-summary">Un personnage, un lieu, un objet… tout ce qui fait le monde du film.</span>
          </span>
        </button>
      </li>
      {entries.map((e) => {
        const Icon = typeIcon(e.type);
        return (
          <li key={e.id}>
            <button type="button" className="entry-card" onClick={() => onOpen(e.id)}>
              <span className="entry-card-media">{e.image ? <MediaImage path={e.image} alt="" /> : <Icon aria-hidden="true" />}</span>
              <span className="entry-card-text">
                <span className="entry-card-type">
                  <Icon aria-hidden="true" />
                  {typeName(e.type)}
                  {e.status === "abandoned" ? " · abandonné" : e.status === "validated" ? " · validé" : ""}
                </span>
                <span className="entry-name">{e.name}</span>
                {e.summary && <span className="entry-card-summary">{e.summary}</span>}
              </span>
            </button>
          </li>
        );
      })}
      {entries.length === 0 && <li className="entry-cards-none muted">Aucune fiche ne correspond.</li>}
    </ul>
  );
}

/** Popover of type checkboxes (none checked = every type), with the archive switch at the bottom. */
function TypeFilter({
  types,
  counts,
  filter,
  onFilter,
  archived,
  onArchived,
}: {
  types: EntryType[];
  counts: Map<string, number>;
  filter: Set<string>;
  onFilter: (f: Set<string>) => void;
  archived: boolean;
  onArchived: (a: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 6, right: window.innerWidth - r.right });
    requestAnimationFrame(() => popRef.current?.querySelector("input")?.focus());
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const chosen = types.filter((t) => filter.has(t.id));
  const label = chosen.length === 0 ? "Tous les types" : chosen.length === 1 ? chosen[0].plural : `${chosen.length} types`;
  const toggle = (id: string) => {
    const next = new Set(filter);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onFilter(next.size === types.length ? new Set() : next);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={open ? "filter-trigger on" : "filter-trigger"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ListFilter aria-hidden="true" />
        <span>{label}</span>
        {archived && <span className="filter-badge">Archivées</span>}
        <ChevronDown aria-hidden="true" className="filter-chevron" />
      </button>
      {open && at && (
        <div ref={popRef} className="filter-pop" role="dialog" aria-label="Filtrer par type" style={{ top: at.top, right: at.right }}>
          <label className="filter-row">
            <input type="checkbox" checked={filter.size === 0} onChange={() => onFilter(new Set())} />
            <span className="filter-box" aria-hidden="true">
              <Check />
            </span>
            <span className="filter-name strong">Tous les types</span>
            <span className="filter-count">{total}</span>
          </label>
          <div className="filter-sep" />
          {types.map((t) => {
            const Icon = typeIcon(t.id);
            return (
              <label key={t.id} className="filter-row">
                <input type="checkbox" checked={filter.has(t.id)} onChange={() => toggle(t.id)} />
                <span className="filter-box" aria-hidden="true">
                  <Check />
                </span>
                <Icon aria-hidden="true" className="filter-icon" />
                <span className="filter-name">{t.plural}</span>
                <span className="filter-count">{counts.get(t.id) ?? 0}</span>
              </label>
            );
          })}
          <div className="filter-sep" />
          <label className="filter-row">
            <input type="checkbox" checked={archived} onChange={(e) => onArchived(e.target.checked)} />
            <span className="filter-box" aria-hidden="true">
              <Check />
            </span>
            <Archive aria-hidden="true" className="filter-icon" />
            <span className="filter-name">Afficher les fiches archivées</span>
          </label>
        </div>
      )}
    </>
  );
}

function NewEntryDialog({
  types,
  type,
  onCancel,
  onCreate,
}: {
  types: EntryType[];
  type: string;
  onCancel: () => void;
  onCreate: (type: string, name: string) => void;
}) {
  const [t, setT] = useState(type);
  const [name, setName] = useState("");
  return (
    <Dialog
      title="Nouvelle fiche"
      onCancel={onCancel}
      actions={[
        { label: "Annuler", onClick: onCancel },
        { label: "Créer la fiche", primary: true, disabled: !name.trim(), onClick: () => onCreate(t, name) },
      ]}
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(t, name);
        }}
      >
        <label className="field">
          <span>Type</span>
          <select value={t} onChange={(e) => setT(e.target.value)}>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Nom</span>
          <input name="entry-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
      </form>
    </Dialog>
  );
}

function Detection({ entries, onCreated }: { entries: Entry[]; onCreated: () => void }) {
  const { session, notify } = useProject();
  const scenes = useScenes(session);
  const found = useMemo(
    () => detect(sceneTexts(scenes), entries.map((e) => ({ id: e.id, type: e.type, name: e.name, aliases: e.aliases }))),
    [scenes, entries],
  );
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const items = [
    ...found.characters.map((n) => ({ key: `c:${n}`, type: "character", name: prettyName(n), label: "Personnage" })),
    ...found.locations.map((n) => ({ key: `l:${n}`, type: "location", name: prettyName(n), label: "Lieu" })),
  ];
  const chosen = items.filter((i) => !skip.has(i.key));
  const create = async () => {
    try {
      await createEntries(chosen.map((i) => ({ type: i.type, name: i.name })));
      notify({ text: `${chosen.length} fiche(s) créée(s).` });
      onCreated();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <section className="panel">
      <h2>Détecter dans le scénario</h2>
      <p className="muted">Les noms en majuscules des répliques et les lieux des en-têtes de scène qui n'ont pas encore de fiche.</p>
      {items.length === 0 ? (
        <p>Tous les personnages et les lieux du scénario ont déjà une fiche.</p>
      ) : (
        <>
          <ul className="check-list">
            {items.map((i) => (
              <li key={i.key}>
                <label className="choice">
                  <input
                    type="checkbox"
                    checked={!skip.has(i.key)}
                    onChange={(e) => {
                      const next = new Set(skip);
                      if (e.target.checked) next.delete(i.key);
                      else next.add(i.key);
                      setSkip(next);
                    }}
                  />
                  {i.name} <span className="muted small">({i.label})</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="btn primary" disabled={chosen.length === 0} onClick={() => void create()}>
            Créer {chosen.length} fiche(s)
          </button>
        </>
      )}
    </section>
  );
}
