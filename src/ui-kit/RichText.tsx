import { useEffect, useRef } from "react";
import { baseKeymap, setBlockType, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { DOMSerializer, Schema, type Node as PMNode } from "prosemirror-model";
import { EditorState, type Command, type Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

/** Rich text of the documents and bible entries: paragraphs, headings, bold, italic, wiki links. */
export const richSchema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", parseDOM: [{ tag: "p" }], toDOM: () => ["p", 0] },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 2 } },
      defining: true,
      parseDOM: [1, 2, 3].map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (n) => [`h${n.attrs.level}`, 0],
    },
    text: { group: "inline" },
    hard_break: { inline: true, group: "inline", selectable: false, parseDOM: [{ tag: "br" }], toDOM: () => ["br"] },
  },
  marks: {
    strong: { parseDOM: [{ tag: "strong" }, { tag: "b" }], toDOM: () => ["strong", 0] },
    em: { parseDOM: [{ tag: "em" }, { tag: "i" }], toDOM: () => ["em", 0] },
    wikilink: {
      attrs: { id: {} },
      inclusive: false,
      parseDOM: [{ tag: "span.wikilink", getAttrs: (dom) => ({ id: (dom as HTMLElement).dataset.id }) }],
      toDOM: (mark) => ["span", { class: "wikilink", "data-id": mark.attrs.id }, 0],
    },
  },
});

export const EMPTY_RICH = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

export function richDoc(json: string | null | undefined): PMNode {
  try {
    const node = richSchema.nodeFromJSON(JSON.parse(json || EMPTY_RICH));
    node.check();
    return node;
  } catch {
    return richSchema.nodeFromJSON(JSON.parse(EMPTY_RICH));
  }
}

/** A rich text document built from headings and paragraphs (treatment skeleton). */
export function richFromParts(parts: { heading?: string; text?: string }[]): string {
  const content: unknown[] = [];
  for (const p of parts) {
    if (p.heading !== undefined) content.push({ type: "heading", attrs: { level: 2 }, content: p.heading ? [{ type: "text", text: p.heading }] : [] });
    if (p.text !== undefined) content.push({ type: "paragraph", content: p.text ? [{ type: "text", text: p.text }] : [] });
  }
  return JSON.stringify({ type: "doc", content: content.length ? content : [{ type: "paragraph" }] });
}

/** Appends the blocks of `extra` at the end of `json`. */
export function richAppend(json: string, extra: string): string {
  const a = JSON.parse(json || EMPTY_RICH);
  const b = JSON.parse(extra);
  const keep = a.content.filter((n: { content?: unknown[] }, i: number) => !(i === a.content.length - 1 && !n.content?.length));
  return JSON.stringify({ type: "doc", content: [...keep, ...b.content] });
}

export function richHtml(json: string): string {
  const div = document.createElement("div");
  div.appendChild(DOMSerializer.fromSchema(richSchema).serializeFragment(richDoc(json).content));
  return div.innerHTML;
}

export function richPlainText(json: string): string {
  const doc = richDoc(json);
  const parts: string[] = [];
  doc.forEach((b) => parts.push(b.textContent));
  return parts.join("\n");
}

export function wordCount(text: string): number {
  return text.split(/[\s ]+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** About 300 words per typed page of a document, synopsis or treatment. */
export function pagesOf(words: number): number {
  return Math.round((words / 300) * 10) / 10;
}

const heading =
  (level: number): Command =>
  (state, dispatch) =>
    setBlockType(richSchema.nodes.heading, { level })(state, dispatch);

export function RichText({
  value,
  onChange,
  label,
  placeholder,
  plugins = [],
  minHeight,
  className,
}: {
  /** Read once: give the component a `key` to load another document. */
  value: string;
  onChange: (json: string) => void;
  label: string;
  placeholder?: string;
  plugins?: Plugin[];
  minHeight?: number;
  className?: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const v = new EditorView(mount.current!, {
      state: EditorState.create({
        doc: richDoc(value),
        plugins: [
          history(),
          keymap({
            "Mod-z": undo,
            "Mod-y": redo,
            "Shift-Mod-z": redo,
            "Mod-b": toggleMark(richSchema.marks.strong),
            "Mod-i": toggleMark(richSchema.marks.em),
            "Mod-Alt-1": heading(1),
            "Mod-Alt-2": heading(2),
            "Mod-Alt-0": setBlockType(richSchema.nodes.paragraph),
            "Shift-Enter": (state, dispatch) => {
              dispatch?.(state.tr.replaceSelectionWith(richSchema.nodes.hard_break.create()).scrollIntoView());
              return true;
            },
          }),
          ...plugins,
          keymap(baseKeymap),
        ],
      }),
      attributes: { "aria-label": label, role: "textbox", "aria-multiline": "true", class: "rich-text", "data-placeholder": placeholder ?? "" },
      dispatchTransaction(tr) {
        const next = v.state.apply(tr);
        v.updateState(next);
        if (tr.docChanged) change.current(JSON.stringify(next.doc.toJSON()));
      },
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The document is read once; plugins are created by the parent with the same lifetime.
  }, []);

  const run = (cmd: Command) => () => {
    const v = view.current;
    if (!v) return;
    cmd(v.state, v.dispatch);
    v.focus();
  };

  return (
    <div className={`rich ${className ?? ""}`}>
      <div className="rich-toolbar" role="toolbar" aria-label={label}>
        <button type="button" className="btn ghost small" onMouseDown={(e) => e.preventDefault()} onClick={run(heading(2))} title="Ctrl+Alt+2">
          Titre
        </button>
        <button type="button" className="btn ghost small" onMouseDown={(e) => e.preventDefault()} onClick={run(setBlockType(richSchema.nodes.paragraph))} title="Ctrl+Alt+0">
          Paragraphe
        </button>
        <button type="button" className="btn ghost small" onMouseDown={(e) => e.preventDefault()} onClick={run(toggleMark(richSchema.marks.strong))} title="Ctrl+B">
          <strong>G</strong>
        </button>
        <button type="button" className="btn ghost small" onMouseDown={(e) => e.preventDefault()} onClick={run(toggleMark(richSchema.marks.em))} title="Ctrl+I">
          <em>I</em>
        </button>
        <span className="muted small rich-hint">@ ou [[ pour lier une fiche</span>
      </div>
      <div ref={mount} className="rich-mount" style={minHeight ? { minHeight } : undefined} />
    </div>
  );
}
