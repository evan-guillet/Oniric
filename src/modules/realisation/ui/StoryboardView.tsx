import { Brush, Clapperboard, Eye, ImagePlus, Images, ListTree, Plus, Trash2, ImageOff } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLive } from "../../../core/db/live";
import { describeError } from "../../../core/errors";
import { t } from "../../../core/i18n";
import { CheckList } from "../../../ui-kit/CheckList";
import { confirmRemoval, Dialog } from "../../../ui-kit/Dialog";
import { MoreMenu } from "../../../ui-kit/MoreMenu";
import { Segmented } from "../../../ui-kit/Segmented";
import { useStoredState } from "../../../ui-kit/useStoredState";
import { useProject } from "../../project/ui/projectContext";
import { useScenes } from "../../script/screenplay/application/scriptSession";
import { MediaImage, pickImage, storeImage } from "../../shared/media";
import { boardImages } from "../application/moodboards";
import {
  addShot,
  byScene,
  deleteShot,
  FRAME_RATIOS,
  ratioValue,
  updateShot,
  useNumbering,
  useRatio,
  useShots,
  writeRatio,
  type FrameRatio,
  type Shot,
} from "../application/shots";
import { formatSeconds, shotNumber } from "../domain/shots";
import { choiceLabel, InlineText, requestScene, SceneRail, shotTotals, useSceneChoice } from "./common";
import { DrawDialog } from "./DrawDialog";

type Panel = "scenes" | "display";

export const ratioName = (r: FrameRatio) => t(`storyboard.ratios.${r.replace(/[.:]/g, "_")}`);

