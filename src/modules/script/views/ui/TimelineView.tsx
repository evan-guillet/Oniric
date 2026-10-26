import { useEffect, useMemo, useState } from "react";
import { useLive } from "../../../../core/db/live";
import { useProject } from "../../../project/ui/projectContext";
import { prettyName } from "../../bible/domain/appearances";
import { useScenes } from "../../screenplay/application/scriptSession";
import { formatEighths } from "../../screenplay/domain/duration";
import { numberedTitles, sceneLabel } from "../domain/outline";
import { loadStory, SCENE_STATUSES, STORY_TABLES, storyOutline } from "../application/story";

const ROW = 30;
const LABEL = 190;

/** Shortens a label to what fits in `width` pixels of SVG text. */
const fit = (text: string, width: number, charPx: number) => {
  const max = Math.floor((width - 10) / charPx);
  if (max < 2) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
};

/** The scenes in the order of the story, as wide as they are long, with acts, beats and characters [VUE-10, VUE-12]. */
export function TimelineView() {
  const { session, openScene } = useProject();
  const scenes = useScenes(session);
  const story = useLive(loadStory, [...STORY_TABLES]);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [room, setRoom] = useState(0);
  useEffect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(([e]) => setRoom(e.contentRect.width));
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller]);
  const pages = scenes.reduce((n, s) => n + s.eighths, 0) / 8;
  const pxPerPage = Math.max(8, room > 0 ? (room - LABEL - 24) / Math.max(1, pages) : 40);
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    let x = 0;
    return scenes.map((s) => {
      const w = Math.max(6, (Math.max(1, s.eighths) / 8) * pxPerPage);
      const item = { scene: s, x, w };
      x += w;
      return item;
    });
  }, [scenes, pxPerPage]);
  const width = layout.length ? layout[layout.length - 1].x + layout[layout.length - 1].w : 0;
  const pos = new Map(layout.map((l) => [l.scene.id, l]));

  const characters = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of scenes) for (const c of s.characters) count.set(c, (count.get(c) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [scenes]);

  if (!story) return <div className="view pad muted">Chargement…</div>;
  const groups = storyOutline(story, scenes.map((s) => s.id));
  const titles = numberedTitles(groups);
  const spans = (ids: string[]) => {
    const ls = ids.map((id) => pos.get(id)).filter((l) => !!l);
    if (!ls.length) return null;
    return { x: ls[0].x, w: ls[ls.length - 1].x + ls[ls.length - 1].w - ls[0].x };
  };
  const tracks = characters;
  const beats = story.beats.filter((b) => b.scenes.length > 0);
  const totalPages = pages;
  const step = totalPages <= 12 ? 1 : totalPages <= 40 ? 5 : 10;
  const height = ROW * (4 + tracks.length) + 30;
  const color = (id: string) => story.meta.get(id)?.color ?? "var(--accent)";
  const shown = hover ? scenes.find((s) => s.id === hover) : null;

  return (
    <div className="view timeline-view">
      <div className="timeline-scroll" ref={setScroller}>
        <svg width={LABEL + width + 20} height={height} role="img" aria-label="Chronologie des scènes">
          <g transform={`translate(${LABEL},0)`}>
            {Array.from({ length: Math.floor(totalPages / step) + 1 }, (_, i) => (
              <g key={i}>
                <line x1={i * step * pxPerPage} x2={i * step * pxPerPage} y1={0} y2={height} className="tl-grid" />
                {i > 0 && (
                  <text x={i * step * pxPerPage + 3} y={height - 10} className="tl-tick">
                    p. {i * step}
                  </text>
                )}
              </g>
            ))}
            {groups.map((g, i) => {
              const sp = spans(g.sequences.flatMap((s) => s.scenes));
              return sp && g.act ? (
                <g key={g.act.id}>
                  <rect x={sp.x} y={2} width={sp.w} height={ROW - 4} className={`tl-act a${i % 2}`} rx={3} />
                  <text x={sp.x + 6} y={ROW - 10} className="tl-label">
                    <title>{titles.get(g.act.id)}</title>
                    {fit(titles.get(g.act.id)!, sp.w, 8)}
                  </text>
                </g>
              ) : null;
            })}
            {groups.flatMap((g) =>
              g.sequences.map((s, i) => {
                const sp = spans(s.scenes);
                return sp && s.sequence ? (
                  <g key={s.sequence.id}>
                    <rect x={sp.x} y={ROW + 2} width={sp.w} height={ROW - 4} className={`tl-seq s${i % 2}`} rx={3} />
                    <text x={sp.x + 4} y={2 * ROW - 10} className="tl-label small">
                      <title>{titles.get(s.sequence.id)}</title>
                      {fit(titles.get(s.sequence.id)!, sp.w, 7.4)}
                    </text>
                  </g>
                ) : null;
              }),
            )}
            {layout.map((l) => {
              const status = story.meta.get(l.scene.id)?.status;
              return (
                <rect
                  key={l.scene.id}
                  x={l.x + 0.5}
                  y={2 * ROW + 2}
                  width={Math.max(1, l.w - 1)}
                  height={ROW * 1.4}
                  fill={color(l.scene.id)}
                  className={`tl-scene ${status ? `st-${status}` : ""} ${hover === l.scene.id ? "on" : ""}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`Scène ${l.scene.index + 1} ${l.scene.heading}`}
                  onMouseEnter={() => setHover(l.scene.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(l.scene.id)}
                  onClick={() => openScene(l.scene.id)}
                  onKeyDown={(e) => e.key === "Enter" && openScene(l.scene.id)}
                />
              );
            })}
            {beats.map((b) => {
              const l = pos.get(b.scenes[0]);
              return l ? (
                <g key={b.id}>
                  <path d={`M${l.x} ${2 * ROW - 2} l5 -7 l-10 0 z`} className="tl-beat" />
                  <title>{b.title}</title>
                </g>
              ) : null;
            })}
            {tracks.map((c, i) => {
              const y = ROW * (3.6 + i);
              return (
                <g key={c}>
                  <text x={-LABEL + 6} y={y + ROW / 2 + 5} className="tl-label">
                    {prettyName(c)}
                  </text>
                  <line x1={0} x2={width} y1={y + ROW / 2} y2={y + ROW / 2} className="tl-track" />
                  {layout
                    .filter((l) => l.scene.characters.includes(c))
                    .map((l) => (
                      <rect key={l.scene.id} x={l.x + 0.5} y={y + 5} width={Math.max(2, l.w - 1)} height={ROW - 10} rx={2} className="tl-presence" />
                    ))}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div aria-live="polite">
        {shown && (
          <div className="timeline-info">
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
