import { Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { describeError } from "../../../core/errors";
import { t } from "../../../core/i18n";
import { confirmRemoval } from "../../../ui-kit/Dialog";
import { useProject } from "../../project/ui/projectContext";
import { useCategories, writeCategories } from "../application/breakdown";
import { categoryName, STANDARD_CATEGORIES, type Category } from "../domain/breakdown";
import { Field } from "./parts";

/** A colour, saved once the picker closes rather than at each step of its drag. */
function ColorField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => setDraft(value), [value]);
  // React's onChange follows the drag; the native event comes when the choice is made.
  useEffect(() => {
    const el = input.current;
    const done = () => el && commit.current(el.value);
    el?.addEventListener("change", done);
    return () => el?.removeEventListener("change", done);
  }, []);
  return <input ref={input} type="color" value={draft} aria-label={label} onChange={(e) => setDraft(e.target.value)} />;
}

/** The categories of the project: their names, colours, the ones not used hidden, and the project's own [DEP-02]. */
export function CategoriesEditor() {
  const { notify, ask } = useProject();
  const list = useCategories();
  const [name, setName] = useState("");
  if (!list) return null;
  const write = (next: Category[]) => void writeCategories(next).catch((e) => notify({ text: describeError(e), tone: "error" }));
  const set = (id: string, p: Partial<Category>) => write(list.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const add = () => {
    if (!name.trim()) return;
    write([...list, { id: `own-${Date.now().toString(36)}`, name: name.trim(), color: "#6a7a8c" }]);
    setName("");
  };
  return (
    <section className="set-group">
      <ul className="set-card pr-cat-edit">
        {list.map((c) => {
          const standard = STANDARD_CATEGORIES.find((s) => s.id === c.id);
          return (
            <li key={c.id} className={c.hidden ? "off" : ""}>
              <ColorField label={t("breakdown.colorOf", { name: categoryName(c) })} value={c.color} onCommit={(color) => set(c.id, { color })} />
              <Field
                label={t("breakdown.nameOf", { name: categoryName(c) })}
                hideLabel
                value={c.name}
                placeholder={standard ? t(`breakdown.categories.${c.id}`) : ""}
                onCommit={(v) => set(c.id, { name: v.trim() })}
              />
              <label className="choice">
                <input type="checkbox" className="switch" checked={!c.hidden} onChange={(e) => set(c.id, { hidden: !e.target.checked })} />
                <span className="visually-hidden">{t("breakdown.shown", { name: categoryName(c) })}</span>
              </label>
              {standard ? (
                <button
                  type="button"
                  className="btn tiny ghost"
                  title={t("breakdown.resetCategory")}
                  aria-label={t("breakdown.resetCategory")}
                  disabled={c.name === "" && c.color === standard.color && !c.hidden}
                  onClick={() => set(c.id, { name: "", color: standard.color, hidden: false })}
                >
                  <RotateCcw aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn tiny ghost"
                  title={t("breakdown.deleteCategory")}
                  aria-label={t("breakdown.deleteCategory")}
                  onClick={async () => {
                    if (await confirmRemoval(ask, { title: t("breakdown.deleteCategoryTitle", { name: categoryName(c) }), text: t("breakdown.deleteCategoryText") }))
                      write(list.filter((x) => x.id !== c.id));
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
        <li className="pr-cat-new">
          <input
            type="text"
            value={name}
            placeholder={t("breakdown.newCategory")}
            aria-label={t("breakdown.newCategory")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" className="btn" disabled={!name.trim()} onClick={add}>
            <Plus aria-hidden="true" />
            {t("common.add")}
          </button>
        </li>
      </ul>
    </section>
  );
}
