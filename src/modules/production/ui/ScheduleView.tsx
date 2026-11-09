import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BedDouble,
  CalendarDays,
  Car,
  Copy,
  Flag,
  GripVertical,
  Pencil,
  Plus,
  Settings2,
  Shuffle,
  Square,
  SquareCheck,
  Trash2,
  Undo2,
  FileWarning,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import type { EventPhase } from "../../../core/db/schema";
import { describeError } from "../../../core/errors";
import { dateFormat, plural, t } from "../../../core/i18n";
import { confirmRemoval, Dialog } from "../../../ui-kit/Dialog";
import { EmptyState } from "../../../ui-kit/Form";
import { MoreMenu, type MoreItem } from "../../../ui-kit/MoreMenu";
import { Segmented } from "../../../ui-kit/Segmented";
import { Select } from "../../../ui-kit/Select";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { PAGE_KEY, useProject } from "../../project/ui/projectContext";
import { byScene, useShots } from "../../realisation/application/shots";
import { useScenes, type SceneInfo } from "../../script/screenplay/application/scriptSession";
import { formatEighths } from "../../script/screenplay/domain/duration";
import { formatMinutes } from "../../realisation/domain/shots";
import {
  addBanner,
  addDay,
  addEvent,
  applyArrangement,
  chooseSchedule,
  createSchedule,
  deleteDay,
  deleteEvent,
  deleteSchedule,
  placeStrips,
  scheduleOf,
  unschedule,
  updateBanner,
  updateDay,
  updateEvent,
  updateSchedule,
  usePlans,
  type Day,
  type Moving,
  type Plans,
  type ProductionEvent,
  type Schedule,
  type Strip,
} from "../application/schedule";
import { castNumbers, useTeam, type Team } from "../application/team";
import { sceneFacts, stripTone, type SceneFacts } from "../domain/sceneFacts";
import { arrange, dayConflicts, dayDates, parseDay, presence, sceneMinutes, shootNumbers, type ArrangeBy, type Conflict, type Presence } from "../domain/schedule";
import type { PermitAlert } from "../domain/permits";
import { Field, shortDate, ViewTools } from "./parts";
import { usePermitAlerts } from "./preparation";

type Tab = "strips" | "dood" | "calendar";

/** What the board knows of a scene: its facts, its time, the numbers of its cast. */
export interface StripScene {
  scene: SceneInfo;
  facts: SceneFacts;
  minutes: number;
  cast: number[];
}

/** Everything the schedule, its exports and the call sheets read of the film, worked out once. */
export function useBoard(plans: Plans | undefined, team: Team | undefined) {
  const { session } = useProject();
  const scenes = useScenes(session);
  const shots = useShots();
  return useMemo(() => {
    if (!plans || !team) return null;
    const schedule = plans.schedules.find((s) => s.id === plans.currentId) ?? null;
    return board(scenes, plans, team, schedule, shots ? byScene(shots) : new Map());
  }, [scenes, plans, team, shots]);
}

export function board(scenes: SceneInfo[], plans: Plans, team: Team, schedule: Schedule | null, shotsOf: Map<string, { setup: number | null }[]>) {
  const facts = sceneFacts(scenes.map((s) => s.heading));
  const count = new Map<string, number>();
  for (const s of scenes) for (const c of s.characters) count.set(c, (count.get(c) ?? 0) + 1);
  const numbers = castNumbers([...count.entries()].map(([name, n]) => ({ name, scenes: n })), team.cast);
  const settings = schedule ?? { startDate: null, week: [1, 2, 3, 4, 5], dayMinutes: 600, pageMinutes: 90 };
  const info = new Map<string, StripScene>(
    scenes.map((s, i) => [
      s.id,
      {
        scene: s,
        facts: facts[i],
        minutes: sceneMinutes(s.eighths, (shotsOf.get(s.id) ?? []).reduce((n, x) => n + (x.setup ?? 0), 0), settings),
        cast: s.characters.flatMap((c) => (numbers.has(c) ? [numbers.get(c)!] : [])).sort((a, b) => a - b),
      },
    ]),
  );
  const { days, strips } = scheduleOf(plans, schedule?.id ?? null);
  const dates = schedule ? dayDates(schedule, days) : days.map(() => null);
  const nums = shootNumbers(days);
  const placed = new Set<string>();
  for (const list of strips.values()) for (const s of list) if (s.sceneId) placed.add(s.sceneId);
  const actorOf = (character: string) => team.cast.find((r) => r.character === character)?.contactId ?? null;
  const dayInfo = days.map((d, i) => {
    const list = (strips.get(d.id) ?? []).filter((s) => !s.sceneId || info.has(s.sceneId));
    const sc = list.flatMap((s) => (s.sceneId ? [info.get(s.sceneId)!] : []));
    const minutes = sc.reduce((n, s) => n + s.minutes, 0);
    const characters = [...new Set(sc.flatMap((s) => s.scene.characters))];
    return {
      day: d,
      date: dates[i],
      number: nums[i],
      strips: list,
      scenes: sc,
      eighths: sc.reduce((n, s) => n + s.scene.eighths, 0),
      minutes,
      characters,
      conflicts: d.kind === "shoot" ? dayConflicts(dates[i], characters, minutes, settings, actorOf, team.away.map((a) => ({ contactId: a.contactId, start: a.start, end: a.end }))) : [],
    };
  });
  return {
    schedule,
    settings,
    days: dayInfo,
    info,
    numbers,
    shootDays: nums.filter((n) => n !== null).length,
    unplaced: scenes.filter((s) => !placed.has(s.id)).map((s) => info.get(s.id)!),
  };
}

export type Board = NonNullable<ReturnType<typeof board>>;

