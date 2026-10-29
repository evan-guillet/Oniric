import { commands } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { t } from "../../../core/i18n";
import { readStored } from "../../../ui-kit/useStoredState";
import type { ProjectApi } from "../../project/ui/projectContext";
import { readImage } from "../../shared/media";
import { loadBoards, loadItems } from "../application/moodboards";
import { byScene, loadShots, ratioValue, readNumbering, readRatio, type Shot } from "../application/shots";
import { inkOn } from "../domain/palette";
import { formatMinutes, formatSeconds, shotNumber, toCsv } from "../domain/shots";
import { choiceLabel, shotTotals } from "./common";
import { columnLabel, DEFAULT_HIDDEN, HIDDEN_KEY, SHOT_COLUMNS, type ShotColumn } from "./ShotlistView";
import { technique } from "./StoryboardView";

type Api = Pick<ProjectApi, "session" | "printPdf" | "project">;

/** A4 landscape and portrait, in inches. */
const A4 = { long: 11.69, short: 8.27 };

const PRINT_CSS = (width: number, height: number) => `
@page { size: ${width}in ${height}in; margin: 0; }
.rz-print { font-family: "Inter Variable", "Segoe UI", sans-serif; color: #111; font-size: 8.5pt; line-height: 1.35; }
.rz-print .page { width: ${width}in; height: ${height}in; padding: 0.45in 0.5in; box-sizing: border-box; break-after: page; overflow: hidden; display: flex; flex-direction: column; }
.rz-print .page:last-child { break-after: auto; }
.rz-print .run { padding: 0.45in 0.5in; }
.rz-print h1 { font-size: 13pt; margin: 0 0 2pt; letter-spacing: -0.01em; }
.rz-print .sub { color: #555; margin: 0 0 12pt; }
.rz-print h2 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; margin: 14pt 0 3pt; break-after: avoid; }
.rz-print .totals { color: #555; margin: 0 0 5pt; }
.rz-print table { width: 100%; border-collapse: collapse; break-inside: auto; }
.rz-print th { text-align: left; font-weight: 600; color: #444; border-bottom: 1pt solid #999; padding: 3pt 4pt; font-size: 7.5pt; }
.rz-print td { border-bottom: 0.5pt solid #ccc; padding: 3pt 4pt; vertical-align: top; white-space: pre-wrap; }
.rz-print tr { break-inside: avoid; }
.rz-print td.num { font-weight: 700; white-space: nowrap; }
.rz-print .grid { flex: 1; display: grid; gap: 10pt 12pt; align-content: start; }
.rz-print .frame { break-inside: avoid; min-width: 0; }
.rz-print .frame .img { border: 0.75pt solid #222; background: #fff; overflow: hidden; display: grid; place-items: center; }
.rz-print .frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rz-print .frame .head { display: flex; gap: 6pt; align-items: baseline; margin: 3pt 0 1pt; }
.rz-print .frame .head b { font-size: 9pt; }
.rz-print .frame .tech { color: #555; font-size: 7.5pt; }
.rz-print .frame p { margin: 1pt 0 0; white-space: pre-wrap; }
.rz-print .frame .dia { font-style: italic; }
.rz-print .frame .notes { color: #555; }
.rz-print .slug { font-weight: 700; text-transform: uppercase; font-size: 8pt; margin: 0 0 6pt; }
.rz-print .foot { margin-top: auto; padding-top: 6pt; color: #777; font-size: 7pt; display: flex; justify-content: space-between; }
.rz-print .board { position: relative; flex: 1; }
.rz-print .board .it { position: absolute; overflow: hidden; box-sizing: border-box; }
.rz-print .board .it img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rz-print .board .it.note { background: #fff6e5; border: 0.75pt solid #f3d9a6; padding: 6pt; }
.rz-print .board .it.text { font-weight: 600; }
.rz-print .board .it.color { display: flex; align-items: flex-end; padding: 4pt; font-size: 7pt; font-weight: 600; }
.rz-print .board .it p { margin: 0; white-space: pre-wrap; }
`;

/** The scenes that have shots, in screenplay order, each with its number and shots. */
async function scenesWithShots(api: Api) {
  await api.session.flush();
  const [shots, numbering] = await Promise.all([loadShots(), readNumbering()]);
  const per = byScene(shots);
  return {
    numbering,
    scenes: api.session
      .scenes()
      .map((s) => ({ scene: s, shots: per.get(s.id) ?? [] }))
      .filter((x) => x.shots.length > 0),
  };
}

