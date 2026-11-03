import { dateFormat, t } from "../../../../core/i18n";
import { richHtml, richPlainText } from "../../../../ui-kit/RichText";
import type { ProjectApi } from "../../../project/ui/projectContext";
import { loadItems } from "../../../realisation/application/moodboards";
import { readImage } from "../../../shared/media";
import { loadEntries } from "../../bible/application/bible";
import { fold } from "../../bible/domain/types";
import { readTitlePage } from "../../screenplay/application/titlePageSettings";
import { loadDocument } from "../application/workshop";

const A4 = { width: 8.2677, height: 11.6929 };

const CSS = `
@page { size: ${A4.width}in ${A4.height}in; margin: 0; }
.dossier { font-family: Georgia, "Times New Roman", serif; color: #111; font-size: 11.5pt; line-height: 1.55; }
.dossier .page { width: ${A4.width}in; min-height: ${A4.height}in; padding: 0.9in 0.95in; box-sizing: border-box; break-after: page; }
.dossier .page:last-child { break-after: auto; }
.dossier .cover { display: flex; flex-direction: column; justify-content: center; text-align: center; }
.dossier .cover h1 { font-size: 30pt; letter-spacing: 0.02em; text-transform: uppercase; margin: 0 0 10pt; }
.dossier .cover .sub { font-style: italic; font-size: 13pt; color: #444; margin: 0 0 28pt; }
.dossier .cover .logline { font-size: 14pt; max-width: 5in; margin: 0 auto 36pt; }
.dossier .cover .by { color: #444; }
.dossier h2 { font-family: "Inter Variable", "Segoe UI", sans-serif; font-size: 10pt; letter-spacing: 0.08em; text-transform: uppercase; color: #555; margin: 0 0 12pt; padding-bottom: 4pt; border-bottom: 0.75pt solid #999; }
.dossier section + section { margin-top: 24pt; }
.dossier .people { display: grid; grid-template-columns: 1fr 1fr; gap: 16pt 20pt; }
.dossier .person { display: grid; grid-template-columns: 0.9in 1fr; gap: 10pt; break-inside: avoid; }
.dossier .person img, .dossier .person .none { width: 0.9in; height: 1.1in; object-fit: cover; background: #eee; }
.dossier .person b { display: block; font-size: 12pt; }
.dossier .person p { margin: 2pt 0 0; font-size: 10pt; }
.dossier .mood { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6pt; }
.dossier .mood img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; }
.dossier .mood .swatch { aspect-ratio: 4 / 3; }
.dossier .foot { margin-top: 24pt; font-family: "Inter Variable", "Segoe UI", sans-serif; font-size: 8pt; color: #777; }
`;

/** The presentation file of the film [DIF-03]: cover, logline, short synopsis, intention, main characters, a moodboard. */
export async function exportDossier(api: Pick<ProjectApi, "printPdf" | "project" | "session">, boardId: string | null, logline: string): Promise<void> {
  const [tp, entries, short, intention, direction, bio] = await Promise.all([
    readTitlePage(),
    loadEntries(),
    loadDocument("short_synopsis"),
    loadDocument("intention"),
    loadDocument("direction_note"),
    loadDocument("bio"),
  ]);
  // The characters in the most scenes, with what the bible says of them.
  const count = new Map<string, number>();
  for (const s of api.session.scenes()) for (const c of s.characters) count.set(fold(c), (count.get(fold(c)) ?? 0) + 1);
  const scenesOf = (e: { name: string; aliases: string[] }) => Math.max(0, ...[e.name, ...e.aliases].map((n) => count.get(fold(n)) ?? 0));
  const people = entries
    .filter((e) => e.type === "character" && e.status !== "abandoned" && !e.archivedAt)
    .sort((a, b) => scenesOf(b) - scenesOf(a))
    .slice(0, 6);
  const photos = new Map<string, string>();
  for (const p of people) if (p.image) photos.set(p.id, await readImage(p.image).catch(() => ""));
  const mood = boardId ? (await loadItems(boardId)).filter((i) => (i.kind === "image" && i.path) || (i.kind === "color" && i.color)).slice(0, 12) : [];
  const moodImages = new Map<string, string>();
  for (const i of mood) if (i.path) moodImages.set(i.id, await readImage(i.path).catch(() => ""));
  const has = (json: string) => richPlainText(json).trim().length > 0;
  const title = tp?.title || api.project.title;
  await api.printPdf(
    `${t("diffusion.dossierFile")} - ${api.project.title}.pdf`,
    <div className="dossier">
      <div className="page cover">
        <h1>{title}</h1>
        {tp?.subtitle && <p className="sub">{tp.subtitle}</p>}
        {logline && <p className="logline">{logline}</p>}
        {tp?.authors && <p className="by">{t("diffusion.writtenBy", { authors: tp.authors.split("\n").filter(Boolean).join(", ") })}</p>}
      </div>
      <div className="page">
        {has(short.content) && (
          <section>
            <h2>{t("diffusion.docs.short_synopsis")}</h2>
            <div dangerouslySetInnerHTML={{ __html: richHtml(short.content) }} />
          </section>
        )}
        {has(intention.content) && (
          <section>
            <h2>{t("diffusion.docs.intention")}</h2>
            <div dangerouslySetInnerHTML={{ __html: richHtml(intention.content) }} />
          </section>
        )}
        {has(direction.content) && (
          <section>
            <h2>{t("diffusion.docs.direction_note")}</h2>
            <div dangerouslySetInnerHTML={{ __html: richHtml(direction.content) }} />
          </section>
        )}
      </div>
      {people.length > 0 && (
        <div className="page">
          <section>
            <h2>{t("diffusion.characters")}</h2>
            <div className="people">
              {people.map((p) => (
                <div key={p.id} className="person">
                  {photos.get(p.id) ? <img src={photos.get(p.id)} alt="" /> : <span className="none" />}
                  <div>
                    <b>{p.name}</b>
                    <p>{p.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {mood.length > 0 && (
            <section>
              <h2>{t("diffusion.mood")}</h2>
              <div className="mood">
                {mood.map((i) => (i.path ? <img key={i.id} src={moodImages.get(i.id)} alt="" /> : <span key={i.id} className="swatch" style={{ background: i.color }} />))}
              </div>
            </section>
          )}
        </div>
      )}
      {has(bio.content) && (
        <div className="page">
          <section>
            <h2>{t("diffusion.docs.bio")}</h2>
            <div dangerouslySetInnerHTML={{ __html: richHtml(bio.content) }} />
          </section>
          <p className="foot">{dateFormat({ dateStyle: "long" }).format(new Date())}</p>
        </div>
      )}
    </div>,
    { width: A4.width, height: A4.height, css: CSS },
  );
}
