import { Minus, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { useLive } from "../../../../core/db/live";
import { useProject } from "../../../project/ui/projectContext";
import { prettyName } from "../../bible/domain/appearances";
import { useScenes } from "../../screenplay/application/scriptSession";
import { formatEighths } from "../../screenplay/domain/duration";
import { numberedParts, sceneLabel } from "../domain/outline";
import { loadStory, SCENE_STATUSES, STORY_TABLES, storyOutline } from "../application/story";
import { t } from "../../../../core/i18n";

const ROW = 30;
/** Room above the acts, for the outline of the one picked. */
const HEAD_PAD = 6;
const ACT_H = 30;
const SEQ_H = 28;
const BEAT_GAP = 10;
const STRIP = 40;
/** The zoom runs from the whole story in the window (1) to twelve times as wide. */
const ZOOM_MAX = 12;
const ZOOM_STEP = 1.2;
/** The width of a scrollbar, as styles.css draws it. */
const SCROLLBAR = 10;

const ACT_FONT = "600 13px";
const SEQ_FONT = "500 12.5px";
const NAME_FONT = "500 13.5px";

let ctx: CanvasRenderingContext2D | null = null;
/** How wide `text` draws in the interface font, so that labels can be laid out before they are drawn. */
function textWidth(text: string, font: string): number {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * 8;
  const family = getComputedStyle(document.documentElement).getPropertyValue("--ui-font") || "sans-serif";
  ctx.font = `${font} ${family}`;
  return ctx.measureText(text).width;
}

/** An act or a sequence: the scenes it holds, and how wide its whole title needs it to be. */
interface Part {
  id: string;
  title: string;
  scenes: string[];
  min: number;
}

/**
 * How wide each scene draws at `perPage` pixels a page, once every sequence and act is stretched to hold its whole
 * title: the scenes of a part too short for its title widen together, so the part keeps its inner proportions.
 */
function stretch(lengths: Map<string, number>, acts: { act: Part | null; sequences: Part[] }[], perPage: number): Map<string, number> {
  const w = new Map([...lengths].map(([id, eighths]) => [id, Math.max(6, (Math.max(1, eighths) / 8) * perPage)]));
  const widen = (p: Part) => {
    const total = p.scenes.reduce((n, id) => n + (w.get(id) ?? 0), 0);
    if (total > 0 && total < p.min) for (const id of p.scenes) w.set(id, (w.get(id) ?? 0) * (p.min / total));
  };
  for (const g of acts) {
    g.sequences.forEach(widen);
    if (g.act) widen(g.act);
  }
  return w;
}

/** The scenes in the order of the story, as wide as they are long, with acts, beats and characters [VUE-10, VUE-12]. */
export function TimelineView() {
  const { session, openScene } = useProject();
  const scenes = useScenes(session);
  const story = useLive(loadStory, [...STORY_TABLES]);
  const viewRef = useRef<HTMLDivElement>(null);
  // Three panes, so that no scrollbar runs along the head or the names: the tracks scroll sideways and carry the
  // head with them, the names scroll up and down and carry the tracks.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const namesRef = useRef<HTMLUListElement>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(([e]) => setRoom(e.contentRect.width));
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller]);
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);
  // The character, act or sequence picked: what is outside it fades, on the scene strip as on the tracks.
  const [alone, setAlone] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  // The point of the story under the pointer when the zoom changed, put back under it once laid out anew.
  const anchor = useRef<{ id: string; frac: number; px: number } | null>(null);

  const characters = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of scenes) for (const c of s.characters) count.set(c, (count.get(c) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, label: prettyName(name), n }));
  }, [scenes]);
  // The names column is as wide as the longest name, so that none is cut.
  const label = useMemo(
    () => Math.ceil(Math.min(280, Math.max(150, ...characters.map((c) => textWidth(c.label, NAME_FONT) + textWidth(String(c.n), "500 12px") + 48)))),
    [characters],
  );

  const outline = useMemo(() => {
    if (!story) return [];
    const groups = storyOutline(story, scenes.map((s) => s.id));
    const numbers = numberedParts(groups);
    const part = (id: string, title: string, ids: string[], font: string): Part => {
      const n = numbers.get(id);
      const whole = n ? (n.title ? `${n.num} ${n.title}` : n.num) : title;
      return { id, title: whole, scenes: ids, min: textWidth(whole, font) + 20 };
    };
    return groups.map((g) => ({
      act: g.act ? part(g.act.id, g.act.title, g.sequences.flatMap((s) => s.scenes), ACT_FONT) : null,
      sequences: g.sequences.flatMap((s) => (s.sequence && s.scenes.length ? [part(s.sequence.id, s.sequence.title, s.scenes, SEQ_FONT)] : [])),
    }));
  }, [story, scenes]);

  const pages = scenes.reduce((n, s) => n + s.eighths, 0) / 8;
  // The zoom sets the whole timeline's width: at 100 %, the window's, or what the narrowest scenes and the whole titles
  // need when that is more. The scale is the largest that stays within it, and the scenes then widen to fill it exactly,
  // so the last one ends on the edge.
  const layout = useMemo(() => {
    const lengths = new Map(scenes.map((s) => [s.id, s.eighths]));
    const sum = (w: Map<string, number>) => [...w.values()].reduce((a, b) => a + b, 0);
    const total = (k: number) => sum(stretch(lengths, outline, k));
    const least = 0.25;
    const target = Math.max(room, total(least)) * zoom;
    let perPage = room > 0 ? least : 40;
    if (room > 0) {
      let hi = Math.max(8, target / Math.max(1, pages));
      for (let i = 0; i < 24 && total(hi) < target; i++) hi *= 2;
      for (let i = 0; i < 24; i++) {
        const mid = (perPage + hi) / 2;
        if (total(mid) <= target) perPage = mid;
        else hi = mid;
      }
    }
    const w = stretch(lengths, outline, perPage);
    const k = room > 0 ? Math.max(1, target / Math.max(1, sum(w))) : 1;
    let x = 0;
    return scenes.map((s) => {
      const item = { scene: s, x, w: (w.get(s.id) ?? 6) * k };
      x += item.w;
      return item;
    });
  }, [scenes, outline, room, pages, zoom]);

  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a || !scroller) return;
    anchor.current = null;
    const l = layout.find((it) => it.scene.id === a.id);
    if (l) scroller.scrollLeft = l.x + a.frac * l.w - a.px;
  }, [layout, scroller]);

  /** Zooms to `next`, keeping still the point `px` pixels into the tracks (their middle by default). */
  const zoomTo = (next: number, px?: number) => {
    const z = Math.min(ZOOM_MAX, Math.max(1, Math.round(next * 100) / 100));
    if (z === zoom) return;
    if (scroller && layout.length) {
      const at = Math.min(scroller.clientWidth, Math.max(0, px ?? scroller.clientWidth / 2));
      const x = scroller.scrollLeft + at;
      const l = layout.find((it) => x < it.x + it.w) ?? layout[layout.length - 1];
      anchor.current = { id: l.scene.id, frac: l.w > 0 ? Math.min(1, (x - l.x) / l.w) : 0, px: at };
    }
    setZoom(z);
  };
  const zoomRef = useRef({ zoomTo, zoom });
  zoomRef.current = { zoomTo, zoom };
  // Ctrl + wheel zooms sideways only, around the pointer, over the head as over the tracks.
  const ready = story !== null;
  useEffect(() => {
    const el = viewRef.current;
    if (!el || !ready) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !scroller) return;
      e.preventDefault();
      const { zoomTo, zoom } = zoomRef.current;
      zoomTo(zoom * Math.exp(-e.deltaY * 0.002), e.clientX - scroller.getBoundingClientRect().left);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [ready, scroller]);

  if (!story) return <div className="view pad muted">{t("dash.loading")}</div>;

  const width = layout.length ? layout[layout.length - 1].x + layout[layout.length - 1].w : 0;
  const pos = new Map(layout.map((l) => [l.scene.id, l]));
  const extent = (p: Part) => {
    const ls = p.scenes.map((id) => pos.get(id)).filter((l) => !!l);
    return ls.length ? { ...p, x: ls[0].x, w: ls[ls.length - 1].x + ls[ls.length - 1].w - ls[0].x } : null;
  };
  const acts = outline.flatMap((g) => (g.act ? [extent(g.act)] : [])).filter((a) => !!a);
  const seqs = outline.flatMap((g) => g.sequences.map(extent)).filter((s) => !!s);
  const actTop = HEAD_PAD;
  const seqTop = actTop + (acts.length ? ACT_H : 0);
  const stripTop = seqTop + (seqs.length ? SEQ_H : 0) + BEAT_GAP;
  const headH = stripTop + STRIP + 12;
  const bodyH = ROW * characters.length + 12;

  const beats = story.beats.filter((b) => b.scenes.length > 0);
  const actLines = acts.slice(1).map((a) => a.x);
  const color = (id: string) => story.meta.get(id)?.color ?? "var(--accent)";
  const shown = hover ? pos.get(hover.id)?.scene : undefined;
  const present = new Set(shown?.characters ?? []);
  // At the window's width, the tracks fill it to the pixel; wider, they scroll.
  const svgW = room > 0 && width <= room + 0.5 ? room : Math.ceil(width);
  // A sideways scrollbar shortens the tracks: the names get as much room below, so both reach their last row together.
  const wide = svgW > room;

  const picked = only ? [...acts, ...seqs].find((p) => p.id === only) : undefined;
  const within = picked ? new Set(picked.scenes) : null;
  const cast = within ? new Set(layout.filter((l) => within.has(l.scene.id)).flatMap((l) => l.scene.characters)) : null;
  const faded = (id: string, characters: string[]) => (alone !== null && !characters.includes(alone)) || (within !== null && !within.has(id));

  const point = (id: string) => (e: MouseEvent<SVGRectElement> | FocusEvent<SVGRectElement>) => {
    const v = viewRef.current?.getBoundingClientRect();
    if (!v) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ id, left: Math.max(12, Math.min(r.left - v.left, v.width - 572)), top: r.bottom - v.top + 8 });
  };
  const pick = (id: string) => setOnly(only === id ? null : id);
  const pickKey = (id: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(id);
    }
  };
  const letGo = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && (alone || only)) {
      setAlone(null);
      setOnly(null);
    }
  };

  // Dragging across the characters' tracks slides the timeline sideways.
  const grab = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !scroller) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, left: scroller.scrollLeft };
  };
  const slide = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current && scroller) scroller.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const release = () => {
    drag.current = null;
  };

  const grid = (h: number) => (
    <>
      {actLines.map((x) => (
        <line key={`a${x}`} x1={x} x2={x} y1={0} y2={h} className="tl-act-line" />
      ))}
    </>
  );

  return (
    <div className="view timeline-view" ref={viewRef} onKeyDown={letGo}>
      <div className="tl-head">
        <div
          className="tl-head-port"
          ref={headRef}
          onScroll={(e) => scroller && (scroller.scrollLeft = e.currentTarget.scrollLeft)}
          onWheel={(e) => scroller && (scroller.scrollLeft += e.shiftKey ? e.deltaY : e.deltaX)}
        >
          <svg width={svgW} height={headH} aria-label={t("timeline.label")}>
            {grid(headH)}
            {[
              { parts: acts, top: actTop, h: ACT_H, kind: "act", inset: 9, rx: 5 },
              { parts: seqs, top: seqTop, h: SEQ_H, kind: "seq", inset: 8, rx: 4 },
            ].map(({ parts, top, h, kind, inset, rx }) =>
              parts.map((p, i) => (
                <g
                  key={p.id}
                  className={`tl-part${only === p.id ? " picked" : ""}${within && !p.scenes.some((id) => within.has(id)) ? " off" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={only === p.id}
                  aria-label={only === p.id ? `${p.title}, revoir toute l'histoire` : `Isoler ${p.title}`}
                  onClick={() => pick(p.id)}
                  onKeyDown={pickKey(p.id)}
                >
                  <rect x={p.x + 1} y={top + 3} width={Math.max(2, p.w - 2)} height={h - 6} rx={rx} className={`tl-${kind} ${kind[0]}${i % 2}`} />
                  <text x={p.x + inset} y={top + h / 2 + 4.5} className={`tl-${kind}-label`}>
                    {p.title}
                  </text>
                </g>
              )),
            )}
            {layout.map((l) => {
              const status = story.meta.get(l.scene.id)?.status;
              return (
                <rect
                  key={l.scene.id}
                  x={l.x + 0.5}
                  y={stripTop}
                  width={Math.max(1, l.w - 1)}
                  height={STRIP}
                  rx={2}
                  fill={color(l.scene.id)}
                  className={`tl-scene ${status ? `st-${status}` : ""} ${hover?.id === l.scene.id ? "on" : ""} ${faded(l.scene.id, l.scene.characters) ? "off" : ""}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${t("palette.scene", { n: l.scene.index + 1 })} ${l.scene.heading}`}
                  onMouseEnter={point(l.scene.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={point(l.scene.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => openScene(l.scene.id)}
                  onKeyDown={(e) => e.key === "Enter" && openScene(l.scene.id)}
                />
              );
            })}
            {beats.map((b) => {
              const l = pos.get(b.scenes[0]);
              return l ? (
                <path key={b.id} d={`M${Math.max(6, l.x + 1)} ${stripTop - 2} l5 -7 l-10 0 z`} className="tl-beat">
                  <title>{b.title}</title>
                </path>
              ) : null;
            })}
          </svg>
        </div>
        <div className="tl-corner" style={{ width: label, height: headH }}>
          {acts.length > 0 && <span style={{ top: actTop, height: ACT_H }}>{t("timeline.acts")}</span>}
          {seqs.length > 0 && <span style={{ top: seqTop, height: SEQ_H }}>{t("timeline.sequences")}</span>}
          <span style={{ top: stripTop, height: STRIP }}>{t("dash.scenes")}</span>
        </div>
      </div>
      <div className="tl-body">
        <div
          className="tl-tracks-port"
          ref={setScroller}
          onScroll={(e) => headRef.current && (headRef.current.scrollLeft = e.currentTarget.scrollLeft)}
          onWheel={(e) => !e.shiftKey && namesRef.current?.scrollBy({ top: e.deltaY })}
        >
          <svg width={svgW} height={bodyH} aria-hidden="true" className="tl-tracks" onPointerDown={grab} onPointerMove={slide} onPointerUp={release} onPointerCancel={release}>
            {shown && pos.get(shown.id) && <rect x={pos.get(shown.id)!.x} y={0} width={pos.get(shown.id)!.w} height={bodyH} className="tl-column" />}
            {grid(bodyH)}
            {characters.map((c, i) => {
              const y = ROW * i;
              const out = (alone !== null && alone !== c.name) || (cast !== null && !cast.has(c.name));
              return (
                <g key={c.name} className={out ? "tl-row off" : "tl-row"}>
                  <line x1={0} x2={width} y1={y + ROW / 2} y2={y + ROW / 2} className="tl-track" />
                  {layout
                    .filter((l) => l.scene.characters.includes(c.name))
                    .map((l) => (
                      <rect
                        key={l.scene.id}
                        x={l.x + 0.5}
                        y={y + 6}
                        width={Math.max(2, l.w - 1)}
                        height={ROW - 12}
                        rx={2}
                        className={`tl-presence${hover?.id === l.scene.id ? " on" : ""}${within && !within.has(l.scene.id) ? " off" : ""}`}
                      />
                    ))}
                </g>
              );
            })}
          </svg>
        </div>
        <ul
          ref={namesRef}
          className={`tl-names${hover ? " hovering" : ""}${alone || cast ? " isolating" : ""}`}
          style={{ width: label + SCROLLBAR, paddingBottom: wide ? SCROLLBAR : 0 }}
          aria-label={t("timeline.characters")}
          onScroll={(e) => scroller && (scroller.scrollTop = e.currentTarget.scrollTop)}
        >
          {characters.map((c) => (
            <li
              key={c.name}
              className={[present.has(c.name) && "on", alone === c.name && "alone", (alone ? alone === c.name : !cast || cast.has(c.name)) && "kept"].filter(Boolean).join(" ") || undefined}
              style={{ height: ROW }}
            >
              <button
                type="button"
                aria-pressed={alone === c.name}
                title={alone === c.name ? t("timeline.all") : t("timeline.isolate", { name: c.label })}
                onClick={() => setAlone(alone === c.name ? null : c.name)}
              >
                <span className="tl-name">{c.label}</span>
                <span className="tl-name-n">{c.n}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="canvas-tools tl-tools" role="toolbar" aria-label={t("timeline.zoom")} style={{ right: label + SCROLLBAR + 16, bottom: 16 + (wide ? SCROLLBAR : 0) }}>
          <button type="button" aria-label={t("timeline.zoomOut")} title={t("timeline.zoomOutTitle")} disabled={zoom <= 1} onClick={() => zoomTo(zoom / ZOOM_STEP)}>
            <Minus aria-hidden="true" />
          </button>
          <button type="button" className="canvas-pct" title={t("timeline.whole")} onClick={() => zoomTo(1)}>
            {Math.round(zoom * 100)} %
          </button>
          <button type="button" aria-label={t("timeline.zoomIn")} title={t("timeline.zoomInTitle")} disabled={zoom >= ZOOM_MAX} onClick={() => zoomTo(zoom * ZOOM_STEP)}>
            <Plus aria-hidden="true" />
          </button>
        </div>
      </div>
      <div aria-live="polite">
        {shown && hover && (
          <div className="timeline-info" style={{ left: hover.left, top: hover.top }}>
            <strong>
              <span className="auto-num">{sceneLabel(shown.index + 1)}</span> {shown.heading || t("dash.noHeading")}
            </strong>{" "}
            <span className="muted">
              {t("workspace.scenePage", { page: shown.page })} · {formatEighths(shown.eighths)} ·{" "}
              {SCENE_STATUSES.find((s) => s.id === story.meta.get(shown.id)?.status)?.label ?? t("timeline.noStatus")}
            </span>
            {story.meta.get(shown.id)?.summary && <p>{story.meta.get(shown.id)?.summary}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
