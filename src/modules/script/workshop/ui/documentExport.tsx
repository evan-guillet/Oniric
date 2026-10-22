import { richHtml } from "../../../../ui-kit/RichText";
import type { ProjectApi } from "../../../project/ui/projectContext";

/** A preparatory document (synopsis, treatment) as an A4 PDF, under the film's title. */
export function exportDocumentPdf(api: Pick<ProjectApi, "printPdf" | "project">, title: string, content: string) {
  return api.printPdf(
    `${title} - ${api.project.title}.pdf`,
    <article className="doc-print">
      <h1>{api.project.title}</h1>
      <p className="doc-print-sub">{title}</p>
      <div dangerouslySetInnerHTML={{ __html: richHtml(content) }} />
    </article>,
    { width: 8.2677, height: 11.6929, css: "@page { size: 8.2677in 11.6929in; margin: 1in 1in 1in 1.1in; }" },
  );
}
