import { useEffect, useRef } from "react";
import { db, query } from "../../../../core/db/client";
import { parseJson } from "../../../../core/db/live";
import { plural, t } from "../../../../core/i18n";
import { useProject } from "../../../project/ui/projectContext";

/**
 * Said once when the project opens: the day set to read the screenplay again has come [REE-04], submissions to follow up
 * or whose deadline is near [DIF-04], rewriting asked for that is due [DEV-01].
 */
export function Reminders() {
  const { notify, go } = useProject();
  const told = useRef(false);
  useEffect(() => {
    if (told.current) return;
    told.current = true;
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    void (async () => {
      const [rest, items] = await Promise.all([
        query(db.selectFrom("workshop_field").select("value").where("key", "=", "rewrite.rest")),
        query(db.selectFrom("workshop_item").select(["kind", "data"]).where("kind", "in", ["submission", "request"])),
      ]);
      const restOn = parseJson<string>(rest[0]?.value, "");
      const lines: string[] = [];
      if (restOn && restOn <= today) lines.push(t("reminders.rest"));
      let follow = 0;
      let due = 0;
      for (const i of items) {
        const d = parseJson<Record<string, unknown>>(i.data, {});
        if (i.kind === "submission") {
          const waiting = d.status === "sent" || d.status === "reading";
          if ((waiting && typeof d.followUp === "string" && d.followUp && d.followUp <= today) || (d.status === "todo" && typeof d.deadline === "string" && d.deadline && d.deadline <= soon)) follow++;
        } else if (!d.done && typeof d.due === "string" && d.due && d.due <= today) due++;
      }
      if (follow) lines.push(plural("reminders.submissions", follow));
      if (due) lines.push(plural("reminders.requests", due));
      if (lines.length) notify({ text: lines.join(" "), tone: "warning", actions: [{ label: t("reminders.open"), onClick: () => go("workshop") }] });
      // The permits to send soon, and those that ran out [AUT-02].
      const permits = await query(db.selectFrom("permit").select(["status", "deadline", "end_date"]));
      const limit = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const toSend = permits.filter((p) => p.status === "todo" && p.deadline && p.deadline <= limit).length;
      const lapsed = permits.filter((p) => p.status === "granted" && p.end_date && p.end_date < today).length;
      if (toSend || lapsed)
        notify({
          text: [toSend && plural("reminders.permits", toSend), lapsed && plural("reminders.permitsLapsed", lapsed)].filter(Boolean).join(" "),
          tone: "warning",
          actions: [{ label: t("reminders.openPermits"), onClick: () => go("permits") }],
        });
    })().catch(() => {});
  }, [notify, go]);
  return null;
}
