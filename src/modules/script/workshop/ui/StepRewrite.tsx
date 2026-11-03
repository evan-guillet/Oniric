import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { dateFormat, plural, t } from "../../../../core/i18n";
import { confirmRemoval } from "../../../../ui-kit/Dialog";
import { MoreMenu } from "../../../../ui-kit/MoreMenu";
import { useProject } from "../../../project/ui/projectContext";
import { listVersions } from "../../screenplay/application/versions";
import { useScenes, type SceneInfo } from "../../screenplay/application/scriptSession";
import { formatEighths } from "../../screenplay/domain/duration";
import { loadStory, STORY_TABLES } from "../../views/application/story";
import { sceneLabel } from "../../views/domain/outline";
import { addItems, deleteItem, itemsOf, updateItem, useItems, type Item } from "../application/items";
import { longAbsences, longScenes, mainCharacters, scenesWithout, speech, type ReviewScene } from "../domain/review";
import { Help, useWorkshop } from "./fields";

interface Pass {
  title: string;
  /** The scenes gone through in this pass. */
  done: string[];
}

/** The scenes in the form the rereading aids read. */
export function reviewScenes(scenes: SceneInfo[]): ReviewScene[] {
  return scenes.map((s) => {
    const blocks: { type: string; text: string }[] = [];
    s.node.forEach((b) => blocks.push({ type: b.type.name, text: b.textContent }));
    return { id: s.id, number: s.number, heading: s.heading, eighths: s.eighths, characters: s.characters, blocks };
  });
}

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Step 6: freeze and compare (in Versions), rewrite in passes, let it rest, read again with help [REE-01 to REE-06]. */
export function StepRewrite() {
  const { go } = useProject();
  const versions = useLive(listVersions, ["script_version"]);
  return (
    <div className="step-body">
      <section className="step-section">
        <h3>{t("rewrite.versions")}</h3>
        <Help>{t("rewrite.versionsHelp")}</Help>
        <p className="muted">{versions ? plural("rewrite.frozen", versions.length) : ""}</p>
        <button type="button" className="btn" onClick={() => go("versions")}>
          {t("workshopView.openVersions")}
        </button>
      </section>
      <Passes />
      <Rest />
      <Rereading />
    </div>
  );
}

function Passes() {
  const { session, notify, ask } = useProject();
  const scenes = useScenes(session);
  const items = useItems();
  const passes = itemsOf<Pass>(items, "pass");
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const add = (titles: string[]) => void addItems("pass", passes, titles.map((title) => ({ title, done: [] }))).catch(fail);
  const ids = new Set(scenes.map((s) => s.id));
  return (
    <section className="step-section">
      <h3>{t("rewrite.passes")}</h3>
      <Help>{t("rewrite.passesHelp")}</Help>
      {passes.length === 0 ? (
        <button type="button" className="btn" onClick={() => add(t("rewrite.usualPasses", { returnObjects: true }) as string[])}>
          {t("rewrite.addUsual")}
        </button>
      ) : (
        <ul className="ws-passes">
          {passes.map((p) => {
            const done = p.data.done.filter((id) => ids.has(id));
            const on = open === p.id;
            return (
              <li key={p.id} className={on ? "open" : ""}>
                <div className="ws-pass-head">
                  <button type="button" className="ws-fold" aria-expanded={on} onClick={() => setOpen(on ? null : p.id)}>
                    <ChevronRight aria-hidden="true" />
                    <span className="ws-pass-title">{p.data.title}</span>
                  </button>
                  <span className="ws-meter" aria-hidden="true">
                    <span style={{ width: `${scenes.length ? (done.length / scenes.length) * 100 : 0}%` }} />
                  </span>
                  <span className={done.length === scenes.length && scenes.length ? "ws-count ok" : "ws-count"}>
                    {t("rewrite.passDone", { done: done.length, total: scenes.length })}
                  </span>
                  <MoreMenu
                    label={t("rewrite.passMenu", { name: p.data.title })}
                    items={[
                      {
                        label: t("rewrite.deletePass"),
                        icon: Trash2,
                        danger: true,
                        onClick: async () => {
                          if (await confirmRemoval(ask, { title: t("rewrite.deletePassTitle", { name: p.data.title }), text: t("rewrite.deletePassText") })) void deleteItem(p).catch(fail);
                        },
                      },
                    ]}
                  />
                </div>
                {on && <PassScenes pass={p} scenes={scenes} />}
              </li>
            );
          })}
        </ul>
      )}
      <div className="input-row ws-add">
        <input
          type="text"
          value={name}
          placeholder={t("rewrite.newPass")}
          aria-label={t("rewrite.newPass")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              add([name.trim()]);
              setName("");
            }
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={!name.trim()}
          onClick={() => {
            add([name.trim()]);
            setName("");
          }}
        >
          <Plus aria-hidden="true" />
          {t("common.add")}
        </button>
      </div>
    </section>
  );
}

