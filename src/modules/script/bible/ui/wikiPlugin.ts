import { Plugin } from "prosemirror-state";
import type { MarkType } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { t } from "../../../../core/i18n";

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
}

/** `@` or `[[` at the start of a word, then what is typed [BIB-02]. */
const TRIGGER = /(?:^|[\s(«"'’ ])(@|\[\[)([^@[\]\n]{0,40})$/;

interface Active {
  from: number;
  to: number;
  items: WikiTarget[];
  index: number;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text) e.textContent = text;
  return e;
}

/**
 * Wiki links in any ProseMirror editor: a list of bible entries under the cursor after `@` or `[[`,
 * a preview on hover, Ctrl+click to open the entry. A plain click places the caret in the word, as in any text;
 * the preview itself is the way to the entry: the pointer can move onto it, and a click there opens the entry.
 * `links` says whether the links show: hidden, they read as plain text, without a preview.
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
      const row = el("div", i === active!.index ? "wiki-item on" : "wiki-item");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(i === active!.index));
      row.append(el("span", "wiki-name", item.name), el("span", "wiki-type", item.typeName));
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

  const choose = (i: number) => {
    if (!active || !view) return;
    const item = active.items[i];
    const { state } = view;
    const tr = state.tr.replaceWith(active.from, active.to, state.schema.text(item.name, [mark.create({ id: item.id })]));
    tr.setStoredMarks([]);
    active = null;
    view.dispatch(tr);
    render();
  };

  const compute = (v: EditorView) => {
    const { selection } = v.state;
    const $from = selection.$from;
    if (!selection.empty || !$from.parent.isTextblock || !$from.parent.type.allowsMarkType(mark)) return null;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
    const m = TRIGGER.exec(before);
    const src = source();
    if (!m || !src) return null;
    const from = $from.pos - m[1].length - m[2].length;
    if (from === dismissedAt) return null;
    const items = src.search(m[2].trim()).slice(0, 8);
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
          const next = compute(v);
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
    props: {
      handleKeyDown(_v, e) {
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
