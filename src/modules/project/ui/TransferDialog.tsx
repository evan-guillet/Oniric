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
import { itemsOf, useItems } from "../../script/workshop/application/items";
import { loadDocument, useFields, type DocumentKind } from "../../script/workshop/application/workshop";
import { exportDocumentPdf } from "../../script/workshop/ui/documentExport";
import { exportReaderCopy, type Reader } from "../../script/workshop/ui/readerCopy";
import { useProject, type ProjectApi, type TransferMode, type TransferSection } from "./projectContext";
import { BOARD_TABLES, loadBoards } from "../../realisation/application/moodboards";
import type { StoryboardLayout } from "../../realisation/ui/realisationExport";
import type { ReportBy, SheetDay } from "../../production/ui/productionExport";

/** The presentation file, read when it is asked for. */
const dossier = () => import("../../script/workshop/ui/dossierExport");
/** The exports of the Réalisation, read when one is asked for. */
const realisation = () => import("../../realisation/ui/realisationExport");
/** The exports of the Production, read when one is asked for. */
const production = () => import("../../production/ui/productionExport");
/** The exports of the budget, the scouting and the permits. */
const preparation = () => import("../../production/ui/preparationExport");
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

/** The texts of the Atelier that go out with the screenplay. */
const SENT_DOCS: DocumentKind[] = ["short_synopsis", "intention", "direction_note", "bio"];

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
      ...SENT_DOCS.map((id) => ({ id, label: `${t(`diffusion.docs.${id}`)} (PDF)`, help: t("transfer.sentDocHelp") })),
      { id: "dossier", label: t("transfer.dossier"), help: t("diffusion.dossierHelp") },
      { id: "reader-copy", label: t("transfer.readerCopy"), help: t("transfer.readerCopyHelp") },
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
      { id: "contact-card", label: t("transfer.contactCard"), help: t("transfer.contactCardHelp") },
      { id: "breakdown-pdf", label: t("transfer.breakdownPdf"), help: t("transfer.breakdownPdfHelp") },
      { id: "breakdown-csv", label: t("transfer.breakdownCsv"), help: t("transfer.breakdownCsvHelp") },
      { id: "schedule-pdf", label: t("transfer.schedulePdf"), help: t("transfer.schedulePdfHelp") },
      { id: "schedule-xlsx", label: t("transfer.scheduleXlsx"), help: t("transfer.scheduleXlsxHelp") },
      { id: "calendar-ics", label: t("transfer.calendarIcs"), help: t("transfer.calendarIcsHelp") },
      { id: "callsheet-pdf", label: t("transfer.callsheetPdf"), help: t("transfer.callsheetPdfHelp") },
      { id: "callsheet-each", label: t("transfer.callsheetEach"), help: t("transfer.callsheetEachHelp") },
      { id: "budget-pdf", label: t("transfer.budgetPdf"), help: t("transfer.budgetPdfHelp") },
      { id: "budget-xlsx", label: t("transfer.budgetXlsx"), help: t("transfer.budgetXlsxHelp") },
      { id: "scouting-pdf", label: t("transfer.scoutingPdf"), help: t("transfer.scoutingPdfHelp") },
      { id: "permits-pdf", label: t("transfer.permitsPdf"), help: t("transfer.permitsPdfHelp") },
      { id: "legal-pdf", label: t("transfer.legalPdf"), help: t("transfer.legalPdfHelp") },
      { id: "legal-docx", label: t("transfer.legalDocx"), help: t("transfer.legalDocxHelp") },
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
  {
    id: "production",
    label: t("nav.parts.production"),
    icon: Users,
    options: [
      { id: "contacts-file", label: t("transfer.contactsImport"), help: t("transfer.contactsImportHelp") },
      { id: "contacts-book", label: t("transfer.contactsBook"), help: t("transfer.contactsBookHelp") },
    ],
  },
];

