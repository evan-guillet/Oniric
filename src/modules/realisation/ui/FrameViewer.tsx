import { Brush, ChevronDown, ChevronUp, ImageOff, ImagePlus, Images, X } from "lucide-react";
import { useEffect, useId, useRef, type CSSProperties } from "react";
import { useLive } from "../../../core/db/live";
import { t } from "../../../core/i18n";
import { Dialog, useBackdropClose } from "../../../ui-kit/Dialog";
import { MediaImage } from "../../shared/media";
import { boardImages } from "../application/moodboards";
import type { FrameRatio, Shot, ShotPatch } from "../application/shots";
import { formatSeconds } from "../domain/shots";
import { choiceLabel, InlineText } from "./common";

export const ratioName = (r: FrameRatio) => t(`storyboard.ratios.${r.replace(/[.:]/g, "_")}`);

/** What a frame says of its shot: size, angle, movement, lens and length [STB-04]. */
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

/** The frame of a shot in the line of the Découpage: its image, or an empty slot; either opens the frame in large. */
export function FrameThumb({ shot, n, ratio, wide, onOpen }: { shot: Shot; n: string; ratio: number; wide?: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={["rz-thumb", wide && "wide", !shot.frameImage && "empty"].filter(Boolean).join(" ")}
      // In a line, 88px wide at most and 50px high at most, whatever the ratio.
      style={{ aspectRatio: String(ratio), width: wide ? undefined : Math.round(Math.min(88, 50 * ratio)) }}
      aria-label={t(shot.frameImage ? "storyboard.openFrame" : "storyboard.addFrame", { n })}
      title={t(shot.frameImage ? "storyboard.openFrame" : "storyboard.addFrame", { n })}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {shot.frameImage ? <MediaImage path={shot.frameImage} alt="" /> : <ImagePlus aria-hidden="true" />}
    </button>
  );
}

/**
 * A frame in large, with what its shot says beside it [STB-01 to STB-06]: drawn, imported or taken from a moodboard
 * here, its caption written in place; ↑ and ↓ go from one shot to the next of those the Découpage shows.
 */
