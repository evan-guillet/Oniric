import { Plus, X } from "lucide-react";
import { useState } from "react";
import { uuidv7 } from "../../../../core/ids";
import { Chips, TagInput } from "../../../../ui-kit/Form";
import { wordCount } from "../../../../ui-kit/RichText";
import { GENRE_CODES, GENRES, TONES } from "../domain/steps";
import { Help, useWorkshop, WText } from "./fields";

interface Idea {
  id: string;
  text: string;
}

interface Reference {
  id: string;
  title: string;
  note: string;
}

const words = (t: string) => {
  const n = wordCount(t);
  return `${n} mot${n > 1 ? "s" : ""}`;
};

const NOTCHES = [-2, -1, 0, 1, 2];

/** A five-notch gauge between two poles: the notches from the middle to the chosen one fill up. */
function ToneNotches({ left, right, value, onChange }: { left: string; right: string; value: number; onChange: (v: number) => void }) {
  const label = (n: number) => (n === 0 ? "Équilibré" : `${Math.abs(n) === 2 ? "Très" : "Plutôt"} ${(n < 0 ? left : right).toLowerCase()}`);
  const filled = (n: number) => (value < 0 ? n >= value && n < 0 : value > 0 ? n <= value && n > 0 : false);
  return (
    <div
      className="notches"
      role="radiogroup"
      aria-label={`${left} ou ${right}`}
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
  const ideas = w.get<Idea[]>("prep.ideas", []);
  const retained = w.get<string>("prep.idea_retained", "");
  const genres = w.get<string[]>("prep.genres", []);
  const refs = w.get<Reference[]>("prep.references", []);
  const [draftIdea, setDraftIdea] = useState("");

  const premiseParts = ["who", "wants", "obstacle", "stakes"].map((k) => w.get(`prep.premise.${k}`, "").trim());
  const composed =
    premiseParts.every(Boolean) &&
    `${premiseParts[0]} veut ${premiseParts[1]}, mais ${premiseParts[2]} ; s'il échoue, ${premiseParts[3]}.`.replace(/\s+/g, " ");

  const proposeCodes = () => {
    const lines = genres.flatMap((g) => (GENRE_CODES[g] ?? []).map((c) => `• ${c}`));
    const current = w.get("prep.codes", "");
    w.set("prep.codes", [current.trim(), ...lines.filter((l) => !current.includes(l))].filter(Boolean).join("\n"));
  };

  return (
    <div className="step-body">
      <section className="step-section">
        <h3>Idée de départ</h3>
        <Help>Un sujet, un personnage, une situation, une question « et si… ? ». Notez-en plusieurs, puis retenez celle qui vous porte.</Help>
        <ul className="idea-list">
          {ideas.map((idea) => (
            <li key={idea.id} className={idea.id === retained ? "on" : ""}>
              <label className="choice">
                <input type="radio" name="idea" checked={idea.id === retained} onChange={() => w.set("prep.idea_retained", idea.id)} />
                <span>{idea.text}</span>
              </label>
              {idea.id === retained && <span className="badge">retenue</span>}
              <button type="button" className="btn ghost small" aria-label="Retirer l'idée" onClick={() => w.set("prep.ideas", ideas.filter((x) => x.id !== idea.id))}>
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
          <input value={draftIdea} onChange={(e) => setDraftIdea(e.target.value)} placeholder="Et si une femme découvrait que…" aria-label="Nouvelle idée" />
          <button type="submit" className="btn">
            Ajouter
          </button>
        </form>
      </section>

      <section className="step-section">
        <h3>Prémisse</h3>
        <Help>Une ou deux phrases : qui veut quoi, qu'est-ce qui l'en empêche, et ce qu'il risque. C'est le film entier, en très court.</Help>
        <div className="grid-2">
          <WText k="prep.premise.who" label="Qui" placeholder="Une boulangère timide" />
          <WText k="prep.premise.wants" label="Veut quoi" placeholder="gagner le concours de Paris" />
          <WText k="prep.premise.obstacle" label="Qu'est-ce qui l'en empêche" placeholder="son père a juré de la déshériter" />
          <WText k="prep.premise.stakes" label="Quels enjeux" placeholder="elle perdra sa famille" />
        </div>
        {composed && (
          <p className="composed">
            {composed}{" "}
            <button type="button" className="btn ghost small" onClick={() => w.set("prep.premise", composed)}>
              Reprendre comme prémisse
            </button>
          </p>
        )}
        <WText k="prep.premise" label="Prémisse (pitch)" rows={2} counter={words} />
      </section>

      <section className="step-section">
        <h3>Thème</h3>
        <Help>Ce que le film veut dire au fond, au-delà de ce qu'il raconte : « la vengeance détruit celui qui la cherche ».</Help>
        <WText k="prep.theme" label="Thème principal" />
        <TagInput label="Thèmes secondaires" value={w.get<string[]>("prep.themes", [])} onChange={(v) => w.set("prep.themes", v)} />
      </section>

      <section className="step-section">
        <h3>Genre et ton</h3>
        <Chips label="Genres" options={GENRES} value={genres} onChange={(v) => w.set("prep.genres", v)} />
        <WText k="prep.subgenres" label="Sous-genres" placeholder="film de casse, comédie de remariage…" />
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
        <h3>Codes du genre</h3>
        <Help>Ce que le public attend du genre choisi. Respectez-les, ou détournez-les en le sachant.</Help>
        <WText k="prep.codes" label="Pense-bête" rows={5} />
        <button type="button" className="btn small" disabled={genres.length === 0} onClick={proposeCodes}>
          Proposer les codes des genres choisis
        </button>
      </section>

      <section className="step-section">
        <h3>Références</h3>
        <Help>Films, livres, œuvres qui inspirent le projet, et ce que vous y prenez.</Help>
        <table className="table compact">
          <tbody>
            {refs.map((r, i) => (
              <tr key={r.id}>
                <td>
                  <input
                    value={r.title}
                    aria-label="Œuvre"
                    placeholder="Titre, auteur, année"
                    onChange={(e) => w.set("prep.references", refs.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
                  />
                </td>
                <td>
                  <input
                    value={r.note}
                    aria-label="Ce que j'y prends"
                    placeholder="Ce que j'y prends"
                    onChange={(e) => w.set("prep.references", refs.map((x, k) => (k === i ? { ...x, note: e.target.value } : x)))}
                  />
                </td>
                <td>
                  <button type="button" className="btn ghost small" aria-label="Retirer" onClick={() => w.set("prep.references", refs.filter((_, k) => k !== i))}>
                    <X aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn small" onClick={() => w.set("prep.references", [...refs, { id: uuidv7(), title: "", note: "" }])}>
          <Plus aria-hidden="true" />
          Référence
        </button>
      </section>
    </div>
  );
}
