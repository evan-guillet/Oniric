import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import type { MarkType } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { t } from "../../../../core/i18n";
import { fold } from "../domain/types";
import { TYPE_ICONS } from "./typeIcons";

export interface WikiTarget {
  id: string;
  name: string;
  typeName: string;
  /** Key of its type's icon (ui/typeIcons). */
  icon?: string;
  summary: string;
}

export interface WikiSource {
  search(query: string): WikiTarget[];
  get(id: string): WikiTarget | undefined;
  open(id: string): void;
  /** The types an entry can be made in, by id and name, in their order. */
  types?(): { id: string; name: string; icon?: string }[];
  /** Makes an entry of `type` named `name`, for a name the Bible does not know yet. */
  create?(type: string, name: string): Promise<WikiTarget>;
}

/** `/`, `@` or `[[` at the start of a word, then what is typed [BIB-02]. */
const TRIGGER = /(?:^|[\s(«"'’ ])(\/|@|\[\[)([^@[\]/\n]{0,40})$/;

const key = new PluginKey("wiki");

/** How many entries the list shows at most, and how many types it offers to make a new one in. */
const MAX_FOUND = 12;
const MAX_CREATE = 3;

/** A row of the list: an entry to link, or a new entry to make with what is typed, then link. */
type Item = { kind: "entry"; target: WikiTarget } | { kind: "create"; name: string; type: string; typeName: string; icon?: string };

interface Active {
  from: number;
  to: number;
  items: Item[];
  index: number;
  /** Only the trigger is typed yet: the text says what to type next. */
  bare: boolean;
}

/** A link the caret is in or against. */
interface Here {
  from: number;
  to: number;
  id: string;
}

const svgs = new Map<string, string>();
/** The SVG of a type's icon, drawn once by key; a type without one gets the plain sheet. */
function iconSvg(key: string | undefined): string {
  const k = key && TYPE_ICONS[key] ? key : "file";
  let svg = svgs.get(k);
  if (svg === undefined) {
    svg = renderToStaticMarkup(createElement(TYPE_ICONS[k].icon, { size: 16, strokeWidth: 1.75, "aria-hidden": true }));
    svgs.set(k, svg);
  }
  return svg;
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
 * Wiki links in any ProseMirror editor: a menu of bible entries under the cursor after `/`, `@` or `[[`, and for a
 * name the Bible does not know, rows that make its entry (Entrée on the first one when nothing matches).
 * A link shines and shows its preview while the caret is in it, or while the pointer is on it; Ctrl+click opens the entry.
 * A plain click places the caret in the word, as in any text; the preview itself is the way to the entry: the pointer
 * can move onto it, and a click there opens the entry.
 * `links` says whether the links show: hidden, they read as plain text, without a preview.
 * What is typed, trigger included, sits in a badge until it is chosen or dismissed.
 */
export function wikiPlugin(mark: MarkType, source: () => WikiSource | null, links?: () => boolean): Plugin {
  let active: Active | null = null;
  let dismissedAt = -1;
  let view: EditorView | null = null;
  const popup = el("div", "wiki-popup");
  const list = el("div", "wiki-list");
  list.setAttribute("role", "listbox");
  const preview = el("div", "wiki-preview");
  preview.setAttribute("role", "link");
  let previewId: string | null = null;
  // The preview follows the caret or the pointer; Échap puts away the caret's until it leaves that link.
  let previewBy: "caret" | "pointer" | null = null;
  let caretDismissed = -1;
  // Leaving the link for the preview crosses a gap: the preview waits a moment before it goes.
  let hideTimer = 0;
  const hide = () => {
    window.clearTimeout(hideTimer);
    previewId = null;
    previewBy = null;
    preview.remove();
  };
  const hideSoon = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      hide();
      followCaret();
    }, 350);
  };
  preview.addEventListener("mouseenter", () => window.clearTimeout(hideTimer));
  preview.addEventListener("mouseleave", () => {
    if (previewBy === "pointer") hideSoon();
  });
  preview.addEventListener("mousedown", (e) => e.preventDefault());
  preview.addEventListener("click", () => {
    const id = previewId;
    hide();
    if (id) source()?.open(id);
  });

  const show = (target: WikiTarget, left: number, bottom: number, by: "caret" | "pointer") => {
    window.clearTimeout(hideTimer);
    previewBy = by;
    if (previewId !== target.id || !preview.isConnected) {
      previewId = target.id;
      const head = el("div", "wiki-preview-head");
      head.append(el("strong", "", target.name), el("span", "wiki-type", target.typeName));
      preview.replaceChildren(head);
      if (target.summary) preview.appendChild(el("p", "", target.summary));
      preview.appendChild(el("span", "wiki-preview-open", t("bible.openEntry")));
      preview.setAttribute("aria-label", t("bible.openEntryNamed", { name: target.name }));
    }
    Object.assign(preview.style, { left: `${left}px`, top: `${bottom + 6}px` });
    if (!preview.isConnected) document.body.appendChild(preview);
  };

  /** The link the caret is in, or against, when the text has the focus and the links show. */
  const here = (state: EditorState): Here | null => {
    if (!view?.hasFocus() || links?.() === false || !state.selection.empty) return null;
    const $head = state.selection.$head;
    if (!$head.parent.isTextblock) return null;
    const at = $head.parentOffset;
    let found: Here | null = null;
    let run: Here | null = null;
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
    const { from, to, id } = found as Here;
    return { from: start + from, to: start + to, id };
  };

  /** Shows the preview of the link the caret is in, or puts away the one it showed. */
  const followCaret = () => {
    if (!view || previewBy === "pointer") return;
    const h = here(view.state);
    const target = h && !active && h.from !== caretDismissed ? source()?.get(h.id) : undefined;
    if (h?.from !== caretDismissed) caretDismissed = -1;
    if (!h || !target) {
      if (previewBy === "caret") hide();
      return;
    }
    const a = view.coordsAtPos(h.from);
    const b = view.coordsAtPos(h.to);
    show(target, a.left, Math.max(a.bottom, b.bottom), "caret");
  };

  const dismiss = (v: EditorView) => {
    if (!active) return;
    dismissedAt = active.from;
    active = null;
    render();
    // Nothing in the text changes: the badge goes with an empty transaction.
    v.dispatch(v.state.tr.setMeta(key, true));
  };

  const section = (title: string) => {
    const head = el("div", "wiki-section", title);
    head.setAttribute("role", "presentation");
    return head;
  };

  const render = () => {
    if (!active || !view) {
      popup.remove();
      return;
    }
    list.replaceChildren();
    let group = "";
    active.items.forEach((item, i) => {
      const title = item.kind === "entry" ? t("bible.menuEntries") : t("bible.menuCreate");
      if (title !== group) {
        if (group) list.appendChild(el("div", "wiki-sep"));
        list.appendChild(section(title));
        group = title;
      }
      const on = i === active!.index;
      const row = el("div", `wiki-item${item.kind === "create" ? " create" : ""}${on ? " on" : ""}`);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(on));
      const icon = el("span", "wiki-icon");
      icon.innerHTML = iconSvg(item.kind === "entry" ? item.target.icon : item.icon);
      const label = el("span", "wiki-label");
      if (item.kind === "entry") label.append(el("span", "wiki-name", item.target.name), el("span", "wiki-type", item.target.typeName));
      else label.append(el("span", "wiki-name", t("bible.createNamed", { name: item.name })), el("span", "wiki-type", item.typeName));
      row.append(icon, label);
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (active) choose(i);
      });
      row.addEventListener("mousemove", () => {
        if (!active || active.index === i) return;
        active.index = i;
        render();
      });
      list.appendChild(row);
    });
    const foot = el("div", "wiki-foot");
    foot.append(el("span", "", t("bible.menuClose")), el("kbd", "", t("bible.menuCloseKey")));
    foot.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (view) dismiss(view);
    });
    popup.replaceChildren(list, foot);
    if (!popup.isConnected) document.body.appendChild(popup);
    // Under the badge, or above it when the page ends too soon.
    const at = view.coordsAtPos(active.from);
    const h = popup.offsetHeight;
    const top = at.bottom + 6 + h <= window.innerHeight - 8 ? at.bottom + 6 : Math.max(8, at.top - 6 - h);
    const left = Math.max(8, Math.min(at.left, window.innerWidth - popup.offsetWidth - 8));
    Object.assign(popup.style, { left: `${left}px`, top: `${top}px` });
    list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
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
      for (const x of ordered.slice(0, MAX_CREATE)) items.push({ kind: "create", name: query, type: x.id, typeName: x.name, icon: x.icon });
    }
    return items.length > 0 ? { from, to: $from.pos, items, index: 0, bare: m[2].length === 0 } : null;
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
          followCaret();
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
        const h = a ? null : here(state);
        if (h) return DecorationSet.create(state.doc, [Decoration.inline(h.from, h.to, { class: "wiki-current" })]);
        if (!a) return null;
        const marks = [Decoration.inline(a.from, a.to, { class: a.bare ? "wiki-typing bare" : "wiki-typing" })];
        if (a.bare) marks.push(Decoration.widget(a.to, () => el("span", "wiki-ghost", t("bible.menuPlaceholder")), { side: 1, key: "ghost" }));
        return DecorationSet.create(state.doc, marks);
      },
      handleKeyDown(v, e) {
        if (previewBy === "pointer") hide();
        if (!active) {
          if (e.key !== "Escape" || previewBy !== "caret") return false;
          caretDismissed = here(v.state)?.from ?? -1;
          hide();
          return true;
        }
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
          dismiss(v);
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        mouseover(_v, e) {
          const link = (e.target as HTMLElement).closest?.(".wikilink") as HTMLElement | null;
          const target = link?.dataset.id ? source()?.get(link.dataset.id) : undefined;
          if (!link || !target || links?.() === false) {
            if (previewBy === "pointer") hideSoon();
            return false;
          }
          const r = link.getBoundingClientRect();
          show(target, r.left, r.bottom, "pointer");
          return false;
        },
        // The shine and the preview of the link under the caret come with the focus, and go with it.
        focus(v) {
          v.dispatch(v.state.tr.setMeta(key, true));
          return false;
        },
        // Leaving the text (another view, the settings) also closes the list and its badge where they are.
        blur(v) {
          if (previewBy === "caret") hide();
          if (active) dismiss(v);
          else v.dispatch(v.state.tr.setMeta(key, true));
          return false;
        },
        mouseout(_v, e) {
          if ((e.target as HTMLElement).closest?.(".wikilink") && previewBy === "pointer") hideSoon();
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
