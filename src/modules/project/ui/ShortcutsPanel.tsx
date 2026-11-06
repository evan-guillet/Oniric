import { Fragment, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { t as translate } from "../../../core/i18n";
import { ELEMENT_TYPES } from "../../script/screenplay/domain/formats";
import { NAV_KEYS, PALETTE_KEY, SETTINGS_KEY, SHORTCUTS_KEY } from "./navKeys";

let isOpen = false;
const listeners = new Set<() => void>();
function setOpen(open: boolean) {
  if (open === isOpen) return;
  isOpen = open;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const openShortcuts = () => setOpen(true);
export const toggleShortcuts = () => setOpen(!isOpen);
export const useShortcutsOpen = () => useSyncExternalStore(subscribe, () => isOpen);

/** The keys whose name changes with the language; the others (Ctrl, Tab, letters) are written as they are. */
const KEY_NAMES: Record<string, string> = { Maj: "shift", Échap: "escape", Entrée: "enter", Molette: "wheel", Clic: "click" };
const keyName = (k: string) => (KEY_NAMES[k] ? translate(`keys.${KEY_NAMES[k]}`) : k);

/** Keys as they are pressed together: « Ctrl » « K ». A « + » is a separator unless it is the key itself. */
function Keys({ keys }: { keys: string }) {
  const { t } = useTranslation();
  return (
    <span className="keys">
      {keys.split(" ").map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="keys-or">{t("settings.or")}</span>}
          {group.split(/\+(?=.)/).map((k, j) => (
            <kbd key={j}>{keyName(k)}</kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * The keyboard shortcuts, on a panel over the right of the window, from any screen. It leaves the rest of the window
 * usable, so a shortcut can be tried with the list in view, and stops under the window's own buttons, so that a second
 * click on its cross can't close the application. Mounted once, before everything else: its Échap comes first.
 */
export function ShortcutsPanel() {
  const { t } = useTranslation();
  const open = useShortcutsOpen();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!isOpen || document.querySelector("dialog[open]")) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === SHORTCUTS_KEY || e.code === "Slash")) {
        if (document.querySelector("dialog[open]:not(.palette)")) return;
        e.preventDefault();
        toggleShortcuts();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // In the top layer, over whatever is on screen, even what stacks highest; the focus goes back where it was.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    const before = document.activeElement as HTMLElement | null;
    el.showPopover();
    el.focus();
    return () => {
      const now = document.activeElement;
      if (!now || now === document.body || el.contains(now)) before?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: t("settings.sc.everywhere"),
      rows: [
        [`Ctrl+${PALETTE_KEY}`, t("settings.sc.palette")],
        [`Ctrl+${SHORTCUTS_KEY}`, t("settings.sc.shortcuts")],
        [`Ctrl+${SETTINGS_KEY}`, t("shell.settings")],
        ["Échap", t("settings.sc.close")],
      ],
    },
    {
      title: t("settings.sc.goTo"),
      rows: NAV_KEYS.map(([view, key]): [string, string] => [`Ctrl+${key}`, t(`nav.views.${view}`)]),
    },
    {
      title: t("nav.views.script"),
      rows: [
        ["Ctrl+S", t("settings.sc.save")],
        ["Ctrl+P", t("settings.sc.pdf")],
        ["Ctrl++ Ctrl+-", t("settings.sc.previewZoom")],
        ["Ctrl+Z", t("settings.sc.undo")],
        ["Ctrl+Y Ctrl+Maj+Z", t("settings.sc.redo")],
        ["/ @ [[", t("settings.sc.link")],
        ["Ctrl+Clic", t("settings.sc.openLink")],
      ],
    },
    {
      title: t("settings.sc.elements"),
      rows: [
        ["Entrée", t("settings.sc.next")],
        ["Tab", t("settings.sc.cycle")],
        ["Maj+Tab", t("settings.sc.back")],
        ...ELEMENT_TYPES.map((type, i): [string, string] => [`Ctrl+${i + 1}`, t(`elements.${type}`)]),
        ["INT. EXT.", t("settings.sc.heading")],
        ["(", t("settings.sc.paren")],
      ],
    },
    {
      title: t("settings.sc.views"),
      rows: [
        ["Ctrl+Molette", t("settings.sc.zoom")],
        ["Entrée", t("settings.sc.openScene")],
      ],
    },
    {
      title: `${t("nav.views.moodboard")} · ${t("nav.views.shotlist")}`,
      rows: [
        ["Ctrl+D", t("settings.sc.duplicate")],
        ["Ctrl+F", t("settings.sc.find")],
      ],
    },
  ];

  return (
    <aside ref={panel} className="shortcuts-panel" popover="manual" tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="shortcuts-panel-title">
      <header className="shortcuts-panel-head">
        <h2 id="shortcuts-panel-title">{t("shell.shortcuts")}</h2>
        <button type="button" className="nav-icon-btn" aria-label={t("common.close")} title={`${t("common.close")} (${keyName("Échap")})`} onClick={() => setOpen(false)}>
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="shortcuts-panel-body">
        <p className="shortcuts-panel-note">{t("settings.shortcutsNote")}</p>
        {groups.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            {g.rows.map(([keys, what]) => (
              <div className="shortcut-row" key={keys + what}>
                <span>{what}</span>
                <Keys keys={keys} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
