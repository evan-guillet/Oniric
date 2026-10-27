import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";
import { describeError } from "../../../../core/errors";
import { useProject } from "../../../project/ui/projectContext";
import { deleteType, saveType } from "../application/bible";
import { FIELD_KINDS, fieldKey, pluralize, type EntryType, type FieldDef, type FieldKind } from "../domain/types";
import { TYPE_ICONS } from "./typeIcons";

import { Dialog } from "../../../../ui-kit/Dialog";
import { Select } from "../../../../ui-kit/Select";

/**
 * A type of entry, its icon and its fields, in a modal [5.2, « Type personnalisé »]: a new one without `type`.
 * Built-in types are not edited here.
 */
export function TypeDialog({ type, types, onClose }: { type?: EntryType; types: EntryType[]; onClose: (savedId?: string) => void }) {
  const { notify, ask } = useProject();
  const [name, setName] = useState(type?.name ?? "");
  const [icon, setIcon] = useState(type?.icon || "file");
  const [fields, setFields] = useState<FieldDef[]>(type?.fields ?? []);
  const patch = (i: number, p: Partial<FieldDef>) => setFields(fields.map((f, k) => (k === i ? { ...f, ...p } : f)));
  const move = (i: number, d: number) => {
    const next = [...fields];
    const [f] = next.splice(i, 1);
    next.splice(i + d, 0, f);
    setFields(next);
  };
  const save = async () => {
    try {
      const keyed = fields.map((f, i) => (f.key ? f : { ...f, key: fieldKey(f.label, fields.filter((_, k) => k !== i).map((x) => x.key)) }));
      const id = await saveType({ id: type?.id, name, icon, fields: keyed.filter((f) => f.label.trim()) });
      onClose(id);
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  const remove = async () => {
    const c = await ask({
      title: "Supprimer ce type ?",
      text: <p>Les fiches de ce type sont conservées ; leurs champs propres restent enregistrés mais ne sont plus affichés.</p>,
      cancel: "Annuler",
      choices: [{ label: "Supprimer", value: "y", danger: true }],
    });
    if (c !== "y" || !type) return;
    try {
      await deleteType(type.id);
      onClose();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <Dialog
      title={type ? `Modifier le type « ${type.name} »` : "Nouveau type"}
      wide
      className="type-dialog"
      onCancel={() => onClose()}
      actions={[
        ...(type ? [{ label: "Supprimer le type", danger: true, onClick: () => void remove() }] : []),
        { label: "Annuler", onClick: () => onClose() },
        { label: type ? "Enregistrer" : "Créer le type", primary: true, disabled: !name.trim(), onClick: () => void save() },
      ]}
    >
      <div className="type-form">
        <label className="field">
          <span>Nom du type</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Planète, sortilège, recette…" data-autofocus />
          {name.trim() && <span className="fld-help">Au pluriel, sur sa carte : {pluralize(name)}</span>}
        </label>
        <div className="field">
          <span id="type-icon-label">Icône</span>
          <div className="icon-picker" role="radiogroup" aria-labelledby="type-icon-label">
            {Object.entries(TYPE_ICONS).map(([key, { icon: Icon, label }]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={icon === key}
                aria-label={label}
                title={label}
                className={icon === key ? "icon-choice on" : "icon-choice"}
                onClick={() => setIcon(key)}
              >
                <Icon aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
        <table className="fields-table">
          <thead>
            <tr>
              <th>Champ</th>
              <th>Nature</th>
              <th>Précision</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={i}>
                <td>
                  <input value={f.label} onChange={(e) => patch(i, { label: e.target.value })} aria-label="Nom du champ" />
                </td>
                <td>
                  <Select value={f.kind} onChange={(e) => patch(i, { kind: e.target.value as FieldKind })} aria-label="Nature du champ">
                    {FIELD_KINDS.map((k) => (
                      <option key={k.kind} value={k.kind}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  {f.kind === "list" && (
                    <input
                      value={(f.options ?? []).join(", ")}
                      placeholder="choix 1, choix 2…"
                      onChange={(e) => patch(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                      aria-label="Choix"
                    />
                  )}
                  {(f.kind === "link" || f.kind === "links") && (
                    <Select value={f.target ?? ""} onChange={(e) => patch(i, { target: e.target.value || undefined })} aria-label="Type des fiches liées">
                      <option value="">Tout type</option>
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </td>
                <td className="row-actions">
                  <button type="button" className="btn ghost small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button type="button" className="btn ghost small" disabled={i === fields.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">
                    <ArrowDown aria-hidden="true" />
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setFields(fields.filter((_, k) => k !== i))} aria-label="Retirer le champ">
                    <X aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn small" onClick={() => setFields([...fields, { key: "", label: "", kind: "text" }])}>
          <Plus aria-hidden="true" />
          Ajouter un champ
        </button>
      </div>
    </Dialog>
  );
}
