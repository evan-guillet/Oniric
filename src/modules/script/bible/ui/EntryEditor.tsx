import { Archive, ArchiveRestore, Copy, History, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeError } from "../../../../core/errors";
import { useLive } from "../../../../core/db/live";
import type { EntryStatus } from "../../../../core/db/schema";
import { confirmRemoval, Dialog } from "../../../../ui-kit/Dialog";
import { Labeled, TagInput } from "../../../../ui-kit/Form";
import { MoreMenu } from "../../../../ui-kit/MoreMenu";
import { RichText, richSchema } from "../../../../ui-kit/RichText";
import { MediaImage, pickImage } from "../../../shared/media";
import { useProject } from "../../../project/ui/projectContext";
import { useScenes } from "../../screenplay/application/scriptSession";
import { archiveEntry, backlinks, bibleIndex, deleteEntry, duplicateEntry, entryVersions, restoreEntry, saveEntry, type Entry } from "../application/bible";
import { sceneTexts } from "../application/sceneTexts";
import { appearances } from "../domain/appearances";
import { optionLabel, STATUSES, type EntryType, type FieldDef } from "../domain/types";
import { wikiPlugin } from "./wikiPlugin";

import { Select } from "../../../../ui-kit/Select";
import { dateFormat, t } from "../../../../core/i18n";
const dates = () => dateFormat({ dateStyle: "medium", timeStyle: "short" });
/** Scenes listed before « Voir les N scènes ». */
const SCENES_SHOWN = 6;

type SaveState = "idle" | "pending" | "saved" | "error";

