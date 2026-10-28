import { Check, Eye } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeError } from "../../../../core/errors";
import { useProject } from "../../../project/ui/projectContext";
import { useScenes } from "../../screenplay/application/scriptSession";
import { formatMinutes } from "../../screenplay/domain/duration";
import { setField, useFields } from "../application/workshop";
import { STEPS, type Step, type StepStatus } from "../domain/steps";
import { Help, WorkshopContext, type Workshop } from "./fields";
import { StepCharacters } from "./StepCharacters";
import { StepDocuments } from "./StepDocuments";
import { StepPreparation } from "./StepPreparation";
import { StepStructure } from "./StepStructure";

import { CheckMenu } from "../../../../ui-kit/CheckMenu";
import { Select } from "../../../../ui-kit/Select";
import { plural, t } from "../../../../core/i18n";
const STATUSES: StepStatus[] = ["empty", "started", "done"];
const statusLabel = (s: StepStatus) => t(`workshopView.status.${s}`);

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
  if (!stored) return <p className="muted view-pad">{t("dash.loading")}</p>;
  const current = STEPS.find((s) => s.n === step) ?? STEPS[0];
  const status = (n: number) => workshop.get<StepStatus>(`step.${n}.status`, "empty");
  const ready = STEPS.filter((s) => s.ready);
  const later = STEPS.filter((s) => !s.ready);

  return (
    <WorkshopContext.Provider value={workshop}>
      <div className="view split">
        <nav className="view-side steps" aria-label={t("workshopView.steps")}>
          <div className="steps-head">
            <p className="steps-count">
              <strong>{ready.filter((s) => status(s.n) === "done").length}</strong> {t("workshopView.doneOf", { total: ready.length })}
            </p>
            <CheckMenu
              label={t("script.display")}
              icon={Eye}
              items={[
                { id: "help", label: t("workshopView.help"), hint: t("workshopView.helpHint"), checked: workshop.help },
                ...STEPS.map((s) => ({ id: String(s.n), label: `${s.n}. ${s.title}`, checked: !hidden.includes(s.n) })),
              ]}
              onToggle={(id) => {
                if (id === "help") workshop.set("ui.help", !workshop.help);
                else {
                  const n = Number(id);
                  workshop.set("ui.hidden", hidden.includes(n) ? hidden.filter((x) => x !== n) : [...hidden, n]);
                }
              }}
            />
          </div>
          <div className="steps-bar" aria-hidden="true">
            {ready.map((s) => (
              <span key={s.n} className={status(s.n)} />
            ))}
          </div>
          <StepList steps={ready.filter((s) => !hidden.includes(s.n))} step={step} status={status} onPick={setStep} />
          {later.some((s) => !hidden.includes(s.n)) && (
            <>
              <p className="steps-group">{t("app.version", { version: "2.0" })}</p>
              <StepList steps={later.filter((s) => !hidden.includes(s.n))} step={step} status={status} onPick={setStep} />
            </>
          )}
        </nav>
        <main className="view-main workshop">
          <header className="step-head">
            <h2>
              {current.n}. {current.title}
            </h2>
            <Select value={status(current.n)} onChange={(e) => workshop.set(`step.${current.n}.status`, e.target.value)} aria-label={t("workshopView.stepState")}>
              {STATUSES.map((k) => (
                <option key={k} value={k}>
                  {statusLabel(k)}
                </option>
              ))}
            </Select>
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
          {t("workshopView.writing", {
            scenes: plural("sceneList.count", scenes.length),
            pages: plural("versions.pages", Number(pages.toFixed(1))),
            time: formatMinutes(pages),
          })}
        </p>
        <Help>
          <ul>
            <li>{t("workshopView.tip1")}</li>
            <li>{t("workshopView.tip2")}</li>
            <li>{t("workshopView.tip3")}</li>
            <li>{t("workshopView.tip4")}</li>
          </ul>
        </Help>
        <button type="button" className="btn primary" onClick={() => go("script")}>
          {t("workshopView.openScript")}
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
        <p>{t("workshopView.later")}</p>
        {n === 6 && (
          <button type="button" className="btn" onClick={() => go("versions")}>
            {t("workshopView.openVersions")}
          </button>
        )}
      </section>
    </div>
  );
}

/** Steps as a thread: each number in its marker, the marker telling where the step stands. */
function StepList({ steps, step, status, onPick }: { steps: Step[]; step: number; status: (n: number) => StepStatus; onPick: (n: number) => void }) {
  return (
    <ol className="step-list">
      {steps.map((s) => {
        const st = s.ready ? status(s.n) : "later";
        return (
          <li key={s.n} className={st}>
            <button type="button" className={s.n === step ? "step-link on" : "step-link"} onClick={() => onPick(s.n)} aria-current={s.n === step ? "step" : undefined}>
              <span className="step-mark" aria-hidden="true">
                {st === "done" ? <Check /> : s.n}
              </span>
              <span className="step-title">{s.title}</span>
              {st !== "later" && <span className="visually-hidden">, {statusLabel(st)}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
