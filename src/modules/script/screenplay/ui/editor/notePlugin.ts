import { Plugin, type EditorState } from "prosemirror-state";
import type { MarkType } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { relativeFormat, t } from "../../../../../core/i18n";

export interface NoteCard {
  body: string;
  createdAt: string;
  /** Who writes in this project: the profile's name, empty when it has none. */
  author: string;
}

export interface NoteSource {
  get(id: string): NoteCard | undefined;
  save(id: string, body: string): void;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text) e.textContent = text;
  return e;
}

/** « il y a 3 jours », in the interface's language, from the largest unit that fits. */
function since(iso: string): string {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (!Number.isFinite(s) || s > -60) return t("script.notes.justNow");
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const [unit, size] = units.find(([, n]) => -s >= n)!;
  return relativeFormat({ numeric: "auto" }).format(Math.round(s / size), unit);
}

interface Span {
  from: number;
  to: number;
  id: string;
}

/**
 * The note on a passage, in a card under the line: while the caret is in the passage, or the pointer on it.
 * The card says who wrote it and when, quotes the passage and holds the note itself, which is written in place:
 * Ctrl+Entrée or leaving the field keeps it, Échap puts it back as it was. A link to the Bible keeps its own preview.
 */
export function notePlugin(mark: MarkType, link: MarkType, source: () => NoteSource | null): Plugin {
  let view: EditorView | null = null;
  const card = el("div", "note-pop");
  card.setAttribute("role", "dialog");
  const head = el("div", "note-pop-head");
  const quote = el("div", "note-pop-quote");
  const field = document.createElement("textarea");
  field.className = "note-pop-field";
  field.rows = 1;
  field.setAttribute("aria-label", t("script.notes.note"));
  card.append(head, quote, field);
  let shownId: string | null = null;
  let shownBy: "caret" | "pointer" | null = null;
  let saved = "";
  // What was kept from the card, until the notes read back say the same.
  const kept = new Map<string, string>();
  // Échap puts the caret's card away until the caret leaves that passage.
  let dismissed = -1;
  let hideTimer = 0;

  const fit = () => {
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  };
  const editing = () => document.activeElement === field;
  const hide = () => {
    window.clearTimeout(hideTimer);
    shownId = null;
    shownBy = null;
    card.remove();
  };
  const hideSoon = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (editing()) return;
      hide();
      followCaret();
    }, 350);
  };
  const keep = () => {
    if (!shownId || field.value === saved) return;
    saved = field.value;
    kept.set(shownId, field.value);
    source()?.save(shownId, field.value);
  };

  card.addEventListener("mouseenter", () => window.clearTimeout(hideTimer));
  card.addEventListener("mouseleave", () => {
    if (shownBy === "pointer") hideSoon();
  });
  // A press on the card outside the field leaves the caret in the text.
  card.addEventListener("mousedown", (e) => {
    if (e.target !== field) e.preventDefault();
  });
  field.addEventListener("input", fit);
  field.addEventListener("blur", (e) => {
    keep();
    const to = e.relatedTarget as Node | null;
    if (!card.contains(to) && !view?.dom.contains(to)) hide();
  });
  field.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      field.value = saved;
      fit();
      view?.focus();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      keep();
      view?.focus();
    }
  });

  const show = (id: string, note: NoteCard, text: string, left: number, top: number, by: "caret" | "pointer") => {
    window.clearTimeout(hideTimer);
    shownBy = by;
    if (shownId !== id || !card.isConnected) {
      shownId = id;
      const who = note.author.trim();
      const avatar = el("span", "note-pop-avatar", (who || t("script.notes.note")).charAt(0).toUpperCase());
      avatar.setAttribute("aria-hidden", "true");
      head.replaceChildren(avatar, el("strong", "", who || t("script.notes.note")), el("span", "note-pop-time", since(note.createdAt)));
      quote.textContent = text;
      if (kept.get(id) === note.body) kept.delete(id);
      const body = kept.get(id) ?? note.body;
      saved = body;
      field.value = body;
      field.placeholder = t("script.notes.write");
    }
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
    if (!card.isConnected) document.body.appendChild(card);
    fit();
    // Kept inside the window: above the line when it ends too soon.
    const r = card.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) card.style.left = `${Math.max(8, window.innerWidth - 8 - r.width)}px`;
  };

  /** The passage of a note the caret is in, unless it is in a link to the Bible there. */
  const here = (state: EditorState): Span | null => {
    if (!view?.hasFocus() || !state.selection.empty) return null;
    const $head = state.selection.$head;
    if (!$head.parent.isTextblock || $head.marks().some((m) => m.type === link)) return null;
    const at = $head.parentOffset;
    let found: Span | null = null;
    let run: Span | null = null;
    const close = () => {
      if (run && !found && run.from <= at && at <= run.to) found = run;
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
    if (!view || shownBy === "pointer" || editing()) return;
    const h = here(view.state);
    if (h?.from !== dismissed) dismissed = -1;
    const note = h && h.from !== dismissed ? source()?.get(h.id) : undefined;
    if (!h || !note) {
      if (shownBy === "caret") hide();
      return;
    }
    // Under the caret's line, from the start of its block.
    const caret = view.coordsAtPos(view.state.selection.head);
    const left = view.coordsAtPos(view.state.selection.$head.start()).left;
    show(h.id, note, view.state.doc.textBetween(h.from, h.to, " "), left, caret.bottom + 6, "caret");
  };

  return new Plugin({
    view(v) {
      view = v;
      window.addEventListener("scroll", onScroll, true);
      return {
        update(v) {
          view = v;
          followCaret();
        },
        destroy() {
          hide();
          window.removeEventListener("scroll", onScroll, true);
          view = null;
        },
      };
    },
    props: {
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
          const note = id ? source()?.get(id) : undefined;
          if (!span || !id || !note || target.closest(".wikilink")) {
            if (shownBy === "pointer") hideSoon();
            return false;
          }
          if (editing() || (shownBy === "caret" && shownId === id)) return false;
          // Under the line the pointer is on, from the start of its block.
          const line = [...span.getClientRects()].find((r) => e.clientY >= r.top && e.clientY <= r.bottom) ?? span.getBoundingClientRect();
          const block = span.closest(".el, p") ?? span;
          const text = [...document.querySelectorAll<HTMLElement>(`.note-mark[data-note="${CSS.escape(id)}"]`)].map((x) => x.textContent).join(" ");
          show(id, note, text, block.getBoundingClientRect().left, line.bottom + 6, "pointer");
          return false;
        },
        mouseout(_v, e) {
          if ((e.target as HTMLElement).closest?.(".note-mark") && shownBy === "pointer") hideSoon();
          return false;
        },
        blur(_v, e) {
          if (card.contains(e.relatedTarget as Node | null)) return false;
          if (shownBy === "caret") hide();
          return false;
        },
      },
    },
  });

  // The caret's card follows its line as the text scrolls; the pointer's goes, the pointer being elsewhere by then.
  function onScroll(e: Event) {
    if (!card.isConnected || (e.target instanceof Node && card.contains(e.target))) return;
    if (shownBy === "pointer") return hide();
    if (!editing()) return followCaret();
    // While the note is written, the card stays with its line.
    if (view) card.style.top = `${view.coordsAtPos(view.state.selection.head).bottom + 6}px`;
  }
}
