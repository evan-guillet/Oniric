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
import { t } from "../../../../core/i18n";
const pct = (x: number) => `${Math.round(x * 100)} %`;
const pctLabel = (x: number) => t("stats.percent", { n: Math.round(x * 100) });

/** Step 3: structure model, key points linked to scenes, real against expected [STR-01 to STR-04]. */
export function StepStructure() {
  const w = useWorkshop();
  const { session, notify, ask, prompt } = useProject();
  const scenes = useScenes(session);
  const story = useLive(loadStory, [...STORY_TABLES]);
  const modelId = w.get<string>("structure.model", "three-acts");
  const model = modelById(modelId);
  if (!story) return <p className="muted">{t("dash.loading")}</p>;

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
        const [one, two, three] = await addActs(story, modelById("three-acts").parts.map((p) => p.title).filter((title) => !existing.has(title)));
        const fresh = await loadStory();
        for (const [i, p] of model.parts.entries()) await addSequence(fresh, [one, two, two, two, two, two, three, three][i] ?? null, p.title);
      } else if (missing.length) {
        await addActs(story, missing);
      }
      notify({ text: t("structureStep.actsCreated") });
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };

  return (
    <div className="step-body">
      <section className="step-section">
        <h3>{t("structureStep.model")}</h3>
        <Help>{t("structureStep.modelHelp")}</Help>
        <div className="input-row">
          <Select value={model.id} onChange={(e) => w.set("structure.model", e.target.value)} aria-label={t("structureStep.model")}>
            {[
              { label: t("structureStep.films"), models: MODELS.filter((m) => m.parts.length > 0 && m.kind !== "tv") },
              { label: t("structureStep.series"), models: MODELS.filter((m) => m.kind === "tv") },
              { label: t("structureStep.noModel"), models: MODELS.filter((m) => m.parts.length === 0) },
            ].map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          {model.parts.length > 0 && (
            <button type="button" className="btn" onClick={() => void createActs()}>
              {t("structureStep.createActs")}
            </button>
          )}
        </div>
      </section>

      {model.parts.length > 0 && (
        <section className="step-section">
          <h3>{t("structureStep.real")}</h3>
          <Help>{t("structureStep.realHelp")}</Help>
          {groups.length === 0 ? (
            <p className="muted">{t("structureStep.noActs")}</p>
          ) : (
            <table className="table compact gaps">
              <thead>
                <tr>
                  <th>{t("structureStep.part")}</th>
                  <th>{t("structureStep.modelColumn")}</th>
                  <th>{t("structureStep.realColumn")}</th>
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
                      {pctLabel(g.expected)} · {formatMinutes(g.expected * pages)}
                    </td>
                    <td>{g.actual === null ? "—" : `${pctLabel(g.actual)} · ${formatMinutes(g.actual * pages)}`}</td>
                    <td>
                      <span className="bar">
                        <span className="bar-expected" style={{ width: pct(g.expected) }} />
                        {g.actual !== null && <span className="bar-actual" style={{ width: pct(g.actual) }} />}
                      </span>
                      {g.off && <span className="badge warn">{t("structureStep.gap")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="step-section">
        <h3>{t("structureStep.beats")}</h3>
        {beats.length === 0 && <p className="muted">{t("structureStep.addOwn")}</p>}
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
              const title = await prompt(t("structureStep.newBeat"), t("script.info.title"));
              if (title) await ensureBeat(story, "free", uuidv7(), title);
            }}
          >
            <Plus aria-hidden="true" />
            {t("structureStep.beat")}
          </button>
        )}
      </section>

      {elsewhere.length > 0 && (
        <section className="step-section">
          <h3>{t("structureStep.elsewhere")}</h3>
          <Help>{t("structureStep.elsewhereHelp")}</Help>
          <ul className="elsewhere">
            {elsewhere.map((b) => (
              <li key={b.id}>
                <span>
                  <strong>{b.title}</strong> <span className="muted small">({modelById(b.model).name})</span>
                  {b.notes && <span className="muted small"> — {b.notes.slice(0, 120)}</span>}
                </span>
                <Select
                  value=""
                  aria-label={t("structureStep.takeInto", { name: b.title })}
                  onChange={async (e) => {
                    const key = e.target.value;
                    if (!key) return;
                    const def = model.beats.find((x) => x.key === key);
                    try {
                      const id = await ensureBeat(story, model.id, key, def?.title ?? key);
                      const target = story.beats.find((x) => x.id === id);
                      await updateBeat(id, { notes: [target?.notes, b.notes].filter((s) => s?.trim()).join("\n\n") });
                      await setBeatScenes(id, [...new Set([...(target?.scenes ?? []), ...b.scenes])]);
                      notify({ text: t("structureStep.taken", { from: b.title, to: def?.title ?? key }) });
                    } catch (err) {
                      notify({ text: describeError(err), tone: "error" });
                    }
                  }}
                >
                  <option value="" hidden>{t("structureStep.takeIntoOption")}</option>
                  {model.beats.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.title}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className="btn ghost small"
                  aria-label={t("structureStep.forget")}
                  onClick={async () => {
                    const c = await ask({ title: t("structureStep.forgetAsk"), text: <p>{t("structureStep.forgetText")}</p>, cancel: t("common.cancel"), choices: [{ label: t("structureStep.forgetButton"), value: "y", danger: true }] });
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
            {t("structureStep.expectedAt", { page: Math.max(1, Math.round(def.at * pages)) })}
            {realPage !== null && ` · ${t("structureStep.realAt", { page: realPage })}`}
          </span>
        )}
      </div>
      {def.help && <p className="muted small">{def.help}</p>}
      <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={flush} aria-label={t("structureStep.notes", { name: def.title })} />
      <div className="tags">
        {linked.map((s) => (
          <span key={s.id} className="tag">
            <button type="button" className="link" onClick={() => openScene(s.id)}>
              {s.index + 1}. {s.heading || t("dash.noHeading")}
            </button>
            <button
              type="button"
              aria-label={t("structureStep.unlink")}
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
            aria-label={t("structureStep.sceneToLink")}
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
              {t("structureStep.chooseScene")}
            </option>
            {scenes
              .filter((s) => !stored?.scenes.includes(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.index + 1}. {s.heading || t("dash.noHeading")}
                </option>
              ))}
          </Select>
        ) : (
          <button type="button" className="btn ghost small" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            {t("structureStep.link")}
          </button>
        )}
      </div>
    </li>
  );
}
