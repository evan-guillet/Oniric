import { Plus, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { t } from "../../../core/i18n";
import { useCatalog, writeCatalog } from "../application/team";
import { addRole, catalogRoles, DEPARTMENTS, departmentName, removeRole, rolesOf } from "../domain/catalog";

/** The posts of each department, the project's own added and those it does not use taken away [EQU-03].
 *  It lives in the settings of the project: the team proposes Oniric's posts and takes new ones as it goes. */
export function CatalogEditor() {
  const catalog = useCatalog();
  const [dept, setDept] = useState<string>(DEPARTMENTS[0]);
  const [name, setName] = useState("");
  const roles = rolesOf(dept, catalog);
  const own = new Set(catalog[dept]?.added ?? []);
  const removed = catalogRoles(dept).filter((r) => catalog[dept]?.removed?.includes(r));
  const add = () => {
    if (!name.trim()) return;
    void writeCatalog(addRole(catalog, dept, name));
    setName("");
  };
  return (
    <div className="pr-catalog">
      <ul className="pr-catalog-depts" role="listbox" aria-label={t("team.department")}>
        {DEPARTMENTS.map((d) => (
          <li key={d}>
            <button type="button" role="option" aria-selected={d === dept} className={d === dept ? "on" : ""} onClick={() => setDept(d)}>
              {departmentName(d)}
              <span className="pr-count">{rolesOf(d, catalog).length}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="pr-catalog-roles">
        <ul aria-label={t("team.postsOf", { department: departmentName(dept) })}>
          {roles.map((r) => (
            <li key={r}>
              <span>
                {r}
                {own.has(r) && <span className="badge pr-own">{t("team.ownRole")}</span>}
              </span>
              <button type="button" className="btn tiny ghost" title={t("team.removeRole", { role: r })} aria-label={t("team.removeRole", { role: r })} onClick={() => void writeCatalog(removeRole(catalog, dept, r))}>
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {removed.length > 0 && (
          <div className="pr-catalog-removed">
            <span className="muted small">{t("team.removedRoles")}</span>
            {removed.map((r) => (
              <button key={r} type="button" className="btn tiny ghost" title={t("team.restoreRole", { role: r })} onClick={() => void writeCatalog(addRole(catalog, dept, r))}>
                <RotateCcw aria-hidden="true" />
                {r}
              </button>
            ))}
          </div>
        )}
        <div className="input-row">
          <input
            type="text"
            value={name}
            placeholder={t("team.newRole")}
            aria-label={t("team.newRole")}
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
        </div>
      </div>
    </div>
  );
}
