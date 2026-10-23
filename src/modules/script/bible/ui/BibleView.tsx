import { Archive, ArrowLeft, CalendarDays, Car, Check, ChevronDown, FileText, Flag, Landmark, Lightbulb, ListFilter, MapPin, Package, PawPrint, Plus, ScanSearch, Shapes, UserRound, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { Dialog } from "../../../../ui-kit/Dialog";
import { EmptyState } from "../../../../ui-kit/Form";
import { MediaImage } from "../../../shared/media";
import { useProject } from "../../../project/ui/projectContext";
import { useScenes } from "../../screenplay/application/scriptSession";
import { addAlias, createEntries, createEntry, loadEntries, loadTypes, type Entry } from "../application/bible";
import { sceneTexts } from "../application/sceneTexts";
import { appearances, detect, triage, type Candidate } from "../domain/appearances";
import { firstSentence, fold, type EntryType } from "../domain/types";
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

type Sort = "name" | "recent" | "presence";
/** Scenes where an entry appears: how many, and the index of the first one (-1 when none). */
type Presence = { count: number; first: number };

/** « Le Cimetière des navires » sorts under C: the leading article is ignored. */
const sortKey = (name: string) => fold(name).replace(/^(l['’]\s*|(le|la|les|un|une|des)\s+)/, "");
const byName = (a: Entry, b: Entry) => sortKey(a.name).localeCompare(sortKey(b.name), "fr");

/** `home` changes each time the Bible is chosen in the side bar, which brings back the cards of all the entries. */
export function BibleView({ selected, onSelected, home }: { selected: string | null; onSelected: (id: string | null) => void; home: number }) {
  const { session, notify, headerActions, setTrail } = useProject();
  const entries = useLive(loadEntries, ["bible_entry"]) ?? [];
  const types = useLive(loadTypes, ["bible_type"]) ?? [];
  const [filter, setFilter] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [pane, setPane] = useState<Pane>({ kind: "none" });
  const [creating, setCreating] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("name");
  const scenes = useScenes(session);
  const presence = useMemo(() => {
    const texts = sceneTexts(scenes);
    const index = new Map(scenes.map((s) => [s.id, s.index]));
    const out = new Map<string, Presence>();
    for (const e of entries) {
      const ids = appearances({ id: e.id, type: e.type, name: e.name, aliases: e.aliases }, texts);
      out.set(e.id, { count: ids.length, first: ids.length ? Math.min(...ids.map((id) => index.get(id) ?? 0)) : -1 });
    }
    return out;
  }, [scenes, entries]);

  useEffect(() => {
    setPane({ kind: "none" });
  }, [home]);

  useEffect(() => {
    if (selected) setPane({ kind: "entry", id: selected });
  }, [selected]);

  // Détecter and Types are a level below the cards: the header says where one is, « Bible » or Escape goes back.
  const sub = pane.kind === "detect" ? "Détecter" : pane.kind === "types" ? "Types de fiches" : null;
  useEffect(() => {
    if (!sub) return setTrail(null);
    setTrail([{ label: "Bible", onClick: () => setPane({ kind: "none" }) }, { label: sub }]);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea, select, dialog, [role=dialog], [role=menu]")) return;
      setPane({ kind: "none" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sub, setTrail]);
  useEffect(() => () => setTrail(null), [setTrail]);

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
  const close = () => {
    setPane({ kind: "none" });
    onSelected(null);
  };
  // The cards stay behind an open entry.
  const cardsShown = pane.kind === "none" || pane.kind === "entry";
  const noMatch = cardsShown && entries.length > 0 && visible.length === 0;

  // When the entry closes, however it closed (button, Escape, deletion), the focus goes back to its card,
  // or to « Nouvelle fiche » when the card is gone.
  const lastOpen = useRef<string | null>(null);
  useEffect(() => {
    if (current) {
      lastOpen.current = current.id;
      return;
    }
    const id = lastOpen.current;
    if (!id) return;
    lastOpen.current = null;
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`.entry-card-open[data-entry="${CSS.escape(id)}"]`);
      (card ?? document.querySelector<HTMLElement>(".bible-bar .btn.primary"))?.focus();
    });
  }, [current?.id]);

  return (
    <div className="view bible-view">
      {headerActions &&
        createPortal(
          <div className="header-tools" role="search" aria-label="Filtrer les fiches">
            {/* Search and filter act on the cards only, so they leave with them. */}
            {sub ? (
              <button type="button" className="btn" onClick={() => setPane({ kind: "none" })}>
                <ArrowLeft aria-hidden="true" />
                Toutes les fiches
              </button>
            ) : (
              <>
                <input type="search" className="header-search" placeholder="Rechercher une fiche…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher une fiche" />
                <TypeFilter types={types} counts={counts} filter={filter} onFilter={setFilter} archived={archived} onArchived={setArchived} />
              </>
            )}
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
      <main className={cardsShown && entries.length > 0 ? "view-main wide" : "view-main"}>
        {pane.kind === "detect" && <Detection entries={entries} onCreated={() => setPane({ kind: "none" })} />}
        {pane.kind === "types" && <TypeEditor types={types} />}
        {cardsShown && entries.length > 0 && (
          <>
            <div className="bible-bar">
              <label className="bible-sort">
                <span>Trier par</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="name">Nom</option>
                  <option value="recent">Modifiées récemment</option>
                  <option value="presence">Présence dans le scénario</option>
                </select>
              </label>
              <button type="button" className="btn primary" onClick={newEntry}>
                <Plus aria-hidden="true" />
                Nouvelle fiche
              </button>
            </div>
            <EntryCards entries={visible} types={types} presence={presence} sort={sort} onOpen={open} onAdd={setCreating} />
            {/* Always in the page, so that the screen reader hears the message when a search empties the cards. */}
            <p className="entry-cards-none muted" role="status">
              {noMatch ? "Aucune fiche ne correspond." : ""}
            </p>
          </>
        )}
        {cardsShown && entries.length === 0 && (
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
                <ScanSearch aria-hidden="true" />
                Détecter les personnages et les lieux
              </button>
            </p>
            {session.editor === null && <p className="muted small">Le scénario se charge…</p>}
          </EmptyState>
        )}
      </main>
      {current && (
        <EntryModal name={current.name} onClose={close}>
          <EntryEditor key={current.id} entry={current} entries={entries} types={types} />
        </EntryModal>
      )}
      {creating !== null && <NewEntryDialog types={types} type={creating} onCancel={() => setCreating(null)} onCreate={create} />}
    </div>
  );
}

/** An entry over the cards, on the native <dialog>: Escape, the close button or a click outside closes it. */
function EntryModal({ name, onClose, children }: { name: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    // showModal focuses the close button, the first in the dialog; the name is what one edits first.
    d.querySelector<HTMLElement>(".entry-name-input")?.focus();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog entry-modal"
      aria-label={`Fiche ${name}`}
      onCancel={(e) => {
        // A dialog opened from the entry (history, deletion) cancels on its own.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button type="button" className="entry-modal-close" aria-label="Fermer la fiche" title="Fermer (Échap)" onClick={onClose}>
        <X aria-hidden="true" />
      </button>
      <div className="entry-modal-body">{children}</div>
    </dialog>
  );
}

/** « 12 scènes · dès la sc. 3 », for the types the screenplay places: characters by their cues, locations by the headings. */
function presenceLabel(type: string, p: Presence | undefined): string | null {
  if (type !== "character" && type !== "location") return null;
  if (!p || p.count === 0) return "Aucune scène";
  return p.count === 1 ? `1 scène · sc. ${p.first + 1}` : `${p.count} scènes · dès la sc. ${p.first + 1}`;
}

/** The entries in one section per type, in the order of the types; « idea » is the default status and shows nothing. */
function EntryCards({
  entries,
  types,
  presence,
  sort,
  onOpen,
  onAdd,
}: {
  entries: Entry[];
  types: EntryType[];
  presence: Map<string, Presence>;
  sort: Sort;
  onOpen: (id: string) => void;
  onAdd: (type: string) => void;
}) {
  if (entries.length === 0) return null;
  const order: (a: Entry, b: Entry) => number =
    sort === "recent"
      ? (a, b) => b.updatedAt.localeCompare(a.updatedAt)
      : sort === "presence"
        ? (a, b) => (presence.get(b.id)?.count ?? 0) - (presence.get(a.id)?.count ?? 0) || byName(a, b)
        : byName;
  const known = new Set(types.map((t) => t.id));
  const sections = [
    ...types.map((t) => ({ id: t.id, title: t.plural, name: t.name })),
    // Entries whose type was removed still show, under their raw type id.
    ...[...new Set(entries.map((e) => e.type))].filter((id) => !known.has(id)).map((id) => ({ id, title: id, name: id })),
  ]
    .map((s) => ({ ...s, entries: entries.filter((e) => e.type === s.id).sort(order) }))
    .filter((s) => s.entries.length > 0);

  return (
    <div className="entry-sections">
      {sections.map((s) => {
        const Icon = typeIcon(s.id);
        return (
          <section key={s.id} className="entry-section" aria-labelledby={`bible-section-${s.id}`}>
            <header className="entry-section-head">
              <h2 id={`bible-section-${s.id}`}>
                <Icon aria-hidden="true" />
                {s.title}
                <span className="entry-section-count">{s.entries.length}</span>
              </h2>
              <button type="button" className="btn ghost small" onClick={() => onAdd(s.id)} aria-label={`Ajouter une fiche : ${s.name}`}>
                <Plus aria-hidden="true" />
                Ajouter
              </button>
            </header>
            <ul className="entry-cards">
              {s.entries.map((e) => {
                const where = presenceLabel(e.type, presence.get(e.id));
                const meta = where || e.status !== "idea";
                // The button holds only the name, a heading of the grid; the summary and the meta describe it.
                // Its ::after spreads over the whole card, so the card still opens on a click anywhere.
                const described = [e.summary && `entry-summary-${e.id}`, meta && `entry-meta-${e.id}`].filter(Boolean).join(" ");
                return (
                  <li key={e.id} className={e.image ? "entry-card with-image" : "entry-card"}>
                    {e.image && (
                      <span className="entry-card-media">
                        <MediaImage path={e.image} alt="" />
                      </span>
                    )}
                    <h3 className="entry-card-head">
                      {!e.image && (
                        <span className="entry-card-icon">
                          <Icon aria-hidden="true" />
                        </span>
                      )}
                      <button type="button" className="entry-card-open entry-name" data-entry={e.id} aria-describedby={described || undefined} onClick={() => onOpen(e.id)}>
                        {e.name}
                      </button>
                    </h3>
                    {e.summary && (
                      <span id={`entry-summary-${e.id}`} className="entry-card-summary">
                        {firstSentence(e.summary)}
                      </span>
                    )}
                    {meta && (
                      <span id={`entry-meta-${e.id}`} className="entry-card-meta">
                        {where && <span className={where === "Aucune scène" ? "entry-card-where none" : "entry-card-where"}>{where}</span>}
                        {e.status === "validated" && <span className="badge ok">Validé</span>}
                        {e.status === "abandoned" && <span className="badge st-todo">Abandonné</span>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
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
          <input name="entry-name" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        </label>
      </form>
    </Dialog>
  );
}

const DOUBT_LABEL = { duplicate: "Doublon probable", sublocation: "Sous-lieu", generic: "Rôle sans nom" } as const;

/** Names of the screenplay without an entry, by group; the doubtful ones start unchecked and say why. */
function Detection({ entries, onCreated }: { entries: Entry[]; onCreated: () => void }) {
  const { session, notify } = useProject();
  const scenes = useScenes(session);
  const candidates = useMemo(() => {
    const refs = entries.map((e) => ({ id: e.id, type: e.type, name: e.name, aliases: e.aliases }));
    return triage(detect(sceneTexts(scenes), refs), refs);
  }, [scenes, entries]);
  // Only the boxes the user changed; the others follow their doubt.
  const [picked, setPicked] = useState<Map<string, boolean>>(new Map());
  const [busy, setBusy] = useState(false);
  const isChecked = (c: Candidate) => picked.get(c.key) ?? c.doubt === null;
  const set = (list: Candidate[], value: boolean) => setPicked((p) => new Map([...p, ...list.map((c) => [c.key, value] as const)]));
  const chosen = candidates.filter(isChecked);
  const groups = [
    { id: "character", title: "Personnages", icon: UserRound, items: candidates.filter((c) => c.type === "character") },
    { id: "location", title: "Lieux", icon: MapPin, items: candidates.filter((c) => c.type === "location") },
  ].filter((g) => g.items.length > 0);

  const create = async () => {
    setBusy(true);
    try {
      await createEntries(chosen.map((c) => ({ type: c.type, name: c.name })));
      notify({ text: chosen.length === 1 ? "1 fiche créée." : `${chosen.length} fiches créées.` });
      onCreated();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const alias = async (c: Candidate, entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    try {
      await addAlias(entry, c.name);
      notify({ text: `« ${c.name} » est maintenant un autre nom de « ${entry.name} ».` });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  return (
    <section className="panel detect">
      <h2>Détecter les personnages et les lieux</h2>
      <p className="muted">Les noms des répliques et les lieux des en-têtes de scène qui n'ont pas encore de fiche. Les noms douteux restent décochés.</p>
      {candidates.length === 0 ? (
        <p>Tous les personnages et les lieux du scénario ont déjà une fiche.</p>
      ) : (
        <>
          {groups.map((g) => {
            const on = g.items.filter(isChecked).length;
            return (
              <fieldset key={g.id} className="detect-group">
                <legend className="detect-group-head">
                  <GroupCheck all={on === g.items.length} some={on > 0} onChange={(v) => set(g.items, v)} label={`Tout cocher : ${g.title}`} />
                  <g.icon aria-hidden="true" />
                  <span>{g.title}</span>
                  <span className="entry-section-count">
                    {on} / {g.items.length}
                  </span>
                </legend>
                <ul className="detect-list">
                  {g.items.map((c) => {
                    const dup = c.doubt?.kind === "duplicate" ? c.doubt.of : null;
                    return (
                    <li key={c.key} className={c.doubt ? "detect-item doubtful" : "detect-item"}>
                      <label className="choice">
                        <input type="checkbox" checked={isChecked(c)} onChange={(e) => set([c], e.target.checked)} />
                        <span className="detect-name">{c.name}</span>
                      </label>
                      {c.doubt && (
                        <span className="detect-doubt">
                          <span className="badge st-todo">{DOUBT_LABEL[c.doubt.kind]}</span>
                          {c.doubt.kind === "duplicate" && (
                            <>
                              <span className="muted small">de « {dup!.name} »</span>
                              <button type="button" className="btn ghost small" onClick={() => void alias(c, dup!.id)}>
                                Ajouter comme autre nom
                              </button>
                            </>
                          )}
                          {c.doubt.kind === "sublocation" && <span className="muted small">de « {c.doubt.of} »</span>}
                        </span>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
          <div className="detect-foot">
            <button type="button" className="btn primary" disabled={chosen.length === 0 || busy} onClick={() => void create()}>
              {chosen.length === 1 ? "Créer 1 fiche" : `Créer ${chosen.length} fiches`}
            </button>
            <span className="muted small" aria-live="polite">
              {chosen.length === 0 ? "Aucun coché" : chosen.length === 1 ? "1 coché" : `${chosen.length} cochés`} sur{" "}
              {candidates.length === 1 ? "1 nom trouvé" : `${candidates.length} noms trouvés`}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/** « Tout cocher » for a group: half-filled when only some of its names are checked. */
function GroupCheck({ all, some, onChange, label }: { all: boolean; some: boolean; onChange: (v: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some && !all;
  }, [all, some]);
  return <input ref={ref} type="checkbox" checked={all} onChange={() => onChange(!all)} aria-label={label} />;
}
