import { Archive, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { Dialog } from "../../../../ui-kit/Dialog";
import { EmptyState } from "../../../../ui-kit/Form";
import { MediaImage } from "../../../shared/media";
import { useStoredState } from "../../../../ui-kit/useStoredState";
import { PAGE_KEY, useProject } from "../../../project/ui/projectContext";
import { useScenes } from "../../screenplay/application/scriptSession";
import { bibleCategories, createEntry, loadEntries, loadTypes, type Entry } from "../application/bible";
import { sceneTexts } from "../application/sceneTexts";
import { detectedEntries, isDetected } from "../application/detected";
import { appearances } from "../domain/appearances";
import { firstSentence, fold, type EntryType } from "../domain/types";
import { EntryEditor } from "./EntryEditor";
import { TypeDialog } from "./TypeEditor";
import { iconOf } from "./typeIcons";
import { SearchBox } from "../../../../ui-kit/SearchBox";
import { Select } from "../../../../ui-kit/Select";
import { plural, t } from "../../../../core/i18n";

type Sort = "name" | "recent" | "presence";
/** Scenes where an entry appears: how many, and the index of the first one (-1 when none). */
type Presence = { count: number; first: number };

/** « Le Cimetière des navires » sorts under C: the leading article is ignored. */
const sortKey = (name: string) => fold(name).replace(/^(l['’]\s*|(le|la|les|un|une|des)\s+)/, "");
const byName = (a: Entry, b: Entry) => sortKey(a.name).localeCompare(sortKey(b.name), "fr");

function DetectedBadge() {
  return (
    <span className="badge detected" title={t("bible.detectedTitle")}>
      {t("bible.detected")}
    </span>
  );
}

/**
 * The entries of one type, chosen in the side bar, with the type's entry open in their place. `home` changes each time
 * the side bar is used, which closes the entry.
 */
export function BibleView({ selected, onSelected, home }: { selected: string | null; onSelected: (id: string | null) => void; home: number }) {
  const { session, notify, setTrail } = useProject();
  const loaded = useLive(loadEntries, ["bible_entry"]);
  const saved = loaded ?? [];
  const types = useLive(loadTypes, ["bible_type"]) ?? [];
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [kept, keep] = useStoredState(PAGE_KEY.bible, "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [typeEdit, setTypeEdit] = useState<EntryType | null>(null);
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
  const categories = bibleCategories(types, entries);
  const category = categories.find((c) => c.id === kept) ?? categories[0];
  const typeId = category?.id;

  // Each type starts without a search and on the current entries.
  useEffect(() => {
    setSearch("");
    setArchived(false);
  }, [typeId]);

  const lastHome = useRef(home);
  useEffect(() => {
    if (lastHome.current === home) return;
    lastHome.current = home;
    setOpenId(null);
    setSearch("");
  }, [home]);

  // An entry opened from elsewhere (a link in the screenplay) lands in its type once the entries are there.
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
    if (typeId !== current.type) keep(current.type);
  }, [current?.id]);

  const inType = entries.filter((e) => e.type === typeId);
  const shown = inType.filter((e) => !!e.archivedAt === archived);
  // An open entry adds its name after its category, which then leads back to the list.
  const title = category?.title ?? "";
  const trail = current ? [{ label: title, onClick: () => close() }, { label: current.name }] : category ? [{ label: title, count: shown.length }] : null;
  const trailKey = trail ? JSON.stringify(trail.map((t) => [t.label, "count" in t ? t.count : ""])) : null;
  useEffect(() => {
    setTrail(trail);
  }, [trailKey, setTrail]);
  // Escape goes from the entry back to the list it was opened from.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || (e.target as HTMLElement).closest("input, textarea, select, dialog, [role=dialog], [role=menu], .ProseMirror")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [!!current]);
  useEffect(() => () => setTrail(null), [setTrail]);

  const matches = (e: Entry) => !search || [e.name, ...e.aliases, ...e.tags].some((n) => fold(n).includes(fold(search)));
  const visible = shown.filter(matches);
  const archivedHere = inType.filter((e) => e.archivedAt).length;
  const customType = category?.type && !category.type.builtin ? category.type : undefined;
  const newEntry = () => setCreating(typeId ?? "character");

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
      if (typeId !== type) keep(type);
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
  // or to « Nouvelle fiche », above the cards, when the card is gone.
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
      (card ?? document.querySelector<HTMLElement>(".bible-toolbar .btn.primary"))?.focus();
    });
  }, [current?.id]);

  return (
    <div className="view bible-view">
      <main className={browsing && entries.length > 0 ? "view-main wide" : "view-main"}>
        {current && (
          <div className="entry-page">
            <EntryEditor key={current.id} entry={current} entries={saved} types={types} />
          </div>
        )}
        {browsing && category && entries.length > 0 && (
          <>
            <div className="bible-toolbar">
              <SearchBox
                value={search}
                onChange={setSearch}
                placeholder={t("bible.searchIn", { title })}
                label={t("bible.searchInLabel", { title })}
              />
              <div className="bible-bar-tools">
                {customType && (
                  <button type="button" className="btn small" onClick={() => setTypeEdit(customType)}>
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
              <button type="button" className="btn primary" onClick={newEntry}>
                <Plus aria-hidden="true" />
                {t("bible.newEntry")}
              </button>
            </div>
            <EntryCards entries={visible} types={types} presence={presence} sort={sort} onOpen={(id) => void open(id)} />
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
              {t("bible.emptyText")} {t("bible.emptyLinkBefore")} <kbd>/</kbd>, <kbd>@</kbd> {t("settings.or")} <kbd>[[</kbd> {t("bible.emptyLinkAfter")}
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
      {typeEdit && <TypeDialog type={typeEdit} types={types} onClose={() => setTypeEdit(null)} />}
    </div>
  );
}

/** « 12 scènes », for the types the screenplay places: characters by their cues, locations by the headings. */
function presenceLabel(type: string, p: Presence | undefined): string | null {
  if (type !== "character" && type !== "location") return null;
  if (!p || p.count === 0) return t("bible.noScene");
  return plural("sceneList.count", p.count);
}

/** The cards of some entries. « Validé » is where an entry ends up and shows nothing; « Idée » and « Abandonné » show, as something left to do. */
function EntryCards({
  entries,
  types,
  presence,
  sort,
  onOpen,
}: {
  entries: Entry[];
  types: EntryType[];
  presence: Map<string, Presence>;
  sort: Sort;
  onOpen: (id: string) => void;
}) {
  if (entries.length === 0) return null;
  const order: (a: Entry, b: Entry) => number =
    sort === "recent"
      ? (a, b) => b.updatedAt.localeCompare(a.updatedAt)
      : sort === "presence"
        ? (a, b) => (presence.get(b.id)?.count ?? 0) - (presence.get(a.id)?.count ?? 0) || byName(a, b)
        : byName;
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
            <h2 className="entry-card-head">
              {/* The entry's own picture, when it has one, takes the place of its type's icon. */}
              <span className={e.image ? "entry-card-icon photo" : "entry-card-icon"}>
                {e.image ? <MediaImage path={e.image} alt="" /> : <Icon aria-hidden="true" />}
              </span>
              <button type="button" className="entry-card-open entry-name" data-entry={e.id} aria-describedby={described || undefined} onClick={() => onOpen(e.id)}>
                {e.name}
              </button>
            </h2>
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
