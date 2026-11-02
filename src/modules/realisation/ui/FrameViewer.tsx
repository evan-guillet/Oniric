import { ChevronDown, ChevronUp, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import { useLive } from "../../../core/db/live";
import { t } from "../../../core/i18n";
import { Dialog } from "../../../ui-kit/Dialog";
import { MediaImage } from "../../shared/media";
import { boardImages } from "../application/moodboards";
import type { FrameRatio, Shot } from "../application/shots";
import { formatSeconds } from "../domain/shots";
import { choiceLabel } from "./common";

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

/** The frame of a shot in the line of the Découpage: its image, which opens in large, or an empty slot to fill. */
export function FrameThumb({ shot, n, ratio, wide, onOpen }: { shot: Shot; n: string; ratio: number; wide?: boolean; onOpen: (el: HTMLElement) => void }) {
  return (
    <button
      type="button"
      className={["rz-thumb", wide && "wide", !shot.frameImage && "empty"].filter(Boolean).join(" ")}
      // In a line, 88px wide at most and 50px high at most, whatever the ratio.
      style={{ aspectRatio: String(ratio), width: wide ? undefined : Math.round(Math.min(88, 50 * ratio)) }}
      aria-label={t(shot.frameImage ? "storyboard.openFrame" : "storyboard.addFrame", { n })}
      title={t(shot.frameImage ? "storyboard.openFrame" : "storyboard.addFrame", { n })}
      aria-haspopup={shot.frameImage ? "dialog" : "menu"}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e.currentTarget);
      }}
    >
      {shot.frameImage ? <MediaImage path={shot.frameImage} alt="" /> : <ImagePlus aria-hidden="true" />}
    </button>
  );
}

/**
 * A frame in large, alone on a dark surround [STB-01]: ↑ ↓, the wheel or the arrows at the right go from one drawn
 * frame to the next of those the Découpage shows; a click beside the image, or Escape, closes.
 */
export function FrameViewer({
  shots,
  index,
  numberOf,
  ratio,
  onMove,
  onClose,
}: {
  shots: Shot[];
  index: number;
  numberOf: (s: Shot) => string;
  ratio: number;
  onMove: (index: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
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
    // The dialog holds the focus, not its first button, which goes off at the first or last frame.
    d.focus();
    return () => d.close();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      stepRef.current(e.key === "ArrowUp" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // One notch of the wheel, or one swipe of a touchpad, is one frame.
  const wheel = useRef(0);
  if (!shot) return null;
  const n = numberOf(shot);

  return (
    <dialog
      ref={ref}
      className="frame-viewer"
      aria-label={t("storyboard.frameOf", { n })}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("img, button")) onClose();
      }}
      onWheel={(e) => {
        const now = performance.now();
        if (Math.abs(e.deltaY) < 4 || now - wheel.current < 320) return;
        wheel.current = now;
        step(e.deltaY < 0 ? -1 : 1);
      }}
    >
      <div key={shot.id} className="fv-frame" style={{ "--r": ratio } as CSSProperties}>
        {shot.frameImage && <MediaImage path={shot.frameImage} alt={t("storyboard.frameOf", { n })} />}
      </div>
      <button type="button" className="fv-close" aria-label={t("common.close")} title={t("common.close")} onClick={onClose}>
        <X aria-hidden="true" />
      </button>
      {shots.length > 1 && (
        <div className="fv-steps">
          <button type="button" disabled={index === 0} aria-label={t("storyboard.previous")} title={t("storyboard.previous")} onClick={() => step(-1)}>
            <ChevronUp aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={index === shots.length - 1}
            aria-label={t("storyboard.next")}
            title={t("storyboard.next")}
            onClick={() => step(1)}
          >
            <ChevronDown aria-hidden="true" />
          </button>
        </div>
      )}
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