function cellText(s: Shot, c: ShotColumn): string {
  switch (c) {
    case "size":
    case "angle":
    case "movement":
    case "support":
    case "sound":
      return s[c] ? choiceLabel(c, s[c]!) : "";
    case "characters":
      return s.characters.join(", ");
    case "duration":
      return formatSeconds(s.duration);
    case "setup":
      return formatMinutes(s.setup);
    default:
      return s[c];
  }
}

/** Every shot of the film in a CSV file, every field, to open in a spreadsheet [DEC-08]. */
export async function exportShotlistCsv(api: Api): Promise<string> {
  const { scenes, numbering } = await scenesWithShots(api);
  const head = [t("shotlist.columns.scene"), t("shotlist.columns.heading"), t("shotlist.columns.number"), t("shotlist.columns.shoot"), ...SHOT_COLUMNS.map(columnLabel)];
  const rows = scenes.flatMap(({ scene, shots }) =>
    shots.map((s, i) => [
      String(scene.index + 1),
      scene.heading,
      shotNumber(scene.index + 1, i, numbering),
      s.shootOrder === null ? "" : String(s.shootOrder),
      ...SHOT_COLUMNS.map((c) => cellText(s, c)),
    ]),
  );
  return unwrap(await commands.exportText(`${t("nav.views.shotlist")} - ${api.project.title}.csv`, toCsv(head, rows)));
}

