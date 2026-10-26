import { BookOpen, FileText, NotebookPen, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { commands } from "../../../bindings";
import { unwrap } from "../../../core/db/client";
import { useLive } from "../../../core/db/live";
import { describeError } from "../../../core/errors";
import { Dialog } from "../../../ui-kit/Dialog";
import { exportBible } from "../../script/bible/application/bible";
import { availableFormats } from "../../script/screenplay/application/formatSettings";
import { readTitlePage } from "../../script/screenplay/application/titlePageSettings";
import { hasContent } from "../../script/screenplay/domain/titlePage";
import { exportScreenplayPdf, exportScreenplayText } from "../../script/screenplay/ui/screenplayExport";
import { loadDocument } from "../../script/workshop/application/workshop";
import { exportDocumentPdf } from "../../script/workshop/ui/documentExport";
import { useProject, type TransferMode, type TransferSection } from "./projectContext";

import { Select } from "../../../ui-kit/Select";
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

const EXPORTS: Section[] = [
  {
    id: "script",
    label: "Scénario",
    icon: FileText,
    options: [
      { id: "pdf", label: "PDF", help: "Pour lire, imprimer et envoyer le scénario." },
      { id: "fountain", label: "Fountain", help: "Texte brut, lisible par la plupart des logiciels d'écriture." },
      { id: "fdx", label: "FDX", help: "Pour ouvrir le scénario dans Final Draft." },
    ],
  },
  {
    id: "bible",
    label: "Bible",
    icon: BookOpen,
    options: [{ id: "bible", label: "Bible Oniric (JSON)", help: "Toutes les fiches, leurs types et leurs liens, à reprendre dans un autre projet." }],
  },
  {
    id: "workshop",
    label: "Atelier",
    icon: NotebookPen,
    options: [
      { id: "synopsis", label: "Synopsis (PDF)", help: "Le synopsis au format A4, sous le titre du film." },
      { id: "treatment", label: "Traitement (PDF)", help: "Le traitement au format A4, sous le titre du film." },
    ],
  },
];

const IMPORTS: Section[] = [
  {
    id: "script",
    label: "Scénario",
    icon: FileText,
    options: [{ id: "script", label: "Fountain ou FDX", help: "Remplace le scénario actuel. Ctrl+Z permet de revenir en arrière." }],
  },
  {
    id: "bible",
    label: "Bible",
    icon: BookOpen,
    options: [{ id: "bible", label: "Bible Oniric (JSON)", help: "Ajoute les nouvelles fiches et met à jour celles qui existent déjà." }],
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
  const sections = mode === "export" ? EXPORTS : IMPORTS;
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
      text: `Fichier enregistré dans le dossier du projet : ${fileOf(path)}`,
      actions: [{ label: "Afficher dans le dossier", onClick: () => void commands.reveal(path, false) }],
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
      title={mode === "export" ? "Exporter" : "Importer"}
      className="transfer-dialog"
      onCancel={onClose}
      actions={[
        { label: "Annuler", onClick: onClose },
        { label: mode === "export" ? "Exporter" : "Choisir le fichier…", primary: true, onClick: go },
      ]}
    >
      <div className="transfer">
        <nav className="transfer-nav" aria-label="Parties du projet">
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
          <div className="export-kinds" role="radiogroup" aria-label={`${current.label} : type de fichier`}>
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
                <span>Mise en page</span>
                <Select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                  {formats.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.id === currentFormat.id ? " (actuel)" : ""}
                    </option>
                  ))}
                </Select>
              </label>
              {formatId !== currentFormat.id && <p className="muted small">Le scénario n'est pas modifié : seules les pages du PDF sont recalculées dans ce format.</p>}
              <label className="choice">
                <input type="checkbox" checked={withTitle && titled} disabled={!titled} onChange={(e) => setWithTitle(e.target.checked)} />
                Avec la page de titre
                {!titled && <span className="muted small"> (aucune page de titre)</span>}
              </label>
            </div>
          )}
          {mode === "export" && <p className="muted small transfer-where">Les fichiers sont enregistrés dans le dossier « exports » du projet.</p>}
        </div>
      </div>
    </Dialog>
  );
}
