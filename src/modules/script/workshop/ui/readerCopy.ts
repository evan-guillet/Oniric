import { t } from "../../../../core/i18n";
import type { ProjectApi } from "../../../project/ui/projectContext";
import { listVersions, readVersion } from "../../screenplay/application/versions";
import { exportScreenplayPdf } from "../../screenplay/ui/screenplayExport";
import { updateItem, type Item } from "../application/items";

export interface Reader {
  name: string;
  /** The frozen version sent, by its id; empty: the text as it was when exported. */
  version: string;
  copy: number;
  sentAt: string;
  strengths: string;
  weaknesses: string;
  understanding: string;
  rating: number;
}

/** The copy of one reader: their name across the pages, in the version chosen for them; it counts as sent from then on [RET-01]. */
export async function exportReaderCopy(api: Pick<ProjectApi, "session" | "printPdf" | "project">, reader: Item<Reader>): Promise<void> {
  const r = reader.data;
  const version = (await listVersions()).find((v) => v.id === r.version);
  await exportScreenplayPdf(api, undefined, undefined, {
    watermark: t("feedback.watermark", { name: r.name, n: r.copy }),
    fileName: `${api.project.title} - ${t("feedback.copyFile", { n: r.copy })} - ${r.name}.pdf`,
    version: version ? await readVersion(version.file) : undefined,
  });
  if (!r.sentAt) await updateItem(reader, { sentAt: new Date().toISOString().slice(0, 10) });
}
