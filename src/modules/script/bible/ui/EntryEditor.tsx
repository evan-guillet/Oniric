import { ImagePlus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeError } from "../../../../core/errors";
import { useLive } from "../../../../core/db/live";
import type { EntryStatus } from "../../../../core/db/schema";
import { Dialog } from "../../../../ui-kit/Dialog";
import { Labeled, TagInput } from "../../../../ui-kit/Form";
import { RichText, richSchema } from "../../../../ui-kit/RichText";
import { MediaImage, pickImage } from "../../../shared/media";
import { useProject } from "../../../project/ui/projectContext";
import { useScenes } from "../../screenplay/application/scriptSession";
import { archiveEntry, backlinks, bibleIndex, deleteEntry, duplicateEntry, entryVersions, restoreEntry, saveEntry, type Entry } from "../application/bible";
import { sceneTexts } from "../application/sceneTexts";
import { appearances } from "../domain/appearances";
import { STATUSES, type EntryType, type FieldDef } from "../domain/types";
import { wikiPlugin } from "./wikiPlugin";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
/** Scenes listed before « Voir les N scènes ». */
const SCENES_SHOWN = 6;

type SaveState = "idle" | "pending" | "saved" | "error";
const SAVE_LABEL: Record<Exclude<SaveState, "idle">, string> = { pending: "Modifications…", saved: "Enregistré", error: "Non enregistré" };

