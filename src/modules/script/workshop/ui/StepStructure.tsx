import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useLive } from "../../../../core/db/live";
import { uuidv7 } from "../../../../core/ids";
import { describeError } from "../../../../core/errors";
import { useDebounced } from "../../../../ui-kit/Form";
import { useProject } from "../../../project/ui/projectContext";
import { useScenes, type SceneInfo } from "../../screenplay/application/scriptSession";
import { formatMinutes } from "../../screenplay/domain/duration";
import { addActs, addSequence, deleteBeat, ensureBeat, loadStory, setBeatScenes, STORY_TABLES, storyOutline, updateBeat, type Beat, type Story } from "../../views/application/story";
import { MODELS, modelById, partGaps, type ModelBeat } from "../domain/structures";
import { Help, useWorkshop } from "./fields";

import { Select } from "../../../../ui-kit/Select";
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Step 3: structure model, key points linked to scenes, real against expected [STR-01 to STR-04]. */
export function StepStructure() {
  const w = useWorkshop();
  const { session, notify, ask, prompt } = useProject();
  const scenes = useScenes(session);
  const story = useLive(loadStory, [...STORY_TABLES]);
  const modelId = w.get<string>("structure.model", "three-acts");
  const model = modelById(modelId);
  if (!story) return <p className="muted">Chargement…</p>;

  const total = scenes.reduce((n, s) => n + s.eighths, 0) || 1;
  const groups = storyOutline(story, scenes.map((s) => s.id)).filter((g) => g.act);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const actShares = groups.map((g) => g.sequences.flatMap((s) => s.scenes).reduce((n, id) => n + (byId.get(id)?.eighths ?? 0), 0) / total);
  const gaps = partGaps(model, actShares);
  const pages = total / 8;

  const beats: { def: ModelBeat; stored?: Beat }[] =
    model.id === "free"
      ? story.beats.filter((b) => b.model === "free").map((b) => ({ def: { key: b.key, title: b.title, help: "", at: -1 }, stored: b }))
      : model.beats.map((def) => ({ def, stored: story.beats.find((b) => b.model === model.id && b.key === def.key) }));
  const elsewhere = story.beats.filter((b) => b.model !== model.id && (b.notes.trim() || b.scenes.length));

  const createActs = async () => {
    try {
      const existing = new Set(story.acts.map((a) => a.title));
      const missing = model.parts.map((p) => p.title).filter((t) => !existing.has(t));
      if (model.id === "eight-sequences") {
        const [one, two, three] = await addActs(story, ["Acte I", "Acte II", "Acte III"].filter((t) => !existing.has(t)));
        const fresh = await loadStory();
        for (const [i, p] of model.parts.entries()) await addSequence(fresh, [one, two, two, two, two, two, three, three][i] ?? null, p.title);
      } else if (missing.length) {
        await addActs(story, missing);
      }
      notify({ text: "Les actes du modèle sont dans le Tableau." });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  return (
    <div className="step-body">
      <section className="step-section">
        <h3>Modèle de structure</h3>
        <Help>Un modèle ne contraint rien : il propose des points clés à placer. Changer de modèle ne perd rien, les points remplis restent proposés.</Help>
        <div className="input-row">
          <Select value={model.id} onChange={(e) => w.set("structure.model", e.target.value)} aria-label="Modèle de structure">
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          {model.parts.length > 0 && (
            <button type="button" className="btn" onClick={() => void createActs()}>
              Créer ces actes dans le Tableau
            </button>
          )}
        </div>
      </section>

      {model.parts.length > 0 && (
        <section className="step-section">
          <h3>Répartition réelle</h3>
          <Help>Les actes du Tableau, dans l'ordre, comparés aux proportions du modèle, en pages et en minutes estimées.</Help>
          {groups.length === 0 ? (
            <p className="muted">Le Tableau n'a pas encore d'actes. Créez ceux du modèle, puis rangez-y les séquences et les scènes.</p>
          ) : (
            <table className="table compact gaps">
              <thead>
                <tr>
                  <th>Partie</th>
                  <th>Modèle</th>
                  <th>Réel</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {gaps.map((g, i) => (
                  <tr key={g.title} className={g.off ? "off" : ""}>
                    <td>
                      {g.title}
                      {groups[i]?.act && groups[i].act!.title !== g.title && <span className="muted small"> ({groups[i].act!.title})</span>}
                    </td>
                    <td>
                      {pct(g.expected)} · {formatMinutes(g.expected * pages)}
                    </td>
                    <td>{g.actual === null ? "—" : `${pct(g.actual)} · ${formatMinutes(g.actual * pages)}`}</td>
                    <td>
                      <span className="bar">
                        <span className="bar-expected" style={{ width: pct(g.expected) }} />
                        {g.actual !== null && <span className="bar-actual" style={{ width: pct(g.actual) }} />}
                      </span>
                      {g.off && <span className="badge warn">écart important</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="step-section">
        <h3>Points clés</h3>
        {beats.length === 0 && <p className="muted">Ajoutez vos propres points clés.</p>}
        <ol className="beats">
          {beats.map(({ def, stored }) => (
            <BeatRow key={def.key} model={model.id} def={def} stored={stored} story={story} scenes={scenes} pages={pages} />
          ))}
        </ol>
        {model.id === "free" && (
          <button
            type="button"
            className="btn small"
            onClick={async () => {
              const t = await prompt("Nouveau point clé", "Titre");
              if (t) await ensureBeat(story, "free", uuidv7(), t);
            }}
          >
            <Plus aria-hidden="true" />
            Point clé
          </button>
        )}
      </section>

      {elsewhere.length > 0 && (
        <section className="step-section">
          <h3>Points clés d'autres modèles</h3>
          <Help>Remplis avec un autre modèle : reprenez-les ici sans rien retaper.</Help>
          <ul className="elsewhere">
            {elsewhere.map((b) => (
              <li key={b.id}>
                <span>
                  <strong>{b.title}</strong> <span className="muted small">({modelById(b.model).name})</span>
                  {b.notes && <span className="muted small"> — {b.notes.slice(0, 120)}</span>}
                </span>
                <Select
                  value=""
                  aria-label={`Reprendre ${b.title} dans…`}
                  onChange={async (e) => {
                    const key = e.target.value;
                    if (!key) return;
                    const def = model.beats.find((x) => x.key === key);
                    try {
                      const id = await ensureBeat(story, model.id, key, def?.title ?? key);
                      const target = story.beats.find((x) => x.id === id);
                      await updateBeat(id, { notes: [target?.notes, b.notes].filter((s) => s?.trim()).join("\n\n") });
                      await setBeatScenes(id, [...new Set([...(target?.scenes ?? []), ...b.scenes])]);
                      notify({ text: `« ${b.title} » repris dans « ${def?.title ?? key} ».` });
                    } catch (err) {
                      notify({ text: describeError(err), tone: "error" });
                    }
                  }}
                >
                  <option value="" hidden>Reprendre dans…</option>
                  {model.beats.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.title}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label="Oublier ce point clé"
                  onClick={async () => {
                    const c = await ask({ title: "Oublier ce point clé ?", text: <p>Ses notes et ses liens aux scènes seront effacés.</p>, cancel: "Annuler", choices: [{ label: "Oublier", value: "y", danger: true }] });
                    if (c === "y") await deleteBeat(b.id);
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BeatRow({ model, def, stored, story, scenes, pages }: { model: string; def: ModelBeat; stored?: Beat; story: Story; scenes: SceneInfo[]; pages: number }) {
  const { notify, openScene, session } = useProject();
  const [adding, setAdding] = useState(false);
  const ensure = () => (stored ? Promise.resolve(stored.id) : ensureBeat(story, model, def.key, def.title));
  const [notes, setNotes, flush] = useDebounced(stored?.notes ?? "", (v) =>
    ensure()
      .then((id) => updateBeat(id, { notes: v }))
      .catch((e) => notify({ text: describeError(e), tone: "error" })),
  );
  const linked = (stored?.scenes ?? []).map((id) => scenes.find((s) => s.id === id)).filter((s): s is SceneInfo => !!s);
  const realPage = linked.length ? Math.min(...linked.map((s) => s.page)) : null;
  return (
    <li className="beat">
      <div className="beat-head">
        <strong>{def.title}</strong>
        {def.at >= 0 && (
          <span className="muted small">
            prévu vers p. {Math.max(1, Math.round(def.at * pages))}
            {realPage !== null && ` · réel p. ${realPage}`}
          </span>
        )}
      </div>
      {def.help && <p className="muted small">{def.help}</p>}
      <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={flush} aria-label={`Notes : ${def.title}`} />
      <div className="tags">
        {linked.map((s) => (
          <span key={s.id} className="tag">
            <button type="button" className="link" onClick={() => openScene(s.id)}>
              {s.index + 1}. {s.heading || "(sans en-tête)"}
            </button>
            <button
              type="button"
              aria-label="Délier la scène"
              onClick={() => stored && void setBeatScenes(stored.id, stored.scenes.filter((x) => x !== s.id))}
            >
              <X aria-hidden="true" />
            </button>
          </span>
        ))}
        {adding ? (
          <Select
            defaultOpen
            value=""
            aria-label="Scène à relier"
            onClose={() => setAdding(false)}
            onChange={async (e) => {
              const id = e.target.value;
              setAdding(false);
              if (!id) return;
              try {
                await session.flush();
                const beat = await ensure();
                await setBeatScenes(beat, [...(stored?.scenes ?? []), id]);
              } catch (err) {
                notify({ text: describeError(err), tone: "error" });
              }
            }}
          >
            <option value="" hidden>
              Choisir une scène…
            </option>
            {scenes
              .filter((s) => !stored?.scenes.includes(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.index + 1}. {s.heading || "(sans en-tête)"}
                </option>
              ))}
          </Select>
        ) : (
          <button type="button" className="btn ghost small" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            Relier une scène
          </button>
        )}
      </div>
    </li>
  );
}
