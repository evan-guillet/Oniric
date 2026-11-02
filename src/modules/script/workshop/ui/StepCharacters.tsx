import { X } from "lucide-react";
import { useLive } from "../../../../core/db/live";
import { describeError } from "../../../../core/errors";
import { useDebounced } from "../../../../ui-kit/Form";
import { confirmRemoval } from "../../../../ui-kit/Dialog";
import { useProject } from "../../../project/ui/projectContext";
import { createEntry, loadEntries, setEntryField, type Entry } from "../../bible/application/bible";
import { choiceLabel, DRAMATIC_FUNCTIONS, OPPOSITION_KINDS } from "../domain/steps";
import { Help, useWorkshop, WText } from "./fields";
import { RelationMap } from "./RelationMap";

import { Select } from "../../../../ui-kit/Select";
import { t } from "../../../../core/i18n";
interface Secondary {
  entryId: string;
  role: string;
}

/** Step 2: protagonist, opposition, secondary characters, relationship map [PER-01 to PER-05]. */
export function StepCharacters() {
  const w = useWorkshop();
  const { notify, ask, openEntry, prompt } = useProject();
  const entries = useLive(loadEntries, ["bible_entry"]) ?? [];
  const characters = entries.filter((e) => e.type === "character" && !e.archivedAt);
  const protagonist = characters.find((c) => c.id === w.get("char.protagonist", ""));
  const antagonist = characters.find((c) => c.id === w.get("char.antagonist", ""));
  const secondary = w.get<Secondary[]>("char.secondary", []);

  const pickOrCreate = async (value: string, key: string) => {
    if (value === "__new") {
      const name = await prompt(t("chars.new"), t("chars.name"));
      if (!name?.trim()) return;
      try {
        const id = await createEntry("character", name);
        w.set(key, id);
      } catch (e) {
        notify({ text: describeError(e), tone: "error" });
      }
    } else w.set(key, value);
  };

  const select = (key: string, current?: Entry) => (
    <Select value={current?.id ?? ""} onChange={(e) => void pickOrCreate(e.target.value, key)}>
      <option value="">{t("chars.choose")}</option>
      {characters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__new">{t("chars.newOption")}</option>
    </Select>
  );

  return (
    <div className="step-body">
      <section className="step-section">
        <h3>{t("chars.protagonist")}</h3>
        <Help>{t("chars.protagonistHelp")}</Help>
        {select("char.protagonist", protagonist)}
        {protagonist && <CharacterSheet entry={protagonist} keys={["desire", "need", "flaw", "arc_start", "arc_end"]} onOpen={() => openEntry(protagonist.id)} />}
      </section>

      <section className="step-section">
        <h3>{t("chars.antagonistTitle")}</h3>
        <Help>{t("chars.antagonistHelp")}</Help>
        <div className="grid-2">
          <label className="fld">
            <span className="fld-label">{t("chars.oppositionKind")}</span>
            <Select value={w.get("char.opposition", "Personne")} onChange={(e) => w.set("char.opposition", e.target.value)}>
              {OPPOSITION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {choiceLabel("oppositions", k)}
                </option>
              ))}
            </Select>
          </label>
          {w.get("char.opposition", "Personne") === "Personne" && (
            <label className="fld">
              <span className="fld-label">{t("chars.antagonist")}</span>
              {select("char.antagonist", antagonist)}
            </label>
          )}
        </div>
        <WText k="char.opposition_text" label={t("chars.oppositionText")} rows={2} />
        {antagonist && w.get("char.opposition", "Personne") === "Personne" && (
          <CharacterSheet entry={antagonist} keys={["desire", "motivations", "flaw"]} onOpen={() => openEntry(antagonist.id)} />
        )}
      </section>

      <section className="step-section">
        <h3>{t("chars.secondary")}</h3>
        <Help>{t("chars.secondaryHelp")}</Help>
        <table className="table compact">
          <tbody>
            {secondary.map((s, i) => {
              const e = characters.find((c) => c.id === s.entryId);
              return (
                <tr key={i}>
                  <td>
                    {e ? (
                      <button type="button" className="link" onClick={() => openEntry(e.id)}>
                        {e.name}
                      </button>
                    ) : (
                      <span className="muted">{t("entry.deletedEntry")}</span>
                    )}
                  </td>
                  <td>
                    <Select value={s.role} onChange={(ev) => w.set("char.secondary", secondary.map((x, k) => (k === i ? { ...x, role: ev.target.value } : x)))} aria-label={t("chars.function")}>
                      {DRAMATIC_FUNCTIONS.map((f) => (
                        <option key={f} value={f}>
                          {choiceLabel("functions", f)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <button type="button" className="btn ghost small" aria-label={t("script.info.remove")}
                      onClick={async () => {
                        if (await confirmRemoval(ask, { title: e?.name ? t("chars.removeNamed", { name: e.name }) : t("chars.remove"), text: t("chars.removeText"), label: t("script.info.remove") }))
                          w.set("char.secondary", secondary.filter((x) => x !== s));
                      }}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Select
          value=""
          aria-label={t("chars.addSecondary")}
          onChange={(e) => e.target.value && w.set("char.secondary", [...secondary, { entryId: e.target.value, role: "Allié" }])}
        >
          <option value="" hidden>{t("chars.addSecondaryOption")}</option>
          {characters
            .filter((c) => c.id !== protagonist?.id && !secondary.some((s) => s.entryId === c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </Select>
      </section>

      <section className="step-section">
        <h3>{t("chars.relations")}</h3>
        <Help>{t("chars.relationsHelp")}</Help>
        <RelationMap characters={characters} protagonistId={protagonist?.id} antagonistId={antagonist?.id} />
      </section>
    </div>
  );
}

/** The bible fields the sheets show; each one's name, with what it holds, is in the catalog. */
const SHEET_KEYS = new Set(["desire", "need", "flaw", "arc_start", "arc_end", "motivations"]);

/** Fields of the bible entry itself: the workshop and the bible show the same data [PER-04]. */
function CharacterSheet({ entry, keys, onOpen }: { entry: Entry; keys: string[]; onOpen: () => void }) {
  return (
    <div className="sheet">
      {keys.map((k) => (
        <EntryField key={`${entry.id}-${k}`} entry={entry} k={k} label={SHEET_KEYS.has(k) ? t(`chars.sheet.${k}`) : k} />
      ))}
      <button type="button" className="btn ghost small" onClick={onOpen}>
        {t("chars.openFull", { name: entry.name })}
      </button>
    </div>
  );
}

function EntryField({ entry, k, label }: { entry: Entry; k: string; label: string }) {
  const { notify } = useProject();
  const [v, set, flush] = useDebounced(String(entry.fields[k] ?? ""), (value) =>
    setEntryField(entry.id, k, value).catch((e) => notify({ text: describeError(e), tone: "error" })),
  );
  return (
    <label className="fld wide">
      <span className="fld-label">{label}</span>
      <textarea rows={2} value={v} onChange={(e) => set(e.target.value)} onBlur={flush} />
    </label>
  );
}
