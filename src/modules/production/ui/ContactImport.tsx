import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { describeError } from "../../../core/errors";
import { plural, t } from "../../../core/i18n";
import { confirmRemoval, Dialog } from "../../../ui-kit/Dialog";
import { useProject } from "../../project/ui/projectContext";
import { addContacts, loadTeam, readBook, removeFromBook, takeFromBook, useTeam, type BookCard } from "../application/team";
import { cardsFromCsv, cardsFromVCard, samePerson, type Card } from "../domain/contacts";
import { Avatar } from "./parts";

const csvLabels = () => Object.fromEntries((["name", "phone", "email", "address", "language", "trades", "agent", "regime", "diet", "allergies", "emergency", "notes"] as const).map((f) => [f, t(`team.fields.${f}`)]));

/** Adds the people of a CSV or vCard file, those already in the project left out; null when the file holds nobody [EQU-08]. */
export async function importContactFile(text: string, name: string): Promise<{ count: number; skipped: number } | null> {
  const cards = /\.vcf$|\.vcard$/i.test(name) || /BEGIN:VCARD/i.test(text) ? cardsFromVCard(text) : cardsFromCsv(text, csvLabels());
  if (cards.length === 0) return null;
  const { contacts } = await loadTeam();
  const fresh = cards.filter((c) => !contacts.some((k) => samePerson(k, c)));
  if (fresh.length) await addContacts(fresh);
  return { count: fresh.length, skipped: cards.length - fresh.length };
}

/** The cards of the address book of this computer, to copy into the project [EQU-01, RG-04]. */
export function ContactBookDialog({ onClose, onTaken }: { onClose: () => void; onTaken: () => void }) {
  const { notify, ask } = useProject();
  const team = useTeam();
  const [cards, setCards] = useState<BookCard[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    readBook()
      .then(setCards)
      .catch((e: unknown) => {
        notify({ text: describeError(e), tone: "error" });
        onClose();
      });
    // Read once, when the window opens.
  }, []);
  if (!team || !cards) return null;
  const here = (c: Card & { id: string }) => team.contacts.some((k) => k.bookId === c.id || samePerson(k, c));
  const take = async () => {
    try {
      const n = await takeFromBook(cards.filter((c) => picked.has(c.id)));
      notify({ text: plural("team.takenFromBook", n) });
      onTaken();
    } catch (e) {
      notify({ text: describeError(e), tone: "error" });
    }
  };
  return (
    <Dialog
      title={t("team.bookTitle")}
      onCancel={onClose}
      actions={[
        { label: t("common.cancel"), onClick: onClose },
        { label: picked.size ? t("team.takeN", { count: picked.size }) : t("team.take"), primary: true, disabled: picked.size === 0, onClick: () => void take() },
      ]}
    >
      <p className="muted">{t("team.bookHelp")}</p>
      {cards.length === 0 ? (
        <p className="pr-empty-box muted">{t("team.bookEmpty")}</p>
      ) : (
        <ul className="pr-book-list">
          {cards.map((c) => {
            const already = here(c);
            return (
              <li key={c.id}>
                <label className={already ? "choice muted" : "choice"}>
                  <input
                    type="checkbox"
                    disabled={already}
                    checked={picked.has(c.id)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(c.id);
                      else next.delete(c.id);
                      setPicked(next);
                    }}
                  />
                  <Avatar name={c.name} size={24} />
                  <span className="pr-row-text">
                    <span className="pr-row-title">{c.name}</span>
                    <span className="pr-row-sub">{already ? t("team.alreadyHere") : c.data.trades.join(", ")}</span>
                  </span>
                </label>
                <button
                  type="button"
                  className="btn tiny ghost"
                  aria-label={t("team.forget", { name: c.name })}
                  title={t("team.forget", { name: c.name })}
                  onClick={async () => {
                    if (!(await confirmRemoval(ask, { title: t("team.forgetTitle", { name: c.name }), text: t("team.forgetText"), label: t("common.removeAction") }))) return;
                    await removeFromBook(c.id);
                    setCards(cards.filter((x) => x.id !== c.id));
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
