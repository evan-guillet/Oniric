import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import type { MarkType, Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

/** What the text needs to know of the notes; the card's content is drawn by the host. */
export interface NoteHost {
  /** Whether the note shows in the text: it exists and is not archived. */
  open(id: string): boolean;
  /** The notes put away: their passage keeps its mark, so a note brought back finds it, but loses its highlight. */
  archived(): ReadonlySet<string>;
  /** Draws the card of note `id` in `card`, or empties it with null. */
  render(id: string | null, card: HTMLElement): void;
}

const noteKey = new PluginKey<DecorationSet>("notes");

/** The notes changed: the passages of archived ones fade, and a card whose note is gone closes. */
export function refreshNotes(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(noteKey, true).setMeta("addToHistory", false));
}

interface Span {
  from: number;
  to: number;
  id: string;
}

/**
 * The note on a passage, in a card under the line: while the caret is in the passage, or the pointer on it.
 * The card is the one of the notes panel, with its « ⋯ » menu; it only shows the note. A link to the Bible keeps its
 * own preview. An archived note leaves the text: its passage is no longer highlighted and opens nothing.
 */
export function notePlugin(mark: MarkType, link: MarkType, host: () => NoteHost | null): Plugin {
  let view: EditorView | null = null;
  const card = document.createElement("div");
  card.className = "note-pop";
  let shownId: string | null = null;
  let shownBy: "caret" | "pointer" | null = null;
  // Échap puts the caret's card away until the caret leaves that passage.
  let dismissed = -1;
  let hideTimer = 0;

  /** Archived passages, each wrapped so its mark can drop the highlight. */
  const faded = (doc: PMNode): DecorationSet => {
    const off = host()?.archived();
    if (!off?.size) return DecorationSet.empty;
    const decos: Decoration[] = [];
    doc.descendants((node, pos) => {
      const id = node.isText ? node.marks.find((m) => m.type === mark)?.attrs.id : undefined;
      if (id && off.has(id)) decos.push(Decoration.inline(pos, pos + node.nodeSize, { class: "note-off" }));
    });
    return DecorationSet.create(doc, decos);
  };

  // The card holds on while it is used: its menu open, its note being written.
  const held = () => card.contains(document.activeElement) || !!card.querySelector('[aria-expanded="true"]');
  const hide = () => {
    window.clearTimeout(hideTimer);
    if (!shownId) return;
    shownId = null;
    shownBy = null;
    card.remove();
    host()?.render(null, card);
  };
  const hideSoon = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (held()) return;
      hide();
      followCaret();
    }, 350);
  };

  card.addEventListener("mouseenter", () => window.clearTimeout(hideTimer));
  card.addEventListener("mouseleave", () => {
    if (shownBy === "pointer") hideSoon();
  });
  // A press on the card leaves the caret in the text, except in the field where the note is written.
  card.addEventListener("mousedown", (e) => {
    if (!(e.target as HTMLElement).closest("textarea, input")) e.preventDefault();
  });
  // The focus gone elsewhere than the text, the card or its menu: the card goes too.
  const onFocus = (e: FocusEvent) => {
    const to = e.target as HTMLElement;
    if (!shownId || card.contains(to) || view?.dom.contains(to) || to.closest?.(".more-menu")) return;
    hide();
  };

  const show = (id: string, left: number, top: number, by: "caret" | "pointer") => {
    window.clearTimeout(hideTimer);
    shownBy = by;
    if (shownId !== id) {
      shownId = id;
      host()?.render(id, card);
    }
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
    if (!card.isConnected) document.body.appendChild(card);
    // Kept inside the window, once the host has drawn it.
    requestAnimationFrame(() => {
      const r = card.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) card.style.left = `${Math.max(8, window.innerWidth - 8 - r.width)}px`;
    });
  };

  /** The passage of an open note the caret is in, unless it is in a link to the Bible there. */
  const here = (state: EditorState): Span | null => {
    if (!view?.hasFocus() || !state.selection.empty) return null;
    const $head = state.selection.$head;
    if (!$head.parent.isTextblock || $head.marks().some((m) => m.type === link)) return null;
    const at = $head.parentOffset;
    let found: Span | null = null;
    let run: Span | null = null;
    const close = () => {
      if (run && !found && run.from <= at && at <= run.to && host()?.open(run.id)) found = run;
      run = null;
    };
    $head.parent.forEach((child, offset) => {
      const m = child.marks.find((x) => x.type === mark);
      if (m && run && run.id === m.attrs.id && run.to === offset) run.to = offset + child.nodeSize;
      else {
        close();
        if (m) run = { from: offset, to: offset + child.nodeSize, id: m.attrs.id as string };
      }
    });
    close();
    if (!found) return null;
    const start = $head.start();
    const { from, to, id } = found as Span;
    return { from: start + from, to: start + to, id };
  };

  const followCaret = () => {
    if (!view || shownBy === "pointer" || held()) return;
    const h = here(view.state);
    if (h?.from !== dismissed) dismissed = -1;
    if (!h || h.from === dismissed) {
      if (shownBy === "caret") hide();
      return;
    }
    // Under the caret's line, from the start of its block.
    const caret = view.coordsAtPos(view.state.selection.head);
    const left = view.coordsAtPos(view.state.selection.$head.start()).left;
    show(h.id, left, caret.bottom + 6, "caret");
  };

  return new Plugin({
    key: noteKey,
    state: {
      init: (_, state) => faded(state.doc),
      apply: (tr, old) => (tr.getMeta(noteKey) || (tr.docChanged && host()?.archived().size) ? faded(tr.doc) : old.map(tr.mapping, tr.doc)),
    },
    view(v) {
      view = v;
      window.addEventListener("scroll", onScroll, true);
      document.addEventListener("focusin", onFocus);
      return {
        update(v) {
          view = v;
          if (shownId && !host()?.open(shownId)) hide();
          followCaret();
        },
        destroy() {
          hide();
          window.removeEventListener("scroll", onScroll, true);
          document.removeEventListener("focusin", onFocus);
          view = null;
        },
      };
    },
    props: {
      decorations: (state) => noteKey.getState(state),
      handleKeyDown(v, e) {
        if (shownBy === "pointer") hide();
        if (e.key !== "Escape" || shownBy !== "caret") return false;
        dismissed = here(v.state)?.from ?? -1;
        hide();
        return true;
      },
      handleDOMEvents: {
        mouseover(_v, e) {
          const target = e.target as HTMLElement;
          const span = target.closest?.(".note-mark") as HTMLElement | null;
          const id = span?.dataset.note;
          if (!span || !id || !host()?.open(id) || target.closest(".wikilink")) {
            if (shownBy === "pointer") hideSoon();
            return false;
          }
          if (held() || (shownBy === "caret" && shownId === id)) return false;
          // Under the line the pointer is on, from the start of its block.
          const line = [...span.getClientRects()].find((r) => e.clientY >= r.top && e.clientY <= r.bottom) ?? span.getBoundingClientRect();
          const block = span.closest(".el, p") ?? span;
          show(id, block.getBoundingClientRect().left, line.bottom + 6, "pointer");
          return false;
        },
        mouseout(_v, e) {
          if ((e.target as HTMLElement).closest?.(".note-mark") && shownBy === "pointer") hideSoon();
          return false;
        },
        // A click outside anything that takes the focus: the caret's card goes with it.
        blur(_v, e) {
          const to = e.relatedTarget as HTMLElement | null;
          if (shownBy === "caret" && !to && !held()) hide();
          return false;
        },
      },
    },
  });

  // The caret's card follows its line as the text scrolls; the pointer's goes, the pointer being elsewhere by then.
  function onScroll(e: Event) {
    if (!card.isConnected || (e.target instanceof Node && card.contains(e.target))) return;
    if (shownBy === "pointer") return held() || hide();
    if (!held()) return followCaret();
    if (view) card.style.top = `${view.coordsAtPos(view.state.selection.head).bottom + 6}px`;
  }
}
