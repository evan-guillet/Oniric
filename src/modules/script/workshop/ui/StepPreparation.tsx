import { Plus, X } from "lucide-react";
import { useState } from "react";
import { uuidv7 } from "../../../../core/ids";
import { confirmRemoval } from "../../../../ui-kit/Dialog";
import { Chips, TagInput } from "../../../../ui-kit/Form";
import { wordCount } from "../../../../ui-kit/RichText";
import { choiceLabel, genreCodes, GENRES, TONES } from "../domain/steps";
import { useProject } from "../../../project/ui/projectContext";
import { Help, useWorkshop, WText } from "./fields";
import { plural, t } from "../../../../core/i18n";

interface Idea {
  id: string;
  text: string;
}

interface Reference {
  id: string;
  title: string;
  note: string;
}

const words = (text: string) => plural("dash.words", wordCount(text));

const NOTCHES = [-2, -1, 0, 1, 2];

/** A five-notch gauge between two poles: the notches from the middle to the chosen one fill up. */
function ToneNotches({ left, right, value, onChange }: { left: string; right: string; value: number; onChange: (v: number) => void }) {
  const label = (n: number) =>
    n === 0 ? t("prep.balanced") : t(Math.abs(n) === 2 ? "prep.very" : "prep.rather", { pole: (n < 0 ? left : right).toLowerCase() });
  const filled = (n: number) => (value < 0 ? n >= value && n < 0 : value > 0 ? n <= value && n > 0 : false);
  return (
    <div
      className="notches"
      role="radiogroup"
      aria-label={t("prep.poles", { left, right })}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = Math.max(-2, Math.min(2, value + step));
        onChange(next);
        (e.currentTarget.children[next + 2] as HTMLElement).focus();
      }}
    >
      {NOTCHES.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          tabIndex={n === value ? 0 : -1}
          title={label(n)}
          aria-label={label(n)}
          className={["notch", n === 0 && "mid", filled(n) && "filled", n === value && "on"].filter(Boolean).join(" ")}
          onClick={() => onChange(n)}
        />
      ))}
    </div>
  );
}

