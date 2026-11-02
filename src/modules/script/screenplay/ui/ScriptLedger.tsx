import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { events } from "../../../../bindings";
import { useSessionState, type ScriptSession } from "../application/scriptSession";

/** A save that failed, said under the act and sequence of the pin: the only place the app still speaks of saving. */
export function ScriptLedger({ session }: { session: ScriptSession }) {
  const { t } = useTranslation();
  useSessionState(session);
  const [flushError, setFlushError] = useState<string | null>(null);

  useEffect(() => {
    const flushed = events.projectFlushed.listen(() => setFlushError(null));
    const failed = events.projectFlushFailed.listen((e) => setFlushError(e.payload.message));
    return () => {
      for (const u of [flushed, failed]) void u.then((f) => f());
    };
  }, []);

  const problem =
    session.saveState === "error"
      ? { text: t("status.error"), title: "", tone: "error" }
      : flushError
        ? { text: t("status.notInFolder"), title: t("status.notInFolderTitle", { detail: flushError }), tone: "warning" }
        : null;

  if (!problem) return null;
  return (
    <span className={`story-pin-alert save-state ${problem.tone}`} title={problem.title} role="status">
      {problem.text}
    </span>
  );
}
