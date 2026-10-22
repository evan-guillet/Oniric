import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { useDebounced } from "../../../../ui-kit/Form";
import { useProject } from "../../../project/ui/projectContext";
import { addRelation, createEntry, deleteRelation, loadEntries, loadRelations, setEntryField, type Entry } from "../../bible/application/bible";
import { loadStory, STORY_TABLES } from "../../views/application/story";
import { DRAMATIC_FUNCTIONS, OPPOSITION_KINDS, RELATION_KINDS } from "../domain/steps";
import { Help, useWorkshop, WText } from "./fields";

interface Secondary {
  entryId: string;
  role: string;
}

/** Step 2: protagonist, opposition, secondary characters, relationship map [PER-01 to PER-05]. */
export function StepCharacters() {
  const w = useWorkshop();
  const { notify, openEntry, prompt } = useProject();
  const entries = useLive(loadEntries, ["bible_entry"]) ?? [];
  const characters = entries.filter((e) => e.type === "character" && !e.archivedAt);
  const protagonist = characters.find((c) => c.id === w.get("char.protagonist", ""));
  const antagonist = characters.find((c) => c.id === w.get("char.antagonist", ""));
  const secondary = w.get<Secondary[]>("char.secondary", []);

  const pickOrCreate = async (value: string, key: string) => {
    if (value === "__new") {
      const name = await prompt("Nouveau personnage", "Nom du personnage");
      if (!name?.trim()) return;
      try {
        const id = await createEntry("character", name);
        w.set(key, id);
      } catch (e) {
        notify({ text: describeError(e), tone: "error" });
      }
    } else w.set(key, value);
  };

  const select = (key: string, current?: Entry) => (
    <select value={current?.id ?? ""} onChange={(e) => void pickOrCreate(e.target.value, key)}>
      <option value="">— Choisir un personnage de la bible —</option>
      {characters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__new">+ Nouveau personnage…</option>
    </select>
  );

  return (
    <div className="step-body">
      <section className="step-section">
        <h3>Le protagoniste</h3>
        <Help>Le personnage dont on suit la quête. Son désir le fait agir ; son besoin, souvent caché, est ce qu'il découvre en chemin.</Help>
        {select("char.protagonist", protagonist)}
        {protagonist && <CharacterSheet entry={protagonist} keys={["desire", "need", "flaw", "arc_start", "arc_end"]} onOpen={() => openEntry(protagonist.id)} />}
      </section>

      <section className="step-section">
        <h3>L'antagoniste ou la force d'opposition</h3>
        <Help>Ce qui s'oppose au désir du protagoniste : une personne, un groupe, la nature, la société, ou lui-même.</Help>
        <div className="grid-2">
          <label className="fld">
            <span className="fld-label">Nature de l'opposition</span>
            <select value={w.get("char.opposition", "Personne")} onChange={(e) => w.set("char.opposition", e.target.value)}>
              {OPPOSITION_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          {w.get("char.opposition", "Personne") === "Personne" && (
            <label className="fld">
              <span className="fld-label">Antagoniste</span>
              {select("char.antagonist", antagonist)}
            </label>
          )}
        </div>
        <WText k="char.opposition_text" label="En quoi elle s'oppose" rows={2} />
        {antagonist && w.get("char.opposition", "Personne") === "Personne" && (
          <CharacterSheet entry={antagonist} keys={["desire", "motivations", "flaw"]} onOpen={() => openEntry(antagonist.id)} />
        )}
      </section>

      <section className="step-section">
        <h3>Les personnages secondaires</h3>
        <Help>Chacun a une fonction dramatique : le mentor guide, l'allié aide, le gardien du seuil met à l'épreuve, l'ombre incarne ce que le héros pourrait devenir…</Help>
        <table className="table compact">
          <tbody>
            {secondary.map((s, i) => {
              const e = characters.find((c) => c.id === s.entryId);
              return (
                <tr key={i}>
                  <td>
                    {e ? (
                      <button type="button" className="link" onClick={() => openEntry(e.id)}>
                        {e.name}
                      </button>
                    ) : (
                      <span className="muted">(fiche supprimée)</span>
                    )}
                  </td>
                  <td>
                    <select value={s.role} onChange={(ev) => w.set("char.secondary", secondary.map((x, k) => (k === i ? { ...x, role: ev.target.value } : x)))} aria-label="Fonction dramatique">
                      {DRAMATIC_FUNCTIONS.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button type="button" className="btn ghost small" aria-label="Retirer" onClick={() => w.set("char.secondary", secondary.filter((_, k) => k !== i))}>
                      <X aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <select
          value=""
          aria-label="Ajouter un personnage secondaire"
          onChange={(e) => e.target.value && w.set("char.secondary", [...secondary, { entryId: e.target.value, role: "Allié" }])}
        >
          <option value="">+ Ajouter un personnage secondaire…</option>
          {characters
            .filter((c) => c.id !== protagonist?.id && !secondary.some((s) => s.entryId === c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </section>

      <section className="step-section">
        <h3>Carte des relations</h3>
        <Help>Les liens entre personnages : famille, amour, rivalité, hiérarchie… Un lien peut ne valoir qu'à partir d'un acte, pour voir les relations évoluer.</Help>
        <RelationMap characters={characters} />
      </section>
    </div>
  );
}

const SHEET_LABELS: Record<string, string> = {
  desire: "Désir (ce qu'il veut)",
  need: "Besoin (ce dont il a vraiment besoin)",
  flaw: "Faille",
  arc_start: "Arc : état initial",
  arc_end: "Arc : état final",
  motivations: "Motivations",
};

/** Fields of the bible entry itself: the workshop and the bible show the same data [PER-04]. */
function CharacterSheet({ entry, keys, onOpen }: { entry: Entry; keys: string[]; onOpen: () => void }) {
  return (
    <div className="sheet">
      {keys.map((k) => (
        <EntryField key={`${entry.id}-${k}`} entry={entry} k={k} label={SHEET_LABELS[k] ?? k} />
      ))}
      <button type="button" className="btn ghost small" onClick={onOpen}>
        Ouvrir la fiche complète de {entry.name}
      </button>
    </div>
  );
}

function EntryField({ entry, k, label }: { entry: Entry; k: string; label: string }) {
  const { notify } = useProject();
  const [v, set, flush] = useDebounced(String(entry.fields[k] ?? ""), (value) =>
    setEntryField(entry.id, k, value).catch((e) => notify({ text: describeError(e), tone: "error" })),
  );
  return (
    <label className="fld wide">
      <span className="fld-label">{label}</span>
      <textarea rows={2} value={v} onChange={(e) => set(e.target.value)} onBlur={flush} />
    </label>
  );
}

const KIND_COLORS: Record<string, string> = {
  Famille: "#5b6fd6",
  Amour: "#e05d8a",
  Amitié: "#5fb36b",
  Rivalité: "#e8933c",
  Hiérarchie: "#8a8a8a",
  Alliance: "#4aa3c7",
  Haine: "#c0392b",
  Autre: "#9b62c9",
};

function RelationMap({ characters }: { characters: Entry[] }) {
  const { notify } = useProject();
  const relations = useLive(loadRelations, ["relation"]) ?? [];
  const story = useLive(loadStory, [...STORY_TABLES]);
  const [act, setAct] = useState<string>("");
  const [form, setForm] = useState({ from: "", to: "", kind: "Famille", note: "", actId: "" });
  const acts = story?.acts ?? [];
  const actIndex = (id: string | null) => (id ? acts.findIndex((a) => a.id === id) : -1);
  const shown = relations.filter((r) => !act || actIndex(r.actId) <= actIndex(act));

  const ids = useMemo(() => [...new Set(characters.map((c) => c.id))], [characters]);
  const R = 150;
  const cx = 220;
  const cy = 180;
  const at = (id: string) => {
    const i = ids.indexOf(id);
    const a = (2 * Math.PI * i) / Math.max(1, ids.length) - Math.PI / 2;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  };
  const name = (id: string) => characters.find((c) => c.id === id)?.name ?? "?";

  if (characters.length < 2) return <p className="muted">Créez au moins deux personnages dans la bible pour dessiner leurs relations.</p>;

  return (
    <div className="relations">
      <svg width={440} height={360} role="img" aria-label="Carte des relations entre personnages" className="relation-map">
        {shown.map((r) => {
          const a = at(r.fromId);
          const b = at(r.toId);
          return (
            <g key={r.id}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={KIND_COLORS[r.kind] ?? "#888"} strokeWidth={2.5} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} className="rel-label" textAnchor="middle">
                {r.kind}
              </text>
            </g>
          );
        })}
        {ids.map((id) => {
          const p = at(id);
          return (
            <g key={id}>
              <circle cx={p.x} cy={p.y} r={8} className="rel-node" />
              <text x={p.x} y={p.y + (p.y < cy ? -14 : 22)} textAnchor="middle" className="rel-name">
                {name(id)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="relation-side">
        {acts.length > 0 && (
          <label className="fld">
            <span className="fld-label">Afficher les relations</span>
            <select value={act} onChange={(e) => setAct(e.target.value)}>
              <option value="">De tout le film</option>
              {acts.map((a) => (
                <option key={a.id} value={a.id}>
                  Jusqu'à {a.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <ul className="rel-list">
          {shown.map((r) => (
            <li key={r.id}>
              <span className="dot" style={{ background: KIND_COLORS[r.kind] }} /> {name(r.fromId)} — {r.kind.toLowerCase()} — {name(r.toId)}
              {r.note && <span className="muted small"> · {r.note}</span>}
              {r.actId && <span className="muted small"> · dès {acts.find((a) => a.id === r.actId)?.title}</span>}
              <button type="button" className="btn ghost tiny" aria-label="Retirer la relation" onClick={() => void deleteRelation(r.id)}>
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="rel-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.from || !form.to || form.from === form.to) return;
            try {
              await addRelation({ fromId: form.from, toId: form.to, kind: form.kind, note: form.note, actId: form.actId || null });
              setForm({ ...form, note: "" });
            } catch (err) {
              notify({ text: describeError(err), tone: "error" });
            }
          }}
        >
          <select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} aria-label="Premier personnage">
            <option value="">Personnage…</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Nature du lien">
            {RELATION_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <select value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} aria-label="Second personnage">
            <option value="">Personnage…</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Précision (frère aîné, ex-femme…)" aria-label="Précision" />
          {acts.length > 0 && (
            <select value={form.actId} onChange={(e) => setForm({ ...form, actId: e.target.value })} aria-label="À partir de">
              <option value="">Dès le début</option>
              {acts.map((a) => (
                <option key={a.id} value={a.id}>
                  À partir de {a.title}
                </option>
              ))}
            </select>
          )}
          <button type="submit" className="btn small" disabled={!form.from || !form.to || form.from === form.to}>
            Ajouter le lien
          </button>
        </form>
      </div>
    </div>
  );
}
