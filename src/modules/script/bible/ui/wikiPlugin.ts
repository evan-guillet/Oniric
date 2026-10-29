import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import type { MarkType } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { t } from "../../../../core/i18n";
import { fold } from "../domain/types";

export interface WikiTarget {
  id: string;
  name: string;
  typeName: string;
  summary: string;
}

export interface WikiSource {
  search(query: string): WikiTarget[];
  get(id: string): WikiTarget | undefined;
  open(id: string): void;
  /** The types an entry can be made in, by id and name, in their order. */
  types?(): { id: string; name: string }[];
  /** Makes an entry of `type` named `name`, for a name the Bible does not know yet. */
  create?(type: string, name: string): Promise<WikiTarget>;
}

/** `/`, `@` or `[[` at the start of a word, then what is typed [BIB-02]. */
const TRIGGER = /(?:^|[\s(«"'’ ])(\/|@|\[\[)([^@[\]/\n]{0,40})$/;

const key = new PluginKey("wiki");

/** How many entries the list shows at most, and how many types it offers to make a new one in. */
const MAX_FOUND = 6;
const MAX_CREATE = 3;

/** A row of the list: an entry to link, or a new entry to make with what is typed, then link. */
type Item = { kind: "entry"; target: WikiTarget } | { kind: "create"; name: string; type: string; typeName: string };

interface Active {
  from: number;
  to: number;
  items: Item[];
  index: number;
}

/** The type a new entry most likely has where it is typed: a place in a scene heading, otherwise a character. */
function likelyType(blockType: string): string {
  return blockType === "scene_heading" ? "location" : "character";
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text) e.textContent = text;
  return e;
}

/**
 * Wiki links in any ProseMirror editor: a list of bible entries under the cursor after `/`, `@` or `[[`, and for a
 * name the Bible does not know, rows that make its entry (Entrée on the first one when nothing matches); a preview on hover, Ctrl+click to open the entry. A plain click places the caret in the word, as in any text;
 * the preview itself is the way to the entry: the pointer can move onto it, and a click there opens the entry.
 * `links` says whether the links show: hidden, they read as plain text, without a preview.
 * What is typed, trigger included, sits in a badge until it is chosen or dismissed.
 */
export function wikiPlugin(mark: MarkType, source: () => WikiSource | null, links?: () => boolean): Plugin {
  let active: Active | null = null;
  let dismissedAt = -1;
  let view: EditorView | null = null;
  const popup = el("div", "wiki-popup");
  popup.setAttribute("role", "listbox");
  const preview = el("div", "wiki-preview");
  preview.setAttribute("role", "link");
  let previewId: string | null = null;
  // Leaving the link for the preview crosses a gap: the preview waits a moment before it goes.
  let hideTimer = 0;
  const hide = () => {
    window.clearTimeout(hideTimer);
    previewId = null;
    preview.remove();
  };
  const hideSoon = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, 350);
  };
  preview.addEventListener("mouseenter", () => window.clearTimeout(hideTimer));
  preview.addEventListener("mouseleave", hideSoon);
  preview.addEventListener("mousedown", (e) => e.preventDefault());
  preview.addEventListener("click", () => {
    const id = previewId;
    hide();
    if (id) source()?.open(id);
  });

  const render = () => {
    popup.replaceChildren();
    if (!active || !view) {
      popup.remove();
      return;
    }
    active.items.forEach((item, i) => {
      const on = i === active!.index;
      const row = el("div", `wiki-item${item.kind === "create" ? " create" : ""}${on ? " on" : ""}`);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(on));
      if (item.kind === "entry") row.append(el("span", "wiki-name", item.target.name), el("span", "wiki-type", item.target.typeName));
      else row.append(el("span", "wiki-name", t("bible.createNamed", { name: item.name })), el("span", "wiki-type", item.typeName));
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (active) choose(i);
      });
      popup.appendChild(row);
    });
    const at = view.coordsAtPos(active.from);
    Object.assign(popup.style, { left: `${at.left}px`, top: `${at.bottom + 4}px` });
    if (!popup.isConnected) document.body.appendChild(popup);
  };

  /** Puts the link to `target` in place of what was typed from `from` to `to`, if that text is still there. */
  const link = (from: number, to: number, typed: string, target: WikiTarget) => {
    if (!view || to > view.state.doc.content.size || view.state.doc.textBetween(from, to) !== typed) return;
    const { state } = view;
    const tr = state.tr.replaceWith(from, to, state.schema.text(target.name, [mark.create({ id: target.id })]));
    tr.setStoredMarks([]);
    view.dispatch(tr);
  };

  const choose = (i: number) => {
    if (!active || !view) return;
    const item = active.items[i];
    const { from, to } = active;
    const typed = view.state.doc.textBetween(from, to);
    active = null;
    render();
    if (item.kind === "entry") return link(from, to, typed, item.target);
    // The entry is made first; the link takes the place of the name once it exists.
    void source()
      ?.create?.(item.type, item.name)
      .then((target) => link(from, to, typed, target))
      .catch(() => {});
  };

  const compute = (state: EditorState): Active | null => {
    const { selection } = state;
    const $from = selection.$from;
    if (!selection.empty || !$from.parent.isTextblock || !$from.parent.type.allowsMarkType(mark)) return null;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
    const m = TRIGGER.exec(before);
    const src = source();
    if (!m || !src) return null;
    const from = $from.pos - m[1].length - m[2].length;
    if (from === dismissedAt) return null;
    const query = m[2].trim();
    // A « / » set apart by a space (INT. / EXT.) stays a plain character.
    if (m[1] === "/" && /^\s/.test(m[2])) return null;
    const found = src.search(query);
    const items: Item[] = found.slice(0, MAX_FOUND).map((target) => ({ kind: "entry", target }));
    const known = found.some((x) => fold(x.name) === fold(query));
    if (query && !known && src.create && src.types) {
      const types = src.types();
      const first = likelyType($from.parent.type.name);
      const ordered = [...types.filter((x) => x.id === first), ...types.filter((x) => x.id !== first)];
      for (const x of ordered.slice(0, MAX_CREATE)) items.push({ kind: "create", name: query, type: x.id, typeName: x.name });
    }
    return items.length > 0 ? { from, to: $from.pos, items, index: 0 } : null;
  };

  return new Plugin({
    view(v) {
      view = v;
      // A fixed preview would stay put while the text scrolls away under it.
      window.addEventListener("scroll", hide, true);
      return {
        update(v) {
          view = v;
          const next = compute(v.state);
          if (next && active && next.from === active.from) next.index = Math.min(active.index, next.items.length - 1);
          active = next;
          render();
        },
        destroy() {
          popup.remove();
          hide();
          window.removeEventListener("scroll", hide, true);
          view = null;
        },
      };
    },
    key,
    props: {
      decorations(state) {
        const a = compute(state);
        return a ? DecorationSet.create(state.doc, [Decoration.inline(a.from, a.to, { class: "wiki-typing" })]) : null;
      },
      handleKeyDown(v, e) {
        if (previewId) hide();
        if (!active) return false;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const n = active.items.length;
          active.index = (active.index + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
          render();
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          choose(active.index);
          return true;
        }
        if (e.key === "Escape") {
          dismissedAt = active.from;
          active = null;
          render();
          // Nothing in the text changes: the badge goes with an empty transaction.
          v.dispatch(v.state.tr.setMeta(key, true));
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        mouseover(_v, e) {
          const link = (e.target as HTMLElement).closest?.(".wikilink") as HTMLElement | null;
          const target = link?.dataset.id ? source()?.get(link.dataset.id) : undefined;
          if (!link || !target || links?.() === false) {
            if (previewId) hideSoon();
            return false;
          }
          window.clearTimeout(hideTimer);
          if (previewId === target.id && preview.isConnected) return false;
          previewId = target.id;
          const head = el("div", "wiki-preview-head");
          head.append(el("strong", "", target.name), el("span", "wiki-type", target.typeName));
          preview.replaceChildren(head);
          if (target.summary) preview.appendChild(el("p", "", target.summary));
          preview.appendChild(el("span", "wiki-preview-open", t("bible.openEntry")));
          preview.setAttribute("aria-label", t("bible.openEntryNamed", { name: target.name }));
          const r = link.getBoundingClientRect();
          Object.assign(preview.style, { left: `${r.left}px`, top: `${r.bottom + 4}px` });
          if (!preview.isConnected) document.body.appendChild(preview);
          return false;
        },
        // Leaving the text (another view, the settings) closes the list and its badge where they are.
        blur(v) {
          if (!active) return false;
          dismissedAt = active.from;
          active = null;
          render();
          v.dispatch(v.state.tr.setMeta(key, true));
          return false;
        },
        mouseout(_v, e) {
          if ((e.target as HTMLElement).closest?.(".wikilink")) hideSoon();
          return false;
        },
        click(_v, e) {
          const link = (e.target as HTMLElement).closest?.(".wikilink") as HTMLElement | null;
          if (!link?.dataset.id || !(e.ctrlKey || e.metaKey)) return false;
          hide();
          source()?.open(link.dataset.id);
          return true;
        },
      },
    },
  });
}
