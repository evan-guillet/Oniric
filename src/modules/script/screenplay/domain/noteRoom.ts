/** A note narrower than this is no longer readable beside the text; wider, its lines run too long. */
const NOTE_MIN = 190;
const NOTE_MAX = 560;
/** How far the card on the left and the note on the right may run into the desk's padding, which is 32px wide. */
const EDGE = 16;

export interface NoteRoom {
  /** The width of the notes. */
  width: number;
  /** How far the text moves left to make room for a note of the smallest width. */
  shift: number;
}

/**
 * The notes in the margin right of the text: the text stays in the middle of the desk and they take what is left,
 * pushing the text over only by what the smallest note lacks. Null when even that does not fit.
 *
 * All in pixels: the desk's content box, the text block, what the scene card adds on each side, the gap to the note.
 */
export function noteRoom(desk: number, text: number, pad: number, gap: number): NoteRoom | null {
  const side = (desk - text) / 2;
  const room = side - pad - gap + EDGE;
  const shift = Math.max(0, NOTE_MIN - room);
  if (side - pad - shift < -EDGE) return null;
  return { width: Math.min(NOTE_MAX, Math.max(NOTE_MIN, room)), shift };
}