/** The shot list in PDF, scene by scene, with the columns the table shows [DEC-08]. */
export async function exportShotlistPdf(api: Api): Promise<void> {
  const { scenes, numbering } = await scenesWithShots(api);
  const hidden = readStored<ShotColumn[]>(HIDDEN_KEY, DEFAULT_HIDDEN);
  const columns = SHOT_COLUMNS.filter((c) => !hidden.includes(c));
  const all = scenes.flatMap((x) => x.shots);
  await api.printPdf(
    `${t("nav.views.shotlist")} - ${api.project.title}.pdf`,
    <div className="rz-print">
      <div className="run">
        <h1>
          {api.project.title} · {t("nav.views.shotlist")}
        </h1>
        <p className="sub">{shotTotals(all)}</p>
        {scenes.map(({ scene, shots }) => (
          <section key={scene.id}>
            <h2>
              {scene.index + 1}. {scene.heading || t("workspace.noHeading")}
            </h2>
            <p className="totals">{shotTotals(shots)}</p>
            <table>
              <thead>
                <tr>
                  <th>{t("shotlist.columns.number")}</th>
                  {columns.map((c) => (
                    <th key={c}>{columnLabel(c)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shots.map((s, i) => (
                  <tr key={s.id}>
                    <td className="num">{shotNumber(scene.index + 1, i, numbering)}</td>
                    {columns.map((c) => (
                      <td key={c}>{cellText(s, c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        {scenes.length === 0 && <p>{t("shotlist.exportEmpty")}</p>}
      </div>
    </div>,
    { width: A4.long, height: A4.short, css: PRINT_CSS(A4.long, A4.short) },
  );
}

export type StoryboardLayout = { perPage: 2 | 3 | 4 | 6; orientation: "landscape" | "portrait" };

/** How a page of frames is cut: columns × rows for each count and orientation [STB-03]. */
function grid(l: StoryboardLayout): { cols: number; rows: number } {
  const land = l.orientation === "landscape";
  switch (l.perPage) {
    case 2:
      return land ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 };
    case 3:
      return land ? { cols: 3, rows: 1 } : { cols: 1, rows: 3 };
    case 4:
      return { cols: 2, rows: 2 };
    default:
      return land ? { cols: 3, rows: 2 } : { cols: 2, rows: 3 };
  }
}

/** The storyboard in PDF, scene by scene, so many frames a page, with their captions [STB-07]. */
export async function exportStoryboardPdf(api: Api, layout: StoryboardLayout): Promise<void> {
  const { scenes, numbering } = await scenesWithShots(api);
  const ratio = ratioValue(await readRatio());
  const images = new Map<string, string>();
  for (const { shots } of scenes) {
    for (const s of shots) {
      if (s.frameImage && !images.has(s.frameImage)) images.set(s.frameImage, await readImage(s.frameImage).catch(() => ""));
    }
  }
  const { cols, rows } = grid(layout);
  const per = cols * rows;
  const [w, h] = layout.orientation === "landscape" ? [A4.long, A4.short] : [A4.short, A4.long];
  const pages: { scene: (typeof scenes)[number]["scene"]; frames: { shot: Shot; n: string }[]; part: number; parts: number }[] = [];
  for (const { scene, shots } of scenes) {
    const frames = shots.map((shot, i) => ({ shot, n: shotNumber(scene.index + 1, i, numbering) }));
    const parts = Math.ceil(frames.length / per);
    for (let p = 0; p < parts; p++) pages.push({ scene, frames: frames.slice(p * per, (p + 1) * per), part: p + 1, parts });
  }
  await api.printPdf(
    `${t("nav.views.storyboard")} - ${api.project.title}.pdf`,
    <div className="rz-print">
      {pages.map((p, pi) => (
        <section key={pi} className="page">
          <p className="slug">
            {p.scene.index + 1}. {p.scene.heading || t("workspace.noHeading")}
            {p.parts > 1 && ` (${p.part}/${p.parts})`}
          </p>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {p.frames.map(({ shot, n }) => (
              <div key={shot.id} className="frame">
                <div className="img" style={{ aspectRatio: String(ratio), maxHeight: `${((h - 1.6) / rows) * 0.62}in` }}>
                  {shot.frameImage && images.get(shot.frameImage) ? <img src={images.get(shot.frameImage)} alt="" /> : null}
                </div>
                <div className="head">
                  <b>{n}</b>
                  <span className="tech">{technique(shot)}</span>
                </div>
                {shot.action && <p>{shot.action}</p>}
                {shot.dialogue && <p className="dia">{shot.dialogue}</p>}
                {shot.frameNotes && <p className="notes">{shot.frameNotes}</p>}
              </div>
            ))}
          </div>
          <div className="foot">
            <span>{api.project.title}</span>
            <span>
              {pi + 1} / {pages.length}
            </span>
          </div>
        </section>
      ))}
      {pages.length === 0 && (
        <section className="page">
          <p>{t("shotlist.exportEmpty")}</p>
        </section>
      )}
    </div>,
    { width: w, height: h, css: PRINT_CSS(w, h) },
  );
}

/** One moodboard on an A4 landscape page, scaled to fit, as it is laid out [MOO-06]. */
export async function exportMoodboardPdf(api: Api, boardId: string): Promise<void> {
  const board = (await loadBoards()).find((b) => b.id === boardId);
  if (!board) return;
  const items = await loadItems(boardId);
  const images = new Map<string, string>();
  for (const i of items) if (i.path && !images.has(i.path)) images.set(i.path, await readImage(i.path).catch(() => ""));
  const [w, h] = [A4.long, A4.short];
  // The box under the title, in CSS pixels (96 an inch): the page less its margins, the title and the line under it.
  const bw = (w - 1) * 96;
  const bh = (h - 1.75) * 96;
  const minX = items.length ? Math.min(...items.map((i) => i.x)) : 0;
  const minY = items.length ? Math.min(...items.map((i) => i.y)) : 0;
  const width = Math.max(1, ...items.map((i) => i.x + i.w)) - minX;
  const height = Math.max(1, ...items.map((i) => i.y + i.h)) - minY;
  const k = Math.min(bw / width, bh / height, 2);
  // The board is centred in its box.
  const dx = (bw - width * k) / 2;
  // Each kind keeps the size of its text on the board, scaled with it.
  const textSize = { text: 22, note: 14, color: 12, image: 12 };
  const low = Math.min(0, ...items.map((i) => i.z));
  await api.printPdf(
    `${board.name} - ${api.project.title}.pdf`,
    <div className="rz-print">
      <section className="page">
        <h1>{board.name}</h1>
        <p className="sub">{api.project.title}</p>
        <div className="board" style={{ width: bw, height: bh, flex: "none" }}>
          {items.map((i) => (
            <div
              key={i.id}
              className={`it ${i.kind}`}
              style={{
                left: dx + (i.x - minX) * k,
                top: (i.y - minY) * k,
                width: i.w * k,
                height: i.h * k,
                zIndex: i.z - low + 1,
                fontSize: `${Math.max(5, textSize[i.kind] * k)}px`,
                padding: i.kind === "note" ? `${12 * k}px ${14 * k}px` : i.kind === "color" ? `${10 * k}px` : undefined,
                ...(i.kind === "color" ? { background: i.color, color: inkOn(i.color ?? "") } : {}),
                ...(i.kind === "note" && i.color ? { background: i.color, borderColor: `color-mix(in srgb, ${i.color}, #000 12%)` } : {}),
              }}
            >
              {i.kind === "image" && i.path && images.get(i.path) && <img src={images.get(i.path)} alt="" />}
              {i.kind === "color" && (i.color ?? "").toUpperCase()}
              {(i.kind === "text" || i.kind === "note") && <p>{i.text}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>,
    { width: w, height: h, css: PRINT_CSS(w, h) },
  );
}