/** The shooting schedule: the strips day by day, the presence of the cast, the calendar of the production [PDT-01 to PDT-07]. */
export function ScheduleView() {
  const [tab, setTab] = useStoredState<Tab>(PAGE_KEY.schedule, "strips");
  const plans = usePlans();
  const team = useTeam();
  const b = useBoard(plans, team);
  const { session, go, notify } = useProject();
  const scenes = useScenes(session);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  if (!plans || !team || !b) return null;
  if (scenes.length === 0) {
    return (
      <div className="view view-pad">
        <EmptyState title={t("schedule.emptyTitle")}>
          <p className="muted">{t("schedule.emptyText")}</p>
          <button type="button" className="btn" onClick={() => go("script")}>
            {t("shotlist.toScript")}
          </button>
        </EmptyState>
      </div>
    );
  }
  if (!b.schedule) {
    return (
      <div className="view view-pad">
        <EmptyState title={t("schedule.firstTitle")}>
          <p className="muted">{t("schedule.firstText")}</p>
          <button type="button" className="btn primary" onClick={() => void createSchedule(plans, t("schedule.defaultName"), null).catch(fail)}>
            <Plus aria-hidden="true" />
            {t("schedule.create")}
          </button>
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <div className="view pr-view pr-schedule">
        <Versions plans={plans} board={b} onSettings={() => setSettingsOpen(true)} />
        {tab === "strips" ? <Strips board={b} /> : tab === "dood" ? <Dood board={b} team={team} /> : <Calendar plans={plans} board={b} onShowStrips={() => setTab("strips")} />}
      </div>
      {settingsOpen && <SettingsDialog schedule={b.schedule} onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

/** The schedule shown among those kept side by side, and what is done with it [PDT-05]. */
function Versions({ plans, board: b, onSettings }: { plans: Plans; board: Board; onSettings: () => void }) {
  const { ask, prompt, notify } = useProject();
  const s = b.schedule!;
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const items: MoreItem[] = [
    {
      label: t("schedule.newVersion"),
      icon: Plus,
      onClick: async () => {
        const name = (await prompt(t("schedule.newVersion"), t("schedule.name"), t("schedule.rainName")))?.trim();
        if (name) void createSchedule(plans, name, null).catch(fail);
      },
    },
  ];
  // What is done to one plan, from the « ⋯ » of its row: the one chosen or another.
  const planItems = (id: string): MoreItem[] => {
    const x = plans.schedules.find((p) => p.id === id);
    if (!x) return [];
    return [
      {
        label: t("schedule.duplicate"),
        icon: Copy,
        hint: t("schedule.duplicateHint"),
        onClick: async () => {
          const name = (await prompt(t("schedule.duplicate"), t("schedule.name"), t("schedule.copyName", { name: x.name })))?.trim();
          if (name) void createSchedule(plans, name, x).catch(fail);
        },
      },
      {
        label: t("schedule.rename"),
        icon: Pencil,
        onClick: async () => {
          const name = (await prompt(t("schedule.rename"), t("schedule.name"), x.name))?.trim();
          if (name) void updateSchedule(x.id, { name }).catch(fail);
        },
      },
      {
        label: t("schedule.delete"),
        icon: Trash2,
        danger: true,
        onClick: async () => {
          if (await confirmRemoval(ask, { title: t("schedule.deleteTitle", { name: x.name }), text: t("schedule.deleteText") })) void deleteSchedule(x.id).catch(fail);
        },
      },
    ];
  };
  return (
    <ViewTools>
      <Select value={s.id} aria-label={t("schedule.version")} actions={items} optionActions={planItems} optionMenuLabel={(name) => t("schedule.planMenu", { name })} onChange={(e) => void chooseSchedule(e.target.value).catch(fail)}>
        {plans.schedules.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </Select>
      <button type="button" className="btn view-tools-end" onClick={onSettings}>
        <Settings2 aria-hidden="true" />
        {t("schedule.settings")}
      </button>
    </ViewTools>
  );
}

const WEEK = [1, 2, 3, 4, 5, 6, 7];
const weekDayName = (d: number) => dateFormat({ weekday: "short" }).format(new Date(2024, 0, d));

/** The start of the schedule, the days of the week worked, the length of a day and the time a page takes. */
function SettingsDialog({ schedule, onClose }: { schedule: Schedule; onClose: () => void }) {
  const { notify } = useProject();
  const [draft, setDraft] = useState({ ...schedule });
  const save = async () => {
    try {
      await updateSchedule(schedule.id, draft);
      onClose();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <Dialog
      title={t("schedule.settingsTitle", { name: schedule.name })}
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        { label: t("common.save"), primary: true, onClick: () => void save() },
      ]}
    >
      <div className="form">
        <label className="field">
          <span>{t("schedule.start")}</span>
          <input type="date" value={draft.startDate ?? ""} onChange={(e) => setDraft({ ...draft, startDate: e.target.value || null })} />
        </label>
        <fieldset className="field">
          <legend>{t("schedule.week")}</legend>
          <div className="chips">
            {WEEK.map((d) => {
              const on = draft.week.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  className={on ? "chip on" : "chip"}
                  aria-pressed={on}
                  onClick={() => setDraft({ ...draft, week: on ? draft.week.filter((x) => x !== d) : [...draft.week, d] })}
                >
                  {weekDayName(d)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="input-row">
          <label className="field">
            <span>{t("schedule.dayLength")}</span>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={draft.dayMinutes / 60}
              onChange={(e) => setDraft({ ...draft, dayMinutes: Math.round(Math.max(0.5, Number(e.target.value) || 10) * 60) })}
            />
          </label>
          <label className="field">
            <span>{t("schedule.pageTime")}</span>
            <input type="number" min={5} max={600} step={5} value={draft.pageMinutes} onChange={(e) => setDraft({ ...draft, pageMinutes: Math.max(5, Math.round(Number(e.target.value) || 90)) })} />
          </label>
        </div>
        <p className="muted small">{t("schedule.pageTimeHelp")}</p>
      </div>
    </Dialog>
  );
}

type Drag = { moving: Moving[]; over?: { dayId: string; stripId: string | null; after: boolean } | "tray" };

function Strips({ board: b }: { board: Board }) {
  const alerts = usePermitAlerts();
  const { session, notify, ask, prompt } = useProject();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [arranging, setArranging] = useState(false);
  const [moving, setMoving] = useState<Moving[] | null>(null);
  // Strips picked with Ctrl + click (or from their menu), moved or taken off together.
  const [picked, setPicked] = useState<Moving[]>([]);
  const keyOf = (m: Moving) => ("stripId" in m ? m.stripId : `scene:${m.sceneId}`);
  const isPicked = (m: Moving) => picked.some((p) => keyOf(p) === keyOf(m));
  const toggle = (m: Moving) => setPicked((list) => (list.some((p) => keyOf(p) === keyOf(m)) ? list.filter((p) => keyOf(p) !== keyOf(m)) : [...list, m]));
  const pickClick = (e: React.MouseEvent, m: Moving) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    toggle(m);
  };
  const pickItem = (m: Moving): MoreItem =>
    isPicked(m) ? { label: t("schedule.unselect"), icon: SquareCheck, onClick: () => toggle(m) } : { label: t("schedule.select"), icon: Square, hint: t("schedule.selectHint"), onClick: () => toggle(m) };
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const schedule = b.schedule!;
  const days = b.days.map((d) => d.day);

  const place = async (m: Moving[], dayId: string, before: Strip | null, after: Strip | null) => {
    try {
      await session.flush();
      await placeStrips(m, dayId, before, after);
      setPicked([]);
    } catch (e) {
      fail(e);
    }
  };
  /** Drops in a day, before or after a strip of it, or at its end. */
  const dropIn = (dayId: string, stripId: string | null, after: boolean, m: Moving[]) => {
    const moved = new Set(m.flatMap((x) => ("stripId" in x ? [x.stripId] : [])));
    if (stripId && moved.has(stripId)) return;
    const list = (b.days.find((d) => d.day.id === dayId)?.strips ?? []).filter((s) => !moved.has(s.id));
    const at = stripId ? list.findIndex((s) => s.id === stripId) : list.length;
    const i = stripId && after ? at + 1 : at;
    void place(m, dayId, list[i - 1] ?? null, list[i] ?? null);
  };
  /** Dragging a picked strip takes the whole selection along, in board order. */
  const dragData = (e: DragEvent, m: Moving) => {
    const all = isPicked(m) ? picked : [m];
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(all));
    setDrag({ moving: all });
  };
  const stripsOf = (m: Moving[]) => m.flatMap((x) => ("stripId" in x ? [x.stripId] : []));
  const overStrip = (e: DragEvent<HTMLElement>, dayId: string, stripId: string | null) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const after = stripId ? e.clientY > r.top + r.height / 2 : true;
    const o = drag.over;
    if (o === "tray" || !o || o.dayId !== dayId || o.stripId !== stripId || o.after !== after) setDrag({ ...drag, over: { dayId, stripId, after } });
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const d = drag;
    setDrag(null);
    if (!d?.over) return;
    if (d.over === "tray") {
      const ids = stripsOf(d.moving);
      if (ids.length) void unschedule(ids).then(() => setPicked([])).catch(fail);
      return;
    }
    dropIn(d.over.dayId, d.over.stripId, d.over.after, d.moving);
  };
  const dropClass = (dayId: string, stripId: string | null) => {
    const o = drag?.over;
    if (!o || o === "tray" || o.dayId !== dayId || o.stripId !== stripId) return "";
    return stripId ? (o.after ? " drop-after" : " drop-before") : " drop-end";
  };

  const stripMenu = (d: Board["days"][number], s: Strip, i: number): MoreItem[] => [
    ...(s.banner === null ? [pickItem({ stripId: s.id })] : []),
    ...(i > 0 ? [{ label: t("schedule.moveUp"), icon: ArrowUp, onClick: () => void place([{ stripId: s.id }], d.day.id, d.strips[i - 2] ?? null, d.strips[i - 1]) }] : []),
    ...(i < d.strips.length - 1 ? [{ label: t("schedule.moveDown"), icon: ArrowDown, onClick: () => void place([{ stripId: s.id }], d.day.id, d.strips[i + 1], d.strips[i + 2] ?? null) }] : []),
    { label: t("schedule.moveTo"), icon: CalendarDays, onClick: () => setMoving(isPicked({ stripId: s.id }) ? picked : [{ stripId: s.id }]) },
    ...(s.banner !== null
      ? [
          {
            label: t("schedule.editBanner"),
            icon: Pencil,
            onClick: async () => {
              const text = (await prompt(t("schedule.editBanner"), t("schedule.bannerText"), s.banner ?? ""))?.trim();
              if (text) void updateBanner(s.id, text).catch(fail);
            },
          },
        ]
      : []),
    {
      label: s.banner !== null ? t("schedule.removeBanner") : t("schedule.unschedule"),
      icon: s.banner !== null ? Trash2 : Undo2,
      danger: s.banner !== null,
      onClick: () => void unschedule([s.id]).catch(fail),
    },
  ];

  const dayMenu = (d: Board["days"][number]): MoreItem[] => [
    {
      label: t("schedule.addBanner"),
      icon: Flag,
      hint: t("schedule.addBannerHint"),
      onClick: async () => {
        const text = (await prompt(t("schedule.addBanner"), t("schedule.bannerText")))?.trim();
        if (text) void addBanner(d.day.id, text, d.strips[d.strips.length - 1] ?? null, null).catch(fail);
      },
    },
    { label: t("schedule.addDayAfter"), icon: Plus, onClick: () => void addDay(schedule.id, days, "shoot", d.day).catch(fail) },
    { label: t("schedule.addOffAfter"), icon: BedDouble, onClick: () => void addDay(schedule.id, days, "off", d.day).catch(fail) },
    { label: t("schedule.addTravelAfter"), icon: Car, onClick: () => void addDay(schedule.id, days, "travel", d.day).catch(fail) },
    ...(d.day.kind !== "shoot" ? [{ label: t("schedule.makeShoot"), icon: CalendarDays, onClick: () => void updateDay(d.day.id, { kind: "shoot" }).catch(fail) }] : []),
    {
      label: t("schedule.deleteDay"),
      icon: Trash2,
      danger: true,
      hint: d.scenes.length ? t("schedule.deleteDayHint") : undefined,
      onClick: async () => {
        if (!d.scenes.length || (await confirmRemoval(ask, { title: t("schedule.deleteDayTitle", { day: dayTitle(d) }), text: t("schedule.deleteDayText") })))
          void deleteDay(d.day.id).catch(fail);
      },
    },
  ];

  return (
    <div className={b.unplaced.length ? "pr-board-wrap" : "pr-board-wrap tray-empty"}>
      <main className="pr-board" aria-label={t("schedule.strips")} onDragEnd={() => setDrag(null)}>
        {b.days.length === 0 && (
          <div className="pr-empty-box">
            <p className="muted">{t("schedule.noDay")}</p>
          </div>
        )}
        {b.days.map((d) => {
          if (d.day.kind !== "shoot") {
            return (
              <section key={d.day.id} className={`pr-day pr-day-${d.day.kind}`} onDragOver={(e) => overStrip(e, d.day.id, null)} onDrop={drop}>
                <header className="pr-day-head">
                  {d.day.kind === "off" ? <BedDouble aria-hidden="true" /> : <Car aria-hidden="true" />}
                  <strong>{t(`schedule.kinds.${d.day.kind}`)}</strong>
                  <DateField day={d.day} date={d.date} />
                  <span className="spacer" />
                  <MoreMenu label={t("schedule.dayMenu", { day: dayTitle(d) })} items={dayMenu(d)} />
                </header>
              </section>
            );
          }
          const over = d.conflicts.find((c) => c.kind === "overload");
          return (
            <section key={d.day.id} className={`pr-day${dropClass(d.day.id, null)}`} aria-label={dayTitle(d)} onDragOver={(e) => overStrip(e, d.day.id, null)} onDrop={drop}>
              <header className="pr-day-head">
                <strong className="pr-day-num">{t("schedule.dayN", { n: d.number, total: b.shootDays })}</strong>
                <DateField day={d.day} date={d.date} />
                <span className="pr-day-sum">
                  {t("breakdown.pages", { pages: formatEighths(d.eighths) })} · <span className={over ? "pr-over" : ""}>{formatMinutes(d.minutes) || "0 min"}</span>
                  <span className="muted"> / {formatMinutes(b.settings.dayMinutes)}</span>
                </span>
                <Conflicts list={d.conflicts} />
                <PermitConflict dayId={d.day.id} alerts={alerts} />
                <span className="spacer" />
                <MoreMenu label={t("schedule.dayMenu", { day: dayTitle(d) })} items={dayMenu(d)} />
              </header>
              {d.strips.length > 0 && <StripColumns />}
              {d.strips.length === 0 ? (
                <p className="pr-day-empty muted">{t("schedule.dropHere")}</p>
              ) : (
                <ol className="pr-strips">
                  {d.strips.map((s, i) => {
                    const info = s.sceneId ? b.info.get(s.sceneId) : undefined;
                    return (
                      <li
                        key={s.id}
                        className={`pr-strip-li${dropClass(d.day.id, s.id)}${isPicked({ stripId: s.id }) ? " picked" : ""}`}
                        draggable
                        onClick={(e) => s.banner === null && pickClick(e, { stripId: s.id })}
                        onDragStart={(e) => dragData(e, { stripId: s.id })}
                        onDragOver={(e) => overStrip(e, d.day.id, s.id)}
                        onDrop={drop}
                      >
                        {info ? <StripRow info={info} menu={stripMenu(d, s, i)} /> : <BannerRow text={s.banner ?? ""} menu={stripMenu(d, s, i)} />}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
        <div className="pr-board-add">
          <button type="button" className="btn" onClick={() => void addDay(schedule.id, days, "shoot").catch(fail)}>
            <Plus aria-hidden="true" />
            {t("schedule.addDay")}
          </button>
          <button type="button" className="btn ghost" onClick={() => void addDay(schedule.id, days, "off").catch(fail)}>
            <BedDouble aria-hidden="true" />
            {t("schedule.addOff")}
          </button>
          <button type="button" className="btn ghost" onClick={() => void addDay(schedule.id, days, "travel").catch(fail)}>
            <Car aria-hidden="true" />
            {t("schedule.addTravel")}
          </button>
        </div>
      </main>
      <aside
        className={drag?.over === "tray" ? "pr-tray over" : "pr-tray"}
        aria-label={t("schedule.toPlace")}
        onDragOver={(e) => {
          if (!drag || !stripsOf(drag.moving).length) return;
          e.preventDefault();
          if (drag.over !== "tray") setDrag({ ...drag, over: "tray" });
        }}
        onDrop={drop}
      >
        <header className="pr-tray-head">
          <h2>
            {t("schedule.toPlace")}
            <span className="pr-count">{b.unplaced.length}</span>
          </h2>
          <button type="button" className={b.unplaced.length ? "btn small primary" : "btn small"} onClick={() => setArranging(true)}>
            <Shuffle aria-hidden="true" />
            {t("schedule.arrange")}
          </button>
        </header>
        {b.unplaced.length === 0 ? (
          <p className="muted small pr-tray-done">{t("schedule.allPlaced")}</p>
        ) : (
          <ol className="pr-strips">
            {b.unplaced.map((info) => (
              <li
                key={info.scene.id}
                className={isPicked({ sceneId: info.scene.id }) ? "pr-strip-li picked" : "pr-strip-li"}
                draggable
                onClick={(e) => pickClick(e, { sceneId: info.scene.id })}
                onDragStart={(e) => dragData(e, { sceneId: info.scene.id })}
              >
                <StripRow
                  info={info}
                  menu={[
                    pickItem({ sceneId: info.scene.id }),
                    { label: t("schedule.moveTo"), icon: CalendarDays, onClick: () => setMoving(isPicked({ sceneId: info.scene.id }) ? picked : [{ sceneId: info.scene.id }]) },
                  ]}
                />
              </li>
            ))}
          </ol>
        )}
      </aside>
      {arranging && <ArrangeDialog board={b} onClose={() => setArranging(false)} />}
      {moving && (
        <MoveDialog
          board={b}
          onPick={(dayId) => {
            const d = b.days.find((x) => x.day.id === dayId);
            const moved = new Set(stripsOf(moving));
            if (d) void place(moving, dayId, d.strips.filter((s) => !moved.has(s.id)).at(-1) ?? null, null);
            setMoving(null);
          }}
          onClose={() => setMoving(null)}
        />
      )}
      {picked.length > 0 && (
        <div className="pr-pickbar" role="toolbar" aria-label={t("schedule.pickBar")} onKeyDown={(e) => e.key === "Escape" && setPicked([])}>
          <strong aria-live="polite">{plural("schedule.picked", picked.length)}</strong>
          <button type="button" className="btn small" onClick={() => setMoving(picked)}>
            <CalendarDays aria-hidden="true" />
            {t("schedule.moveTo")}
          </button>
          {stripsOf(picked).length > 0 && (
            <button type="button" className="btn small" onClick={() => void unschedule(stripsOf(picked)).then(() => setPicked([])).catch(fail)}>
              <Undo2 aria-hidden="true" />
              {t("schedule.unschedule")}
            </button>
          )}
          <button type="button" className="btn small ghost" onClick={() => setPicked([])}>
            {t("schedule.clearPick")}
          </button>
        </div>
      )}
      {drag && <span className="visually-hidden" aria-live="polite">{t("schedule.dragging")}</span>}
    </div>
  );
}

export function dayTitle(d: { number: number | null; date: string | null; day: Day }): string {
  const name = d.day.kind === "shoot" ? t("schedule.dayShort", { n: d.number }) : t(`schedule.kinds.${d.day.kind}`);
  return d.date ? `${name} · ${shortDate(d.date)}` : name;
}

/** The date of a day: worked out from the one before, or set by hand. */
function DateField({ day, date }: { day: Day; date: string | null }) {
  const { notify } = useProject();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <span className="pr-date-edit">
        <input
          type="date"
          autoFocus
          defaultValue={day.date ?? date ?? ""}
          aria-label={t("schedule.dateOf")}
          onBlur={(e) => {
            setEditing(false);
            const v = e.target.value || null;
            if (v !== day.date) void updateDay(day.id, { date: v }).catch((x) => notify({ text: describeError(x), tone: "error" }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        {day.date && (
          <button type="button" className="btn tiny ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => void updateDay(day.id, { date: null }).then(() => setEditing(false))}>
            {t("schedule.autoDate")}
          </button>
        )}
      </span>
    );
  }
  return (
    <button type="button" className={day.date ? "pr-date fixed" : "pr-date"} title={day.date ? t("schedule.dateFixed") : t("schedule.dateAuto")} onClick={() => setEditing(true)}>
      {date ? dateFormat({ weekday: "long", day: "numeric", month: "long" }).format(parseDay(date)) : t("schedule.noDate")}
    </button>
  );
}

/** A set of the day has no permit for that day [AUT-04]; the badge leads to the requests. */
function PermitConflict({ dayId, alerts }: { dayId: string; alerts: PermitAlert[] | undefined }) {
  const { go } = useProject();
  const own = alerts?.filter((a) => a.dayId === dayId) ?? [];
  if (!own.length) return null;
  const text = own.map((a) => t("schedule.permitConflict", { name: a.name })).join("\n");
  return (
    <button type="button" className="badge warn pr-conflict pr-conflict-link" title={text} onClick={() => go("permits")}>
      <FileWarning aria-hidden="true" />
      {plural("schedule.permitConflicts", own.length)}
      <span className="visually-hidden">{text}</span>
    </button>
  );
}

function Conflicts({ list }: { list: Conflict[] }) {
  const away = list.filter((c) => c.kind === "unavailable");
  const over = list.find((c) => c.kind === "overload");
  if (!away.length && !over) return null;
  const text = [
    ...away.map((c) => t("schedule.awayConflict", { name: c.character })),
    ...(over ? [t("schedule.overConflict", { time: formatMinutes(over.minutes ?? 0) })] : []),
  ].join("\n");
  return (
    <span className="badge warn pr-conflict" title={text}>
      <AlertTriangle aria-hidden="true" />
      {plural("schedule.conflicts", away.length + (over ? 1 : 0))}
      <span className="visually-hidden">{text}</span>
    </span>
  );
}

/** The names of the strip columns, above the strips of a day; the strips say them to a screen reader themselves. */
function StripColumns() {
  return (
    <div className="pr-strip pr-strip-cols" aria-hidden="true">
      <span />
      <span>{t("team.number")}</span>
      <span>{t("schedule.cols.side")}</span>
      <span>{t("schedule.cols.moment")}</span>
      <span>{t("schedule.cols.set")}</span>
      <span className="pr-strip-cast">{t("schedule.cols.cast")}</span>
      <span className="pr-strip-len">{t("schedule.cols.pages")}</span>
      <span className="pr-strip-time">{t("schedule.cols.time")}</span>
      <span />
    </div>
  );
}

/** A strip in the colour of its moment and side: number, I/E, D/N, set, cast numbers, length and time [PDT-01]. */
function StripRow({ info, menu }: { info: StripScene; menu: MoreItem[] }) {
  const f = info.facts;
  const place = f.place ? (f.detail ? `${f.place} – ${f.detail}` : f.place) : info.scene.heading || t("workspace.noHeading");
  // What a screen reader says of the strip, its colour included: the cells alone are loose numbers.
  const spoken = [
    t("schedule.stripScene", { n: info.scene.number }),
    f.side && t(`breakdown.side.${f.side}`),
    f.moment && t(`breakdown.moment.${f.moment}`),
    place,
    t("breakdown.pages", { pages: formatEighths(info.scene.eighths) }),
    info.scene.characters.length > 0 && t("schedule.stripCast", { list: info.scene.characters.join(", ") }),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <div className={`pr-strip tone-${stripTone(f)}`}>
      <span className="visually-hidden">{spoken}</span>
      <span className="grip" aria-hidden="true">
        <GripVertical />
      </span>
      <span className="pr-strip-num" aria-hidden="true">
        {info.scene.number}
      </span>
      <span className="pr-strip-ie" aria-hidden="true">
        {f.side ? t(`schedule.sideShort.${f.side}`) : ""}
      </span>
      <span className="pr-strip-dn" aria-hidden="true">
        {f.moment ? t(`schedule.momentShort.${f.moment}`) : ""}
      </span>
      <span className="pr-strip-place" title={info.scene.heading} aria-hidden="true">
        {place}
      </span>
      <span className="pr-strip-cast" title={info.scene.characters.join(", ")} aria-hidden="true">
        {info.cast.join(", ")}
      </span>
      <span className="pr-strip-len" aria-hidden="true">
        {formatEighths(info.scene.eighths)}
      </span>
      <span className="pr-strip-time" aria-hidden="true">
        {formatMinutes(info.minutes)}
      </span>
      <MoreMenu label={t("schedule.stripMenu", { n: info.scene.number })} items={menu} />
    </div>
  );
}

function BannerRow({ text, menu }: { text: string; menu: MoreItem[] }) {
  return (
    <div className="pr-strip pr-banner">
      <span className="grip" aria-hidden="true">
        <GripVertical />
      </span>
      <Flag aria-hidden="true" className="pr-banner-icon" />
      <span className="pr-strip-place">{text}</span>
      <MoreMenu label={t("schedule.bannerMenu")} items={menu} />
    </div>
  );
}

/** The day to put a strip in, for who does not drag [PDT-02]. */
function MoveDialog({ board: b, onPick, onClose }: { board: Board; onPick: (dayId: string) => void; onClose: () => void }) {
  const shoot = b.days.filter((d) => d.day.kind === "shoot");
  const [dayId, setDayId] = useState(shoot[0]?.day.id ?? "");
  return (
    <Dialog
      title={t("schedule.moveTo")}
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        { label: t("schedule.place"), primary: true, disabled: !dayId, onClick: () => onPick(dayId) },
      ]}
    >
      {shoot.length === 0 ? (
        <p className="muted">{t("schedule.noDay")}</p>
      ) : (
        <Select value={dayId} aria-label={t("schedule.day")} onChange={(e) => setDayId(e.target.value)}>
          {shoot.map((d) => (
            <option key={d.day.id} value={d.day.id}>
              {dayTitle(d)}
            </option>
          ))}
        </Select>
      )}
    </Dialog>
  );
}

/** The scenes put in days for the user, grouped by set, actors or moment of the day [PDT-03]. */
function ArrangeDialog({ board: b, onClose }: { board: Board; onClose: () => void }) {
  const { session, notify } = useProject();
  const [by, setBy] = useState<ArrangeBy>("set");
  const [all, setAll] = useState(b.unplaced.length === 0);
  const scenes = all ? [...b.info.values()] : b.unplaced;
  const groups = useMemo(
    () => arrange(scenes.map((s) => ({ id: s.scene.id, minutes: s.minutes, facts: s.facts, cast: s.cast })), by, b.settings.dayMinutes),
    [scenes, by, b.settings.dayMinutes],
  );
  const go = async () => {
    try {
      await session.flush();
      await applyArrangement(b.schedule!.id, b.days.map((d) => d.day), groups, all);
      onClose();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <Dialog
      title={t("schedule.arrangeTitle")}
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        { label: plural("schedule.arrangeGo", groups.length), primary: true, disabled: groups.length === 0, onClick: () => void go() },
      ]}
    >
      <div className="form">
        <p className="muted">{t("schedule.arrangeHelp")}</p>
        <Segmented
          label={t("schedule.arrangeBy")}
          value={by}
          onChange={setBy}
          options={[
            { id: "set", label: t("schedule.bySet"), hint: t("schedule.bySetHint") },
            { id: "cast", label: t("schedule.byCast"), hint: t("schedule.byCastHint") },
            { id: "moment", label: t("schedule.byMoment"), hint: t("schedule.byMomentHint") },
          ]}
        />
        <fieldset className="field">
          <legend>{t("schedule.arrangeWhat")}</legend>
          <label className="choice">
            <input type="radio" name="arrange-all" checked={!all} disabled={b.unplaced.length === 0} onChange={() => setAll(false)} />
            {plural("schedule.arrangeUnplaced", b.unplaced.length)}
          </label>
          <label className="choice">
            <input type="radio" name="arrange-all" checked={all} onChange={() => setAll(true)} />
            {t("schedule.arrangeAll")}
          </label>
        </fieldset>
        {all && b.days.some((d) => d.day.kind === "shoot") && <p className="error">{t("schedule.arrangeAllWarning")}</p>}
      </div>
    </Dialog>
  );
}

/** The days in runs of one calendar week, for the band above them. */
function weeksOf(days: Board["days"]) {
  const weeks: { key: number; start: number; span: number; first: string | null }[] = [];
  days.forEach((d, i) => {
    const monday = d.date ? parseDay(d.date) : null;
    monday?.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const key = monday ? monday.getTime() : 0;
    const last = weeks[weeks.length - 1];
    if (last && last.key === key) last.span++;
    else weeks.push({ key, start: i, span: 1, first: d.date });
  });
  return weeks;
}

/** Who is there which day: one square per day with the usual day-out-of-days code [PDT-04]. */
function Dood({ board: b, team }: { board: Board; team: Team }) {
  const [hot, setHot] = useState<number | null>(null);
  const days = b.days.filter((d) => d.day.kind !== "off");
  const contact = new Map(team.contacts.map((c) => [c.id, c.name]));
  if (!days.some((d) => d.day.kind === "shoot")) {
    return (
      <div className="pr-pad">
        <EmptyState title={t("schedule.doodEmptyTitle")}>
          <p className="muted">{t("schedule.doodEmptyText")}</p>
        </EmptyState>
      </div>
    );
  }
  const rows = [...b.numbers.entries()]
    .sort((x, y) => x[1] - y[1])
    .map(([character, n]) => {
      const marks = presence(
        days.map((d) => d.day),
        days.map((d) => d.characters.includes(character)),
      );
      const actorId = team.cast.find((r) => r.character === character)?.contactId;
      return { character, n, marks, actor: actorId ? contact.get(actorId) : undefined };
    });
  const worked = (m: Presence) => m === "SW" || m === "W" || m === "WF" || m === "SWF";
  const count = (marks: Presence[], test: (m: Presence) => boolean) => marks.filter(test).length;
  const totalWork = rows.reduce((sum, r) => sum + count(r.marks, worked), 0);
  const totalHold = rows.reduce((sum, r) => sum + count(r.marks, (m) => m === "H"), 0);
  const dated = days.some((d) => d.date);
  const weeks = weeksOf(days);
  const weekStarts = new Set(weeks.slice(1).map((w) => w.start));
  const shortDay = dateFormat({ day: "numeric", month: "short" });
  const dayName = dateFormat({ weekday: "short", day: "numeric" });
  const dayLabel = (d: Board["days"][number]) => (d.day.kind === "shoot" ? t("schedule.dayShort", { n: d.number }) : t("schedule.travelShort"));
  const col = (i: number) => `${days[i].day.kind === "travel" ? " off" : ""}${weekStarts.has(i) ? " wk" : ""}${hot === i ? " hot" : ""}`;
  const amount = (n: number) => n || "–";
  const nameHead = (
    <div className="pr-dood-who">
      <span className="pr-dood-n">{t("team.number")}</span>
      {t("team.character")}
    </div>
  );
  return (
    <div className="pr-dood-wrap">
      <div className="pr-dood-scroll" tabIndex={0} role="region" aria-label={t("schedule.dood")}>
        <table
          className="pr-dood"
          style={{ "--dood-days": days.length } as CSSProperties}
          onMouseOver={(e) => {
            const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-col]");
            setHot(cell ? Number(cell.dataset.col) : null);
          }}
          onMouseLeave={() => setHot(null)}
        >
          <colgroup>
            <col className="c-name" />
            {days.map((d) => (
              <col key={d.day.id} />
            ))}
            <col className="c-total" />
            <col className="c-total" />
          </colgroup>
          <thead>
            {dated && (
              <tr className="pr-dood-weeks">
                <th className="pr-dood-name" rowSpan={2}>
                  {nameHead}
                </th>
                {weeks.map((w) => (
                  <th key={w.start} colSpan={w.span} className={w.start > 0 ? "wk" : undefined}>
                    {w.first && <span className="pr-dood-week">{w.span >= 3 ? t("schedule.weekOf", { date: shortDay.format(new Date(w.key)) }) : shortDay.format(parseDay(w.first))}</span>}
                  </th>
                ))}
                <th className="pr-dood-total t-work" rowSpan={2}>
                  {t("schedule.work")}
                </th>
                <th className="pr-dood-total t-hold" rowSpan={2}>
                  {t("schedule.hold")}
                </th>
              </tr>
            )}
            <tr>
              {!dated && <th className="pr-dood-name">{nameHead}</th>}
              {days.map((d, i) => (
                <th key={d.day.id} data-col={i} className={`pr-dood-day${col(i)}`} title={d.date ? shortDate(d.date) : undefined}>
                  {dayLabel(d)}
                  {d.date && <span>{dayName.format(parseDay(d.date))}</span>}
                </th>
              ))}
              {!dated && (
                <>
                  <th className="pr-dood-total t-work">{t("schedule.work")}</th>
                  <th className="pr-dood-total t-hold">{t("schedule.hold")}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const holds = count(r.marks, (m) => m === "H");
              return (
                <tr key={r.character}>
                  <th scope="row" className="pr-dood-name" title={r.actor ? `${r.character} · ${r.actor}` : r.character}>
                    <div className="pr-dood-who">
                      <span className="pr-dood-n">{r.n}</span>
                      <span className="pr-slug">{r.character}</span>
                      {r.actor && <span className="pr-dood-actor">{r.actor}</span>}
                    </div>
                  </th>
                  {r.marks.map((m, i) => {
                    const d = days[i];
                    const label = m ? t(`schedule.doodMarks.${m}`) : "";
                    return (
                      <td key={d.day.id} data-col={i} className={`pr-dood-cell${col(i)}`}>
                        {m && (
                          <abbr className={`pr-dood-mark m-${m}`} title={`${label} · ${r.character} · ${dayLabel(d)}${d.date ? ` · ${shortDate(d.date)}` : ""}`}>
                            {m}
                          </abbr>
                        )}
                      </td>
                    );
                  })}
                  <td className="pr-dood-total t-work">{amount(count(r.marks, worked))}</td>
                  <td className={`pr-dood-total t-hold${holds ? " held" : ""}`}>{amount(holds)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pr-dood-name">
                <div className="pr-dood-who">{t("schedule.doodAtWork")}</div>
              </th>
              {days.map((d, i) => (
                <td key={d.day.id} data-col={i} className={`pr-dood-count${col(i)}`}>
                  {amount(count(rows.map((r) => r.marks[i]), worked))}
                </td>
              ))}
              <td className="pr-dood-total t-work">{amount(totalWork)}</td>
              <td className={`pr-dood-total t-hold${totalHold ? " held" : ""}`}>{amount(totalHold)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const PHASES: EventPhase[] = ["prep", "tests", "shoot", "edit", "delivery", "other"];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Whole days from one date to another: rounded, as a change of clock hour makes a day 23 or 25 hours long. */
const dayDiff = (from: string, to: string) => Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86400000);
const shiftDay = (iso: string, by: number) => {
  const d = parseDay(iso);
  d.setDate(d.getDate() + by);
  return isoDay(d);
};
/** What a stage lasts, in the unit a production speaks of: days up to two weeks, weeks beyond. */
const stageLength = (start: string, end: string) => {
  const days = dayDiff(start, end) + 1;
  return days < 14 ? t("schedule.lengthDays", { n: days }) : t("schedule.lengthWeeks", { n: Math.round(days / 7) });
};
/** The shooting days as runs of consecutive days: the rest days show as gaps in the shoot. */
const dayRuns = (dates: string[]) => {
  const runs: { start: string; end: string }[] = [];
  for (const d of dates) {
    const last = runs[runs.length - 1];
    if (last && dayDiff(last.end, d) <= 1) last.end = d;
    else runs.push({ start: d, end: d });
  }
  return runs;
};

type StageRow = ProductionEvent & { auto?: boolean };
type StageDates = { id: string; start: string; end: string };

/** The calendar of the production, the shooting days among its stages, sent to any diary as an iCal file [PDT-06]. */
function Calendar({ plans, board: b, onShowStrips }: { plans: Plans; board: Board; onShowStrips: () => void }) {
  const { ask, notify } = useProject();
  const [adding, setAdding] = useState<ProductionEvent | "new" | null>(null);
  const [moved, setMoved] = useState<StageDates | null>(null);
  const grab = useRef<{ row: StageRow; mode: string; x: number; perDay: number; dragged: boolean } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });
  const shooting = b.days
    .filter((d) => d.day.kind === "shoot" && d.date)
    .map((d) => d.date!)
    .sort();
  const rows: StageRow[] = [
    ...plans.events,
    ...(shooting.length ? [{ id: "shoot", phase: "shoot" as const, title: t("schedule.phases.shoot"), start: shooting[0], end: shooting[shooting.length - 1], notes: "", auto: true }] : []),
  ].sort((x, y) => (x.start < y.start ? -1 : x.start > y.start ? 1 : 0));
  const first = rows.reduce((m, r) => (r.start < m ? r.start : m), rows[0]?.start ?? "");
  const last = rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0]?.end ?? "");
  // The sheet runs over whole months, so that every column reads as a month.
  const from = first && `${first.slice(0, 7)}-01`;
  const to = last && isoDay(new Date(parseDay(last).getFullYear(), parseDay(last).getMonth() + 1, 0));
  const span = from && to ? dayDiff(from, to) + 1 : 1;
  const pos = (iso: string) => (dayDiff(from, iso) / span) * 100;
  const today = isoDay(new Date());
  const hasToday = !!from && today >= from && today <= to;

  const months: { iso: string; days: number; yearly: boolean }[] = [];
  if (from) {
    for (const d = parseDay(from); isoDay(d) <= to; d.setMonth(d.getMonth() + 1)) {
      months.push({ iso: isoDay(d), days: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), yearly: months.length === 0 || d.getMonth() === 0 });
    }
  }
  const mondays: string[] = [];
  if (from && span <= 100) {
    for (let d = shiftDay(from, (8 - parseDay(from).getDay()) % 7); d <= to; d = shiftDay(d, 7)) mondays.push(d);
  }
  const monthName = dateFormat({ month: "short" });
  const monthAndYear = dateFormat({ month: "short", year: "numeric" });
  const dayAndMonth = dateFormat({ day: "numeric", month: "short" });

  // A window too narrow for the whole sheet opens on the present day rather than on its first month.
  useEffect(() => {
    const box = scroller.current;
    if (!box || !hasToday || box.scrollWidth <= box.clientWidth) return;
    const axis = box.querySelector(".pr-cal-axis");
    if (axis) box.scrollLeft = (axis.clientWidth * pos(today)) / 100 - axis.clientWidth / 8;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGrab = (e: PointerEvent<HTMLElement>, row: StageRow) => {
    if (e.button !== 0) return;
    const track = e.currentTarget.parentElement!;
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { row, mode: (e.target as HTMLElement).dataset.edge ?? "move", x: e.clientX, perDay: track.getBoundingClientRect().width / span, dragged: false };
  };
  const dragGrab = (e: PointerEvent<HTMLElement>) => {
    const g = grab.current;
    if (!g) return;
    if (Math.abs(e.clientX - g.x) >= 3) g.dragged = true;
    if (!g.dragged) return;
    const by = Math.round((e.clientX - g.x) / g.perDay);
    const { id, start, end } = g.row;
    if (g.mode === "start") {
      const s = shiftDay(start, by);
      setMoved({ id, start: s > end ? end : s, end });
    } else if (g.mode === "end") {
      const n = shiftDay(end, by);
      setMoved({ id, start, end: n < start ? start : n });
    } else {
      setMoved({ id, start: shiftDay(start, by), end: shiftDay(end, by) });
    }
  };
  const dropGrab = async () => {
    const g = grab.current;
    grab.current = null;
    if (!g) return;
    if (!g.dragged) {
      setAdding(g.row);
      return;
    }
    try {
      if (moved && (moved.start !== g.row.start || moved.end !== g.row.end)) await updateEvent(g.row.id, { start: moved.start, end: moved.end });
    } catch (e) {
      fail(e);
    }
    setMoved(null);
  };
  const stageMenu = (r: StageRow) => [
    { label: t("schedule.editStage"), icon: Pencil, onClick: () => setAdding(r) },
    {
      label: t("schedule.deleteStage"),
      icon: Trash2,
      danger: true,
      onClick: async () => {
        if (await confirmRemoval(ask, { title: t("schedule.deleteStageTitle", { name: r.title }), text: t("schedule.deleteStageText") })) void deleteEvent(r.id).catch(fail);
      },
    },
  ];
  return (
    <div className="pr-cal-wrap">
      <ViewTools>
        <button type="button" className={`btn view-tools-end${rows.length === 0 ? " primary" : ""}`} onClick={() => setAdding("new")}>
          <Plus aria-hidden="true" />
          {t("schedule.addStage")}
        </button>
      </ViewTools>
      {rows.length === 0 ? (
        <div className="pr-cal-empty">
          <EmptyState title={t("schedule.calendarEmptyTitle")}>
            <p className="muted">{t("schedule.calendarEmptyText")}</p>
          </EmptyState>
        </div>
      ) : (
        <div className="pr-cal-scroll" ref={scroller} tabIndex={0} role="region" aria-label={t("schedule.calendar")}>
          <div className="pr-cal" style={{ "--cal-days": span } as CSSProperties}>
            {/* The months, the shoot and the present day run the full height of the sheet, down past the last stage. */}
            <div className="pr-cal-ground" aria-hidden="true">
              {months.map((m, i) => (
                <span key={m.iso} className={`pr-cal-band${i % 2 ? " odd" : ""}`} style={{ left: `${pos(m.iso)}%`, width: `${(m.days / span) * 100}%` }} />
              ))}
              {mondays.map((d) => (
                <span key={d} className="pr-cal-week" style={{ left: `${pos(d)}%` }} />
              ))}
              {shooting.length > 0 && <span className="pr-cal-shoot" style={{ left: `${pos(shooting[0])}%`, width: `${((dayDiff(shooting[0], shooting[shooting.length - 1]) + 1) / span) * 100}%` }} />}
              {hasToday && <span className="pr-cal-now" style={{ left: `${pos(today)}%` }} />}
            </div>
            <div className="pr-cal-head" aria-hidden="true">
              <div className="pr-cal-corner" />
              <div className="pr-cal-axis">
                {months.map((m) => (
                  <span key={m.iso} className="pr-cal-month" style={{ left: `${pos(m.iso)}%`, width: `${(m.days / span) * 100}%` }}>
                    {(m.yearly ? monthAndYear : monthName).format(parseDay(m.iso))}
                  </span>
                ))}
                {mondays.map((d) => (
                  <span key={d} className="pr-cal-monday" style={{ left: `${pos(d)}%` }}>
                    {parseDay(d).getDate()}
                  </span>
                ))}
                {hasToday && (
                  <span className="pr-cal-today" style={{ left: `${pos(today)}%` }}>
                    {t("schedule.today")}
                  </span>
                )}
              </div>
            </div>
            {PHASES.map((phase) => {
              const stages = rows.filter((r) => r.phase === phase);
              if (!stages.length) return null;
              return (
                <section key={phase} className={`pr-cal-group ph-${phase}`} aria-label={t(`schedule.phases.${phase}`)}>
                  <h3 className="pr-cal-phase">
                    <span>{t(`schedule.phases.${phase}`)}</span>
                  </h3>
                  <ul className="pr-cal-rows">
                    {stages.map((r) => {
                      const now = moved?.id === r.id ? moved : r;
                      const dates = now.start === now.end ? shortDate(now.start) : `${shortDate(now.start)} – ${shortDate(now.end)}`;
                      const flip = pos(now.end) > 84;
                      const tag = r.auto ? `${plural("schedule.shootDays", shooting.length)} · ${t("schedule.fromStrips")}` : now.start === now.end ? dayAndMonth.format(parseDay(now.start)) : stageLength(now.start, now.end);
                      return (
                        <li key={r.id} className={`pr-cal-row${moved?.id === r.id ? " moving" : ""}`}>
                          <div className="pr-cal-name">
                            <button type="button" className="pr-cal-title" title={`${r.title} · ${dates}`} onClick={() => (r.auto ? onShowStrips() : setAdding(r))}>
                              <strong>{r.title}</strong>
                              <span>{dates}</span>
                            </button>
                            {!r.auto && <MoreMenu label={t("schedule.stageMenu", { name: r.title })} items={stageMenu(r)} />}
                          </div>
                          <div className="pr-cal-track" aria-hidden="true">
                            {r.auto ? (
                              <button type="button" tabIndex={-1} className="pr-cal-shootbar" title={`${r.title} · ${dates}`} style={{ left: `${pos(now.start)}%`, width: `${((dayDiff(now.start, now.end) + 1) / span) * 100}%` }} onClick={onShowStrips}>
                                {dayRuns(shooting).map((run) => (
                                  <span key={run.start} style={{ left: `${(dayDiff(now.start, run.start) / (dayDiff(now.start, now.end) + 1)) * 100}%`, width: `${((dayDiff(run.start, run.end) + 1) / (dayDiff(now.start, now.end) + 1)) * 100}%` }} />
                                ))}
                              </button>
                            ) : (
                              <span
                                className={`pr-cal-bar${now.start === now.end ? " one" : ""}`}
                                title={`${r.title} · ${dates}${r.notes ? `\n${r.notes}` : ""}`}
                                style={now.start === now.end ? { left: `${pos(now.start) + 50 / span}%` } : { left: `${pos(now.start)}%`, width: `${((dayDiff(now.start, now.end) + 1) / span) * 100}%` }}
                                onPointerDown={(e) => startGrab(e, r)}
                                onPointerMove={dragGrab}
                                onPointerUp={() => void dropGrab()}
                                onPointerCancel={() => {
                                  grab.current = null;
                                  setMoved(null);
                                }}
                              >
                                {now.start !== now.end && (
                                  <>
                                    <i data-edge="start" />
                                    <i data-edge="end" />
                                  </>
                                )}
                              </span>
                            )}
                            {tag && (
                              <span className="pr-cal-tag" style={flip ? { right: `calc(${100 - pos(now.start)}% + ${now.start === now.end ? 14 : 8}px)` } : { left: `calc(${pos(now.end) + 100 / span}% + 8px)` }}>
                                {tag}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
      {adding && <StageDialog event={adding === "new" ? null : adding} onClose={() => setAdding(null)} />}
    </div>
  );
}

function StageDialog({ event, onClose }: { event: ProductionEvent | null; onClose: () => void }) {
  const { notify } = useProject();
  const today = new Date().toISOString().slice(0, 10);
  const [draft, setDraft] = useState<Omit<ProductionEvent, "id">>(event ?? { phase: "prep", title: "", start: today, end: today, notes: "" });
  const save = async () => {
    try {
      const fixed = { ...draft, title: draft.title.trim() || t(`schedule.phases.${draft.phase}`), end: draft.end < draft.start ? draft.start : draft.end };
      if (event) await updateEvent(event.id, fixed);
      else await addEvent(fixed);
      onClose();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <Dialog
      title={event ? t("schedule.editStage") : t("schedule.addStage")}
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        { label: event ? t("common.save") : t("common.add"), primary: true, disabled: !draft.start, onClick: () => void save() },
      ]}
    >
      <div className="form">
        <label className="field">
          <span>{t("schedule.phase")}</span>
          <Select value={draft.phase} aria-label={t("schedule.phase")} onChange={(e) => setDraft({ ...draft, phase: e.target.value as EventPhase })}>
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {t(`schedule.phases.${p}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="field">
          <span>{t("schedule.stageTitle")}</span>
          <input type="text" value={draft.title} placeholder={t(`schedule.phases.${draft.phase}`)} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-autofocus />
        </label>
        <div className="input-row">
          <label className="field">
            <span>{t("team.start")}</span>
            <input type="date" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
          </label>
          <label className="field">
            <span>{t("team.end")}</span>
            <input type="date" value={draft.end} min={draft.start} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
          </label>
        </div>
        <Field label={t("team.notes")} multiline value={draft.notes} onCommit={(v) => setDraft({ ...draft, notes: v })} />
      </div>
    </Dialog>
  );
}