/** The scenes of a pass, ticked as they are gone through [REE-03]. */
function PassScenes({ pass, scenes }: { pass: Item<Pass>; scenes: SceneInfo[] }) {
  const { notify } = useProject();
  const done = new Set(pass.data.done);
  const set = (list: string[]) => void updateItem(pass, { done: list }).catch((e) => notify({ text: describeError(e), tone: "error" }));
  return (
    <div className="ws-pass-scenes">
      <div className="ws-pass-tools">
        <button type="button" className="btn tiny" onClick={() => set(scenes.map((s) => s.id))}>
          {t("rewrite.checkAll")}
        </button>
        <button type="button" className="btn tiny ghost" onClick={() => set([])}>
          {t("rewrite.uncheckAll")}
        </button>
      </div>
      <ul>
        {scenes.map((s) => (
          <li key={s.id}>
            <label className="choice">
              <input
                type="checkbox"
                checked={done.has(s.id)}
                onChange={(e) => set(e.target.checked ? [...done, s.id] : [...done].filter((id) => id !== s.id))}
              />
              <span className="ws-scene-num">{s.number}</span>
              <span className="ws-scene-head">{s.heading || t("workspace.noHeading")}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The date to read the screenplay again, after letting it rest [REE-04]. */
function Rest() {
  const w = useWorkshop();
  const { go } = useProject();
  const date = w.get<string>("rewrite.rest", "");
  const today = new Date().toISOString().slice(0, 10);
  const days = date ? Math.round((Date.parse(date) - Date.parse(today)) / 86400000) : null;
  return (
    <section className="step-section">
      <h3>{t("rewrite.rest")}</h3>
      <Help>{t("rewrite.restHelp")}</Help>
      <div className="ws-rest">
        <label className="field">
          <span>{t("rewrite.readOn")}</span>
          <input type="date" value={date} min={today} onChange={(e) => w.set("rewrite.rest", e.target.value)} />
        </label>
        {[3, 10, 30].map((n) => (
          <button key={n} type="button" className="btn small" onClick={() => w.set("rewrite.rest", addDays(n))}>
            {t("rewrite.inDays", { count: n })}
          </button>
        ))}
      </div>
      {days !== null &&
        (days > 0 ? (
          <p className="muted">{t("rewrite.restLeft", { count: days, date: dateFormat({ dateStyle: "long" }).format(new Date(`${date}T12:00:00`)) })}</p>
        ) : (
          <div className="ws-due">
            <p>{t("rewrite.restDue")}</p>
            <button type="button" className="btn small" onClick={() => go("script")}>
              {t("workshopView.openScript")}
            </button>
            <button type="button" className="btn small ghost" onClick={() => w.set("rewrite.rest", "")}>
              {t("rewrite.restDone")}
            </button>
          </div>
        ))}
    </section>
  );
}

/** What to look at when reading again: long scenes, who speaks, who is missing, scenes outside the structure [REE-05]. */
function Rereading() {
  const { session, openScene } = useProject();
  const scenes = useScenes(session);
  const story = useLive(loadStory, [...STORY_TABLES]);
  const review = useMemo(() => reviewScenes(scenes), [scenes]);
  const long = useMemo(() => longScenes(review), [review]);
  const voices = useMemo(() => speech(review).slice(0, 8), [review]);
  const mains = useMemo(() => mainCharacters(review), [review]);
  const without = useMemo(() => scenesWithout(review, mains), [review, mains]);
  const away = useMemo(() => longAbsences(review), [review]);
  const linked = new Set(story?.beats.flatMap((b) => b.scenes) ?? []);
  const loose = story && story.beats.length ? review.filter((s) => !linked.has(s.id)) : [];
  if (scenes.length === 0) return null;
  const sceneList = (list: ReviewScene[], extra?: (s: ReviewScene) => string) =>
    list.length === 0 ? (
      <p className="muted small">{t("rewrite.none")}</p>
    ) : (
      <ul className="ws-scene-list">
        {list.slice(0, 12).map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => openScene(s.id)}>
              <span className="ws-scene-num">{s.number}</span>
              <span className="ws-scene-head">{s.heading || t("workspace.noHeading")}</span>
              {extra && <span className="muted">{extra(s)}</span>}
            </button>
          </li>
        ))}
        {list.length > 12 && <li className="muted small">{t("rewrite.more", { count: list.length - 12 })}</li>}
      </ul>
    );
  return (
    <section className="step-section">
      <h3>{t("rewrite.rereading")}</h3>
      <Help>{t("rewrite.rereadingHelp")}</Help>
      <div className="ws-review">
        <div>
          <h4>{t("rewrite.longScenes")}</h4>
          {sceneList(long, (s) => t("breakdown.pages", { pages: formatEighths(s.eighths) }))}
        </div>
        <div>
          <h4>{t("rewrite.speech")}</h4>
          {voices.length === 0 ? (
            <p className="muted small">{t("rewrite.none")}</p>
          ) : (
            <ul className="ws-voices">
              {voices.map((v) => (
                <li key={v.name}>
                  <span className="ws-voice-name">{v.name}</span>
                  <span className="ws-meter" aria-hidden="true">
                    <span style={{ width: `${(v.share / voices[0].share) * 100}%` }} />
                  </span>
                  <span className="ws-count">{Math.round(v.share * 100)} %</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4>{t("rewrite.without", { names: mains.join(", ") })}</h4>
          {sceneList(without)}
        </div>
        <div>
          <h4>{t("rewrite.absent")}</h4>
          {away.length === 0 ? (
            <p className="muted small">{t("rewrite.none")}</p>
          ) : (
            <ul className="ws-plain">
              {away.map((a) => (
                <li key={a.name}>
                  {t("rewrite.absentLine", { name: a.name, pages: formatEighths(a.eighths), after: sceneLabel(a.after), back: sceneLabel(a.back) })}
                </li>
              ))}
            </ul>
          )}
        </div>
        {story && story.beats.length > 0 && (
          <div>
            <h4>{t("rewrite.loose")}</h4>
            {sceneList(loose)}
          </div>
        )}
      </div>
    </section>
  );
}
