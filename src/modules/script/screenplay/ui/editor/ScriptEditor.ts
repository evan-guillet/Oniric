import { EditorState, Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { EditorView, DecorationSet } from "prosemirror-view";
import { history } from "prosemirror-history";
import { Fragment, type Mark, type Node as PMNode } from "prosemirror-model";
import type { ElementType, ScreenplayFormat } from "../../domain/formats";
import { paginate } from "../../domain/paginate";
import type { LaidBlock, Pagination } from "../../domain/types";
import { Measurer } from "./measure";
import { currentType, elementInputRules, placeholderPlugin, sceneNormalizer, screenplayKeymap, setType, typographyPlugin } from "./keymap";
import { pageDecorations } from "./pageDecorations";
import { newScene, schema, sceneFromStored } from "./schema";
import { frenchTypography, getWritingPrefs } from "../../../../../core/writingPrefs";

const pagesKey = new PluginKey<DecorationSet>("pages");

const pagesPlugin = new Plugin<DecorationSet>({
  key: pagesKey,
  state: {
    init: () => DecorationSet.empty,
    apply: (tr, old) => tr.getMeta(pagesKey) ?? old.map(tr.mapping, tr.doc),
  },
  props: { decorations: (state) => pagesKey.getState(state) },
});

export interface LayoutStats {
  measureMs: number;
  paginateMs: number;
  measuredBlocks: number;
  blocks: number;
  pages: number;
}

export interface EditorSnapshot {
  pagination: Pagination;
  blocks: LaidBlock[];
  headings: string[];
  stats: LayoutStats;
  type: ElementType;
  /** Scene that holds the cursor. */
  sceneIndex: number;
}

export interface EditorHooks {
  onUpdate(s: EditorSnapshot): void;
  /** Called after every change of the text, never for a selection move. */
  onDocChange(doc: PMNode): void;
  hint(type: ElementType): string;
  /** Plugins of other modules: wiki links, notes. */
  plugins?: Plugin[];
}

export interface MarkSpan {
  id: string;
  from: number;
  to: number;
  sceneId: string;
  text: string;
}

/** The screenplay editor: ProseMirror, with the pages computed by the shared layout engine (architecture, 8.2). */
export class ScriptEditor {
  readonly view: EditorView;
  private measurer: Measurer;
  private laid: LaidBlock[] = [];
  private pagination!: Pagination;
  private headings: string[] = [];
  private stats!: LayoutStats;
  private keyDownAt = 0;
  /** The desk that scrolls, when the line being typed is held in its middle. */
  private typewriter: HTMLElement | null = null;
  /** The last selection came from the keyboard, not from a click: only typing moves the desk. */
  private byKey = false;
  readonly latencies: number[] = [];

  constructor(
    mount: HTMLElement,
    private format: ScreenplayFormat,
    doc: PMNode,
    private readonly hooks: EditorHooks,
  ) {
    this.measurer = new Measurer(format);
    this.view = new EditorView(mount, {
      state: this.createState(doc),
      attributes: () => this.attributes(),
      dispatchTransaction: (tr) => {
        this.view.updateState(this.view.state.apply(tr));
        if (this.byKey && (tr.docChanged || tr.selectionSet)) this.centerCaret();
        if (tr.docChanged) {
          this.relayout();
          this.hooks.onDocChange(this.view.state.doc);
        } else if (!tr.getMeta(pagesKey)) {
          this.emit();
        }
      },
      handleDOMEvents: {
        keydown: () => {
          this.keyDownAt = performance.now();
          this.byKey = true;
          return false;
        },
        mousedown: () => {
          this.byKey = false;
          return false;
        },
      },
    });
    this.relayout();
  }

  private createState(doc: PMNode): EditorState {
    return EditorState.create({
      doc,
      plugins: [
        ...(this.hooks.plugins ?? []),
        history(),
        ...screenplayKeymap(),
        elementInputRules,
        typographyPlugin(() => frenchTypography(getWritingPrefs(), this.format.language)),
        sceneNormalizer,
        placeholderPlugin((t) => this.hooks.hint(t)),
        pagesPlugin,
      ],
    });
  }

  private attributes(): Record<string, string> {
    const spell = getWritingPrefs().spellcheck;
    return { spellcheck: spell ? "true" : "false", lang: this.format.language, "aria-label": "Scénario", role: "textbox", "aria-multiline": "true" };
  }

  /** Reads the writing preferences again (spelling, typography). */
  refreshPrefs(): void {
    this.view.setProps({ attributes: () => this.attributes() });
  }

  /** Holds the line being typed in the middle of `desk`, or stops with null. */
  setTypewriter(desk: HTMLElement | null): void {
    this.typewriter = desk;
    if (desk && this.view.hasFocus()) this.centerCaret();
  }

  private centerCaret(): void {
    const desk = this.typewriter;
    if (!desk) return;
    requestAnimationFrame(() => {
      if (this.view.isDestroyed) return;
      const at = this.view.coordsAtPos(this.view.state.selection.head);
      const box = desk.getBoundingClientRect();
      desk.scrollTop += (at.top + at.bottom) / 2 - (box.top + box.height / 2);
    });
  }

  get doc(): PMNode {
    return this.view.state.doc;
  }

  get currentFormat(): ScreenplayFormat {
    return this.format;
  }

  setFormat(format: ScreenplayFormat): void {
    this.measurer.dispose();
    this.format = format;
    this.measurer = new Measurer(format);
    this.refreshPrefs();
    this.relayout();
  }

  setType(type: ElementType): void {
    setType(type)(this.view.state, this.view.dispatch);
    this.view.focus();
  }

  /** Replaces the whole screenplay in one step that Ctrl+Z can undo (imports). */
  replaceContent(doc: PMNode): void {
    const state = this.view.state;
    this.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, doc.content).scrollIntoView());
  }

  /** Adds the scenes of `doc` after the last one, in one step that Ctrl+Z can undo. */
  appendDoc(doc: PMNode): void {
    const state = this.view.state;
    const lone = state.doc.childCount === 1 && state.doc.firstChild!.textContent === "";
    if (lone) this.replaceContent(doc);
    else this.view.dispatch(state.tr.insert(state.doc.content.size, doc.content).scrollIntoView());
  }

  /** Puts the cursor at the end of the first element of scene `index` and shows it. */
  goToScene(index: number): void {
    let pos = -1;
    this.view.state.doc.forEach((scene, offset, i) => {
      if (i === index) pos = offset + 1 + (scene.firstChild?.nodeSize ?? 2) - 1;
    });
    if (pos < 0) return;
    const tr = this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, pos));
    this.view.dispatch(tr);
    this.view.focus();
    const { node } = this.view.domAtPos(pos);
    const el = node instanceof Element ? node : node.parentElement;
    el?.closest(".el")?.scrollIntoView({ block: "center" });
  }

  focus(): void {
    this.view.focus();
  }

  sceneIds(): string[] {
    const ids: string[] = [];
    this.doc.forEach((scene) => ids.push(scene.attrs.id as string));
    return ids;
  }

  indexOfScene(id: string): number {
    return this.sceneIds().indexOf(id);
  }

  goToSceneId(id: string): void {
    const i = this.indexOfScene(id);
    if (i >= 0) this.goToScene(i);
  }

  private replaceScenes(nodes: PMNode[]): void {
    const state = this.view.state;
    this.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, Fragment.from(nodes)));
  }

  /** Puts the scenes in the order of `ids`, in one step that Ctrl+Z can undo; scenes not listed keep their place at the end. */
  moveScenes(ids: string[]): boolean {
    const byId = new Map<string, PMNode>();
    this.doc.forEach((scene) => byId.set(scene.attrs.id as string, scene));
    const ordered = ids.map((id) => byId.get(id)).filter((n): n is PMNode => !!n);
    const listed = new Set(ids);
    this.doc.forEach((scene) => {
      if (!listed.has(scene.attrs.id as string)) ordered.push(scene);
    });
    if (ordered.every((n, i) => this.doc.child(i) === n)) return false;
    this.replaceScenes(ordered);
    return true;
  }

  /** A new scene at `index` (the end when beyond), with `heading`; returns its id [VUE-06]. */
  insertScene(index: number, heading = "", stored?: { id: string; content: string }): string {
    const node = stored ? sceneFromStored(stored.id, stored.content) : newScene(heading);
    const doc = this.doc;
    const lone = doc.childCount === 1 && doc.firstChild!.textContent === "" && !stored;
    if (lone) {
      this.replaceScenes([node]);
      return node.attrs.id as string;
    }
    let pos = doc.content.size;
    doc.forEach((_scene, offset, i) => {
      if (i === index) pos = offset;
    });
    const state = this.view.state;
    this.view.dispatch(state.tr.insert(pos, node));
    return node.attrs.id as string;
  }

  /** Rewrites the scene heading of scene `id`, adding one when the scene opens on something else. */
  setSceneHeading(id: string, heading: string): void {
    this.doc.forEach((scene, offset) => {
      if (scene.attrs.id !== id) return;
      const state = this.view.state;
      const node = schema.nodes.scene_heading.create(null, heading ? [schema.text(heading)] : []);
      const first = scene.firstChild;
      if (first?.type === schema.nodes.scene_heading) this.view.dispatch(state.tr.replaceWith(offset + 1, offset + 1 + first.nodeSize, node));
      else this.view.dispatch(state.tr.insert(offset + 1, node));
    });
  }

  removeScene(id: string): void {
    const doc = this.doc;
    doc.forEach((scene, offset) => {
      if (scene.attrs.id !== id) return;
      const state = this.view.state;
      if (doc.childCount === 1) this.replaceScenes([newScene()]);
      else this.view.dispatch(state.tr.delete(offset, offset + scene.nodeSize));
    });
  }

  /** Replaces the whole screenplay by stored scenes (a frozen version), in one step that Ctrl+Z can undo. */
  restoreScenes(scenes: { id: string; content: string }[]): void {
    const nodes = scenes.map((s) => sceneFromStored(s.id, s.content));
    this.replaceScenes(nodes.length > 0 ? nodes : [newScene()]);
  }

  /** Pages of the screenplay in another format, without touching the editor (export in another format) [EDT-02]. */
  paginationFor(format: ScreenplayFormat): { pagination: Pagination; blocks: LaidBlock[] } {
    if (format.id === this.format.id && JSON.stringify(format) === JSON.stringify(this.format)) return { pagination: this.pagination, blocks: this.laid };
    const measurer = new Measurer(format);
    try {
      const laid: LaidBlock[] = [];
      this.doc.forEach((scene, _o, sceneIndex) =>
        scene.forEach((b) => laid.push({ type: b.type.name as ElementType, text: b.textContent, lineStarts: measurer.lineStarts(b.type.name as ElementType, b.textContent), sceneIndex })),
      );
      return { pagination: paginate(laid, format), blocks: laid };
    } finally {
      measurer.dispose();
    }
  }

  /** The selected text, or the whole element under the cursor when nothing is selected. */
  selectionRange(): { from: number; to: number; text: string; sceneId: string } | null {
    const { $from, $to, empty } = this.view.state.selection;
    if ($from.depth < 2) return null;
    const sceneId = $from.node(1).attrs.id as string;
    const from = empty ? $from.start() : $from.pos;
    const to = empty ? $from.end() : $to.pos;
    if (to <= from) return null;
    return { from, to, text: this.doc.textBetween(from, to, " "), sceneId };
  }

  addMark(from: number, to: number, mark: Mark): void {
    this.view.dispatch(this.view.state.tr.addMark(from, to, mark));
  }

  /** Every passage carrying a mark of `type` (`note`, `wikilink`), in document order. */
  marks(type: "note" | "wikilink"): MarkSpan[] {
    const markType = schema.marks[type];
    const spans = new Map<string, MarkSpan>();
    this.doc.forEach((scene, sceneOffset) => {
      scene.descendants((node, pos) => {
        if (!node.isText) return;
        const m = markType.isInSet(node.marks);
        if (!m) return;
        const id = m.attrs.id as string;
        const from = sceneOffset + 1 + pos;
        const to = from + node.nodeSize;
        const span = spans.get(id);
        if (span) {
          span.to = to;
          span.text += node.text ?? "";
        } else {
          spans.set(id, { id, from, to, sceneId: scene.attrs.id as string, text: node.text ?? "" });
        }
      });
    });
    return [...spans.values()];
  }

  removeMarkById(type: "note" | "wikilink", id: string): void {
    const markType = schema.marks[type];
    const tr = this.view.state.tr;
    for (const span of this.marks(type).filter((s) => s.id === id)) tr.removeMark(span.from, span.to, markType);
    if (tr.docChanged) this.view.dispatch(tr);
  }

  /** Selects a passage and shows it. */
  reveal(from: number, to: number): void {
    const doc = this.doc;
    if (to > doc.content.size) return;
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.create(doc, from, to)));
    this.view.focus();
    const { node } = this.view.domAtPos(from);
    const el = node instanceof Element ? node : node.parentElement;
    el?.closest(".el")?.scrollIntoView({ block: "center" });
  }

  relayout(): void {
    const t0 = performance.now();
    const before = this.measurer.measuredCount;
    const laid: LaidBlock[] = [];
    const headings: string[] = [];
    this.view.state.doc.forEach((scene, _o, sceneIndex) => {
      headings.push(scene.firstChild?.type.name === "scene_heading" ? scene.firstChild.textContent : "");
      scene.forEach((b) => {
        const type = b.type.name as ElementType;
        const text = b.textContent;
        laid.push({ type, text, lineStarts: this.measurer.lineStarts(type, text), sceneIndex });
      });
    });
    const t1 = performance.now();
    const pagination = paginate(laid, this.format);
    const t2 = performance.now();
    this.laid = laid;
    this.headings = headings;
    this.pagination = pagination;
    this.stats = {
      measureMs: t1 - t0,
      paginateMs: t2 - t1,
      measuredBlocks: this.measurer.measuredCount - before,
      blocks: laid.length,
      pages: pagination.pages.length,
    };
    const tr = this.view.state.tr.setMeta(pagesKey, pageDecorations(this.view.state.doc, pagination, this.format));
    tr.setMeta("addToHistory", false);
    this.view.dispatch(tr);
    if (this.keyDownAt > 0) {
      const start = this.keyDownAt;
      this.keyDownAt = 0;
      requestAnimationFrame(() => {
        this.latencies.push(performance.now() - start);
        if (this.latencies.length > 200) this.latencies.shift();
      });
    }
    this.emit();
  }

  get snapshot(): EditorSnapshot {
    return {
      pagination: this.pagination,
      blocks: this.laid,
      headings: this.headings,
      stats: this.stats,
      type: currentType(this.view.state),
      sceneIndex: this.view.state.selection.$from.index(0),
    };
  }

  private emit(): void {
    this.hooks.onUpdate(this.snapshot);
  }

  destroy(): void {
    this.view.destroy();
    this.measurer.dispose();
  }
}