export function FrameViewer({
  shots,
  index,
  numberOf,
  headingOf,
  ratio,
  onMove,
  onClose,
  onDraw,
  onImport,
  onPick,
  onClear,
  onPatch,
}: {
  shots: Shot[];
  index: number;
  numberOf: (s: Shot) => string;
  headingOf: (s: Shot) => string;
  ratio: number;
  onMove: (index: number) => void;
  onClose: () => void;
  onDraw: (s: Shot) => void;
  onImport: (s: Shot) => void;
  onPick: (s: Shot) => void;
  onClear: (s: Shot) => void;
  onPatch: (s: Shot, p: ShotPatch, label?: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdrop = useBackdropClose(onClose);
  // Escape in a field only puts back what it held; the next one closes.
  const keepOpen = useRef(false);
  const shot = shots[index];
  const step = (by: -1 | 1) => {
    const next = index + by;
    if (next >= 0 && next < shots.length) onMove(next);
  };
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    // The dialog holds the focus, not its first button, which goes off at the first or last shot.
    d.focus();
    return () => d.close();
  }, []);
  // ↑ and ↓ wherever the focus is, unless a field is written in or another dialog (drawing, moodboard) is over this one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const open = document.querySelectorAll("dialog[open]");
      if (open[open.length - 1] !== ref.current) return;
      if ((e.target as HTMLElement).closest?.("textarea, input, select, [contenteditable='true'], [role=listbox]")) return;
      e.preventDefault();
      stepRef.current(e.key === "ArrowUp" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!shot) return null;
  const n = numberOf(shot);
  const tech = technique(shot);

  return (
    <dialog
      ref={ref}
      className="dialog frame-viewer"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDownCapture={(e) => {
        keepOpen.current = e.key === "Escape" && !!(e.target as HTMLElement).closest("textarea, input");
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (keepOpen.current) {
          keepOpen.current = false;
          ref.current?.focus();
        } else onClose();
      }}
      {...backdrop}
    >
      <header className="fv-head">
        <h2 id={titleId}>
          <span className="fv-num">{t("storyboard.shotN", { n })}</span>
          <span className="fv-scene">{headingOf(shot)}</span>
        </h2>
        <span className="fv-count" aria-live="polite">
          {t("storyboard.position", { at: index + 1, count: shots.length })}
        </span>
        <div className="fv-steps">
          <button type="button" className="icon-btn" disabled={index === 0} aria-label={t("storyboard.previous")} title={t("storyboard.previous")} onClick={() => step(-1)}>
            <ChevronUp aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={index === shots.length - 1}
            aria-label={t("storyboard.next")}
            title={t("storyboard.next")}
            onClick={() => step(1)}
          >
            <ChevronDown aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="icon-btn" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="fv-body">
        <div className="fv-stage">
          <div key={shot.id} className={shot.frameImage ? "fv-frame" : "fv-frame empty"} style={{ aspectRatio: String(ratio), "--r": ratio } as CSSProperties}>
            {shot.frameImage ? (
              <MediaImage path={shot.frameImage} alt={t("storyboard.frameOf", { n })} />
            ) : (
              <p className="muted">{t("storyboard.noImage")}</p>
            )}
          </div>
          <div className="fv-tools">
            <button type="button" className="btn small" onClick={() => onDraw(shot)}>
              <Brush aria-hidden="true" />
              {t(shot.frameImage ? "storyboard.drawOver" : "storyboard.drawIt")}
            </button>
            <button type="button" className="btn small" onClick={() => onImport(shot)}>
              <ImagePlus aria-hidden="true" />
              {t(shot.frameImage ? "storyboard.change" : "storyboard.import")}
            </button>
            <button type="button" className="btn small" onClick={() => onPick(shot)}>
              <Images aria-hidden="true" />
              {t("storyboard.fromBoardShort")}
            </button>
            {shot.frameImage && (
              <button type="button" className="btn small ghost" onClick={() => onClear(shot)}>
                <ImageOff aria-hidden="true" />
                {t("storyboard.clear")}
              </button>
            )}
          </div>
        </div>
        <div className="fv-detail">
          <p className={tech ? "fv-tech" : "fv-tech muted"}>{tech || t("storyboard.noTechnique")}</p>
          <div className="fv-field">
            <span className="fv-label">{t("storyboard.shown.action")}</span>
            <InlineText
              key={`a${shot.id}`}
              multiline
              className="fv-caption"
              label={t("storyboard.caption", { n })}
              placeholder="—"
              value={shot.action}
              onCommit={(action) => onPatch(shot, { action })}
            />
          </div>
          <div className="fv-field">
            <span className="fv-label">{t("storyboard.shown.dialogue")}</span>
            <InlineText
              key={`d${shot.id}`}
              multiline
              className="fv-dialogue"
              label={t("storyboard.dialogueOf", { n })}
              placeholder="—"
              value={shot.dialogue}
              onCommit={(dialogue) => onPatch(shot, { dialogue })}
            />
          </div>
          <div className="fv-field">
            <span className="fv-label">{t("storyboard.shown.notes")}</span>
            <InlineText
              key={`n${shot.id}`}
              multiline
              className="fv-notes"
              label={t("storyboard.notesOf", { n })}
              placeholder="—"
              value={shot.frameNotes}
              onCommit={(frameNotes) => onPatch(shot, { frameNotes }, "Notes de la case")}
            />
          </div>
          <p className="fv-hint">{t("storyboard.arrowsHint")}</p>
        </div>
      </div>
    </dialog>
  );
}

/** An image of a moodboard to set as a frame [STB-02]. */
export function BoardImagePicker({ onPick, onClose }: { onPick: (path: string) => void; onClose: () => void }) {
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
