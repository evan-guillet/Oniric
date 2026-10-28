import { Archive, ArrowLeft, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { Dialog } from "../../../../ui-kit/Dialog";
import { EmptyState } from "../../../../ui-kit/Form";
import { MediaImage } from "../../../shared/media";
import { useProject } from "../../../project/ui/projectContext";
import { useScenes } from "../../screenplay/application/scriptSession";
import { createEntry, loadEntries, loadTypes, type Entry } from "../application/bible";
import { sceneTexts } from "../application/sceneTexts";
import { appearances, detect, triage } from "../domain/appearances";
import { firstSentence, fold, type EntryType } from "../domain/types";
import { EntryEditor } from "./EntryEditor";
import { TypeDialog } from "./TypeEditor";
import { iconOf } from "./typeIcons";
import { Select } from "../../../../ui-kit/Select";
import { plural, relativeFormat, t } from "../../../../core/i18n";

/** Where one is in the Bible: the categories, or one category's entries. The open entry takes their place. */
type View = { kind: "home" } | { kind: "type"; id: string };
/** The type being made or changed in its modal: a new one, or a custom type. */
type TypeEdit = { type?: EntryType };

type Sort = "name" | "recent" | "presence";
/** Scenes where an entry appears: how many, and the index of the first one (-1 when none). */
type Presence = { count: number; first: number };
/** One category: a type, or the raw id of a removed type that still has entries. */
type Category = { id: string; title: string; name: string; type?: EntryType };

/** « Le Cimetière des navires » sorts under C: the leading article is ignored. */
const sortKey = (name: string) => fold(name).replace(/^(l['’]\s*|(le|la|les|un|une|des)\s+)/, "");
const byName = (a: Entry, b: Entry) => sortKey(a.name).localeCompare(sortKey(b.name), "fr");

/**
 * A character or a location of the screenplay without an entry, found as one writes [BIB-03]. It shows as a card
 * with the « Détecté » badge and becomes an entry once opened. The doubtful names (roles, likely duplicates,
 * parts of a location) are left out.
 */
const DETECTED = "detected:";
const isDetected = (e: Entry) => e.id.startsWith(DETECTED);
function detectedEntries(texts: ReturnType<typeof sceneTexts>, entries: Entry[]): Entry[] {
  const refs = entries.map((e) => ({ id: e.id, type: e.type, name: e.name, aliases: e.aliases }));
  return triage(detect(texts, refs), refs)
    .filter((c) => c.doubt === null)
    .map((c) => ({
      id: DETECTED + c.key,
      type: c.type,
      name: c.name,
      aliases: [],
      summary: "",
      content: "",
      fields: {},
      tags: [],
      links: [],
      status: "validated",
      image: null,
      gallery: [],
      notes: "",
      createdAt: "",
      updatedAt: "",
      archivedAt: null,
    }));
}

function DetectedBadge() {
  return (
    <span className="badge detected" title={t("bible.detectedTitle")}>
      {t("bible.detected")}
    </span>
  );
}

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
  const saved = loaded ?? [];
  const types = useLive(loadTypes, ["bible_type"]) ?? [];
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [view, setView] = useState<View>({ kind: "home" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [typeEdit, setTypeEdit] = useState<TypeEdit | null>(null);
  const [sort, setSort] = useState<Sort>("name");
  const scenes = useScenes(session);
  const texts = useMemo(() => sceneTexts(scenes), [scenes]);
  // Not while the entries are still being read: every name would show as detected.
  const detected = useMemo(() => (loaded ? detectedEntries(texts, loaded) : []), [texts, loaded]);
  const entries = useMemo(() => [...saved, ...detected], [saved, detected]);
  const presence = useMemo(() => {
    const index = new Map(scenes.map((s) => [s.id, s.index]));
    const out = new Map<string, Presence>();
    for (const e of entries) {
      const ids = appearances({ id: e.id, type: e.type, name: e.name, aliases: e.aliases }, texts);
      out.set(e.id, { count: ids.length, first: ids.length ? Math.min(...ids.map((id) => index.get(id) ?? 0)) : -1 });
    }
    return out;
  }, [scenes, texts, entries]);
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
  const current = openId ? saved.find((e) => e.id === openId) : undefined;
  useEffect(() => {
    if (!current || !landing.current) return;
    landing.current = false;
    if (view.kind !== "type" || view.id !== current.type) go({ kind: "type", id: current.type });
  }, [current?.id]);

  // Below the categories, the header says where one is; « Bible » or Escape goes back up.
  const inType = view.kind === "type" ? entries.filter((e) => e.type === view.id) : [];
  const shown = inType.filter((e) => !!e.archivedAt === archived);
  // An open entry adds its name after its category, which then leads back to the list.
  const typeStep = view.kind === "type" ? { label: category?.title ?? view.id, count: shown.length } : null;
  const trail = current
    ? [...(typeStep ? [{ label: typeStep.label, onClick: () => close() }] : []), { label: current.name }]
    : typeStep
      ? [typeStep]
      : null;
  const trailKey = trail ? JSON.stringify(trail.map((t) => [t.label, "count" in t ? t.count : ""])) : null;
  useEffect(() => {
    if (!trail) return setTrail(null);
    setTrail([
      {
        label: "Bible",
        onClick: () => {
          close();
          go({ kind: "home" });
        },
      },
      ...trail,
    ]);
  }, [trailKey, setTrail]);
  // Escape goes up one level: from the entry to the list it was opened from, from a category to the home.
  useEffect(() => {
    if (view.kind === "home" && !current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea, select, dialog, [role=dialog], [role=menu], .ProseMirror")) return;
      if (current) close();
      else go({ kind: "home" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.kind, !!current]);
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
  const customType = category?.type && !category.type.builtin ? category.type : undefined;
  const newEntry = () => setCreating(view.kind === "type" && category ? view.id : "character");

  const open = async (id: string) => {
    const found = entries.find((e) => e.id === id);
    if (found && isDetected(found)) {
      // A detected card becomes an entry as it opens.
      try {
        id = await createEntry(found.type, found.name);
      } catch (e) {
        notify({ text: describeError(e), tone: "error" });
        return;
      }
    }
    setOpenId(id);
    onSelected(id);
  };

  const create = async (type: string, name: string) => {
    try {
      const id = await createEntry(type, name);
      setCreating(null);
      if (view.kind !== "type" || view.id !== type) go({ kind: "type", id: type });
      void open(id);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  const close = () => {
    setOpenId(null);
    onSelected(null);
  };
  const browsing = !current;
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

  return (
    <div className="view bible-view">
      {headerActions &&
        createPortal(
          <div className="header-tools">
            {browsing && entries.length > 0 && (
              <input
                type="search"
                className="header-search"
                placeholder={category ? t("bible.searchIn", { title: category.title }) : t("bible.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={category ? t("bible.searchInLabel", { title: category.title }) : t("bible.searchLabel")}
              />
            )}
            <button type="button" className="btn primary" onClick={newEntry}>
              <Plus aria-hidden="true" />
              {t("bible.newEntry")}
            </button>
          </div>,
          headerActions,
        )}
      <main className={browsing && entries.length > 0 ? "view-main wide" : "view-main"}>
        {current && (
          <>
            <div className="bible-bar">
              <button type="button" className="btn text" onClick={close}>
                <ArrowLeft aria-hidden="true" />
                {t("bible.back")}
              </button>
            </div>
            <div className="entry-page">
              <EntryEditor key={current.id} entry={current} entries={saved} types={types} />
            </div>
          </>
        )}
        {browsing && view.kind === "home" && entries.length > 0 && (
          <>
            {search ? (
              <EntrySections entries={found} categories={categories} presence={presence} onOpen={(id) => void open(id)} onCategory={(id) => go({ kind: "type", id })} />
            ) : (
              <CategoryCards
                categories={categories}
                entries={entries}
                presence={presence}
                onOpen={(id) => go({ kind: "type", id })}
                onOpenEntry={(id) => void open(id)}
                onCreate={setCreating}
                onNewType={() => setTypeEdit({})}
              />
            )}
          </>
        )}
        {browsing && view.kind === "type" && (
          <>
            <div className="bible-bar">
              <button type="button" className="btn text" onClick={() => go({ kind: "home" })}>
                <ArrowLeft aria-hidden="true" />
                {t("bible.back")}
              </button>
              <div className="bible-bar-tools">
                {customType && (
                  <button type="button" className="btn small" onClick={() => setTypeEdit({ type: customType })}>
                    <Pencil aria-hidden="true" />
                    {t("bible.editType")}
                  </button>
                )}
                <label className="bible-sort">
                  <span>{t("bible.sortBy")}</span>
                  <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="name">{t("settings.profile.name")}</option>
                    <option value="recent">{t("bible.recent")}</option>
                    <option value="presence">{t("bible.presence")}</option>
                  </Select>
                </label>
                {(archivedHere > 0 || archived) && (
                  <button type="button" className={archived ? "btn small on" : "btn small"} aria-pressed={archived} onClick={() => setArchived(!archived)}>
                    <Archive aria-hidden="true" />
                    {t("bible.archived")}
                    <span className="btn-count">{archivedHere}</span>
                  </button>
                )}
              </div>
            </div>
            <EntryCards entries={visible} types={types} presence={presence} sort={sort} level={2} onOpen={(id) => void open(id)} />
            {shown.length === 0 && <p className="entry-cards-empty muted">{archived ? t("bible.noArchived") : t("bible.noEntryHere")}</p>}
          </>
        )}
        {browsing && (
          // Always in the page, so that the screen reader hears the message when a search empties the cards.
          <p className="entry-cards-none muted" role="status">
            {noMatch ? t("bible.noMatch") : ""}
          </p>
        )}
        {/* Not while the cards are still being read: an empty Bible would flash before them. */}
        {browsing && loaded?.length === 0 && detected.length === 0 && (
          <EmptyState title={t("bible.emptyTitle")}>
            <p className="muted">
              {t("bible.emptyText")} {t("bible.emptyLinkBefore")} <kbd>@</kbd> {t("settings.or")} <kbd>[[</kbd> {t("bible.emptyLinkAfter")}
            </p>
            <p className="empty-actions">
              <button type="button" className="btn primary" onClick={newEntry}>
                <Plus aria-hidden="true" />
                {t("bible.newEntry")}
              </button>
            </p>
            <p className="muted small">
              {session.editor === null ? t("bible.loadingScript") : t("bible.willAppear")}
            </p>
          </EmptyState>
        )}
      </main>
      {creating !== null && <NewEntryDialog types={types} type={creating} onCancel={() => setCreating(null)} onCreate={create} />}
      {typeEdit && (
        <TypeDialog
          type={typeEdit.type}
          types={types}
          onClose={(id) => {
            setTypeEdit(null);
            if (id && !typeEdit.type) notify({ text: t("bible.typeCreated") });
          }}
        />
      )}
    </div>
  );
}

/** « 12 scènes », for the types the screenplay places: characters by their cues, locations by the headings. */
function presenceLabel(type: string, p: Presence | undefined): string | null {
  if (type !== "character" && type !== "location") return null;
  if (!p || p.count === 0) return t("bible.noScene");
  return plural("sceneList.count", p.count);
}

/** The entries of a type, the most present first where the screenplay counts them, else by name. */
function ranked(type: string, entries: Entry[], presence: Map<string, Presence>): Entry[] {
  const counted = type === "character" || type === "location";
  return [...entries].sort((a, b) => (counted ? (presence.get(b.id)?.count ?? 0) - (presence.get(a.id)?.count ?? 0) : 0) || byName(a, b));
}

/** « il y a 5 minutes », « hier », « il y a 3 semaines ». */
function since(iso: string): string {
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
    ["year", Infinity],
  ];
  let v = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, size] of steps) {
    if (Math.round(Math.abs(v)) < size) return unit === "second" ? t("bible.justNow") : relativeFormat({ numeric: "auto" }).format(Math.round(v), unit);
    v /= size;
  }
  return "";
}

/** An entry's picture, or the first letter of its name. */
function Avatar({ entry }: { entry: Entry }) {
  return (
    <span className={entry.image ? "bible-avatar photo" : "bible-avatar"} aria-hidden="true">
      {entry.image ? <MediaImage path={entry.image} alt="" /> : sortKey(entry.name).charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** How many entries a category's card lists before « Voir les N ». */
const LISTED = 4;

/**
 * The home of the Bible: the entries last changed, to pick up where one left off; then one card per category
 * listing its most present entries, each opening at once, and « Nouveau type » as the last card; then the
 * categories still empty, each a button that makes their first entry.
 */
function CategoryCards({
  categories,
  entries,
  presence,
  onOpen,
  onOpenEntry,
  onCreate,
  onNewType,
}: {
  categories: Category[];
  entries: Entry[];
  presence: Map<string, Presence>;
  onOpen: (id: string) => void;
  onOpenEntry: (id: string) => void;
  onCreate: (type: string) => void;
  onNewType: () => void;
}) {
  const cards = categories.map((c) => ({ ...c, entries: entries.filter((e) => e.type === c.id && !e.archivedAt) }));
  const full = cards.filter((c) => c.entries.length > 0);
  const empty = cards.filter((c) => c.entries.length === 0);
  const categoryOf = new Map(categories.map((c) => [c.id, c]));
  const recent = entries
    .filter((e) => !e.archivedAt && !isDetected(e))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);
  return (
    <div className="bible-home">
      {recent.length > 0 && (
        <section className="bible-home-part" aria-labelledby="bible-recent">
          <h2 id="bible-recent" className="bible-home-label">
            {t("bible.recent")}
          </h2>
          <ul className="recent-entries">
            {recent.map((e) => {
              const c = categoryOf.get(e.type);
              const Icon = iconOf(c?.type);
              return (
                <li key={e.id}>
                  <button type="button" className="recent-entry" onClick={() => onOpenEntry(e.id)}>
                    {e.image ? (
                      <Avatar entry={e} />
                    ) : (
                      <span className="recent-entry-icon" aria-hidden="true">
                        <Icon />
                      </span>
                    )}
                    <span className="recent-entry-text">
                      <span className="recent-entry-name">{e.name}</span>
                      <span className="recent-entry-meta">
                        <span>
                          {c?.name ?? e.type} · {since(e.updatedAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="bible-home-part" aria-labelledby="bible-types">
        <h2 id="bible-types" className="bible-home-label">
          {t("bible.byType")}
        </h2>
        <ul className="type-cards">
          {full.map((c) => {
            const Icon = iconOf(c.type);
            const n = c.entries.length;
            const counted = c.id === "character" || c.id === "location";
            const listed = ranked(c.id, c.entries, presence).slice(0, LISTED);
            // Pictures only where some entry has one: letters alone would read as bullets.
            const pictured = listed.some((e) => e.image);
            return (
              <li key={c.id} className="type-card">
                <div className="type-card-top">
                  <span className="type-card-icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <h3 className="type-card-head">
                    <button type="button" className="type-card-open" data-type={c.id} onClick={() => onOpen(c.id)}>
                      {c.title}
                    </button>
                  </h3>
                  <span className="type-card-count">{n}</span>
                </div>
                <ul className="type-card-entries">
                  {listed.map((e) => {
                      const k = presence.get(e.id)?.count ?? 0;
                      return (
                        <li key={e.id}>
                          <button type="button" className="type-card-entry" onClick={() => onOpenEntry(e.id)}>
                            {pictured && <Avatar entry={e} />}
                            <span className="type-card-entry-name">{e.name}</span>
                            {isDetected(e) && <DetectedBadge />}
                            {counted && (
                              <span className="type-card-entry-where" title={plural("sceneList.count", k)}>
                                {t("bible.scenesShort", { n: k })}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                </ul>
                {n > LISTED && (
                  <button type="button" className="type-card-more" onClick={() => onOpen(c.id)}>
                    {t("bible.seeAll", { n })}
                  </button>
                )}
              </li>
            );
          })}
          <li className="type-card-new-item">
            <button type="button" className="type-card-new" onClick={onNewType}>
              <span className="type-card-new-label">
                <Plus aria-hidden="true" />
                {t("bible.newType")}
              </span>
              <span className="type-card-new-hint">{t("bible.newTypeHint")}</span>
            </button>
          </li>
        </ul>
      </section>

      {empty.length > 0 && (
        <section className="bible-home-part" aria-labelledby="bible-empty">
          <h2 id="bible-empty" className="bible-home-label">
            {t("bible.noEntryYet")}
          </h2>
          <ul className="type-pills">
          {empty.map((c) => {
            const Icon = iconOf(c.type);
            return (
              <li key={c.id}>
                <button type="button" className="type-pill" title={t("bible.createFirst", { name: c.name })} onClick={() => onCreate(c.id)}>
                  <Icon aria-hidden="true" />
                  {c.title}
                  <Plus className="type-pill-add" aria-hidden="true" />
                </button>
              </li>
            );
          })}
          </ul>
        </section>
      )}
    </div>
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
        const meta = where || e.status !== "validated" || isDetected(e);
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
                {where && <span className={where === t("bible.noScene") ? "entry-card-where none" : "entry-card-where"}>{where}</span>}
                {e.status === "idea" && <span className="badge st-draft">{t("bible.statuses.idea")}</span>}
                {e.status === "abandoned" && <span className="badge st-todo">{t("bible.statuses.abandoned")}</span>}
                {isDetected(e) && <DetectedBadge />}
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
  const [chosen, setChosen] = useState(type);
  const [name, setName] = useState("");
  return (
    <Dialog
      title={t("bible.newEntry")}
      onCancel={onCancel}
      actions={[
        { label: t("common.cancel"), onClick: onCancel },
        { label: t("bible.createEntry"), primary: true, disabled: !name.trim(), onClick: () => onCreate(chosen, name) },
      ]}
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(chosen, name);
        }}
      >
        <label className="field">
          <span>{t("bible.type")}</span>
          <Select value={chosen} onChange={(e) => setChosen(e.target.value)}>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="field">
          <span>{t("settings.profile.name")}</span>
          <input name="entry-name" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        </label>
      </form>
    </Dialog>
  );
}
