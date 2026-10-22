import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeError } from "../../../../core/errors";
import { useProject } from "../../../project/ui/projectContext";
import { useScenes } from "../../screenplay/application/scriptSession";
import { formatMinutes } from "../../screenplay/domain/duration";
import { setField, useFields } from "../application/workshop";
import { STEPS, type StepStatus } from "../domain/steps";
import { Help, WorkshopContext, type Workshop } from "./fields";
import { StepCharacters } from "./StepCharacters";
import { StepDocuments } from "./StepDocuments";
import { StepPreparation } from "./StepPreparation";
import { StepStructure } from "./StepStructure";

const STATUS_LABEL: Record<StepStatus, string> = { empty: "À faire", started: "Commencée", done: "Terminée" };

/** The writing workshop: nine steps, none compulsory, the first five in this version [ATL-01 to ATL-03]. */
export function WorkshopView() {
  const { notify } = useProject();
  const stored = useFields();
  const [local, setLocal] = useState<Map<string, unknown>>(new Map());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, unknown>());

  const write = useCallback(
    (key: string) => {
      timers.current.delete(key);
      if (!pending.current.has(key)) return;
      const value = pending.current.get(key);
      pending.current.delete(key);
      setField(key, value, !key.startsWith("ui.") && !key.startsWith("step.")).catch((e) => notify({ text: describeError(e), tone: "error" }));
    },
    [notify],
  );

  useEffect(
    () => () => {
      for (const [key, t] of timers.current) {
        clearTimeout(t);
        write(key);
      }
    },
    [write],
  );

  const fields = useMemo(() => {
    const all = new Map(stored ?? []);
    for (const [k, v] of local) all.set(k, v);
    return all;
  }, [stored, local]);

  const workshop: Workshop = useMemo(
    () => ({
      fields,
      help: fields.get("ui.help") !== false,
      get: <T,>(key: string, fallback: T) => (fields.has(key) ? (fields.get(key) as T) ?? fallback : fallback),
      set: (key: string, value: unknown) => {
        setLocal((m) => new Map(m).set(key, value));
        pending.current.set(key, value);
        const t = timers.current.get(key);
        if (t) clearTimeout(t);
        timers.current.set(
          key,
          setTimeout(() => write(key), 500),
        );
      },
    }),
    [fields, write],
  );

  const hidden = workshop.get<number[]>("ui.hidden", []);
  const [step, setStep] = useState(1);
  if (!stored) return <p className="muted view-pad">Chargement…</p>;
  const current = STEPS.find((s) => s.n === step) ?? STEPS[0];
  const status = (n: number) => workshop.get<StepStatus>(`step.${n}.status`, "empty");

  return (
    <WorkshopContext.Provider value={workshop}>
      <div className="view split">
        <nav className="view-side steps" aria-label="Étapes de l'atelier">
          <ol>
            {STEPS.filter((s) => !hidden.includes(s.n)).map((s) => (
              <li key={s.n}>
                <button type="button" className={s.n === step ? "step-link on" : "step-link"} onClick={() => setStep(s.n)} aria-current={s.n === step ? "step" : undefined}>
                  <span className={`step-dot ${status(s.n)}`} aria-hidden="true" />
                  <span>
                    {s.n}. {s.title}
                    {!s.ready && <span className="muted tiny"> (v2.0)</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <label className="choice small">
            <input type="checkbox" checked={workshop.help} onChange={(e) => workshop.set("ui.help", e.target.checked)} />
            Afficher l'aide
          </label>
          <details className="small">
            <summary>
              <ChevronRight aria-hidden="true" />
              Étapes affichées
            </summary>
            {STEPS.map((s) => (
              <label key={s.n} className="choice">
                <input
                  type="checkbox"
                  checked={!hidden.includes(s.n)}
                  onChange={(e) => workshop.set("ui.hidden", e.target.checked ? hidden.filter((x) => x !== s.n) : [...hidden, s.n])}
                />
                {s.n}. {s.title}
              </label>
            ))}
          </details>
        </nav>
        <main className="view-main workshop">
          <header className="step-head">
            <h2>
              {current.n}. {current.title}
            </h2>
            <select value={status(current.n)} onChange={(e) => workshop.set(`step.${current.n}.status`, e.target.value)} aria-label="État de l'étape">
              {(Object.keys(STATUS_LABEL) as StepStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABEL[k]}
                </option>
              ))}
            </select>
          </header>
          <Help>{current.intro}</Help>
          {current.n === 1 && <StepPreparation />}
          {current.n === 2 && <StepCharacters />}
          {current.n === 3 && <StepStructure />}
          {current.n === 4 && <StepDocuments />}
          {current.n === 5 && <StepWriting />}
          {current.n > 5 && <StepLater n={current.n} />}
        </main>
      </div>
    </WorkshopContext.Provider>
  );
}

function StepWriting() {
  const { session, go } = useProject();
  const scenes = useScenes(session);
  const eighths = scenes.reduce((n, s) => n + s.eighths, 0);
  const pages = eighths / 8;
  return (
    <div className="step-body">
      <section className="step-section">
        <p>
          Le scénario compte {scenes.length} scène{scenes.length > 1 ? "s" : ""}, environ {pages.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} page
          {pages > 1 ? "s" : ""}, soit {formatMinutes(pages)} à l'écran.
        </p>
        <Help>
          <ul>
            <li>Un long métrage fait en général de 90 à 120 pages ; un court métrage, moins de 30.</li>
            <li>N'écrivez que ce qui se voit et s'entend. Les pensées des personnages passent par leurs actes.</li>
            <li>Une scène entre le plus tard possible et sort le plus tôt possible.</li>
            <li>Tapez @ ou [[ pour relier un personnage, un lieu ou un objet de la Bible.</li>
          </ul>
        </Help>
        <button type="button" className="btn primary" onClick={() => go("script")}>
          Ouvrir le scénario
        </button>
      </section>
    </div>
  );
}

function StepLater({ n }: { n: number }) {
  const { go } = useProject();
  return (
    <div className="step-body">
      <section className="step-section empty-state">
        <p>Cette étape guidée arrive dans la version 2.0.</p>
        {n === 6 && (
          <button type="button" className="btn" onClick={() => go("versions")}>
            Ouvrir les versions
          </button>
        )}
      </section>
    </div>
  );
}
