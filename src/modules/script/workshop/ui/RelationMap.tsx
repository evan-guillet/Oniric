import { RotateCcw, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { plural, t } from "../../../../core/i18n";
import { confirmRemoval } from "../../../../ui-kit/Dialog";
import { Select } from "../../../../ui-kit/Select";
import { useProject } from "../../../project/ui/projectContext";
import { addRelation, deleteRelation, loadRelations, type Entry, type Relation } from "../../bible/application/bible";
import { loadStory, STORY_TABLES } from "../../views/application/story";
import { choiceLabel, RELATION_KINDS } from "../domain/steps";
import { useWorkshop } from "./fields";

/** Each kind of tie has its own colour token, set for light and dark in the stylesheet. */
const KIND_VARS: Record<string, string> = {
  Famille: "--rel-family",
  Amour: "--rel-love",
  Amitié: "--rel-friend",
  Rivalité: "--rel-rival",
  Hiérarchie: "--rel-rank",
  Alliance: "--rel-ally",
  Haine: "--rel-hate",
  Autre: "--rel-other",
};
const kindColor = (kind: string) => `var(${KIND_VARS[kind] ?? "--rel-other"})`;

/** Where the writer put each character, as fractions of the map, so it survives a resize. */
type Placed = Record<string, [number, number]>;
interface Point {
  x: number;
  y: number;
}
interface Node {
  id: string;
  name: string;
  w: number;
}

const NODE_H = 28;
const PAD = 14;

let ruler: CanvasRenderingContext2D | null = null;
/** The width of a name on its pill, measured in the interface font. */
function pillWidth(name: string): number {
  ruler ??= document.createElement("canvas").getContext("2d");
  if (!ruler) return name.length * 7 + 26;
  ruler.font = `500 12px ${getComputedStyle(document.body).fontFamily}`;
  return Math.ceil(ruler.measureText(name).width) + 26;
}

/**
 * A force layout: characters push each other away, ties pull them together, then
 * overlapping pills are pried apart. Placed characters stay where the writer left them;
 * a newcomer starts beside the characters it is tied to. Deterministic, so the map
 * does not move between two renders.
 */
function layout(nodes: Node[], ties: [string, string][], placed: Placed, W: number, H: number): Map<string, Point> {
  const pos = new Map<string, Point>();
  const fixed = new Set<string>();
  const n = nodes.length;
  nodes.forEach((node, i) => {
    const p = placed[node.id];
    if (p) {
      pos.set(node.id, { x: p[0] * W, y: p[1] * H });
      fixed.add(node.id);
    } else {
      const a = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2;
      pos.set(node.id, { x: W / 2 + W * 0.32 * Math.cos(a), y: H / 2 + H * 0.34 * Math.sin(a) });
    }
  });
  if (fixed.size) {
    for (const node of nodes) {
      if (fixed.has(node.id)) continue;
      const near = ties.flatMap(([a, b]) => (a === node.id && fixed.has(b) ? [b] : b === node.id && fixed.has(a) ? [a] : []));
      if (!near.length) continue;
      const c = near.reduce((s, id) => ({ x: s.x + pos.get(id)!.x, y: s.y + pos.get(id)!.y }), { x: 0, y: 0 });
      const p = pos.get(node.id)!;
      pos.set(node.id, { x: c.x / near.length + (p.x - W / 2) * 0.25, y: c.y / near.length + (p.y - H / 2) * 0.25 });
    }
  }
  const width = new Map(nodes.map((node) => [node.id, node.w]));
  const clamp = (id: string, p: Point) => {
    const hw = width.get(id)! / 2 + PAD;
    p.x = Math.min(W - hw, Math.max(hw, p.x));
    p.y = Math.min(H - NODE_H / 2 - PAD, Math.max(NODE_H / 2 + PAD, p.y));
  };
  const free = nodes.filter((node) => !fixed.has(node.id));
  if (!free.length) return pos;

  const k = Math.sqrt((W * H) / Math.max(1, n)) * 0.72;
  let temp = Math.min(W, H) / 6;
  for (let it = 0; it < 320; it++) {
    const move = new Map(free.map((node) => [node.id, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i].id;
        const b = nodes[j].id;
        const pa = pos.get(a)!;
        const pb = pos.get(b)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        if (dx === 0 && dy === 0) {
          dx = (i - j) * 0.1;
          dy = 0.1;
        }
        // Wide pills need more room sideways than tall: measure distance on a squashed axis.
        const d = Math.max(1, Math.hypot(dx * 0.6, dy));
        const f = (k * k) / d;
        move.get(a) && ((move.get(a)!.x += (dx / d) * f), (move.get(a)!.y += (dy / d) * f));
        move.get(b) && ((move.get(b)!.x -= (dx / d) * f), (move.get(b)!.y -= (dy / d) * f));
      }
    }
    for (const [a, b] of ties) {
      const pa = pos.get(a)!;
      const pb = pos.get(b)!;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d * d) / k;
      move.get(a) && ((move.get(a)!.x -= (dx / d) * f), (move.get(a)!.y -= (dy / d) * f));
      move.get(b) && ((move.get(b)!.x += (dx / d) * f), (move.get(b)!.y += (dy / d) * f));
    }
    for (const node of free) {
      const p = pos.get(node.id)!;
      const m = move.get(node.id)!;
      m.x += (W / 2 - p.x) * 0.04 * k * 0.05;
      m.y += (H / 2 - p.y) * 0.06 * k * 0.05;
      const len = Math.max(1, Math.hypot(m.x, m.y));
      p.x += (m.x / len) * Math.min(len, temp);
      p.y += (m.y / len) * Math.min(len, temp);
      clamp(node.id, p);
    }
    temp = Math.max(1, temp * 0.985);
  }
  // Pry apart pills that still overlap, along the axis where they overlap least.
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const pa = pos.get(a.id)!;
        const pb = pos.get(b.id)!;
        const ox = (a.w + b.w) / 2 + 12 - Math.abs(pa.x - pb.x);
        const oy = NODE_H + 10 - Math.abs(pa.y - pb.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const fa = fixed.has(a.id) ? 0 : fixed.has(b.id) ? 1 : 0.5;
        const fb = 1 - fa;
        if (fixed.has(a.id) && fixed.has(b.id)) continue;
        if (oy < ox) {
          const s = pa.y < pb.y ? -1 : 1;
          pa.y += s * oy * fa;
          pb.y -= s * oy * fb;
        } else {
          const s = pa.x < pb.x ? -1 : 1;
          pa.x += s * ox * fa;
          pb.x -= s * ox * fb;
        }
        clamp(a.id, pa);
        clamp(b.id, pb);
      }
    }
    if (!moved) break;
  }
  return pos;
}