/** Edits one entry; changes are saved a moment after the last one [BIB-01]. */
export function EntryEditor({ entry, entries, types }: { entry: Entry; entries: Entry[]; types: EntryType[] }) {
  const { notify, openScene, session } = useProject();
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
    return s ? `${s.index + 1}. ${s.heading || "(sans en-tête)"}` : null;
  };

  // No confirmation: the notice offers to bring the entry back, with the edits saved just before.
  const remove = async () => {
    const { id, name } = latest.current;
    try {
      await flush();
      await deleteEntry(id);
      notify({
        text: `La fiche « ${name} » est supprimée.`,
        actions: [{ label: "Annuler", onClick: () => void restoreEntry(id).catch((e) => notify({ text: describeError(e), tone: "error" })) }],
      });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  return (
    <article className="entry" aria-label={`Fiche ${draft.name}`}>
      <header className="entry-head">
        <ImageFrame path={draft.image} onChange={(image) => update({ image })} />
        <div className="entry-title">
          <input className="entry-name-input" value={draft.name} onChange={(e) => update({ name: e.target.value })} onBlur={() => void flush()} aria-label="Nom" />
          <div className="entry-meta">
            <select value={draft.type} onChange={(e) => update({ type: e.target.value })} aria-label="Type">
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select value={draft.status} onChange={(e) => update({ status: e.target.value as EntryStatus })} aria-label="Statut">
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            {draft.archivedAt && <span className="badge">Archivée</span>}
          </div>
          <div className="entry-actions">
            <button type="button" className="btn small" onClick={() => void duplicateEntry(draft)}>
              Dupliquer
            </button>
            <button type="button" className="btn small" onClick={() => void archiveEntry(draft.id, !draft.archivedAt)}>
              {draft.archivedAt ? "Désarchiver" : "Archiver"}
            </button>
            <button type="button" className="btn small" onClick={() => setHistory(true)}>
              Historique
            </button>
            <button type="button" className="btn ghost small danger" onClick={() => void remove()}>
              Supprimer
            </button>
            {saveState !== "idle" && <span className={`entry-saved ${saveState}`}>{SAVE_LABEL[saveState]}</span>}
          </div>
        </div>
      </header>

      <div className="entry-body">
        <div className="entry-main">
          <Labeled label="Résumé court">
            <textarea rows={2} value={draft.summary} onChange={(e) => update({ summary: e.target.value })} onBlur={() => void flush()} />
          </Labeled>
          {longFields.map(field)}
          <div className="fld">
            <span className="fld-label">Contenu</span>
            <RichText value={draft.content} onChange={(content) => update({ content })} label="Contenu de la fiche" plugins={plugins} minHeight={220} />
          </div>
          {notesOpen ? (
            <Labeled label="Notes">
              <textarea rows={3} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} onBlur={() => void flush()} autoFocus={!draft.notes} />
            </Labeled>
          ) : (
            <button type="button" className="btn ghost small entry-fold" onClick={() => setNotesOpen(true)}>
              <Plus aria-hidden="true" />
              Notes
            </button>
          )}
        </div>

        <aside className="entry-side" aria-label="Détails de la fiche">
          <section className="entry-refs">
            <h3>
              Scènes <span className="entry-refs-count">{seen.size}</span>
            </h3>
            {seen.size === 0 ? (
              <p className="muted small">Aucune scène pour l'instant.</p>
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
                  <button type="button" className="btn ghost small entry-refs-more" aria-expanded={allScenes} onClick={() => setAllScenes(!allScenes)}>
                    {allScenes ? "Voir moins" : `Voir les ${seen.size} scènes`}
                  </button>
                )}
              </>
            )}
            {links && links.entries.length > 0 && (
              <>
                <h3>
                  Mentionnée dans <span className="entry-refs-count">{links.entries.length}</span>
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
          <TagInput label="Autres noms" value={draft.aliases} onChange={(aliases) => update({ aliases })} help="Surnoms, diminutifs : reconnus dans le scénario comme le nom." />
          {shortFields.map(field)}
          <TagInput label="Étiquettes" value={draft.tags} onChange={(tags) => update({ tags })} suggestions={[...new Set(entries.flatMap((e) => e.tags))]} />
          <LinksInput value={draft.links} entries={entries} selfId={draft.id} onChange={(l) => update({ links: l })} label="Liens vers d'autres fiches" />
          {draft.gallery.length > 0 ? (
            <div className="fld">
              <span className="fld-label">Galerie</span>
              <div className="gallery">
                {draft.gallery.map((p) => (
                  <figure key={p}>
                    <MediaImage path={p} alt="" />
                    <button type="button" className="btn ghost small" onClick={() => update({ gallery: draft.gallery.filter((x) => x !== p) })}>
                      Retirer
                    </button>
                  </figure>
                ))}
                <button type="button" className="btn small" onClick={() => void addImages()}>
                  Ajouter des images…
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn ghost small entry-fold" onClick={() => void addImages()}>
              <Plus aria-hidden="true" />
              Galerie
            </button>
          )}
        </aside>
      </div>

      {history && (
        <HistoryDialog
          id={draft.id}
          onClose={() => setHistory(false)}
          onRestore={async (old) => {
            const restored = { ...old, id: draft.id, archivedAt: draft.archivedAt };
            const previous = saved.current;
            saved.current = restored;
            setDraft(restored);
            await saveEntry(restored, previous);
            setHistory(false);
            notify({ text: "Version restaurée." });
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
          <select value={text} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {field.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
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
          <select value={text} onChange={(e) => onChange(e.target.value)}>
            <option value="">—</option>
            {options.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
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
  const { notify } = useProject();
  return (
    <div className={path ? "entry-image filled" : "entry-image"}>
      <button
        type="button"
        className="entry-image-pick"
        aria-label={path ? "Changer l'image" : "Choisir une image"}
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
          {path ? "Changer" : "Choisir une image"}
        </span>
      </button>
      {path && (
        <button type="button" className="entry-image-remove" aria-label="Retirer l'image" title="Retirer l'image" onClick={() => onChange(null)}>
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
  const name = (id: string) => entries.find((e) => e.id === id)?.name ?? "(fiche supprimée)";
  return (
    <div className="fld wide">
      <span className="fld-label">{label}</span>
      <div className="tags">
        {value.map((id) => (
          <span key={id} className="tag">
            <button type="button" className="link" onClick={() => openEntry(id)}>
              {name(id)}
            </button>
            <button type="button" aria-label={`Retirer ${name(id)}`} onClick={() => onChange(value.filter((x) => x !== id))}>
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        <select
          value=""
          aria-label={`Ajouter : ${label}`}
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">+ Lier…</option>
          {entries
            .filter((e) => e.id !== selfId && !value.includes(e.id))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

function HistoryDialog({ id, onClose, onRestore }: { id: string; onClose: () => void; onRestore: (e: Entry) => Promise<void> }) {
  const versions = useLive(() => entryVersions(id), ["bible_entry_version"], [id]);
  return (
    <Dialog title="Historique de la fiche" onCancel={onClose} wide actions={[{ label: "Fermer", onClick: onClose }]}>
      {!versions ? (
        <p className="muted">Chargement…</p>
      ) : versions.length === 0 ? (
        <p className="muted">Aucune version antérieure pour l'instant : Oniric en garde une toutes les dix minutes de travail sur la fiche.</p>
      ) : (
        <ul className="version-list">
          {versions.map((v) => (
            <li key={v.id}>
              <span>
                <strong>{dateFormat.format(new Date(v.createdAt))}</strong> — {v.entry.name}
                {v.entry.summary && <span className="muted small"> · {v.entry.summary.slice(0, 80)}</span>}
              </span>
              <button type="button" className="btn small" onClick={() => void onRestore(v.entry)}>
                Restaurer
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
