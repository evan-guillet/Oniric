//! HTML to PDF with the Chromium engine of WebView2 (architecture, 9.3).

use std::sync::mpsc;

/// Prints the window content to PDF. The `@media print` rules of the interface decide what ends up on paper;
/// margins are part of the printed pages, so the printer adds none.
pub async fn window_to_pdf(window: tauri::WebviewWindow, path: String, width_in: f64, height_in: f64) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let fail = tx.clone();
    window
        .with_webview(move |webview| {
            if let Err(e) = print_to_pdf(&webview, &path, width_in, height_in, tx) {
                let _ = fail.send(Err(e));
            }
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn print_to_pdf(
    webview: &tauri::webview::PlatformWebview,
    path: &str,
    width_in: f64,
    height_in: f64,
    tx: mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows_core::{Interface, HSTRING};

    let err = |e: windows_core::Error| e.message();
    unsafe {
        let core = webview.controller().CoreWebView2().map_err(err)?;
        let core7: ICoreWebView2_7 = core.cast().map_err(err)?;
        let env6: ICoreWebView2Environment6 = webview.environment().cast().map_err(err)?;
        let settings = env6.CreatePrintSettings().map_err(err)?;
        settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT).map_err(err)?;
        settings.SetPageWidth(width_in).map_err(err)?;
        settings.SetPageHeight(height_in).map_err(err)?;
        settings.SetMarginTop(0.0).map_err(err)?;
        settings.SetMarginBottom(0.0).map_err(err)?;
        settings.SetMarginLeft(0.0).map_err(err)?;
        settings.SetMarginRight(0.0).map_err(err)?;
        settings.SetScaleFactor(1.0).map_err(err)?;
        settings.SetShouldPrintBackgrounds(true).map_err(err)?;
        settings.SetShouldPrintHeaderAndFooter(false).map_err(err)?;

        let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
            let outcome = match result {
                Err(e) => Err(e.message()),
                Ok(()) if !ok => Err("WebView2 n'a pas pu écrire le PDF (fichier ouvert dans un autre programme ?)".into()),
                Ok(()) => Ok(()),
            };
            let _ = tx.send(outcome);
            Ok(())
        }));
        core7.PrintToPdf(&HSTRING::from(path), &settings, &handler).map_err(err)?;
    }
    Ok(())
}

#[cfg(not(windows))]
fn print_to_pdf(
    _webview: &tauri::webview::PlatformWebview,
    _path: &str,
    _width_in: f64,
    _height_in: f64,
    _tx: mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    Err("L'export PDF passe par WebView2 et n'existe que sous Windows".into())
}
