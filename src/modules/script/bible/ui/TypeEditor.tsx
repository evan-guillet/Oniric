import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";
import { describeError } from "../../../../core/errors";
import { useProject } from "../../../project/ui/projectContext";
import { deleteType, saveType } from "../application/bible";
import { FIELD_KINDS, fieldKey, pluralize, type EntryType, type FieldDef, type FieldKind } from "../domain/types";
import { iconOf, TYPE_ICONS } from "./typeIcons";

const blank: EntryType = { id: "", name: "", plural: "", icon: "file", builtin: false, fields: [] };

/** Custom entry types, their icon and their fields [5.2, « Type personnalisé »]. `startNew` opens on a new type. */
export function TypeEditor({ types, startNew = false }: { types: EntryType[]; startNew?: boolean }) {
  const custom = types.filter((t) => !t.builtin);
  const [editing, setEditing] = useState<EntryType | null>(startNew ? blank : null);
  return (
    <section className="panel">
      <h2>Types de fiches</h2>
      <p className="muted">
        Oniric fournit les types courants (personnage, lieu, objet…). Créez vos propres types, avec leurs champs, pour ce que votre univers demande.
      </p>
      <h3>Fournis</h3>
      <p className="small">{types.filter((t) => t.builtin).map((t) => t.name).join(", ")}</p>
      <h3>Personnalisés</h3>
      {custom.length === 0 && <p className="muted small">Aucun pour l'instant.</p>}
      <ul className="type-list">
        {custom.map((t) => (
          <li key={t.id}>
            <TypeIcon type={t} />
            <span>
              <strong>{t.name}</strong> <span className="muted small">{t.fields.map((f) => f.label).join(", ") || "aucun champ"}</span>
            </span>
            <button type="button" className="btn small" onClick={() => setEditing(t)}>
              Modifier
            </button>
          </li>
        ))}
      </ul>
      {!editing && (
        <button type="button" className="btn" onClick={() => setEditing(blank)}>
          <Plus aria-hidden="true" />
          Nouveau type
        </button>
      )}
      {editing && <TypeForm key={editing.id || "new"} type={editing} types={types} onDone={() => setEditing(null)} />}
    </section>
  );
}

function TypeIcon({ type }: { type: EntryType }) {
  const Icon = iconOf(type);
  return (
    <span className="type-list-icon">
      <Icon aria-hidden="true" />
    </span>
  );
}

function TypeForm({ type, types, onDone }: { type: EntryType; types: EntryType[]; onDone: () => void }) {
  const { notify, ask } = useProject();
  const [name, setName] = useState(type.name);
  const [icon, setIcon] = useState(type.icon || "file");
  const [fields, setFields] = useState<FieldDef[]>(type.fields);
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
      await saveType({ id: type.id || undefined, name, icon, fields: keyed.filter((f) => f.label.trim()) });
      onDone();
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
    if (c === "y") {
      await deleteType(type.id);
      onDone();
    }
  };
  return (
    <div className="type-form">
      <label className="field">
        <span>Nom du type</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Planète, sortilège, recette…" autoFocus />
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
              className={icon === key ? "icon-choice on" : "icon-choice"}
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
                <select value={f.kind} onChange={(e) => patch(i, { kind: e.target.value as FieldKind })} aria-label="Nature du champ">
                  {FIELD_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
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
                  <select value={f.target ?? ""} onChange={(e) => patch(i, { target: e.target.value || undefined })} aria-label="Type des fiches liées">
                    <option value="">Tout type</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
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
      <div className="form-actions">
        <button type="button" className="btn small" onClick={() => setFields([...fields, { key: "", label: "", kind: "text" }])}>
          <Plus aria-hidden="true" />
          Ajouter un champ
        </button>
        <span className="spacer" />
        {type.id && (
          <button type="button" className="btn ghost danger small" onClick={() => void remove()}>
            Supprimer le type
          </button>
        )}
        <button type="button" className="btn small" onClick={onDone}>
          Annuler
        </button>
        <button type="button" className="btn primary small" disabled={!name.trim()} onClick={() => void save()}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}