/** Step 1: idea, premise, theme, genre, tone, genre codes, references (specification, 5.1). */
export function StepPreparation() {
  const w = useWorkshop();
  const { ask } = useProject();
  const ideas = w.get<Idea[]>("prep.ideas", []);
  const retained = w.get<string>("prep.idea_retained", "");
  const genres = w.get<string[]>("prep.genres", []);
  const refs = w.get<Reference[]>("prep.references", []);
  const [draftIdea, setDraftIdea] = useState("");

  const premiseParts = ["who", "wants", "obstacle", "stakes"].map((k) => w.get(`prep.premise.${k}`, "").trim());
  const composed =
    premiseParts.every(Boolean) &&
    t("prep.composed", { who: premiseParts[0], wants: premiseParts[1], obstacle: premiseParts[2], stakes: premiseParts[3] }).replace(/\s+/g, " ");

  const proposeCodes = () => {
    const lines = genres.flatMap((g) => genreCodes(g).map((c) => `• ${c}`));
    const current = w.get("prep.codes", "");
    w.set("prep.codes", [current.trim(), ...lines.filter((l) => !current.includes(l))].filter(Boolean).join("\n"));
  };

  return (
    <div className="step-body">
      <section className="step-section">
        <h3>{t("prep.idea")}</h3>
        <Help>{t("prep.ideaHelp")}</Help>
        <ul className="idea-list">
          {ideas.map((idea) => (
            <li key={idea.id} className={idea.id === retained ? "on" : ""}>
              <label className="choice">
                <input type="radio" name="idea" checked={idea.id === retained} onChange={() => w.set("prep.idea_retained", idea.id)} />
                <span>{idea.text}</span>
              </label>
              {idea.id === retained && <span className="badge">{t("prep.retained")}</span>}
              <button type="button" className="btn ghost small" aria-label={t("prep.removeIdea")}
                onClick={async () => {
                  if (await confirmRemoval(ask, { title: t("prep.removeIdeaAsk"), text: t("dash.quote", { quote: idea.text }), label: t("script.info.remove") })) w.set("prep.ideas", ideas.filter((x) => x.id !== idea.id));
                }}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="input-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draftIdea.trim()) return;
            const idea = { id: uuidv7(), text: draftIdea.trim() };
            w.set("prep.ideas", [...ideas, idea]);
            if (!retained) w.set("prep.idea_retained", idea.id);
            setDraftIdea("");
          }}
        >
          <input value={draftIdea} onChange={(e) => setDraftIdea(e.target.value)} placeholder={t("prep.ideaPlaceholder")} aria-label={t("prep.newIdea")} />
          <button type="submit" className="btn">
            {t("common.add")}
          </button>
        </form>
      </section>

      <section className="step-section">
        <h3>{t("prep.premise")}</h3>
        <Help>{t("prep.premiseHelp")}</Help>
        <div className="grid-2">
          <WText k="prep.premise.who" label={t("prep.who")} placeholder={t("prep.whoPlaceholder")} />
          <WText k="prep.premise.wants" label={t("prep.wants")} placeholder={t("prep.wantsPlaceholder")} />
          <WText k="prep.premise.obstacle" label={t("prep.obstacle")} placeholder={t("prep.obstaclePlaceholder")} />
          <WText k="prep.premise.stakes" label={t("prep.stakes")} placeholder={t("prep.stakesPlaceholder")} />
        </div>
        {composed && (
          <p className="composed">
            {composed}{" "}
            <button type="button" className="btn ghost small" onClick={() => w.set("prep.premise", composed)}>
              {t("prep.takePremise")}
            </button>
          </p>
        )}
        <WText k="prep.premise" label={t("prep.pitch")} rows={2} counter={words} />
      </section>

      <section className="step-section">
        <h3>{t("prep.theme")}</h3>
        <Help>{t("prep.themeHelp")}</Help>
        <WText k="prep.theme" label={t("prep.mainTheme")} />
        <TagInput label={t("prep.otherThemes")} value={w.get<string[]>("prep.themes", [])} onChange={(v) => w.set("prep.themes", v)} />
      </section>

      <section className="step-section">
        <h3>{t("prep.genreTone")}</h3>
        <Chips label={t("prep.genres")} options={GENRES} labelOf={(g) => choiceLabel("genres", g)} value={genres} onChange={(v) => w.set("prep.genres", v)} />
        <WText k="prep.subgenres" label={t("prep.subgenres")} placeholder={t("prep.subgenresPlaceholder")} />
        <div className="tones">
          {TONES.map((t) => (
            <div key={t.key} className="tone">
              <span>{t.left}</span>
              <ToneNotches left={t.left} right={t.right} value={w.get<number>(`prep.tone.${t.key}`, 0)} onChange={(v) => w.set(`prep.tone.${t.key}`, v)} />
              <span>{t.right}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="step-section">
        <h3>{t("prep.codes")}</h3>
        <Help>{t("prep.codesHelp")}</Help>
        <WText k="prep.codes" label={t("prep.reminder")} rows={5} />
        <button type="button" className="btn small" disabled={genres.length === 0} onClick={proposeCodes}>
          {t("prep.proposeCodes")}
        </button>
      </section>

      <section className="step-section">
        <h3>{t("prep.references")}</h3>
        <Help>{t("prep.referencesHelp")}</Help>
        <table className="table compact">
          <tbody>
            {refs.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <input
                    value={r.title}
                    aria-label={t("prep.work")}
                    placeholder={t("prep.workPlaceholder")}
                    onChange={(e) => w.set("prep.references", refs.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
                  />
                </td>
                <td>
                  <input
                    value={r.note}
                    aria-label={t("prep.take")}
                    placeholder={t("prep.take")}
                    onChange={(e) => w.set("prep.references", refs.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)))}
                  />
                </td>
                <td>
                  <button type="button" className="btn ghost small" aria-label={t("script.info.remove")}
                    onClick={async () => {
                      const filled = r.title.trim() || r.note.trim();
                      if (filled && !(await confirmRemoval(ask, { title: r.title.trim() ? t("prep.removeRefNamed", { name: r.title.trim() }) : t("prep.removeRef"), text: t("prep.removeRefText"), label: t("script.info.remove") })))
                        return;
                      w.set("prep.references", refs.filter((x) => x.id !== r.id));
                    }}
                  >
                    <X aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn small" onClick={() => w.set("prep.references", [...refs, { id: uuidv7(), title: "", note: "" }])}>
          <Plus aria-hidden="true" />
          {t("prep.reference")}
        </button>
      </section>
    </div>
  );
}
