import { Archive, ArrowLeft, MapPin, Plus, ScanSearch, Shapes, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { Dialog, useBackdropClose } from "../../../../ui-kit/Dialog";
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
import { iconOf } from "./typeIcons";

import { Select } from "../../../../ui-kit/Select";
/** Where one is in the Bible: the categories, one category's entries, or a tool. The open entry sits over it. */
type View = { kind: "home" } | { kind: "type"; id: string } | { kind: "detect" } | { kind: "types"; startNew?: boolean };

type Sort = "name" | "recent" | "presence";
/** Scenes where an entry appears: how many, and the index of the first one (-1 when none). */
type Presence = { count: number; first: number };
/** One category: a type, or the raw id of a removed type that still has entries. */
type Category = { id: string; title: string; name: string; type?: EntryType };

/** « Le Cimetière des navires » sorts under C: the leading article is ignored. */
const sortKey = (name: string) => fold(name).replace(/^(l['’]\s*|(le|la|les|un|une|des)\s+)/, "");
const byName = (a: Entry, b: Entry) => sortKey(a.name).localeCompare(sortKey(b.name), "fr");

/** The types in their order, then the removed types whose entries still show, under their raw id. */
function categoriesOf(types: EntryType[], entries: Entry[]): Category[] {
  const known = new Set(types.map((t) => t.id));
  return [
    ...types.map((t) => ({ id: t.id, title: t.plural, name: t.name, type: t })),
    ...[...new Set(entries.map((e) => e.type))].filter((id) => !known.has(id)).map((id) => ({ id, title: id, name: id })),
  ];
}

/** `home` changes each time the Bible is chosen in the side bar, which brings back the categories. */
export function BibleView({ selected, onSelected, home }: { selected: string | null; onSelected: (id: string | null) => void; home: number }) {
  const { session, notify, headerActions, setTrail } = useProject();
  const loaded = useLive(loadEntries, ["bible_entry"]);
  const entries = loaded ?? [];
  const types = useLive(loadTypes, ["bible_type"]) ?? [];
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [view, setView] = useState<View>({ kind: "home" });
  const [openId, setOpenId] = useState<string | null>(null);
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
  const categories = categoriesOf(types, entries);
  const category = view.kind === "type" ? categories.find((c) => c.id === view.id) : undefined;

  // Each level starts without a search and on the current entries.
  const go = (next: View) => {
    setView(next);
    setSearch("");
    setArchived(false);
  };

  useEffect(() => {
    go({ kind: "home" });
  }, [home]);

  // An entry opened from elsewhere (a link in the screenplay) lands in its category once the entries are there.
  const landing = useRef(false);
  useEffect(() => {
    if (!selected) return;
    setOpenId(selected);
    landing.current = true;
  }, [selected]);
  const current = openId ? entries.find((e) => e.id === openId) : undefined;
  useEffect(() => {
    if (!current || !landing.current) return;
    landing.current = false;
    if (view.kind !== "type" || view.id !== current.type) go({ kind: "type", id: current.type });
  }, [current?.id]);

  // Below the categories, the header says where one is; « Bible » or Escape goes back up.
  const inType = view.kind === "type" ? entries.filter((e) => e.type === view.id) : [];
  const shown = inType.filter((e) => !!e.archivedAt === archived);
  const here =
    view.kind === "type"
      ? { label: category?.title ?? view.id, count: shown.length }
      : view.kind === "detect"
        ? { label: "Détecter" }
        : view.kind === "types"
          ? { label: "Types de fiches" }
          : null;
  const hereKey = here ? `${view.kind}:${here.label}:${"count" in here ? here.count : ""}` : null;
  useEffect(() => {
    if (!here) return setTrail(null);
    setTrail([{ label: "Bible", onClick: () => go({ kind: "home" }) }, here]);
  }, [hereKey, setTrail]);
  useEffect(() => {
    if (view.kind === "home") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea, select, dialog, [role=dialog], [role=menu]")) return;
      go({ kind: "home" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.kind]);
  useEffect(() => () => setTrail(null), [setTrail]);

  // Coming back up, the focus goes to the category one left; going down, to its first card.
  const lastView = useRef<View>(view);
  useEffect(() => {
    const was = lastView.current;
    lastView.current = view;
    requestAnimationFrame(() => {
      if (view.kind === "home" && was.kind === "type") document.querySelector<HTMLElement>(`.type-card-open[data-type="${CSS.escape(was.id)}"]`)?.focus();
      if (view.kind === "type") (document.querySelector<HTMLElement>(".entry-card-open") ?? document.querySelector<HTMLElement>(".header-tools .btn.primary"))?.focus();
    });
  }, [view]);

  const matches = (e: Entry) => !search || [e.name, ...e.aliases, ...e.tags].some((n) => fold(n).includes(fold(search)));
  const found = view.kind === "home" && search ? entries.filter((e) => !e.archivedAt && matches(e)) : [];
  const visible = view.kind === "type" ? shown.filter(matches) : found;
  const archivedHere = inType.filter((e) => e.archivedAt).length;
  const newEntry = () => setCreating(view.kind === "type" && category ? view.id : "character");

  const open = (id: string) => {
    setOpenId(id);
    onSelected(id);
  };

  const create = async (type: string, name: string) => {
    try {
      const id = await createEntry(type, name);
      setCreating(null);
      if (view.kind !== "type" || view.id !== type) go({ kind: "type", id: type });
      open(id);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const close = () => {
    setOpenId(null);
    onSelected(null);
  };
  const browsing = view.kind === "home" || view.kind === "type";
  const noMatch = !!search && visible.length === 0;

  // When the entry closes, however it closed (button, Escape, deletion), the focus goes back to its card,
  // or to « Nouvelle fiche », in the header, when the card is gone.
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
      (card ?? document.querySelector<HTMLElement>(".header-tools .btn.primary"))?.focus();
    });
  }, [current?.id]);

  // Détecter and Types de fiches are switches: pressed again, they go back to the categories.
  const tool = (kind: "detect" | "types") => go(view.kind === kind ? { kind: "home" } : { kind });

  return (
    <div className="view bible-view">
      {headerActions &&
        createPortal(
          <div className="header-tools">
            {browsing && entries.length > 0 && (
              <input
                type="search"
                className="header-search"
                placeholder={category ? `Rechercher dans ${category.title}…` : "Rechercher une fiche…"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={category ? `Rechercher dans ${category.title}` : "Rechercher une fiche"}
              />
            )}
            <button type="button" className={view.kind === "detect" ? "btn on" : "btn"} aria-pressed={view.kind === "detect"} onClick={() => tool("detect")}>
              <ScanSearch aria-hidden="true" />
              Détecter
            </button>
            <button type="button" className={view.kind === "types" ? "btn on" : "btn"} aria-pressed={view.kind === "types"} onClick={() => tool("types")}>
              <Shapes aria-hidden="true" />
              Types de fiches
            </button>
            <button type="button" className="btn primary" onClick={newEntry}>
              <Plus aria-hidden="true" />
              Nouvelle fiche
            </button>
          </div>,
          headerActions,
        )}
      <main className={browsing && entries.length > 0 ? "view-main wide" : "view-main"}>
        {view.kind === "detect" && <Detection entries={entries} onCreated={() => go({ kind: "home" })} />}
        {view.kind === "types" && <TypeEditor types={types} startNew={view.startNew} />}
        {view.kind === "home" && entries.length > 0 && (
          <>
            {search ? (
              <EntrySections entries={found} categories={categories} presence={presence} onOpen={open} onCategory={(id) => go({ kind: "type", id })} />
            ) : (
              <CategoryCards categories={categories} entries={entries} presence={presence} onOpen={(id) => go({ kind: "type", id })} onNewType={() => go({ kind: "types", startNew: true })} />
            )}
          </>
        )}
        {view.kind === "type" && (
          <>
            <div className="bible-bar">
              <button type="button" className="btn ghost" onClick={() => go({ kind: "home" })}>
                <ArrowLeft aria-hidden="true" />
                Retour
              </button>
              <div className="bible-bar-tools">
                <label className="bible-sort">
                  <span>Trier par</span>
                  <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="name">Nom</option>
                    <option value="recent">Modifiées récemment</option>
                    <option value="presence">Présence dans le scénario</option>
                  </Select>
                </label>
                {(archivedHere > 0 || archived) && (
                  <button type="button" className={archived ? "btn small on" : "btn small"} aria-pressed={archived} onClick={() => setArchived(!archived)}>
                    <Archive aria-hidden="true" />
                    Archivées
                    <span className="btn-count">{archivedHere}</span>
                  </button>
                )}
              </div>
            </div>
            <EntryCards entries={visible} types={types} presence={presence} sort={sort} level={2} onOpen={open} />
            {shown.length === 0 && <p className="entry-cards-empty muted">{archived ? "Aucune fiche archivée ici." : "Pas encore de fiche ici."}</p>}
          </>
        )}
        {browsing && (
          // Always in the page, so that the screen reader hears the message when a search empties the cards.
          <p className="entry-cards-none muted" role="status">
            {noMatch ? "Aucune fiche ne correspond." : ""}
          </p>
        )}
        {/* Not while the cards are still being read: an empty Bible would flash before them. */}
        {browsing && loaded?.length === 0 && (
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
              <button type="button" className="btn" onClick={() => go({ kind: "detect" })}>
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
  const backdrop = useBackdropClose(onClose);
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
      {...backdrop}
    >
      <button type="button" className="entry-modal-close" aria-label="Fermer la fiche" title="Fermer (Échap)" onClick={onClose}>
        <X aria-hidden="true" />
      </button>
      <div className="entry-modal-body">{children}</div>
    </dialog>
  );
}

/** « 12 scènes », for the types the screenplay places: characters by their cues, locations by the headings. */
function presenceLabel(type: string, p: Presence | undefined): string | null {
  if (type !== "character" && type !== "location") return null;
  if (!p || p.count === 0) return "Aucune scène";
  return p.count === 1 ? "1 scène" : `${p.count} scènes`;
}

/** « Nyra Solenne, Tamsin Kreel, Oren Vasq et 11 autres »: the most present first where the screenplay counts them. */
function namesPreview(type: string, entries: Entry[], presence: Map<string, Presence>): string {
  const counted = type === "character" || type === "location";
  const names = [...entries]
    .sort((a, b) => (counted ? (presence.get(b.id)?.count ?? 0) - (presence.get(a.id)?.count ?? 0) : 0) || byName(a, b))
    .map((e) => e.name);
  const head = names.slice(0, 3).join(", ");
  const rest = names.length - 3;
  return rest > 0 ? `${head} et ${rest} ${rest === 1 ? "autre" : "autres"}` : head;
}

/** The home of the Bible: one card per category, with its count and its first names; the empty ones come last, quieter, then the card that makes a new type. */
function CategoryCards({
  categories,
  entries,
  presence,
  onOpen,
  onNewType,
}: {
  categories: Category[];
  entries: Entry[];
  presence: Map<string, Presence>;
  onOpen: (id: string) => void;
  onNewType: () => void;
}) {
  const cards = categories
    .map((c) => ({ ...c, entries: entries.filter((e) => e.type === c.id && !e.archivedAt) }))
    .sort((a, b) => Number(b.entries.length > 0) - Number(a.entries.length > 0));
  return (
    <ul className="type-cards">
      {cards.map((c) => {
        const Icon = iconOf(c.type);
        const n = c.entries.length;
        return (
          <li key={c.id} className={n ? "type-card" : "type-card empty"}>
            <span className="type-card-icon">
              <Icon aria-hidden="true" />
            </span>
            <h2 className="type-card-head">
              <button type="button" className="type-card-open" data-type={c.id} aria-describedby={`type-names-${c.id}`} onClick={() => onOpen(c.id)}>
                {c.title}
              </button>
              {n > 0 && <span className="type-card-count">{n}</span>}
            </h2>
            <span id={`type-names-${c.id}`} className="type-card-names">
              {n ? namesPreview(c.id, c.entries, presence) : "Aucune fiche"}
            </span>
          </li>
        );
      })}
      <li className="type-card new">
        <span className="type-card-icon">
          <Plus aria-hidden="true" />
        </span>
        <h2 className="type-card-head">
          <button type="button" className="type-card-open" aria-describedby="type-new-hint" onClick={onNewType}>
            Nouveau type
          </button>
        </h2>
        <span id="type-new-hint" className="type-card-names">
          Planètes, sortilèges, recettes… avec son icône et ses champs
        </span>
      </li>
    </ul>
  );
}

/** A search from the home: the entries found, under their category, whose name leads into it. */
function EntrySections({
  entries,
  categories,
  presence,
  onOpen,
  onCategory,
}: {
  entries: Entry[];
  categories: Category[];
  presence: Map<string, Presence>;
  onOpen: (id: string) => void;
  onCategory: (id: string) => void;
}) {
  const sections = categories.map((c) => ({ ...c, entries: entries.filter((e) => e.type === c.id) })).filter((s) => s.entries.length > 0);
  return (
    <div className="entry-sections">
      {sections.map((s) => {
        const Icon = iconOf(s.type);
        return (
          <section key={s.id} className="entry-section" aria-labelledby={`bible-section-${s.id}`}>
            <header className="entry-section-head">
              <h2 id={`bible-section-${s.id}`}>
                <Icon aria-hidden="true" />
                <button type="button" className="entry-section-link" onClick={() => onCategory(s.id)}>
                  {s.title}
                </button>
                <span className="entry-section-count">{s.entries.length}</span>
              </h2>
            </header>
            <EntryCards entries={s.entries} types={categories.flatMap((c) => (c.type ? [c.type] : []))} presence={presence} sort="name" level={3} onOpen={onOpen} />
          </section>
        );
      })}
    </div>
  );
}

/** The cards of some entries. « Validé » is where an entry ends up and shows nothing; « Idée » and « Abandonné » show, as something left to do. */
function EntryCards({
  entries,
  types,
  presence,
  sort,
  level,
  onOpen,
}: {
  entries: Entry[];
  types: EntryType[];
  presence: Map<string, Presence>;
  sort: Sort;
  level: 2 | 3;
  onOpen: (id: string) => void;
}) {
  if (entries.length === 0) return null;
  const order: (a: Entry, b: Entry) => number =
    sort === "recent"
      ? (a, b) => b.updatedAt.localeCompare(a.updatedAt)
      : sort === "presence"
        ? (a, b) => (presence.get(b.id)?.count ?? 0) - (presence.get(a.id)?.count ?? 0) || byName(a, b)
        : byName;
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <ul className="entry-cards">
      {[...entries].sort(order).map((e) => {
        const Icon = iconOf(types.find((t) => t.id === e.type));
        const where = presenceLabel(e.type, presence.get(e.id));
        const meta = where || e.status !== "validated";
        // The button holds only the name, a heading of the grid; the summary and the meta describe it.
        // Its ::after spreads over the whole card, so the card still opens on a click anywhere.
        const described = [e.summary && `entry-summary-${e.id}`, meta && `entry-meta-${e.id}`].filter(Boolean).join(" ");
        return (
          <li key={e.id} className="entry-card">
            <Heading className="entry-card-head">
              {/* The entry's own picture, when it has one, takes the place of its type's icon. */}
              <span className={e.image ? "entry-card-icon photo" : "entry-card-icon"}>
                {e.image ? <MediaImage path={e.image} alt="" /> : <Icon aria-hidden="true" />}
              </span>
              <button type="button" className="entry-card-open entry-name" data-entry={e.id} aria-describedby={described || undefined} onClick={() => onOpen(e.id)}>
                {e.name}
              </button>
            </Heading>
            {e.summary && (
              <span id={`entry-summary-${e.id}`} className="entry-card-summary">
                {firstSentence(e.summary)}
              </span>
            )}
            {meta && (
              <span id={`entry-meta-${e.id}`} className="entry-card-meta">
                {where && <span className={where === "Aucune scène" ? "entry-card-where none" : "entry-card-where"}>{where}</span>}
                {e.status === "idea" && <span className="badge st-draft">Idée</span>}
                {e.status === "abandoned" && <span className="badge st-todo">Abandonné</span>}
              </span>
            )}
          </li>
        );
      })}
    </ul>
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
          <Select value={t} onChange={(e) => setT(e.target.value)}>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
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
