import { ImagePlus, X } from "lucide-react";
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
import { archiveEntry, backlinks, bibleIndex, deleteEntry, duplicateEntry, entryVersions, saveEntry, type Entry } from "../application/bible";
import { sceneTexts } from "../application/sceneTexts";
import { appearances } from "../domain/appearances";
import { STATUSES, type EntryType, type FieldDef } from "../domain/types";
import { wikiPlugin } from "./wikiPlugin";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Edits one entry; changes are saved a moment after the last one [BIB-01]. */
export function EntryEditor({ entry, entries, types }: { entry: Entry; entries: Entry[]; types: EntryType[] }) {
  const { notify, ask, openScene, session } = useProject();
  const [draft, setDraft] = useState(entry);
  const saved = useRef(entry);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(draft);
  latest.current = draft;
  const [history, setHistory] = useState(false);
  const plugins = useMemo(() => [wikiPlugin(richSchema.marks.wikilink, () => bibleIndex)], []);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = latest.current;
    if (JSON.stringify(next) === JSON.stringify(saved.current)) return;
    const previous = saved.current;
    saved.current = next;
    try {
      await saveEntry(next, previous);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  useEffect(() => () => void flush(), []);

  const update = (patch: Partial<Entry>) => {
    setDraft((d) => ({ ...d, ...patch }));
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
  const sceneLabel = (id: string) => {
    const s = scenes.find((x) => x.id === id);
    return s ? `${s.index + 1}. ${s.heading || "(sans en-tête)"}` : null;
  };

  const remove = async () => {
    const choice = await ask({
      title: "Supprimer la fiche ?",
      text: <p>« {draft.name} » sera supprimée. Les liens qui y mènent resteront dans le texte, sans destination.</p>,
      cancel: "Annuler",
      choices: [{ label: "Supprimer", value: "delete", danger: true }],
    });
    if (choice === "delete") await deleteEntry(draft.id);
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
          </div>
        </div>
      </header>

      <div className="entry-grid">
        <TagInput label="Autres noms" value={draft.aliases} onChange={(aliases) => update({ aliases })} help="Surnoms, diminutifs : reconnus dans le scénario comme le nom." />
        <Labeled label="Résumé court" wide>
          <textarea rows={2} value={draft.summary} onChange={(e) => update({ summary: e.target.value })} onBlur={() => void flush()} />
        </Labeled>
        {type?.fields.map((field) => (
          <FieldInput key={field.key} field={field} value={draft.fields[field.key]} onChange={(v) => setField(field.key, v)} onBlur={() => void flush()} entries={entries} selfId={draft.id} />
        ))}
        <TagInput label="Étiquettes" value={draft.tags} onChange={(tags) => update({ tags })} suggestions={[...new Set(entries.flatMap((e) => e.tags))]} />
        <div className="fld wide">
          <span className="fld-label">Contenu</span>
          <RichText value={draft.content} onChange={(content) => update({ content })} label="Contenu de la fiche" plugins={plugins} minHeight={160} />
        </div>
        <LinksInput value={draft.links} entries={entries} selfId={draft.id} onChange={(l) => update({ links: l })} label="Liens vers d'autres fiches" />
        <div className="fld wide">
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
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                try {
                  const ps = await pickImage(true);
                  if (ps.length) update({ gallery: [...latest.current.gallery, ...ps] });
                } catch (e) {
                  notify({ text: describeError(e), tone: "error" });
                }
              }}
            >
              Ajouter des images…
            </button>
          </div>
        </div>
        <Labeled label="Notes" wide>
          <textarea rows={3} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} onBlur={() => void flush()} />
        </Labeled>
      </div>

      <section className="entry-refs">
        <h3>Scènes où « {draft.name} » apparaît ({seen.size})</h3>
        {seen.size === 0 ? (
          <p className="muted small">Aucune scène pour l'instant.</p>
        ) : (
          <ul className="ref-list">
            {[...seen].map((id) => (
              <li key={id}>
                <button type="button" className="link" onClick={() => openScene(id)}>
                  {sceneLabel(id)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {links && links.entries.length > 0 && (
          <>
            <h3>Fiches qui mentionnent « {draft.name} »</h3>
            <ul className="ref-list">
              {links.entries.map((e) => (
                <li key={e.id}>
                  <button type="button" className="link" onClick={() => bibleIndex.open(e.id)}>
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

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
