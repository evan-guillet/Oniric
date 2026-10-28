import { BookOpen, FileText, NotebookPen, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { commands } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { useLive } from "../../../core/db/live";
import { describeError } from "../../../core/errors";
import { Dialog } from "../../../ui-kit/Dialog";
import { exportBible } from "../../script/bible/application/bible";
import { availableFormats } from "../../script/screenplay/application/formatSettings";
import { formatName, groupFormats } from "../../script/screenplay/domain/formats";
import { readTitlePage } from "../../script/screenplay/application/titlePageSettings";
import { hasContent } from "../../script/screenplay/domain/titlePage";
import { exportScreenplayPdf, exportScreenplayText } from "../../script/screenplay/ui/screenplayExport";
import { loadDocument } from "../../script/workshop/application/workshop";
import { exportDocumentPdf } from "../../script/workshop/ui/documentExport";
import { useProject, type TransferMode, type TransferSection } from "./projectContext";

import { Select } from "../../../ui-kit/Select";
import { t } from "../../../core/i18n";
interface Option {
  id: string;
  label: string;
  help: string;
}

interface Section {
  id: TransferSection;
  label: string;
  icon: LucideIcon;
  options: Option[];
}

const exportSections = (): Section[] => [
  {
    id: "script",
    label: t("nav.views.script"),
    icon: FileText,
    options: [
      { id: "pdf", label: "PDF", help: t("transfer.pdfHelp") },
      { id: "fountain", label: "Fountain", help: t("transfer.fountainHelp") },
      { id: "fdx", label: "FDX", help: t("transfer.fdxHelp") },
    ],
  },
  {
    id: "bible",
    label: "Bible",
    icon: BookOpen,
    options: [{ id: "bible", label: "Bible Oniric (JSON)", help: t("transfer.bibleExportHelp") }],
  },
  {
    id: "workshop",
    label: t("nav.views.workshop"),
    icon: NotebookPen,
    options: [
      { id: "synopsis", label: t("transfer.synopsis"), help: t("transfer.synopsisHelp") },
      { id: "treatment", label: t("transfer.treatment"), help: t("transfer.treatmentHelp") },
    ],
  },
];

const importSections = (): Section[] => [
  {
    id: "script",
    label: t("nav.views.script"),
    icon: FileText,
    options: [{ id: "script", label: t("transfer.scriptImport"), help: t("transfer.scriptImportHelp") }],
  },
  {
    id: "bible",
    label: "Bible",
    icon: BookOpen,
    options: [{ id: "bible", label: "Bible Oniric (JSON)", help: t("transfer.bibleImportHelp") }],
  },
];

const fileOf = (path: string) => path.split(/[\\/]/).slice(-2).join("\\");

/**
 * Every import or export of the project, whatever its part, in one window: the parts on the left,
 * their file kinds on the right. Imports hand the chosen kind back so the shell opens the file picker.
 */
export function TransferDialog({
  mode,
  section,
  onImport,
  onClose,
}: {
  mode: TransferMode;
  section?: TransferSection;
  onImport: (kind: "script" | "bible") => void;
  onClose: () => void;
}) {
  const api = useProject();
  const sections = mode === "export" ? exportSections() : importSections();
  const [at, setAt] = useState<TransferSection>(sections.find((s) => s.id === section)?.id ?? sections[0].id);
  const current = sections.find((s) => s.id === at)!;
  const [choice, setChoice] = useState<Record<string, string>>({});
  const option = choice[at] ?? current.options[0].id;
  const formats = useLive(availableFormats, ["project_setting"]) ?? [];
  const tp = useLive(readTitlePage, ["project_setting"]);
  const titled = hasContent(tp ?? null);
  const currentFormat = api.session.editor?.currentFormat;
  const [formatId, setFormatId] = useState(currentFormat?.id ?? "");
  const [withTitle, setWithTitle] = useState(true);

  const saved = (path: string) =>
    api.notify({
      text: t("workspace.exported", { file: fileOf(path) }),
      actions: [{ label: t("workspace.showInFolder"), onClick: () => void commands.reveal(path, false) }],
    });

  const run = async () => {
    try {
      if (option === "pdf") {
        const other = formats.find((f) => f.id === formatId && f.id !== currentFormat?.id);
        await exportScreenplayPdf(api, other, withTitle && titled);
      } else if (option === "fountain" || option === "fdx") {
        const path = await exportScreenplayText(api, option);
        if (path) saved(path);
      } else if (option === "bible") {
        saved(unwrap(await commands.exportText(`Bible - ${api.project.title}.json`, JSON.stringify(await exportBible(), null, 2))));
      } else if (option === "synopsis" || option === "treatment") {
        const doc = await loadDocument(option);
        await exportDocumentPdf(api, option === "synopsis" ? "Synopsis" : "Traitement", doc.content);
      }
    } catch (e) {
      api.notify({ text: describeError(e), tone: "error" });
    }
  };

  const go = () => {
    onClose();
    if (mode === "import") onImport(option as "script" | "bible");
    else void run();
  };

  return (
    <Dialog
      title={mode === "export" ? t("transfer.export") : t("transfer.import")}
      className="transfer-dialog"
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        { label: mode === "export" ? t("transfer.export") : t("transfer.chooseFile"), primary: true, onClick: go },
      ]}
    >
      <div className="transfer">
        <nav className="transfer-nav" aria-label={t("transfer.parts")}>
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button key={s.id} type="button" className={s.id === at ? "on" : ""} aria-current={s.id === at} onClick={() => setAt(s.id)}>
                <Icon aria-hidden="true" />
                <span>{s.label}</span>
                <span className="transfer-count">{s.options.length}</span>
              </button>
            );
          })}
        </nav>
        <div className="transfer-main">
          <div className="export-kinds" role="radiogroup" aria-label={t("transfer.kind", { section: current.label })}>
            {current.options.map((o) => (
              <label key={o.id} className={option === o.id ? "export-kind on" : "export-kind"}>
                <input type="radio" name="transfer-kind" checked={option === o.id} onChange={() => setChoice({ ...choice, [at]: o.id })} />
                <span className="export-kind-label">{o.label}</span>
                <span className="muted small">{o.help}</span>
              </label>
            ))}
          </div>
          {option === "pdf" && currentFormat && (
            <div className="form transfer-options">
              <label className="field">
                <span>{t("transfer.layout")}</span>
                <Select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                  {groupFormats(formats).map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.formats.map((x) => (
                        <option key={x.id} value={x.id}>
                          {formatName(x)}
                          {x.id === currentFormat.id ? t("transfer.current") : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </label>
              {formatId !== currentFormat.id && <p className="muted small">{t("transfer.otherFormat")}</p>}
              <label className="choice">
                <input type="checkbox" checked={withTitle && titled} disabled={!titled} onChange={(e) => setWithTitle(e.target.checked)} />
                {t("transfer.withTitle")}
                {!titled && <span className="muted small"> {t("transfer.noTitlePage")}</span>}
              </label>
            </div>
          )}
          {mode === "export" && <p className="muted small transfer-where">{t("transfer.where")}</p>}
        </div>
      </div>
    </Dialog>
  );
}
