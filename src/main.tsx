import "@fontsource-variable/inter";
import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/400-italic.css";
import { createRoot } from "react-dom/client";
import "./core/i18n";
import { initScrollPreference } from "./core/scrollPreference";
import { initTheme } from "./core/theme";
import { App } from "./App";
import "./styles.css";

async function start() {
  void initTheme();
  void initScrollPreference();
  await Promise.all([document.fonts.load('12pt "Courier Prime"'), document.fonts.load('italic 12pt "Courier Prime"')]);
  await document.fonts.ready;
  createRoot(document.getElementById("root")!).render(<App />);
}

start();