/** What a frame says under its image: size, angle, movement, lens and length [STB-04]. */
export function technique(s: Shot): string {
  return [
    s.size && choiceLabel("size", s.size),
    s.angle && s.angle !== "eye" && choiceLabel("angle", s.angle),
    s.movement && choiceLabel("movement", s.movement),
    s.lens,
    formatSeconds(s.duration),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The storyboard: one frame per shot of the Découpage, drawn here or imported, with its caption [STB-01 to STB-06]. */
export function StoryboardView() {
  const { project, session, headerActions, ask, notify, go } = useProject();
  const scenes = useScenes(session);
  const shots = useShots();
  const numbering = useNumbering();
  const ratio = useRatio();
  const [scene, chooseScene] = useSceneChoice(project.id, scenes);
  const [panel, setPanel] = useStoredState<Panel>("oniric.storyboard.panel", "scenes");
  const [columns, setColumns] = useStoredState<number>("oniric.storyboard.columns", 3);
  const [shown, setShown] = useStoredState<string[]>("oniric.storyboard.shown", ["technique", "action", "dialogue", "notes"]);
  const [drawing, setDrawing] = useState<Shot | null>(null);
  const [picking, setPicking] = useState<Shot | null>(null);

  const perScene = useMemo(() => byScene(shots ?? []), [shots]);
  const list = scene ? (perScene.get(scene.id) ?? []) : [];
  const number = (s: Shot) => shotNumber(scene ? scene.index + 1 : 0, list.indexOf(s), numbering);
  const fail = (e: unknown) => notify({ text: describeError(e), tone: "error" });

  const add = async () => {
    if (!scene) return;
    try {
      await session.flush();
      await addShot(scene.id, list);
    } catch (e) {
      fail(e);
    }
  };

  const importInto = async (s: Shot) => {
    try {
      const [path] = await pickImage();
      if (path) await updateShot(s.id, { frameImage: path }, "Image de la case");
    } catch (e) {
      fail(e);
    }
  };

  const clearImage = async (s: Shot) => {
    if (!(await confirmRemoval(ask, { title: t("storyboard.clearTitle", { n: number(s) }), text: t("storyboard.clearText"), label: t("common.removeAction") }))) return;
    void updateShot(s.id, { frameImage: null }, "Image retirée de la case").catch(fail);
  };

  const remove = async (s: Shot) => {
    if (!(await confirmRemoval(ask, { title: t("shotlist.deleteTitle", { n: number(s) }), text: t("shotlist.deleteText") }))) return;
    void deleteShot(s.id).catch(fail);
  };

  const header = headerActions
    ? createPortal(
        <div className="header-tools">
          <Segmented
            label={t("storyboard.panel")}
            value={panel}
            onChange={setPanel}
            options={[
              { id: "scenes", label: t("shotlist.panels.scenes"), icon: ListTree },
              { id: "display", label: t("shotlist.panels.display"), icon: Eye },
            ]}
          />
          <button type="button" className="btn primary" disabled={!scene} onClick={() => void add()}>
            <Plus aria-hidden="true" />
            {t("shotlist.add")}
          </button>
        </div>,
        headerActions,
      )
    : null;

  if (scenes.length === 0) {
    return (
      <div className="view view-pad">
        {header}
        <div className="empty-state">
          <h2>{t("storyboard.emptyTitle")}</h2>
          <p className="muted">{t("shotlist.emptyText")}</p>
          <button type="button" className="btn" onClick={() => go("script")}>
            {t("shotlist.toScript")}
          </button>
        </div>
      </div>
    );
  }

  const aspect = String(ratioValue(ratio));

  return (
    <div className="view split rz-split">
      {header}
      <main className="rz-main sb-main" aria-label={t("nav.views.storyboard")}>
        {scene && (
          <header className="rz-scene-head">
            <div className="rz-scene-title">
              <span className="rz-scene-num">{t("shotlist.sceneNum", { n: scene.index + 1 })}</span>
              <h2 className="rz-slug">{scene.heading || t("workspace.noHeading")}</h2>
            </div>
            <div className="rz-scene-facts">
              <span className="muted">{shotTotals(list)}</span>
              <span className="spacer" />
              <button
                type="button"
                className="btn text"
                onClick={() => {
                  requestScene(scene.id);
                  go("shotlist");
                }}
              >
                <Clapperboard aria-hidden="true" />
                {t("storyboard.toShotlist")}
              </button>
            </div>
          </header>
        )}
        <ol className="sb-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {list.map((s) => {
            const n = number(s);
            const tech = technique(s);
            return (
              <li key={s.id} className="sb-frame">
                <header className="sb-frame-head">
                  <span className="rz-num">{n}</span>
                  {shown.includes("technique") && tech && <span className="sb-tech">{tech}</span>}
                  <span className="spacer" />
                  <MoreMenu
                    label={t("shotlist.shotMenu", { n })}
                    items={[
                      { label: t("storyboard.draw.open"), icon: Brush, onClick: () => setDrawing(s) },
                      { label: t("storyboard.import"), icon: ImagePlus, onClick: () => void importInto(s) },
                      { label: t("storyboard.fromBoard"), icon: Images, onClick: () => setPicking(s) },
                      ...(s.frameImage ? [{ label: t("storyboard.clear"), icon: ImageOff, onClick: () => void clearImage(s) }] : []),
                      { label: t("shotlist.delete"), icon: Trash2, danger: true, onClick: () => void remove(s) },
                    ]}
                  />
                </header>
                <div className={s.frameImage ? "sb-image" : "sb-image empty"} style={{ aspectRatio: aspect }}>
                  {s.frameImage ? (
                    <>
                      <MediaImage path={s.frameImage} alt={t("storyboard.frameOf", { n })} />
                      <div className="sb-image-tools">
                        <button type="button" className="btn small" onClick={() => setDrawing(s)}>
                          <Brush aria-hidden="true" />
                          {t("storyboard.drawOver")}
                        </button>
                        <button type="button" className="btn small" onClick={() => void importInto(s)}>
                          <ImagePlus aria-hidden="true" />
                          {t("storyboard.change")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="sb-empty-tools">
                      <button type="button" className="btn small" onClick={() => setDrawing(s)}>
                        <Brush aria-hidden="true" />
                        {t("storyboard.drawIt")}
                      </button>
                      <button type="button" className="btn small" onClick={() => void importInto(s)}>
                        <ImagePlus aria-hidden="true" />
                        {t("storyboard.import")}
                      </button>
                      <button type="button" className="btn small ghost" onClick={() => setPicking(s)}>
                        <Images aria-hidden="true" />
                        {t("storyboard.fromBoardShort")}
                      </button>
                    </div>
                  )}
                </div>
                {shown.includes("action") && (
                  <InlineText
                    multiline
                    className="sb-caption"
                    label={t("storyboard.caption", { n })}
                    placeholder={t("storyboard.captionPlaceholder")}
                    value={s.action}
                    onCommit={(action) => void updateShot(s.id, { action }).catch(fail)}
                  />
                )}
                {shown.includes("dialogue") && (
                  <InlineText
                    multiline
                    className="sb-dialogue"
                    label={t("storyboard.dialogueOf", { n })}
                    placeholder={t("storyboard.dialoguePlaceholder")}
                    value={s.dialogue}
                    onCommit={(dialogue) => void updateShot(s.id, { dialogue }).catch(fail)}
                  />
                )}
                {shown.includes("notes") && (
                  <InlineText
                    multiline
                    className="sb-notes"
                    label={t("storyboard.notesOf", { n })}
                    placeholder={t("storyboard.notesPlaceholder")}
                    value={s.frameNotes}
                    onCommit={(frameNotes) => void updateShot(s.id, { frameNotes }, "Notes de la case").catch(fail)}
                  />
                )}
              </li>
            );
          })}
          <li className="sb-add">
            <button type="button" style={{ aspectRatio: aspect }} onClick={() => void add()}>
              <Plus aria-hidden="true" />
              {list.length === 0 ? t("storyboard.addFirst") : t("shotlist.add")}
            </button>
            {list.length === 0 && <p className="muted small">{t("storyboard.addHint")}</p>}
          </li>
        </ol>
      </main>
      <aside className="view-side rz-side" aria-label={t(`shotlist.panels.${panel}`)}>
        {panel === "scenes" ? (
          <SceneRail
            scenes={scenes}
            current={scene?.id ?? null}
            onSelect={chooseScene}
            meta={(sc) => {
              const own = perScene.get(sc.id) ?? [];
              if (own.length === 0) return t("storyboard.noFrame");
              return t("storyboard.framesDone", { count: own.length, done: own.filter((x) => x.frameImage).length });
            }}
          />
        ) : (
          <div className="rz-display">
            <p className="check-list-title">{t("storyboard.ratio")}</p>
            <div className="check-list" role="radiogroup" aria-label={t("storyboard.ratio")}>
              {FRAME_RATIOS.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={ratio === r} onClick={() => void writeRatio(r).catch(fail)}>
                  <span className="check-box radio" aria-hidden="true" />
                  <span className="more-item">
                    {ratioName(r)}
                    <span className="more-item-hint">{t(`storyboard.ratioHints.${r.replace(/[.:]/g, "_")}`)}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="check-list-title">{t("storyboard.perRow")}</p>
            <div className="check-list" role="radiogroup" aria-label={t("storyboard.perRow")}>
              {[2, 3, 4].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={columns === n} onClick={() => setColumns(n)}>
                  <span className="check-box radio" aria-hidden="true" />
                  <span className="more-item">{t("storyboard.perRowN", { count: n })}</span>
                </button>
              ))}
            </div>
            <p className="check-list-title">{t("storyboard.underFrame")}</p>
            <CheckList
              label={t("storyboard.underFrame")}
              items={(["technique", "action", "dialogue", "notes"] as const).map((id) => ({
                id,
                label: t(`storyboard.shown.${id}`),
                hint: t(`storyboard.shown.${id}Hint`),
                checked: shown.includes(id),
              }))}
              onToggle={(id) => setShown(shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id])}
            />
          </div>
        )}
      </aside>
      {drawing && (
        <DrawDialog
          ratio={ratioValue(ratio)}
          ratioLabel={ratioName(ratio)}
          background={drawing.frameImage}
          title={t("storyboard.draw.title", { n: number(drawing) })}
          onClose={() => setDrawing(null)}
          onSave={async (png) => {
            try {
              const path = await storeImage(png, "storyboard", `${project.title} ${number(drawing)}`);
              await updateShot(drawing.id, { frameImage: path }, "Case dessinée");
            } catch (e) {
              fail(e);
            }
          }}
        />
      )}
      {picking && (
        <BoardImagePicker
          onPick={(path) => void updateShot(picking.id, { frameImage: path }, "Image de la case").catch(fail)}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

/** An image of a moodboard to set as a frame [STB-02]. */
function BoardImagePicker({ onPick, onClose }: { onPick: (path: string) => void; onClose: () => void }) {
  const images = useLive(boardImages, ["moodboard", "moodboard_item"]);
  return (
    <Dialog title={t("storyboard.fromBoard")} className="sb-picker" onCancel={onClose} actions={[{ label: t("common.cancel"), onClick: onClose }]}>
      {images && images.length === 0 && <p className="muted">{t("storyboard.noBoardImage")}</p>}
      <ul className="sb-picker-grid">
        {(images ?? []).map((im) => (
          <li key={im.path}>
            <button
              type="button"
              title={im.board}
              onClick={() => {
                onPick(im.path);
                onClose();
              }}
            >
              <MediaImage path={im.path} alt={im.board} />
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