/** Edits one entry; changes are saved a moment after the last one [BIB-01]. */
export function EntryEditor({ entry, entries, types }: { entry: Entry; entries: Entry[]; types: EntryType[] }) {
  const { notify, ask, openScene, openEntry, session } = useProject();
  const [draft, setDraft] = useState(entry);
  const saved = useRef(entry);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(draft);
  latest.current = draft;
  const [history, setHistory] = useState(false);
  // Nothing shows until the first change.
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [allScenes, setAllScenes] = useState(false);
  // Empty, Notes and Galerie fold to a button; once open or filled they stay open.
  const [notesOpen, setNotesOpen] = useState(!!entry.notes);
  const plugins = useMemo(() => [wikiPlugin(richSchema.marks.wikilink, () => bibleIndex)], []);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = latest.current;
    if (JSON.stringify(next) === JSON.stringify(saved.current)) {
      setSaveState((st) => (st === "pending" ? "saved" : st));
      return;
    }
    const previous = saved.current;
    saved.current = next;
    try {
      await saveEntry(next, previous);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      notify({ text: describeError(e), tone: "error" });
    }
  };

  useEffect(() => () => void flush(), []);

  const update = (patch: Partial<Entry>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  };
  const setField = (key: string, value: unknown) => update({ fields: { ...latest.current.fields, [key]: value } });

  const type = types.find((t) => t.id === draft.type);
  const scenes = useScenes(session);
  const seen = useMemo(
    () => new Set(appearances({ id: draft.id, type: draft.type, name: draft.name, aliases: draft.aliases }, sceneTexts(scenes))),
    [scenes, draft.id, draft.type, draft.name, draft.aliases],
  );
  const links = useLive(() => backlinks(draft.id), ["bible_entry", "scene"], [draft.id]);
  const longFields = type?.fields.filter((f) => f.kind === "longtext") ?? [];
  const shortFields = type?.fields.filter((f) => f.kind !== "longtext") ?? [];
  const field = (f: FieldDef) => (
    <FieldInput key={f.key} field={f} value={draft.fields[f.key]} onChange={(v) => setField(f.key, v)} onBlur={() => void flush()} entries={entries} selfId={draft.id} />
  );
  const addImages = async () => {
    try {
      const ps = await pickImage(true);
      if (ps.length) update({ gallery: [...latest.current.gallery, ...ps] });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  const sceneLabel = (id: string) => {
    const s = scenes.find((x) => x.id === id);
    return s ? `${s.index + 1}. ${s.heading || t("dash.noHeading")}` : null;
  };

  // The copy was silent: the notice says it exists and opens it.
  const duplicate = async () => {
    try {
      await flush();
      const id = await duplicateEntry(latest.current);
      notify({ text: t("entry.copied", { name: t("settings.copyName", { name: latest.current.name }) }), actions: [{ label: t("workspace.openFile"), onClick: () => openEntry(id) }] });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  // Confirmed first; the notice still offers to bring the entry back, with the edits saved just before.
  const remove = async () => {
    const { id, name } = latest.current;
    if (!(await confirmRemoval(ask, { title: t("entry.deleteAsk", { name: name || t("entry.unnamed") }), text: t("entry.deleteText") }))) return;
    try {
      await flush();
      await deleteEntry(id);
      notify({
        text: t("entry.deleted", { name }),
        actions: [{ label: t("common.cancel"), onClick: () => void restoreEntry(id).catch((e) => notify({ text: describeError(e), tone: "error" })) }],
      });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  return (
    <article className="entry" aria-label={t("entry.label", { name: draft.name })}>
      <header className="entry-head">
        <ImageFrame path={draft.image} onChange={(image) => update({ image })} />
        <div className="entry-title">
          <input className="entry-name-input" value={draft.name} onChange={(e) => update({ name: e.target.value })} onBlur={() => void flush()} aria-label={t("settings.profile.name")} />
          <div className="entry-meta">
            <Select value={draft.type} onChange={(e) => update({ type: e.target.value })} aria-label={t("bible.type")}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Select value={draft.status} onChange={(e) => update({ status: e.target.value as EntryStatus })} aria-label={t("board.filterKinds.status")}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            {/* From the live entry: the draft never sees archiving, which saveEntry leaves alone. */}
            {entry.archivedAt && <span className="badge">{t("entry.archivedBadge")}</span>}
            {/* The occasional actions wait in « ⋯ »; only Supprimer, which can be undone, stays in view. */}
            <span className="entry-actions">
              {saveState !== "idle" && <span className={`entry-saved ${saveState}`}>{t(`entry.save.${saveState}`)}</span>}
              <button type="button" className="btn small danger" onClick={() => void remove()}>
                <Trash2 aria-hidden="true" />
                {t("common.delete")}
              </button>
              <MoreMenu
                label={t("entry.more")}
                items={[
                  { label: t("settings.duplicate"), icon: Copy, onClick: () => void duplicate() },
                  entry.archivedAt
                    ? { label: t("script.notes.unarchive"), icon: ArchiveRestore, hint: t("entry.unarchiveHint"), onClick: () => void archiveEntry(draft.id, false) }
                    : {
                        label: t("script.notes.archive"),
                        icon: Archive,
                        hint: t("entry.archiveHint"),
                        onClick: () => void archiveEntry(draft.id, true),
                      },
                  { label: t("entry.historyAction"), icon: History, onClick: () => setHistory(true) },
                ]}
              />
            </span>
          </div>
        </div>
      </header>

      <div className="entry-body">
        <div className="entry-main">
          <Labeled label={t("entry.summary")}>
            <textarea rows={2} value={draft.summary} onChange={(e) => update({ summary: e.target.value })} onBlur={() => void flush()} />
          </Labeled>
          {longFields.map(field)}
          <div className="fld">
            <span className="fld-label">{t("entry.content")}</span>
            <RichText value={draft.content} onChange={(content) => update({ content })} label={t("entry.contentLabel")} plugins={plugins} minHeight={220} />
          </div>
          {notesOpen ? (
            <Labeled label={t("script.panels.notes")}>
              <textarea rows={3} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} onBlur={() => void flush()} autoFocus={!draft.notes} />
            </Labeled>
          ) : (
            <button type="button" className="btn small text entry-fold" onClick={() => setNotesOpen(true)}>
              <Plus aria-hidden="true" />
              {t("script.panels.notes")}
            </button>
          )}
        </div>

        <aside className="entry-side" aria-label={t("entry.details")}>
          <section className="entry-refs">
            <h3>
              {t("dash.scenes")} <span className="entry-refs-count">{seen.size}</span>
            </h3>
            {seen.size === 0 ? (
              <p className="muted small">{t("entry.noScene")}</p>
            ) : (
              <>
                <ul className="ref-list">
                  {[...seen].slice(0, allScenes ? undefined : SCENES_SHOWN).map((id) => (
                    <li key={id}>
                      <button type="button" className="entry-ref" title={sceneLabel(id) ?? undefined} onClick={() => openScene(id)}>
                        {sceneLabel(id)}
                      </button>
                    </li>
                  ))}
                </ul>
                {seen.size > SCENES_SHOWN && (
                  <button type="button" className="btn small text entry-refs-more" aria-expanded={allScenes} onClick={() => setAllScenes(!allScenes)}>
                    {allScenes ? t("entry.seeLess") : t("entry.seeAllScenes", { n: seen.size })}
                  </button>
                )}
              </>
            )}
            {links && links.entries.length > 0 && (
              <>
                <h3>
                  {t("entry.mentionedIn")} <span className="entry-refs-count">{links.entries.length}</span>
                </h3>
                <ul className="ref-list">
                  {links.entries.map((e) => (
                    <li key={e.id}>
                      <button type="button" className="entry-ref" onClick={() => bibleIndex.open(e.id)}>
                        {e.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <TagInput label={t("entry.aliases")} value={draft.aliases} onChange={(aliases) => update({ aliases })} help={t("entry.aliasesHelp")} />
          {shortFields.map(field)}
          <TagInput label={t("entry.tags")} value={draft.tags} onChange={(tags) => update({ tags })} suggestions={[...new Set(entries.flatMap((e) => e.tags))]} />
          <LinksInput value={draft.links} entries={entries} selfId={draft.id} onChange={(l) => update({ links: l })} label={t("entry.links")} />
          {draft.gallery.length > 0 ? (
            <div className="fld">
              <span className="fld-label">{t("entry.gallery")}</span>
              <div className="gallery">
                {draft.gallery.map((p) => (
                  <figure key={p}>
                    <MediaImage path={p} alt="" />
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={async () => {
                        if (await confirmRemoval(ask, { title: t("entry.removeImageAsk"), text: t("entry.removeImageText"), label: t("script.info.remove") }))
                          update({ gallery: latest.current.gallery.filter((x) => x !== p) });
                      }}
                    >
                      {t("script.info.remove")}
                    </button>
                  </figure>
                ))}
                <button type="button" className="btn small" onClick={() => void addImages()}>
                  {t("entry.addImages")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn small text entry-fold" onClick={() => void addImages()}>
              <Plus aria-hidden="true" />
              {t("entry.gallery")}
            </button>
          )}
        </aside>
      </div>

      {history && (
        <HistoryDialog
          id={draft.id}
          onClose={() => setHistory(false)}
          onRestore={async (old) => {
            const restored = { ...old, id: draft.id, archivedAt: entry.archivedAt };
            const previous = saved.current;
            saved.current = restored;
            setDraft(restored);
            await saveEntry(restored, previous);
            setHistory(false);
            notify({ text: t("entry.restored") });
          }}
        />
      )}
    </article>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  onBlur,
  entries,
  selfId,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  onBlur: () => void;
  entries: Entry[];
  selfId: string;
}) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  switch (field.kind) {
    case "longtext":
      return (
        <Labeled label={field.label} help={field.help} wide>
          <textarea rows={2} value={text} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
        </Labeled>
      );
    case "number":
      return (
        <Labeled label={field.label} help={field.help}>
          <input type="number" value={text} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} onBlur={onBlur} />
        </Labeled>
      );
    case "list":
      return (
        <Labeled label={field.label} help={field.help}>
          <Select value={text} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {field.options?.map((o) => (
              <option key={o} value={o}>
                {optionLabel(o)}
              </option>
            ))}
          </Select>
        </Labeled>
      );
    case "image":
      return (
        <div className="fld">
          <span className="fld-label">{field.label}</span>
          <ImageFrame path={text || null} onChange={(p) => onChange(p ?? "")} />
        </div>
      );
    case "link": {
      const options = entries.filter((e) => e.id !== selfId && (!field.target || e.type === field.target));
      return (
        <Labeled label={field.label} help={field.help}>
          <Select value={text} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {options.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Labeled>
      );
    }
    case "links":
      return (
        <LinksInput
          label={field.label}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          entries={entries.filter((e) => !field.target || e.type === field.target)}
          selfId={selfId}
        />
      );
    default:
      return (
        <Labeled label={field.label} help={field.help}>
          <input value={text} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
        </Labeled>
      );
  }
}

/** The image frame is the button: empty it invites to choose an image, filled it offers to change or remove it. */
function ImageFrame({ path, onChange }: { path: string | null; onChange: (p: string | null) => void }) {
  const { notify, ask } = useProject();
  return (
    <div className={path ? "entry-image filled" : "entry-image"}>
      <button
        type="button"
        className="entry-image-pick"
        aria-label={path ? t("entry.changeImage") : t("media.choose")}
        onClick={async () => {
          try {
            const [p] = await pickImage();
            if (p) onChange(p);
          } catch (e) {
            notify({ text: describeError(e), tone: "error" });
          }
        }}
      >
        {path && <MediaImage path={path} alt="" />}
        <span className="entry-image-hint">
          <ImagePlus aria-hidden="true" />
          {path ? t("entry.change") : t("media.choose")}
        </span>
      </button>
      {path && (
        <button type="button" className="entry-image-remove" aria-label={t("entry.removeImage")} title={t("entry.removeImage")}
          onClick={async () => {
            if (await confirmRemoval(ask, { title: t("entry.removeOneImageAsk"), text: t("entry.removeOneImageText"), label: t("script.info.remove") })) onChange(null);
          }}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function LinksInput({
  value,
  onChange,
  entries,
  selfId,
  label,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  entries: Entry[];
  selfId: string;
  label: string;
}) {
  const { openEntry } = useProject();
  const name = (id: string) => entries.find((e) => e.id === id)?.name ?? t("entry.deletedEntry");
  return (
    <div className="fld wide">
      <span className="fld-label">{label}</span>
      <div className="tags">
        {value.map((id) => (
          <span key={id} className="tag">
            <button type="button" className="link" onClick={() => openEntry(id)}>
              {name(id)}
            </button>
            <button type="button" aria-label={t("script.info.removeName", { name: name(id) })} onClick={() => onChange(value.filter((x) => x !== id))}>
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        <Select
          className="links-add"
          value=""
          aria-label={t("entry.addTo", { label })}
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="" hidden>
            {t("entry.link")}
          </option>
          {entries
            .filter((e) => e.id !== selfId && !value.includes(e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </Select>
      </div>
    </div>
  );
}

function HistoryDialog({ id, onClose, onRestore }: { id: string; onClose: () => void; onRestore: (e: Entry) => Promise<void> }) {
  const versions = useLive(() => entryVersions(id), ["bible_entry_version"], [id]);
  return (
    <Dialog title={t("entry.history")} onCancel={onClose} wide actions={[{ label: t("common.close"), onClick: onClose }]}>
      {!versions ? (
        <p className="muted">{t("dash.loading")}</p>
      ) : versions.length === 0 ? (
        <p className="muted">{t("entry.noHistory")}</p>
      ) : (
        <ul className="version-list">
          {versions.map((v) => (
            <li key={v.id}>
              <span>
                <strong>{dates().format(new Date(v.createdAt))}</strong> — {v.entry.name}
                {v.entry.summary && <span className="muted small"> · {v.entry.summary.slice(0, 80)}</span>}
              </span>
              <button type="button" className="btn small" onClick={() => void onRestore(v.entry)}>
                {t("entry.restore")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
