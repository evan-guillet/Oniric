import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, MouseEvent } from "react";
import { useLive } from "../../../../core/db/live";
import { useProject } from "../../../project/ui/projectContext";
import { prettyName } from "../../bible/domain/appearances";
import { useScenes } from "../../screenplay/application/scriptSession";
import { formatEighths } from "../../screenplay/domain/duration";
import { numberedTitles, sceneLabel } from "../domain/outline";
import { loadStory, SCENE_STATUSES, STORY_TABLES, storyOutline } from "../application/story";

const ROW = 30;
const RULER = 26;
const ACT_H = 30;
const SEQ_H = 28;
const BEAT_GAP = 10;
const STRIP = 40;
const PAD = 12;
const GUTTER = 24;

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

interface Span {
  id: string;
  title: string;
  x: number;
  w: number;
  /** As wide as the span, or as the title when the title is longer. */
  box: number;
  lane: number;
}

/**
 * Puts each label on the first lane where it fits whole, so that no title is ever cut: a title longer than its
 * span runs past it, and the next span that would collide drops to the lane below.
 */
function inLanes(items: Omit<Span, "lane" | "box">[], font: string): { spans: Span[]; lanes: number } {
  const ends: number[] = [];
  const spans = items.map((it) => {
    const box = Math.max(it.w, textWidth(it.title, font) + 18);
    let lane = ends.findIndex((e) => e <= it.x + 0.5);
    if (lane < 0) lane = ends.length;
    ends[lane] = it.x + box + (box > it.w ? 3 : 0);
    return { ...it, box, lane };
  });
  return { spans, lanes: Math.max(1, ends.length) };
}