/** The map of ties between characters [PER-05]: a canvas of the tied characters, the list of ties, a row to add one. */
export function RelationMap({ characters, protagonistId, antagonistId }: { characters: Entry[]; protagonistId?: string; antagonistId?: string }) {
  const w = useWorkshop();
  const { notify, ask } = useProject();
  const relations = useLive(loadRelations, ["relation"]) ?? [];
  const story = useLive(loadStory, [...STORY_TABLES]);
  const acts = story?.acts ?? [];
  const [act, setAct] = useState("");
  const [hiddenKinds, setHiddenKinds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverTie, setHoverTie] = useState<string | null>(null);
  const [dragAt, setDragAt] = useState<{ id: string; p: Point } | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; x0: number; y0: number; moved: boolean } | null>(null);
  const [form, setForm] = useState({ from: "", to: "", kind: "Famille", note: "", actId: "" });
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el);
    setW(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, [characters.length >= 2]);

  const byId = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const name = (id: string) => byId.get(id)?.name ?? "?";
  const actIndex = (id: string | null) => (id ? acts.findIndex((a) => a.id === id) : -1);
  // The ties of the chosen moment between characters still in the bible.
  const inTime = relations.filter((r) => byId.has(r.fromId) && byId.has(r.toId) && (!act || actIndex(r.actId) <= actIndex(act)));
  const kinds = RELATION_KINDS.filter((k) => inTime.some((r) => r.kind === k));
  const drawn = inTime.filter((r) => !hiddenKinds.has(r.kind));

  const nodes: Node[] = useMemo(() => {
    const ids = new Set(drawn.flatMap((r) => [r.fromId, r.toId]));
    return characters.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, name: c.name, w: pillWidth(c.name) }));
  }, [characters, drawn.map((r) => r.id).join()]);
  const unlinked = characters.length - new Set(inTime.flatMap((r) => [r.fromId, r.toId])).size;
  const H = nodes.length > 22 ? 560 : 460;
  const placed = w.get<Placed>("char.mapPos", {});
  const pos = useMemo(
    () => (W ? layout(nodes, drawn.map((r) => [r.fromId, r.toId]), placed, W, H) : new Map<string, Point>()),
    [nodes, W, H, JSON.stringify(placed), drawn.map((r) => `${r.fromId}${r.toId}`).join()],
  );
  const at = (id: string) => (dragAt?.id === id ? dragAt.p : pos.get(id)) ?? { x: 0, y: 0 };
  const onTop = (id: string) => (dragAt?.id === id ? 2 : selected === id ? 1 : 0);
  const nodeW = (id: string) => nodes.find((node) => node.id === id)?.w ?? 60;

  // What the eye is on: a hovered tie, else a hovered or chosen character.
  const focusTie = hoverTie ? drawn.find((r) => r.id === hoverTie) : undefined;
  const focusId = focusTie ? null : (hover ?? selected);
  const lit = (r: Relation) => (focusTie ? r.id === focusTie.id : focusId ? r.fromId === focusId || r.toId === focusId : false);
  const near = new Set<string>(focusTie ? [focusTie.fromId, focusTie.toId] : focusId ? [focusId, ...drawn.flatMap((r) => (r.fromId === focusId ? [r.toId] : r.toId === focusId ? [r.fromId] : []))] : []);
  const dimmed = near.size > 0;

  // Several ties between the same two characters bow apart instead of lying on top of each other.
  const bends = useMemo(() => {
    const groups = new Map<string, Relation[]>();
    for (const r of drawn) {
      const key = [r.fromId, r.toId].sort().join("|");
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const out = new Map<string, number>();
    for (const g of groups.values()) g.forEach((r, i) => out.set(r.id, (i - (g.length - 1) / 2) * 34 * (r.fromId < r.toId ? 1 : -1)));
    return out;
  }, [drawn.map((r) => r.id).join()]);
  const curve = (r: Relation) => {
    const a = at(r.fromId);
    const b = at(r.toId);
    const bend = bends.get(r.id) ?? 0;
    const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const c = { x: (a.x + b.x) / 2 - ((b.y - a.y) / d) * bend * 2, y: (a.y + b.y) / 2 + ((b.x - a.x) / d) * bend * 2 };
    return { path: `M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`, mid: { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 } };
  };

  const choose = (id: string | null) => {
    setSelected(id);
    if (id) setForm((f) => ({ ...f, from: id, to: f.to === id ? "" : f.to }));
  };

  const local = (e: ReactPointerEvent) => {
    const r = e.currentTarget.closest("svg")!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onNodeDown = (e: ReactPointerEvent<SVGGElement>, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = local(e);
    const c = at(id);
    drag.current = { id, dx: c.x - p.x, dy: c.y - p.y, x0: p.x, y0: p.y, moved: false };
    e.currentTarget.closest("svg")!.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = local(e);
    if (!d.moved && Math.hypot(p.x - d.x0, p.y - d.y0) < 4) return;
    d.moved = true;
    const hw = nodeW(d.id) / 2 + PAD;
    setDragAt({ id: d.id, p: { x: Math.min(W - hw, Math.max(hw, p.x + d.dx)), y: Math.min(H - NODE_H / 2 - PAD, Math.max(NODE_H / 2 + PAD, p.y + d.dy)) } });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) return choose(selected === d.id ? null : d.id);
    // Moving one character pins the whole map as it stands, so nothing else shifts under the writer's hand.
    // A character dropped onto another slides off it, toward the side it came from.
    const drop = dragAt ? { ...dragAt.p } : null;
    if (drop) {
      const dw = nodeW(d.id);
      for (let pass = 0; pass < 8; pass++) {
        const hit = nodes.find((o) => o.id !== d.id && Math.abs(pos.get(o.id)!.x - drop.x) < (o.w + dw) / 2 + 8 && Math.abs(pos.get(o.id)!.y - drop.y) < NODE_H + 6);
        if (!hit) break;
        const o = pos.get(hit.id)!;
        drop.y = o.y + (drop.y <= o.y ? -1 : 1) * (NODE_H + 8);
        drop.y = Math.min(H - NODE_H / 2 - PAD, Math.max(NODE_H / 2 + PAD, drop.y));
      }
    }
    const next: Placed = { ...placed };
    for (const node of nodes) {
      const p = node.id === d.id && drop ? drop : pos.get(node.id);
      if (p) next[node.id] = [+(p.x / W).toFixed(4), +(p.y / H).toFixed(4)];
    }
    w.set("char.mapPos", next);
    setDragAt(null);
  };

  if (characters.length < 2) return <p className="muted">{t("chars.needTwo")}</p>;

  const listed = selected ? drawn.filter((r) => r.fromId === selected || r.toId === selected) : drawn;
  const pinned = Object.keys(placed).length > 0;

  return (
    <div className="relations">
      <div className="rel-bar">
        {kinds.length > 0 && (
          <div className="rel-keys" role="group" aria-label={t("chars.kindFilter")}>
            {kinds.map((k) => {
              const off = hiddenKinds.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  className={`rel-key${off ? " off" : ""}`}
                  aria-pressed={!off}
                  style={{ "--k": kindColor(k) } as CSSProperties}
                  onClick={() => {
                    const next = new Set(hiddenKinds);
                    if (off) next.delete(k);
                    else next.add(k);
                    setHiddenKinds(next);
                  }}
                >
                  <span className="rel-swatch" aria-hidden="true" />
                  {choiceLabel("relations", k)}
                  <span className="rel-key-n">{inTime.filter((r) => r.kind === k).length}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="rel-tools">
          {acts.length > 0 && (
            <Select value={act} onChange={(e) => setAct(e.target.value)} aria-label={t("chars.showRelations")}>
              <option value="">{t("chars.wholeFilm")}</option>
              {acts.map((a) => (
                <option key={a.id} value={a.id}>
                  {t("chars.until", { act: a.title })}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      <div className="rel-canvas" ref={box} style={{ height: H }}>
        {W > 0 && nodes.length > 0 && (
          <svg
            width={W}
            height={H}
            role="group"
            aria-label={t("chars.mapLabel")}
            className={`relation-map${dimmed ? " dim" : ""}${dragAt ? " dragging" : ""}`}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => {
              drag.current = null;
              setDragAt(null);
            }}
            onPointerDown={(e) => e.button === 0 && choose(null)}
          >
            <g aria-hidden="true">
              {drawn.map((r) => (
                <path key={r.id} d={curve(r).path} className={`rel-tie${lit(r) ? " lit" : ""}`} style={{ stroke: kindColor(r.kind) }} />
              ))}
            </g>
            {/* The character in hand, then the chosen one, are drawn last so they sit on top. */}
            {[...nodes].sort((a, b) => onTop(a.id) - onTop(b.id)).map((node) => {
              const p = at(node.id);
              const role = node.id === protagonistId ? " lead" : node.id === antagonistId ? " foe" : "";
              return (
                <g
                  key={node.id}
                  className={`rel-node${role}${selected === node.id ? " on" : ""}${dimmed && !near.has(node.id) ? " far" : ""}`}
                  transform={`translate(${p.x - node.w / 2},${p.y - NODE_H / 2})`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === node.id}
                  aria-label={node.name}
                  onPointerDown={(e) => onNodeDown(e, node.id)}
                  onPointerEnter={() => !drag.current && setHover(node.id)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(node.id)}
                  onBlur={() => setHover(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      choose(selected === node.id ? null : node.id);
                    } else if (e.key === "Escape") choose(null);
                  }}
                >
                  <rect width={node.w} height={NODE_H} rx={NODE_H / 2} />
                  <text x={node.w / 2} y={NODE_H / 2} dominantBaseline="central" textAnchor="middle">
                    {node.name}
                  </text>
                </g>
              );
            })}
            <g aria-hidden="true">
              {drawn.filter(lit).map((r) => {
                const { mid } = curve(r);
                const a = at(r.fromId);
                const b = at(r.toId);
                // No room for a tag on a tie hidden under its own two pills.
                if (Math.abs(a.x - b.x) < (nodeW(r.fromId) + nodeW(r.toId)) / 2 + 40 && Math.abs(a.y - b.y) < NODE_H + 30) return null;
                const label = choiceLabel("relations", r.kind);
                const lw = pillWidth(label) - 8;
                return (
                  <g key={r.id} className="rel-tag" transform={`translate(${mid.x - lw / 2},${mid.y - 10})`}>
                    <rect width={lw} height={20} rx={10} style={{ stroke: kindColor(r.kind) }} />
                    <text x={lw / 2} y={10} dominantBaseline="central" textAnchor="middle">
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {nodes.length === 0 && <p className="rel-empty">{inTime.length ? t("chars.allKindsHidden") : t("chars.noTies")}</p>}
      </div>
      {nodes.length > 0 && (
        <div className="rel-foot">
          <p className="rel-caption">
            {t("chars.mapHint")}
            {unlinked > 0 && <> {plural("chars.unlinked", unlinked)}</>}
          </p>
          {pinned && (
            <button type="button" className="btn ghost small" onClick={() => w.set("char.mapPos", {})}>
              <RotateCcw aria-hidden="true" />
              {t("chars.resetLayout")}
            </button>
          )}
        </div>
      )}

      {drawn.length > 0 && (
        <div className="rel-ties">
          <div className="rel-ties-head">
            <h4>{selected ? t("chars.tiesOf", { name: name(selected) }) : t("chars.ties")}</h4>
            <span className="rel-key-n">{listed.length}</span>
            {selected && (
              <button type="button" className="btn text small" onClick={() => choose(null)}>
                {t("chars.allTies")}
              </button>
            )}
          </div>
          <ul className="rel-list">
            {listed.map((r) => (
              <li key={r.id} onPointerEnter={() => setHoverTie(r.id)} onPointerLeave={() => setHoverTie(null)}>
                <span className="rel-kind" style={{ "--k": kindColor(r.kind) } as CSSProperties}>
                  <span className="rel-swatch" aria-hidden="true" />
                  {choiceLabel("relations", r.kind)}
                </span>
                <span className="rel-body">
                  <span className="rel-who">
                    <button type="button" onClick={() => choose(r.fromId)}>{name(r.fromId)}</button>
                    <span className="rel-and" aria-hidden="true">·</span>
                    <button type="button" onClick={() => choose(r.toId)}>{name(r.toId)}</button>
                  </span>
                  {(r.note || r.actId) && (
                    <span className="rel-note">
                      {r.note}
                      {r.note && r.actId && " · "}
                      {r.actId && t("chars.since", { act: acts.find((a) => a.id === r.actId)?.title })}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn ghost tiny rel-remove"
                  aria-label={t("chars.removeRelation")}
                  onClick={async () => {
                    if (await confirmRemoval(ask, { title: t("chars.removeRelationAsk"), text: `${name(r.fromId)} — ${choiceLabel("relations", r.kind).toLowerCase()} — ${name(r.toId)}`, label: t("script.info.remove") }))
                      await deleteRelation(r.id);
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        className="rel-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.from || !form.to || form.from === form.to) return;
          try {
            await addRelation({ fromId: form.from, toId: form.to, kind: form.kind, note: form.note, actId: form.actId || null });
            setForm({ ...form, to: "", note: "" });
          } catch (err) {
            notify({ text: describeError(err), tone: "error" });
          }
        }}
      >
        <Select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} aria-label={t("chars.first")}>
          <option value="" hidden>{t("chars.characterOption")}</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label={t("chars.linkKind")}>
          {RELATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {choiceLabel("relations", k)}
            </option>
          ))}
        </Select>
        <Select value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} aria-label={t("chars.second")}>
          <option value="" hidden>{t("chars.characterOption")}</option>
          {characters
            .filter((c) => c.id !== form.from)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
        <input className="rel-note-field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("chars.precisionPlaceholder")} aria-label={t("chars.precision")} />
        {acts.length > 0 && (
          <Select value={form.actId} onChange={(e) => setForm({ ...form, actId: e.target.value })} aria-label={t("chars.fromLabel")}>
            <option value="">{t("chars.fromStart")}</option>
            {acts.map((a) => (
              <option key={a.id} value={a.id}>
                {t("chars.from", { act: a.title })}
              </option>
            ))}
          </Select>
        )}
        <button type="submit" className="btn small primary" disabled={!form.from || !form.to || form.from === form.to}>
          {t("chars.addLink")}
        </button>
      </form>
    </div>
  );
}
