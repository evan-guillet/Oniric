import "@fontsource-variable/inter";
import "./fonts.css";
import { createRoot } from "react-dom/client";
import { initLanguage, startLanguage } from "./core/i18n";
import { initTheme } from "./core/theme";
import { App } from "./App";
import "./styles.css";

async function start() {
  void initTheme();
  // The saved language comes after the cached one, so that it wins when they differ.
  const language = startLanguage();
  void language.then(initLanguage);
  await Promise.all([language, document.fonts.load('12pt "Courier Prime"'), document.fonts.load('italic 12pt "Courier Prime"')]);
  await document.fonts.ready;
  createRoot(document.getElementById("root")!).render(<App />);
}

start();