/** The scenes in the order of the story, as wide as they are long, with acts, beats and characters [VUE-10, VUE-12]. */
export function TimelineView() {
  const { session, openScene } = useProject();
  const scenes = useScenes(session);
  const story = useLive(loadStory, [...STORY_TABLES]);
  const viewRef = useRef<HTMLDivElement>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(([e]) => setRoom(e.contentRect.width));
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller]);
  const [hover, setHover] = useState<{ id: string; left: number; top: number } | null>(null);

  const characters = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of scenes) for (const c of s.characters) count.set(c, (count.get(c) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, label: prettyName(name), n }));
  }, [scenes]);
  // The names column is as wide as the longest name, so that none is cut.
  const label = useMemo(
    () => Math.min(280, Math.max(150, ...characters.map((c) => textWidth(c.label, NAME_FONT) + textWidth(String(c.n), "500 12px") + 48))),
    [characters],
  );

  const pages = scenes.reduce((n, s) => n + s.eighths, 0) / 8;
  const pxPerPage = Math.max(8, room > 0 ? (room - label - PAD - GUTTER) / Math.max(1, pages) : 40);
  const layout = useMemo(() => {
    let x = 0;
    return scenes.map((s) => {
      const w = Math.max(6, (Math.max(1, s.eighths) / 8) * pxPerPage);
      const item = { scene: s, x, w };
      x += w;
      return item;
    });
  }, [scenes, pxPerPage]);

  if (!story) return <div className="view pad muted">Chargement…</div>;

  const width = layout.length ? layout[layout.length - 1].x + layout[layout.length - 1].w : 0;
  const pos = new Map(layout.map((l) => [l.scene.id, l]));
  const groups = storyOutline(story, scenes.map((s) => s.id));
  const titles = numberedTitles(groups);
  const extent = (ids: string[]) => {
    const ls = ids.map((id) => pos.get(id)).filter((l) => !!l);
    return ls.length ? { x: ls[0].x, w: ls[ls.length - 1].x + ls[ls.length - 1].w - ls[0].x } : null;
  };
  const actItems = groups.flatMap((g) => {
    const sp = g.act && extent(g.sequences.flatMap((s) => s.scenes));
    return sp && g.act ? [{ id: g.act.id, title: titles.get(g.act.id) ?? g.act.title, ...sp }] : [];
  });
  const seqItems = groups.flatMap((g) =>
    g.sequences.flatMap((s) => {
      const sp = s.sequence && extent(s.scenes);
      return sp && s.sequence ? [{ id: s.sequence.id, title: titles.get(s.sequence.id) ?? s.sequence.title, ...sp }] : [];
    }),
  );
  const acts = inLanes(actItems, ACT_FONT);
  const seqs = inLanes(seqItems, SEQ_FONT);
  const actTop = RULER;
  const seqTop = actTop + (actItems.length ? acts.lanes * ACT_H : 0);
  const stripTop = seqTop + (seqItems.length ? seqs.lanes * SEQ_H : 0) + BEAT_GAP;
  const headH = stripTop + STRIP + 12;
  const bodyH = ROW * characters.length + 12;

  const beats = story.beats.filter((b) => b.scenes.length > 0);
  const step = pages <= 12 ? 1 : pages <= 40 ? 5 : 10;
  const ticks = Array.from({ length: Math.floor(pages / step) + 1 }, (_, i) => i * step);
  const actLines = actItems.slice(1).map((a) => a.x);
  const color = (id: string) => story.meta.get(id)?.color ?? "var(--accent)";
  const shown = hover ? pos.get(hover.id)?.scene : undefined;
  const present = new Set(shown?.characters ?? []);
  const svgW = PAD + width + GUTTER;

  const point = (id: string) => (e: MouseEvent<SVGRectElement> | FocusEvent<SVGRectElement>) => {
    const v = viewRef.current?.getBoundingClientRect();
    if (!v) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ id, left: Math.max(12, Math.min(r.left - v.left, v.width - 572)), top: r.bottom - v.top + 8 });
  };

  const grid = (h: number) => (
    <>
      {ticks.map((p) => (
        <line key={`p${p}`} x1={p * pxPerPage} x2={p * pxPerPage} y1={0} y2={h} className="tl-grid" />
      ))}
      {actLines.map((x) => (
        <line key={`a${x}`} x1={x} x2={x} y1={0} y2={h} className="tl-act-line" />
      ))}
    </>
  );

  return (
    <div className="view timeline-view" ref={viewRef}>
      <div className="timeline-scroll" ref={setScroller}>
        <div className="tl-sheet" style={{ width: label + svgW }}>
          <div className="tl-head">
            <div className="tl-corner" style={{ width: label, height: headH }}>
              <span style={{ top: 0, height: RULER }}>Pages</span>
              {actItems.length > 0 && <span style={{ top: actTop, height: ACT_H }}>Actes</span>}
              {seqItems.length > 0 && <span style={{ top: seqTop, height: SEQ_H }}>Séquences</span>}
              <span style={{ top: stripTop, height: STRIP }}>Scènes</span>
            </div>
            <svg width={svgW} height={headH} role="img" aria-label="Chronologie des scènes">
              <g transform={`translate(${PAD},0)`}>
                {grid(headH)}
                {ticks.slice(1).map((p) => (
                  <text key={p} x={p * pxPerPage + 4} y={17} className="tl-tick">
                    p. {p}
                  </text>
                ))}
                {acts.spans.map((a, i) => (
                  <g key={a.id}>
                    <rect x={a.x + 1} y={actTop + a.lane * ACT_H + 3} width={a.box - 2} height={ACT_H - 6} rx={5} className={`tl-act a${i % 2}`} />
                    {a.box > a.w && <rect x={a.x + 1} y={actTop + a.lane * ACT_H + ACT_H - 6} width={Math.max(3, a.w - 2)} height={3} className="tl-extent" />}
                    <text x={a.x + 9} y={actTop + a.lane * ACT_H + ACT_H / 2 + 4.5} className="tl-act-label">
                      {a.title}
                    </text>
                  </g>
                ))}
                {seqs.spans.map((s, i) => (
                  <g key={s.id}>
                    <rect x={s.x + 1} y={seqTop + s.lane * SEQ_H + 3} width={s.box - 2} height={SEQ_H - 6} rx={4} className={`tl-seq s${i % 2}`} />
                    {s.box > s.w && <rect x={s.x + 1} y={seqTop + s.lane * SEQ_H + SEQ_H - 6} width={Math.max(3, s.w - 2)} height={3} className="tl-extent" />}
                    <text x={s.x + 8} y={seqTop + s.lane * SEQ_H + SEQ_H / 2 + 4.5} className="tl-seq-label">
                      {s.title}
                    </text>
                  </g>
                ))}
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
                      className={`tl-scene ${status ? `st-${status}` : ""} ${hover?.id === l.scene.id ? "on" : ""}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`Scène ${l.scene.index + 1} ${l.scene.heading}`}
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
                    <path key={b.id} d={`M${l.x + 1} ${stripTop - 2} l5 -7 l-10 0 z`} className="tl-beat">
                      <title>{b.title}</title>
                    </path>
                  ) : null;
                })}
              </g>
            </svg>
          </div>
          <div className="tl-body">
            <ul className={hover ? "tl-names hovering" : "tl-names"} style={{ width: label }} aria-label="Personnages">
              {characters.map((c) => (
                <li key={c.name} className={present.has(c.name) ? "on" : undefined} style={{ height: ROW }}>
                  <span className="tl-name">{c.label}</span>
                  <span className="tl-name-n" title={`${c.n} scènes`}>
                    {c.n}
                  </span>
                </li>
              ))}
            </ul>
            <svg width={svgW} height={bodyH} aria-hidden="true">
              <g transform={`translate(${PAD},0)`}>
                {shown && pos.get(shown.id) && <rect x={pos.get(shown.id)!.x} y={0} width={pos.get(shown.id)!.w} height={bodyH} className="tl-column" />}
                {grid(bodyH)}
                {characters.map((c, i) => {
                  const y = ROW * i;
                  return (
                    <g key={c.name}>
                      <line x1={0} x2={width} y1={y + ROW / 2} y2={y + ROW / 2} className="tl-track" />
                      {layout
                        .filter((l) => l.scene.characters.includes(c.name))
                        .map((l) => (
                          <rect key={l.scene.id} x={l.x + 0.5} y={y + 6} width={Math.max(2, l.w - 1)} height={ROW - 12} rx={2} className={hover?.id === l.scene.id ? "tl-presence on" : "tl-presence"} />
                        ))}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>
      </div>
      <div aria-live="polite">
        {shown && hover && (
          <div className="timeline-info" style={{ left: hover.left, top: hover.top }}>
            <strong>
              <span className="auto-num">{sceneLabel(shown.index + 1)}</span> {shown.heading || "(sans en-tête)"}
            </strong>{" "}
            <span className="muted">
              p. {shown.page} · {formatEighths(shown.eighths)} · {SCENE_STATUSES.find((s) => s.id === story.meta.get(shown.id)?.status)?.label ?? "sans statut"}
            </span>
            {story.meta.get(shown.id)?.summary && <p>{story.meta.get(shown.id)?.summary}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
