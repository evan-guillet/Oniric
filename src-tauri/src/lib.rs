//! Oniric's core (architecture, section 4). Without the "app" feature, only the parts that need no Tauri build.

pub mod app_data;
pub mod db;
pub mod project;
pub mod system;

#[cfg(feature = "app")]
mod commands;
#[cfg(feature = "app")]
mod documents;

#[cfg(feature = "app")]
pub use app::{export_types, run};

#[cfg(feature = "app")]
mod app {
    use crate::commands::{self, BackupDone, BackupFailed, Core, DbChanged, ProjectFlushFailed, ProjectFlushed};
    use crate::system::{log, Paths};
    use specta_typescript::Typescript;
    use std::time::{Duration, Instant};
    use tauri::{Manager, RunEvent};
    use tauri_specta::{collect_commands, collect_events, Builder};

    const FLUSH_EVERY: Duration = Duration::from_secs(30);
    const EXIT_GRACE: Duration = Duration::from_secs(5);

    #[cfg(windows)]
    fn force_exit() {
        use windows_sys::Win32::System::Threading::{GetCurrentProcess, TerminateProcess};
        // TerminateProcess skips the DLL detach work that ExitProcess would wait on again.
        unsafe { TerminateProcess(GetCurrentProcess(), 0) };
    }

    #[cfg(not(windows))]
    fn force_exit() {
        std::process::exit(0);
    }

    fn builder() -> Builder<tauri::Wry> {
        Builder::<tauri::Wry>::new()
            .commands(collect_commands![
                commands::app_ready,
                commands::startup_project,
                commands::default_projects_dir,
                commands::recent_list,
                commands::recent_forget,
                commands::project_folder_for,
                commands::project_probe,
                commands::project_create,
                commands::project_open,
                commands::project_close,
                commands::project_flush,
                commands::db_query,
                commands::db_write,
                commands::history_state,
                commands::history_mark,
                commands::history_drop,
                commands::history_step,
                commands::project_rename,
                commands::export_pdf,
                commands::export_text,
                commands::reveal,
                commands::app_setting_get,
                commands::app_setting_set,
                commands::backup_state,
                commands::backup_settings_set,
                commands::backup_now,
                commands::backup_restore,
                commands::backup_reveal,
                commands::media_import,
                commands::media_read,
                commands::media_write,
                commands::version_save,
                commands::version_read,
            ])
            .events(collect_events![DbChanged, ProjectFlushed, ProjectFlushFailed, BackupDone, BackupFailed])
    }

    /// `oniric --exporter-types chemin\bindings.ts` writes the TypeScript bindings and exits.
    pub fn export_types(path: &str) -> Result<(), String> {
        builder().export(Typescript::default(), path).map_err(|e| e.to_string())
    }

    /// Browser shortcuts (F5, Ctrl+R, Ctrl+P, Ctrl+F…) would reload or print the interface itself: they are off,
    /// except in development builds, which keep the developer tools.
    #[cfg(windows)]
    fn harden(window: &tauri::WebviewWindow) {
        if cfg!(debug_assertions) {
            return;
        }
        let _ = window.with_webview(|w| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
            use windows_core::Interface;
            let Ok(core) = w.controller().CoreWebView2() else { return };
            let Ok(settings) = core.Settings() else { return };
            let _ = settings.SetIsStatusBarEnabled(false);
            if let Ok(s3) = settings.cast::<ICoreWebView2Settings3>() {
                let _ = s3.SetAreBrowserAcceleratorKeysEnabled(false);
            }
        });
    }

    #[cfg(not(windows))]
    fn harden(_window: &tauri::WebviewWindow) {}

    pub fn run(started: Instant, startup_project: Option<String>) {
        let builder = builder();
        let every = std::env::var("ONIRIC_RECOPIE_S")
            .ok()
            .and_then(|s| s.parse().ok())
            .map(Duration::from_secs)
            .unwrap_or(FLUSH_EVERY);
        let app = tauri::Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_opener::init())
            .invoke_handler(builder.invoke_handler())
            .setup(move |app| {
                let path = app.path();
                let exe_dir = std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.to_path_buf()));
                let paths = Paths::resolve(path.data_dir()?, path.local_data_dir()?, exe_dir.as_deref());
                log::init(&paths.logs());
                log::info(&format!("démarrage d'Oniric {}", app.package_info().version));
                let backups = if paths.portable {
                    paths.app_data.join("sauvegardes")
                } else {
                    path.document_dir()?.join("Oniric").join("Sauvegardes")
                };
                app.manage(Core::new(paths, started, startup_project, backups));
                builder.mount_events(app);
                if let Some(window) = app.get_webview_window("main") {
                    harden(&window);
                }
                let handle = app.handle().clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(every);
                    let _ = commands::flush_now(&handle);
                    commands::backup_tick(&handle);
                });
                Ok(())
            })
            .build(tauri::generate_context!())
            .expect("échec du lancement d'Oniric");
        app.run(|handle, event| {
            if let RunEvent::Exit = event {
                if let Some(core) = handle.try_state::<Core>() {
                    let _ = commands::close_current(&core, true);
                }
                log::info("arrêt d'Oniric");
                // Everything is saved and closed by now. Seen on Windows: the process lingering, windowless, for
                // minutes after this point, which locks the executable; past a few seconds, end it outright.
                std::thread::spawn(|| {
                    std::thread::sleep(EXIT_GRACE);
                    log::info("arrêt forcé : le processus ne s'était pas terminé après la fermeture");
                    force_exit();
                });
            }
        });
    }
}
