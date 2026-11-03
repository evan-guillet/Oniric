import { BookOpen, Clapperboard, FileText, NotebookPen, Users, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { useProject, type ProjectApi, type TransferMode, type TransferSection } from "./projectContext";
import { BOARD_TABLES, loadBoards } from "../../realisation/application/moodboards";
import type { StoryboardLayout } from "../../realisation/ui/realisationExport";

/** The exports of the Réalisation, read when one is asked for. */
const realisation = () => import("../../realisation/ui/realisationExport");
/** The exports of the Production, read when one is asked for. */
const production = () => import("../../production/ui/productionExport");
import { Segmented } from "../../../ui-kit/Segmented";
import { readStored } from "../../../ui-kit/useStoredState";

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
  {
    id: "realisation",
    label: t("nav.parts.realisation"),
    icon: Clapperboard,
    options: [
      { id: "shotlist-pdf", label: t("transfer.shotlistPdf"), help: t("transfer.shotlistPdfHelp") },
      { id: "shotlist-csv", label: t("transfer.shotlistCsv"), help: t("transfer.shotlistCsvHelp") },
      { id: "storyboard-pdf", label: t("transfer.storyboardPdf"), help: t("transfer.storyboardPdfHelp") },
      { id: "moodboard-pdf", label: t("transfer.moodboardPdf"), help: t("transfer.moodboardPdfHelp") },
    ],
  },
  {
    id: "production",
    label: t("nav.parts.production"),
    icon: Users,
    options: [
      { id: "team-pdf", label: t("transfer.teamPdf"), help: t("transfer.teamPdfHelp") },
      { id: "contacts-csv", label: t("transfer.contactsCsv"), help: t("transfer.contactsCsvHelp") },
      { id: "contacts-vcf", label: t("transfer.contactsVcf"), help: t("transfer.contactsVcfHelp") },
      { id: "breakdown-pdf", label: t("transfer.breakdownPdf"), help: t("transfer.breakdownPdfHelp") },
      { id: "breakdown-csv", label: t("transfer.breakdownCsv"), help: t("transfer.breakdownCsvHelp") },
      { id: "schedule-pdf", label: t("transfer.schedulePdf"), help: t("transfer.schedulePdfHelp") },
      { id: "schedule-xlsx", label: t("transfer.scheduleXlsx"), help: t("transfer.scheduleXlsxHelp") },
      { id: "calendar-ics", label: t("transfer.calendarIcs"), help: t("transfer.calendarIcsHelp") },
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
 * their file kinds on the right. An export takes as many kinds as are checked, across the parts, each moodboard
 * checked its own file; an import takes one kind and hands it back so the shell opens the file picker.
 */
export function TransferDialog({
  mode,
  section,
  option: initialOption,
  onImport,
  onClose,
}: {
  mode: TransferMode;
  section?: TransferSection;
  /** The kind chosen at first in the section, when the view calls for one (the Storyboard's PDF). */
  option?: string;
  onImport: (kind: "script" | "bible") => void;
  onClose: () => void;
}) {
  const api = useProject();
  const sections = mode === "export" ? exportSections() : importSections();
  const [at, setAt] = useState<TransferSection>(sections.find((s) => s.id === section)?.id ?? sections[0].id);
  const current = sections.find((s) => s.id === at)!;
  const exporting = mode === "export";
  // Import: the one kind chosen in each part. Export: the kinds checked, all parts together; the first kind of the
  // part opened at first is checked, or the one the view called for.
  const [choice, setChoice] = useState<Record<string, string>>(initialOption && section ? { [section]: initialOption } : {});
  const option = choice[at] ?? current.options[0].id;
  const [checked, setChecked] = useState<Set<string>>(() => new Set([initialOption && section ? initialOption : current.options[0].id]));
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (!next.delete(id)) next.add(id);
    setChecked(next);
  };
  const isOn = (id: string) => (exporting ? checked.has(id) : option === id);
  const formats = useLive(availableFormats, ["project_setting"]) ?? [];
  const tp = useLive(readTitlePage, ["project_setting"]);
  const titled = hasContent(tp ?? null);
  const currentFormat = api.session.editor?.currentFormat;
  const [formatId, setFormatId] = useState(currentFormat?.id ?? "");
  const [withTitle, setWithTitle] = useState(true);
  const [layout, setLayout] = useState<StoryboardLayout>({ perPage: 6, orientation: "landscape" });
  const boards = useLive(loadBoards, [...BOARD_TABLES]) ?? [];
  // The board open in the Moodboards is checked at first.
  const [boardIds, setBoardIds] = useState<Set<string> | null>(null);
  const opened = readStored<string | null>(`oniric.moodboard.board.${api.project.id}`, null);
  const chosenBoards = boardIds ?? new Set(boards.length ? [boards.find((b) => b.id === opened)?.id ?? boards[0].id] : []);
  const pickedBoards = boards.filter((b) => chosenBoards.has(b.id));
  const toggleBoard = (id: string) => {
    const next = new Set(chosenBoards);
    if (!next.delete(id)) next.add(id);
    setBoardIds(next);
  };
  const allBoards = boards.length > 0 && pickedBoards.length === boards.length;
  const someBoards = pickedBoards.length > 0 && !allBoards;
  const allBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = someBoards;
  });

  /** The kinds checked, in the order of the window, and how many files they make. */
  const jobs = sections.flatMap((s) => s.options.map((o) => o.id)).filter((id) => checked.has(id));
  const files = jobs.reduce((n, id) => n + (id === "moodboard-pdf" ? pickedBoards.length : 1), 0);

  /** Writes one kind; the PDFs print quietly, and every path written goes to `paths`. */
  const write = async (id: string, paths: string[]) => {
    const quiet: ProjectApi = {
      ...api,
      printPdf: async (name, content, page) => {
        const path = await api.printPdf(name, content, page, true);
        if (path) paths.push(path);
        return path;
      },
    };
    const kept = (path: string | null) => path && paths.push(path);
    if (id === "pdf") {
      const other = formats.find((f) => f.id === formatId && f.id !== currentFormat?.id);
      await exportScreenplayPdf(quiet, other, withTitle && titled);
    } else if (id === "fountain" || id === "fdx") {
      kept(await exportScreenplayText(api, id));
    } else if (id === "bible") {
      kept(unwrap(await commands.exportText(`Bible - ${api.project.title}.json`, JSON.stringify(await exportBible(), null, 2))));
    } else if (id === "synopsis" || id === "treatment") {
      const doc = await loadDocument(id);
      await exportDocumentPdf(quiet, id === "synopsis" ? "Synopsis" : "Traitement", doc.content);
    } else if (id === "shotlist-pdf") {
      await (await realisation()).exportShotlistPdf(quiet);
    } else if (id === "shotlist-csv") {
      kept(await (await realisation()).exportShotlistCsv(api));
    } else if (id === "storyboard-pdf") {
      await (await realisation()).exportStoryboardPdf(quiet, layout);
    } else if (id === "moodboard-pdf") {
      for (const b of pickedBoards) await (await realisation()).exportMoodboardPdf(quiet, b.id);
    } else if (id === "team-pdf") {
      await (await production()).exportTeamPdf(quiet);
    } else if (id === "contacts-csv") {
      kept(await (await production()).exportContactsCsv(api));
    } else if (id === "contacts-vcf") {
      kept(await (await production()).exportContactsVcf(api));
    } else if (id === "breakdown-pdf") {
      await (await production()).exportBreakdownPdf(quiet, "category");
    } else if (id === "breakdown-csv") {
      kept(await (await production()).exportBreakdownCsv(api, "category"));
    } else if (id === "schedule-pdf") {
      await (await production()).exportSchedulePdf(quiet);
    } else if (id === "schedule-xlsx") {
      kept(await (await production()).exportScheduleXlsx(api));
    } else if (id === "calendar-ics") {
      kept(await (await production()).exportCalendar(api));
    }
  };

  /** The kinds one after the other (the PDFs share one page to print on), then one word for all of them. */
  const run = async () => {
    const paths: string[] = [];
    for (const id of jobs) {
      try {
        await write(id, paths);
      } catch (e) {
        api.notify({ text: describeError(e), tone: "error" });
      }
    }
    const last = paths[paths.length - 1];
    if (!last) return;
    api.notify({
      text: paths.length === 1 ? t("workspace.exported", { file: fileOf(last) }) : t("workspace.exportedMany", { count: paths.length }),
      actions: [
        ...(paths.length === 1 ? [{ label: t("workspace.openFile"), onClick: () => void commands.reveal(last, true) }] : []),
        { label: t("workspace.showInFolder"), onClick: () => void commands.reveal(last, false) },
      ],
    });
  };

  const go = () => {
    onClose();
    if (!exporting) onImport(option as "script" | "bible");
    else void run();
  };

  /** What a checked kind asks for, under it. */
  const settings = (id: string) => {
    if (id === "pdf" && currentFormat)
      return (
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
      );
    if (id === "storyboard-pdf")
      return (
        <div className="form transfer-options">
          <div className="field">
            <span>{t("transfer.perPage")}</span>
            <Segmented
              label={t("transfer.perPage")}
              value={String(layout.perPage) as "2" | "3" | "4" | "6"}
              onChange={(v) => setLayout({ ...layout, perPage: Number(v) as StoryboardLayout["perPage"] })}
              options={(["2", "3", "4", "6"] as const).map((n) => ({ id: n, label: t("transfer.perPageN", { count: Number(n) }) }))}
            />
          </div>
          <div className="field">
            <span>{t("transfer.orientation")}</span>
            <Segmented
              label={t("transfer.orientation")}
              value={layout.orientation}
              onChange={(orientation) => setLayout({ ...layout, orientation })}
              options={[
                { id: "landscape", label: t("transfer.landscape") },
                { id: "portrait", label: t("transfer.portrait") },
              ]}
            />
          </div>
        </div>
      );
    if (id === "moodboard-pdf")
      return (
        <div className="form transfer-options">
          {boards.length ? (
            <fieldset className="transfer-boards">
              <legend className="transfer-boards-head">
                <span>{t("transfer.boards")}</span>
                <label className="choice">
                  <input
                    ref={allBox}
                    type="checkbox"
                    checked={allBoards}
                    onChange={() => setBoardIds(new Set(allBoards ? [] : boards.map((b) => b.id)))}
                  />
                  {t("transfer.allBoards")}
                </label>
              </legend>
              <div className="transfer-board-list">
                {boards.map((b) => (
                  <label key={b.id} className="choice">
                    <input type="checkbox" checked={chosenBoards.has(b.id)} onChange={() => toggleBoard(b.id)} />
                    <span>{b.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="muted small">{t("transfer.noBoard")}</p>
          )}
        </div>
      );
    return null;
  };

  return (
    <Dialog
      title={mode === "export" ? t("transfer.export") : t("transfer.import")}
      className="transfer-dialog"
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        exporting
          ? { label: files > 1 ? t("transfer.exportFiles", { count: files }) : t("transfer.export"), primary: true, disabled: files === 0, onClick: go }
          : { label: t("transfer.chooseFile"), primary: true, onClick: go },
      ]}
    >
      <div className="transfer">
        <nav className="transfer-nav" aria-label={t("transfer.parts")}>
          {sections.map((s) => {
            const Icon = s.icon;
            const on = exporting ? s.options.filter((o) => checked.has(o.id)).length : 0;
            return (
              <button key={s.id} type="button" className={s.id === at ? "on" : ""} aria-current={s.id === at} onClick={() => setAt(s.id)}>
                <Icon aria-hidden="true" />
                <span>{s.label}</span>
                {on > 0 ? (
                  <span className="transfer-count picked" aria-label={t("transfer.picked", { count: on })}>
                    {on}
                  </span>
                ) : (
                  <span className="transfer-count">{s.options.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="transfer-main">
          <div
            className="export-kinds"
            role={exporting ? "group" : "radiogroup"}
            aria-label={t("transfer.kind", { section: current.label })}
          >
            {current.options.map((o) => (
              <div key={o.id} className="export-kind-block">
                <label className={isOn(o.id) ? "export-kind on" : "export-kind"}>
                  {exporting ? (
                    <input type="checkbox" checked={checked.has(o.id)} onChange={() => toggle(o.id)} />
                  ) : (
                    <input type="radio" name="transfer-kind" checked={option === o.id} onChange={() => setChoice({ ...choice, [at]: o.id })} />
                  )}
                  <span className="export-kind-label">{o.label}</span>
                  <span className="muted small">{o.help}</span>
                </label>
                {exporting && checked.has(o.id) && settings(o.id)}
              </div>
            ))}
          </div>
          {exporting && <p className="muted small transfer-where">{t("transfer.where")}</p>}
        </div>
      </div>
    </Dialog>
  );
}