/** What an import hands back to the shell. */
export type ImportKind = "script" | "bible" | "contacts-file" | "contacts-book";

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
  onImport: (kind: ImportKind) => void;
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

  // The report is the one chosen in the Dépouillement at first.
  const [reportBy, setReportBy] = useState<ReportBy>(() => readStored<ReportBy>("oniric.breakdown.report", "category"));
  // The days with a sheet are read when a call sheet is checked; the day open in the Feuilles de service is chosen at first.
  const wantsSheets = checked.has("callsheet-pdf") || checked.has("callsheet-each");
  const [sheetDays, setSheetDays] = useState<SheetDay[] | null>(null);
  const [sheetDayId, setSheetDayId] = useState(() => readStored<string | null>(`oniric.callsheets.day.${api.project.id}`, null));
  const sheetDay = sheetDays?.find((d) => d.id === sheetDayId) ?? sheetDays?.[0];
  useEffect(() => {
    if (!wantsSheets || sheetDays) return;
    void production()
      .then((m) => m.sheetDays(api))
      .then(setSheetDays)
      .catch((e) => api.notify({ text: describeError(e), tone: "error" }));
  }, [wantsSheets]);

  // The presentation file: a moodboard if one wants, and the logline written in the Atelier.
  const [dossierBoard, setDossierBoard] = useState("");
  const fields = useFields();
  // The readers' copies: checked one by one, the first one at first.
  const readers = itemsOf<Reader>(useItems(), "reader");
  const [readerIds, setReaderIds] = useState<Set<string> | null>(null);
  const chosenReaders = readerIds ?? new Set(readers.slice(0, 1).map((r) => r.id));
  const pickedReaders = readers.filter((r) => chosenReaders.has(r.id));
  const toggleReader = (id: string) => {
    const next = new Set(chosenReaders);
    if (!next.delete(id)) next.add(id);
    setReaderIds(next);
  };
  // One person's card: the names are read when it is checked.
  const wantsCard = checked.has("contact-card");
  const [contacts, setContacts] = useState<{ id: string; name: string }[] | null>(null);
  const [contactId, setContactId] = useState("");
  const contact = contacts?.find((c) => c.id === contactId) ?? contacts?.[0];
  useEffect(() => {
    if (!wantsCard || contacts) return;
    void production()
      .then((m) => m.contactNames())
      .then(setContacts)
      .catch((e) => api.notify({ text: describeError(e), tone: "error" }));
  }, [wantsCard]);

  // A letter or a contract: the list is read when one of its kinds is checked; the one open in the Documents comes first.
  const wantsLegal = checked.has("legal-pdf") || checked.has("legal-docx");
  const [legals, setLegals] = useState<{ id: string; title: string }[] | null>(null);
  const [legalId, setLegalId] = useState(() => readStored<string>(`oniric.permits.document.${api.project.id}`, ""));
  const legal = legals?.find((d) => d.id === legalId) ?? legals?.[0];
  useEffect(() => {
    if (!wantsLegal || legals) return;
    void preparation()
      .then((m) => m.legalDocuments())
      .then(setLegals)
      .catch((e) => api.notify({ text: describeError(e), tone: "error" }));
  }, [wantsLegal]);

  /** The kinds checked, in the order of the window, and how many files they make. */
  const jobs = sections.flatMap((s) => s.options.map((o) => o.id)).filter((id) => checked.has(id));
  const filesOf = (id: string) => (id === "moodboard-pdf" ? pickedBoards.length : id === "reader-copy" ? pickedReaders.length : id === "contact-card" ? (contact ? 1 : 0) : id === "callsheet-pdf" ? (sheetDay ? 1 : 0) : id === "callsheet-each" ? (sheetDay?.people ?? 0) : id === "legal-pdf" || id === "legal-docx" ? (legal ? 1 : 0) : 1);
  const files = jobs.reduce((n, id) => n + filesOf(id), 0);

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
    } else if ((SENT_DOCS as string[]).includes(id)) {
      const doc = await loadDocument(id as DocumentKind);
      await exportDocumentPdf(quiet, t(`diffusion.docs.${id}`), doc.content);
    } else if (id === "dossier") {
      const logline = fields?.get("diffusion.logline");
      await (await dossier()).exportDossier(quiet, dossierBoard || null, typeof logline === "string" ? logline : "");
    } else if (id === "reader-copy") {
      for (const r of pickedReaders) await exportReaderCopy(quiet, r);
    } else if (id === "contact-card") {
      if (contact) kept(await (await production()).exportContactCard(contact.id));
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
      await (await production()).exportBreakdownPdf(quiet, reportBy);
    } else if (id === "breakdown-csv") {
      kept(await (await production()).exportBreakdownCsv(api, reportBy));
    } else if (id === "schedule-pdf") {
      await (await production()).exportSchedulePdf(quiet);
    } else if (id === "schedule-xlsx") {
      kept(await (await production()).exportScheduleXlsx(api));
    } else if (id === "calendar-ics") {
      kept(await (await production()).exportCalendar(api));
    } else if (id === "budget-pdf") {
      await (await preparation()).exportBudgetPdf(quiet);
    } else if (id === "budget-xlsx") {
      kept(await (await preparation()).exportBudgetXlsx(api));
    } else if (id === "scouting-pdf") {
      await (await preparation()).exportScoutingPdf(quiet);
    } else if (id === "permits-pdf") {
      await (await preparation()).exportPermitsPdf(quiet);
    } else if (id === "legal-pdf") {
      if (legal) await (await preparation()).exportLegalPdf(quiet, legal.id);
    } else if (id === "legal-docx") {
      if (legal) kept(await (await preparation()).exportLegalDocx(legal.id));
    } else if ((id === "callsheet-pdf" || id === "callsheet-each") && sheetDay && filesOf(id) > 0) {
      // A whole list takes seconds: nothing else says so once the window is closed. The last word is said at the end, for all.
      if (filesOf(id) > 1) api.notify({ text: t("transfer.writingSheets", { count: filesOf(id) }) });
      await (await production()).exportSheetOf({ ...quiet, notify: () => {} }, sheetDay.id, id === "callsheet-each");
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
    if (!exporting) onImport(option as ImportKind);
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
    if (id === "dossier")
      return (
        <div className="form transfer-options">
          <label className="field">
            <span>{t("diffusion.moodboard")}</span>
            <Select value={dossierBoard} onChange={(e) => setDossierBoard(e.target.value)}>
              <option value="">{t("diffusion.noBoard")}</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      );
    if (id === "reader-copy")
      return (
        <div className="form transfer-options">
          {readers.length ? (
            <fieldset className="transfer-boards">
              <legend className="transfer-boards-head">
                <span>{t("transfer.readers")}</span>
              </legend>
              <div className="transfer-board-list">
                {readers.map((r) => (
                  <label key={r.id} className="choice">
                    <input type="checkbox" checked={chosenReaders.has(r.id)} onChange={() => toggleReader(r.id)} />
                    <span>{r.data.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="muted small">{t("transfer.noReader")}</p>
          )}
        </div>
      );
    if (id === "contact-card")
      return (
        contacts && (
          <div className="form transfer-options">
            {contact ? (
              <label className="field">
                <span>{t("team.person")}</span>
                <Select value={contact.id} onChange={(e) => setContactId(e.target.value)}>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <p className="muted small">{t("transfer.noContact")}</p>
            )}
          </div>
        )
      );
    if (id === "legal-pdf" || (id === "legal-docx" && !checked.has("legal-pdf")))
      return (
        legals && (
          <div className="form transfer-options">
            {legal ? (
              <label className="field">
                <span>{t("transfer.legalWhich")}</span>
                <Select value={legal.id} onChange={(e) => setLegalId(e.target.value)}>
                  {legals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <p className="muted small">{t("transfer.noLegal")}</p>
            )}
          </div>
        )
      );
    // One choice for the two kinds, under the first one checked.
    if (id === "breakdown-pdf" || (id === "breakdown-csv" && !checked.has("breakdown-pdf")))
      return (
        <div className="form transfer-options">
          <label className="field">
            <span>{t("breakdown.reportBy")}</span>
            <Select value={reportBy} onChange={(e) => setReportBy(e.target.value as ReportBy)}>
              <option value="category">{t("breakdown.byCategory")}</option>
              <option value="set">{t("breakdown.bySet")}</option>
              <option value="character">{t("breakdown.byCharacter")}</option>
            </Select>
          </label>
        </div>
      );
    if (id === "callsheet-pdf" || (id === "callsheet-each" && !checked.has("callsheet-pdf")))
      return (
        sheetDays && (
          <div className="form transfer-options">
            {sheetDay ? (
              <label className="field">
                <span>{t("transfer.sheetDay")}</span>
                <Select value={sheetDay.id} onChange={(e) => setSheetDayId(e.target.value)}>
                  {sheetDays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <p className="muted small">{t("transfer.noSheet")}</p>
            )}
          </div>
        )
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
          : { label: option === "contacts-book" ? t("transfer.openBook") : t("transfer.chooseFile"), primary: true, onClick: go },
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
