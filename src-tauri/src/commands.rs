//! Commands and events between the interface and the core (architecture, 4.2).

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_specta::Event;

use crate::app_data::{self, RecentProject};
use crate::db::{self, history, DbError, Rows, Statement};
use crate::project::{self, backup, CrashChoice, LockState, OpenOptions, Project, Source};
use crate::system::{self, log, Paths};

pub struct Core {
    pub paths: Paths,
    pub started: Instant,
    pub project: Mutex<Option<Project>>,
    /// Read-only connection to the open project, so that reads never wait for a write.
    pub reader: Mutex<Option<Connection>>,
    pub app_db: Mutex<Option<Connection>>,
    /// Project given on the command line (double-click on a `.oniric` file), handed once to the interface.
    pub startup_project: Mutex<Option<String>>,
    /// Backup folder when the user chose none [SAV-03].
    pub default_backup_root: PathBuf,
    pub last_backup: Mutex<Instant>,
    /// Folders the core made outside the open project (restored projects), which may be shown too.
    pub made_here: Mutex<Vec<PathBuf>>,
    /// One backup at a time: the timer's and the user's would both write the list of copies.
    pub backing_up: Mutex<()>,
}

impl Core {
    pub fn new(paths: Paths, started: Instant, startup_project: Option<String>, default_backup_root: PathBuf) -> Core {
        let app_db = app_data::open(&paths.app_data)
            .inspect_err(|e| log::error(&format!("base de l'application : {e}")))
            .ok();
        Core {
            paths,
            started,
            project: Mutex::new(None),
            reader: Mutex::new(None),
            app_db: Mutex::new(app_db),
            startup_project: Mutex::new(startup_project),
            default_backup_root,
            last_backup: Mutex::new(Instant::now()),
            made_here: Mutex::new(Vec::new()),
            backing_up: Mutex::new(()),
        }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum CoreError {
    NoProject,
    NotAProject(String),
    FolderNotEmpty(String),
    NewerFormat(String),
    LockedElsewhere(String),
    AlreadyOpen(String),
    Damaged(String),
    Refused(String),
    /// The project folder could not receive the last changes; the project stays open.
    NotSaved(String),
    Failed(String),
}

impl From<project::Error> for CoreError {
    fn from(e: project::Error) -> Self {
        let message = e.to_string();
        match e {
            project::Error::NotAProject(_) => CoreError::NotAProject(message),
            project::Error::FolderNotEmpty(_) => CoreError::FolderNotEmpty(message),
            project::Error::NewerFormat(_) => CoreError::NewerFormat(message),
            project::Error::LockedElsewhere(_) => CoreError::LockedElsewhere(message),
            project::Error::AlreadyOpenHere(_) => CoreError::AlreadyOpen(message),
            project::Error::Damaged(_) => CoreError::Damaged(message),
            _ => CoreError::Failed(message),
        }
    }
}

impl From<DbError> for CoreError {
    fn from(e: DbError) -> Self {
        match e {
            DbError::Refused(why) => CoreError::Refused(why),
            DbError::Sql(e) => CoreError::Failed(e.to_string()),
        }
    }
}

impl From<rusqlite::Error> for CoreError {
    fn from(e: rusqlite::Error) -> Self {
        CoreError::Failed(e.to_string())
    }
}

impl From<std::io::Error> for CoreError {
    fn from(e: std::io::Error) -> Self {
        CoreError::Failed(e.to_string())
    }
}

type Result<T> = std::result::Result<T, CoreError>;

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum OpenedFrom {
    ProjectFolder,
    RestoredWorkingCopy,
    RepairedFromWorkingCopy,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OpenState {
    pub dir: String,
    pub id: String,
    pub title: String,
    pub from: OpenedFrom,
    pub previous_crash: bool,
    pub kept_aside: Option<String>,
    pub notes: Vec<String>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LockStatus {
    Free,
    OpenHere,
    OpenElsewhere,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProbeState {
    pub title: String,
    pub lock: LockStatus,
    /// Computer that holds the lock, and since when (ISO 8601, UTC).
    pub lock_host: Option<String>,
    pub lock_since: Option<String>,
    pub recoverable: bool,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WriteMeta {
    pub label: String,
    pub tables: Vec<String>,
    /// False for the screenplay's text, which the editor undoes itself.
    pub undoable: bool,
}

/// A step of the undo line, as the interface sees it.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryStep {
    pub label: String,
    /// The depth of the editor's history after the action, when the editor undoes it.
    pub editor: Option<u32>,
}

impl From<history::StepInfo> for HistoryStep {
    fn from(s: history::StepInfo) -> Self {
        HistoryStep { label: s.label, editor: s.editor }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HistoryState {
    pub undo: Option<HistoryStep>,
    pub redo: Option<HistoryStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "db:changed")]
pub struct DbChanged {
    pub tables: Vec<String>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "project:flushed")]
pub struct ProjectFlushed {
    pub micros: u32,
    pub bytes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "project:flush-failed")]
pub struct ProjectFlushFailed {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "backup:done")]
pub struct BackupDone {
    pub entry: backup::Entry,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "backup:failed")]
pub struct BackupFailed {
    pub message: String,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupState {
    pub settings: backup::Settings,
    /// The folder that receives the copies: the chosen one, or the default one.
    pub root: String,
    /// The folder of the open project inside it, and its copies, most recent first.
    pub folder: Option<String>,
    pub copies: Vec<backup::Entry>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SavedFile {
    /// Path inside the project folder, with `/`.
    pub path: String,
    pub sha256: String,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StartupReport {
    pub ms_to_ready: u32,
    pub version: String,
    pub portable: bool,
}

fn options(core: &Core, restore: bool, force_lock: bool) -> OpenOptions {
    let on_crash = if restore { CrashChoice::Restore } else { CrashChoice::Discard };
    OpenOptions { work_root: core.paths.work_root(), on_crash, force_lock }
}

fn opened(p: &Project, report: project::OpenReport) -> OpenState {
    OpenState {
        dir: p.dir().display().to_string(),
        id: p.manifest().id.clone(),
        title: p.manifest().title.clone(),
        from: match report.source {
            Source::ProjectFolder => OpenedFrom::ProjectFolder,
            Source::RestoredWorkingCopy => OpenedFrom::RestoredWorkingCopy,
            Source::RepairedFromWorkingCopy => OpenedFrom::RepairedFromWorkingCopy,
        },
        previous_crash: report.previous_crash,
        kept_aside: report.kept_aside.map(|p| p.display().to_string()),
        notes: report.notes,
    }
}

const BACKUP_SETTING: &str = "backup";

fn backup_settings(core: &Core) -> backup::Settings {
    let raw = core.app_db.lock().unwrap().as_ref().and_then(|c| app_data::setting(c, BACKUP_SETTING).ok().flatten());
    raw.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn backup_root(core: &Core, settings: &backup::Settings) -> PathBuf {
    settings.dir.as_deref().map(str::trim).filter(|d| !d.is_empty()).map(PathBuf::from).unwrap_or_else(|| core.default_backup_root.clone())
}

/// A backup copy of the open project, if it changed since the last one (or always, with `force`).
pub fn backup_current(core: &Core, kind: &str, force: bool) -> Result<Option<backup::Entry>> {
    let settings = backup_settings(core);
    let root = backup_root(core, &settings);
    let _one = core.backing_up.lock().unwrap();
    let mut slot = core.project.lock().unwrap();
    let Some(p) = slot.as_mut() else { return Ok(None) };
    if !force && !p.needs_backup() {
        return Ok(None);
    }
    let copy = p.backup(&root, kind).inspect_err(|e| log::error(&format!("sauvegarde : {e}")))?;
    drop(slot);
    // The medias are files of their own: copying them does not hold up the writes.
    let entry = copy.finish(settings.keep).inspect_err(|e| log::error(&format!("sauvegarde : {e}")))?;
    *core.last_backup.lock().unwrap() = Instant::now();
    log::info(&format!("sauvegarde {} ({} octets)", entry.file, entry.bytes));
    Ok(Some(entry))
}

/// Called every few seconds: a copy every `every_minutes` while the project changes.
pub fn backup_tick(app: &AppHandle) {
    let core = app.state::<Core>();
    let every = backup_settings(&core).every_minutes.max(1) as u64 * 60;
    {
        let mut last = core.last_backup.lock().unwrap();
        if last.elapsed().as_secs() < every {
            return;
        }
        *last = Instant::now();
    }
    match backup_current(&core, "auto", false) {
        Ok(Some(entry)) => {
            let _ = BackupDone { entry }.emit(app);
        }
        Ok(None) => {}
        Err(e) => {
            let _ = BackupFailed { message: format!("{e:?}") }.emit(app);
        }
    }
}

fn install(core: &Core, p: Project) -> Result<()> {
    let reader = p.open_reader()?;
    if let Some(app_db) = core.app_db.lock().unwrap().as_ref() {
        let _ = app_data::touch(app_db, &p.dir().display().to_string(), &p.manifest().title);
    }
    log::info(&format!("projet ouvert ({})", p.manifest().id));
    *core.reader.lock().unwrap() = Some(reader);
    *core.project.lock().unwrap() = Some(p);
    *core.last_backup.lock().unwrap() = Instant::now();
    Ok(())
}

/// Closes the open project. If the last flush fails, the project stays open unless `force` is set;
/// a forced close keeps the working copy, which the next opening recovers.
pub fn close_current(core: &Core, force: bool) -> Result<()> {
    let _ = backup_current(core, "fermeture", false);
    let mut slot = core.project.lock().unwrap();
    let Some(p) = slot.take() else { return Ok(()) };
    drop(core.reader.lock().unwrap().take());
    let id = p.manifest().id.clone();
    match p.close() {
        Ok(()) => {
            log::info(&format!("projet fermé ({id})"));
            Ok(())
        }
        Err(failure) => {
            log::error(&format!("fermeture du projet {id} : {}", failure.error));
            match failure.project {
                Some(p) if !force => {
                    if let Ok(reader) = p.open_reader() {
                        *core.reader.lock().unwrap() = Some(reader);
                    }
                    *slot = Some(p);
                    Err(CoreError::NotSaved(failure.error.to_string()))
                }
                _ if force => Ok(()),
                _ => Err(CoreError::Failed(failure.error.to_string())),
            }
        }
    }
}

fn project_dir(core: &Core) -> Result<PathBuf> {
    Ok(core.project.lock().unwrap().as_ref().ok_or(CoreError::NoProject)?.dir().to_path_buf())
}

fn inside(path: &Path, dir: &Path) -> bool {
    path.canonicalize().ok().zip(dir.canonicalize().ok()).is_some_and(|(p, d)| p.starts_with(d))
}

/// Images above this size are refused rather than sent to the interface as one string.
const MEDIA_MAX_BYTES: u64 = 64 * 1024 * 1024;

#[tauri::command]
#[specta::specta]
pub fn app_ready(app: AppHandle, core: State<'_, Core>) -> StartupReport {
    let ms = core.started.elapsed().as_millis() as u32;
    if let Ok(path) = std::env::var("ONIRIC_MESURE_DEMARRAGE") {
        let _ = fs::write(path, ms.to_string());
        let _ = close_current(&core, true);
        app.exit(0);
    }
    StartupReport { ms_to_ready: ms, version: app.package_info().version.to_string(), portable: core.paths.portable }
}

#[tauri::command]
#[specta::specta]
pub fn startup_project(core: State<'_, Core>) -> Option<String> {
    core.startup_project.lock().unwrap().take()
}

#[tauri::command]
#[specta::specta]
pub fn default_projects_dir(app: AppHandle) -> Result<String> {
    let docs = app.path().document_dir().map_err(|e| CoreError::Failed(e.to_string()))?;
    Ok(docs.join("Oniric").display().to_string())
}

#[tauri::command]
#[specta::specta]
pub fn recent_list(core: State<'_, Core>) -> Result<Vec<RecentProject>> {
    match core.app_db.lock().unwrap().as_ref() {
        Some(conn) => Ok(app_data::list(conn)?),
        None => Ok(vec![]),
    }
}

#[tauri::command]
#[specta::specta]
pub fn recent_forget(core: State<'_, Core>, path: String) -> Result<()> {
    if let Some(conn) = core.app_db.lock().unwrap().as_ref() {
        app_data::forget(conn, &path)?;
    }
    Ok(())
}

/// The folder a new project titled `title` would get inside `parent`.
#[tauri::command]
#[specta::specta]
pub fn project_folder_for(parent: String, title: String) -> String {
    Path::new(&parent).join(system::file_name(&title)).display().to_string()
}

#[tauri::command]
#[specta::specta]
pub fn project_probe(core: State<'_, Core>, dir: String) -> Result<ProbeState> {
    let probe = Project::probe(Path::new(&dir), &core.paths.work_root())?;
    let (lock, info) = match probe.lock {
        LockState::Free | LockState::Stale(_) => (LockStatus::Free, None),
        LockState::HeldHere(i) => (LockStatus::OpenHere, Some(i)),
        LockState::HeldElsewhere(i) => (LockStatus::OpenElsewhere, Some(i)),
    };
    Ok(ProbeState {
        title: probe.manifest.title,
        lock,
        lock_host: info.as_ref().map(|i| i.host.clone()),
        lock_since: info.map(|i| system::iso_utc(i.since)),
        recoverable: probe.recoverable,
    })
}

#[tauri::command]
#[specta::specta]
pub fn project_create(core: State<'_, Core>, parent: String, title: String) -> Result<OpenState> {
    close_current(&core, false)?;
    let title = title.trim();
    if title.is_empty() {
        return Err(CoreError::Failed("le titre est vide".into()));
    }
    let dir = Path::new(&parent).join(system::file_name(title));
    let p = Project::create(&dir, title, &options(&core, true, false))?;
    let report = project::OpenReport { source: Source::ProjectFolder, previous_crash: false, kept_aside: None, notes: vec![], migration_backup: None };
    let state = opened(&p, report);
    install(&core, p)?;
    Ok(state)
}

#[tauri::command]
#[specta::specta]
pub fn project_open(core: State<'_, Core>, dir: String, restore: bool, force_lock: bool) -> Result<OpenState> {
    close_current(&core, false)?;
    let (p, report) = Project::open(Path::new(&dir), &options(&core, restore, force_lock))
        .inspect_err(|e| log::error(&format!("ouverture : {e}")))?;
    for note in &report.notes {
        log::info(note);
    }
    if let Some(file) = &report.migration_backup {
        let kind = file.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let root = backup_root(&core, &backup_settings(&core));
        if let Err(e) = backup::store(file, p.manifest(), &root, &kind) {
            log::error(&format!("copie d'avant migration vers les sauvegardes : {e}"));
        }
    }
    let state = opened(&p, report);
    install(&core, p)?;
    Ok(state)
}

#[tauri::command]
#[specta::specta]
pub fn project_close(core: State<'_, Core>, force: bool) -> Result<()> {
    close_current(&core, force)
}

#[tauri::command]
#[specta::specta]
pub fn db_query(core: State<'_, Core>, query: Statement) -> Result<Rows> {
    let reader = core.reader.lock().unwrap();
    let conn = reader.as_ref().ok_or(CoreError::NoProject)?;
    Ok(db::query(conn, &query)?)
}

#[tauri::command]
#[specta::specta]
pub fn db_write(app: AppHandle, core: State<'_, Core>, batch: Vec<Statement>, meta: WriteMeta) -> Result<u32> {
    let mut slot = core.project.lock().unwrap();
    let p = slot.as_mut().ok_or(CoreError::NoProject)?;
    let (changed, changes) = p.write(|tx| history::capture(tx, || db::write(tx, &batch, &meta.label, &meta.tables)))?;
    if meta.undoable {
        p.history.record(&meta.label, &meta.tables, changes);
    }
    drop(slot);
    let _ = DbChanged { tables: meta.tables, label: meta.label }.emit(&app);
    Ok(changed as u32)
}

/// The next steps Ctrl+Z and Ctrl+Y would take.
#[tauri::command]
#[specta::specta]
pub fn history_state(core: State<'_, Core>) -> Result<HistoryState> {
    let slot = core.project.lock().unwrap();
    let p = slot.as_ref().ok_or(CoreError::NoProject)?;
    Ok(HistoryState { undo: p.history.next_undo().map(Into::into), redo: p.history.next_redo().map(Into::into) })
}

/// Puts an action done in the screenplay editor in the undo line; `absorb` joins the write just made for it.
#[tauri::command]
#[specta::specta]
pub fn history_mark(core: State<'_, Core>, label: String, depth: u32, absorb: bool) -> Result<()> {
    let mut slot = core.project.lock().unwrap();
    let p = slot.as_mut().ok_or(CoreError::NoProject)?;
    p.history.mark(&label, depth, absorb);
    Ok(())
}

/// Forgets the next step to undo (or redo), already undone in the editor.
#[tauri::command]
#[specta::specta]
pub fn history_drop(core: State<'_, Core>, redo: bool) -> Result<()> {
    let mut slot = core.project.lock().unwrap();
    let p = slot.as_mut().ok_or(CoreError::NoProject)?;
    p.history.drop_next(redo);
    Ok(())
}

/// Undoes (or redoes) the next step in the database; the editor does its part when the step says so.
#[tauri::command]
#[specta::specta]
pub fn history_step(app: AppHandle, core: State<'_, Core>, redo: bool) -> Result<Option<HistoryStep>> {
    let mut slot = core.project.lock().unwrap();
    let p = slot.as_mut().ok_or(CoreError::NoProject)?;
    let mut line = std::mem::take(&mut p.history);
    let done = p.write(|tx| {
        let step = if redo { line.redo(tx)? } else { line.undo(tx)? };
        if let Some(s) = &step {
            let label = format!("{} : {}", if redo { "Rétablir" } else { "Annuler" }, s.label);
            tx.execute(
                "INSERT INTO oniric_journal (at, label, tables) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?1, ?2)",
                [&label, &s.tables.join(",")],
            )?;
        }
        Ok::<_, rusqlite::Error>(step)
    });
    p.history = line;
    let step = done.map_err(|e| CoreError::Failed(e.to_string()))?;
    drop(slot);
    if let Some(s) = &step {
        if !s.tables.is_empty() {
            let _ = DbChanged { tables: s.tables.clone(), label: s.label.clone() }.emit(&app);
        }
    }
    Ok(step.map(Into::into))
}

/// A new title for the project in `dir`, open or not; its folder keeps its name.
#[tauri::command]
#[specta::specta]
pub fn project_rename(core: State<'_, Core>, dir: String, title: String) -> Result<String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(CoreError::Failed("le titre est vide".into()));
    }
    {
        let mut slot = core.project.lock().unwrap();
        match slot.as_mut() {
            Some(p) if Path::new(&dir) == p.dir() => p.retitle(&title)?,
            _ => Project::retitle_closed(Path::new(&dir), &title)?,
        }
    }
    if let Some(conn) = core.app_db.lock().unwrap().as_ref() {
        app_data::retitle(conn, &dir, &title)?;
    }
    Ok(title)
}

pub fn flush_now(app: &AppHandle) -> Result<Option<ProjectFlushed>> {
    let core = app.state::<Core>();
    let mut slot = core.project.lock().unwrap();
    let Some(p) = slot.as_mut() else { return Ok(None) };
    match p.flush() {
        Ok(None) => Ok(None),
        Ok(Some(stats)) => {
            drop(slot);
            let ev = ProjectFlushed { micros: stats.duration.as_micros() as u32, bytes: stats.bytes as u32 };
            let _ = ev.clone().emit(app);
            Ok(Some(ev))
        }
        Err(e) => {
            drop(slot);
            let message = e.to_string();
            log::error(&format!("recopie dans le dossier projet : {message}"));
            let _ = ProjectFlushFailed { message: message.clone() }.emit(app);
            Err(CoreError::NotSaved(message))
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn project_flush(app: AppHandle) -> Result<Option<ProjectFlushed>> {
    flush_now(&app)
}

fn export_path(core: &Core, file_name: &str) -> Result<PathBuf> {
    let dir = project_dir(core)?.join("exports");
    fs::create_dir_all(&dir)?;
    Ok(dir.join(system::file_name(file_name)))
}

/// Prints the main window to `exports/<file_name>` and returns the full path.
#[tauri::command]
#[specta::specta]
pub async fn export_pdf(window: WebviewWindow, core: State<'_, Core>, file_name: String, width_in: f64, height_in: f64) -> Result<String> {
    let path = export_path(&core, &file_name)?;
    let shown = path.display().to_string();
    crate::documents::window_to_pdf(window, shown.clone(), width_in, height_in).await.map_err(CoreError::Failed)?;
    Ok(shown)
}

#[tauri::command]
#[specta::specta]
pub fn export_text(core: State<'_, Core>, file_name: String, contents: String) -> Result<String> {
    let path = export_path(&core, &file_name)?;
    project::fsx::write_atomically(&path, contents.as_bytes())?;
    Ok(path.display().to_string())
}

/// Opens a file of the project with its default application, or shows it in the Explorer.
#[tauri::command]
#[specta::specta]
pub fn reveal(core: State<'_, Core>, path: String, open: bool) -> Result<()> {
    let path = PathBuf::from(path);
    let made_here = core.made_here.lock().unwrap().iter().any(|d| inside(&path, d));
    if !made_here && !project_dir(&core).is_ok_and(|dir| inside(&path, &dir)) {
        return Err(CoreError::Refused("seuls les fichiers du projet ouvert peuvent être montrés".into()));
    }
    let done = if open { tauri_plugin_opener::open_path(&path, None::<&str>) } else { tauri_plugin_opener::reveal_item_in_dir(&path) };
    done.map_err(|e| CoreError::Failed(e.to_string()))
}

#[tauri::command]
#[specta::specta]
pub fn app_setting_get(core: State<'_, Core>, key: String) -> Result<Option<String>> {
    match core.app_db.lock().unwrap().as_ref() {
        Some(conn) => Ok(app_data::setting(conn, &key)?),
        None => Ok(None),
    }
}

#[tauri::command]
#[specta::specta]
pub fn app_setting_set(core: State<'_, Core>, key: String, value: String) -> Result<()> {
    if key == BACKUP_SETTING {
        return Err(CoreError::Refused("les réglages de sauvegarde passent par backup_settings_set".into()));
    }
    let db = core.app_db.lock().unwrap();
    let conn = db.as_ref().ok_or_else(|| CoreError::Failed("base de l'application indisponible".into()))?;
    Ok(app_data::set_setting(conn, &key, &value)?)
}

#[tauri::command]
#[specta::specta]
pub fn backup_state(core: State<'_, Core>) -> Result<BackupState> {
    let settings = backup_settings(&core);
    let root = backup_root(&core, &settings);
    let manifest = core.project.lock().unwrap().as_ref().map(|p| p.manifest().clone());
    let (folder, copies) = match &manifest {
        Some(m) => (Some(backup::folder(&root, m).display().to_string()), backup::list(&root, m)),
        None => (None, vec![]),
    };
    Ok(BackupState { settings, root: root.display().to_string(), folder, copies })
}

#[tauri::command]
#[specta::specta]
pub fn backup_settings_set(core: State<'_, Core>, settings: backup::Settings) -> Result<()> {
    let settings = backup::Settings { every_minutes: settings.every_minutes.clamp(5, 24 * 60), keep: settings.keep.clamp(1, 1000), ..settings };
    let json = serde_json::to_string(&settings).unwrap();
    let db = core.app_db.lock().unwrap();
    let conn = db.as_ref().ok_or_else(|| CoreError::Failed("base de l'application indisponible".into()))?;
    Ok(app_data::set_setting(conn, BACKUP_SETTING, &json)?)
}

#[tauri::command]
#[specta::specta]
pub fn backup_now(app: AppHandle, core: State<'_, Core>) -> Result<backup::Entry> {
    let entry = backup_current(&core, "manuelle", true)?.ok_or(CoreError::NoProject)?;
    let _ = BackupDone { entry: entry.clone() }.emit(&app);
    Ok(entry)
}

/// Rebuilds a project folder from the copy `file`, inside `dest_parent`, and returns the new folder.
#[tauri::command]
#[specta::specta]
pub fn backup_restore(core: State<'_, Core>, file: String, dest_parent: String) -> Result<String> {
    let dir = backup::restore(Path::new(&file), Path::new(&dest_parent))?;
    log::info(&format!("projet restauré depuis {file}"));
    core.made_here.lock().unwrap().push(dir.clone());
    Ok(dir.display().to_string())
}

/// Shows the backup folder of the open project (or the backup folder itself) in the Explorer.
#[tauri::command]
#[specta::specta]
pub fn backup_reveal(core: State<'_, Core>) -> Result<()> {
    let state = backup_state(core)?;
    let dir = PathBuf::from(state.folder.filter(|f| Path::new(f).exists()).unwrap_or(state.root));
    fs::create_dir_all(&dir)?;
    tauri_plugin_opener::open_path(&dir, None::<&str>).map_err(|e| CoreError::Failed(e.to_string()))
}

fn relative(dir: &Path, path: &Path) -> String {
    path.strip_prefix(dir).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

/// Copies a file into `medias/<kind>/` of the open project and returns its path inside the project [FIC-03].
#[tauri::command]
#[specta::specta]
pub fn media_import(core: State<'_, Core>, source: String, kind: String) -> Result<String> {
    let dir = project_dir(&core)?;
    let kind = system::file_name(&kind);
    let target_dir = dir.join("medias").join(&kind);
    fs::create_dir_all(&target_dir)?;
    let source = PathBuf::from(source);
    let stem = system::file_name(&source.file_stem().unwrap_or_default().to_string_lossy());
    let ext = source.extension().map(|e| format!(".{}", e.to_string_lossy().to_lowercase())).unwrap_or_default();
    let mut target = target_dir.join(format!("{stem}{ext}"));
    let mut n = 2;
    while target.exists() {
        target = target_dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    let tmp = target_dir.join(format!(".import-{}-{}.tmp", std::process::id(), system::now_nanos()));
    fs::copy(&source, &tmp)?;
    project::fsx::sync_file(&tmp)?;
    project::fsx::replace_atomically(&tmp, &target)?;
    Ok(relative(&dir, &target))
}

fn mime(path: &Path) -> &'static str {
    match path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        _ => "application/octet-stream",
    }
}

/// A file of the open project as a `data:` URL, to show an image.
#[tauri::command]
#[specta::specta]
pub fn media_read(core: State<'_, Core>, path: String) -> Result<String> {
    use base64::Engine;
    let dir = project_dir(&core)?;
    let full = dir.join(&path);
    if !inside(&full, &dir) {
        return Err(CoreError::Refused("seuls les fichiers du projet ouvert peuvent être lus".into()));
    }
    if fs::metadata(&full)?.len() > MEDIA_MAX_BYTES {
        return Err(CoreError::Refused(format!("image de plus de {} Mo", MEDIA_MAX_BYTES >> 20)));
    }
    let bytes = fs::read(&full)?;
    Ok(format!("data:{};base64,{}", mime(&full), base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Writes a frozen version of the screenplay in `versions/`, with its SHA-256 fingerprint [REE-01].
#[tauri::command]
#[specta::specta]
pub fn version_save(core: State<'_, Core>, name: String, contents: String) -> Result<SavedFile> {
    let dir = project_dir(&core)?;
    let versions = dir.join("versions");
    fs::create_dir_all(&versions)?;
    let path = versions.join(format!("{}_{}.json", system::local_stamp(), system::file_name(&name)));
    project::fsx::write_atomically(&path, contents.as_bytes())?;
    Ok(SavedFile { path: relative(&dir, &path), sha256: backup::sha256_bytes(contents.as_bytes()) })
}

#[tauri::command]
#[specta::specta]
pub fn version_read(core: State<'_, Core>, path: String) -> Result<String> {
    let dir = project_dir(&core)?;
    let full = dir.join(&path);
    if !inside(&full, &dir.join("versions")) {
        return Err(CoreError::Refused("seules les versions du projet ouvert peuvent être lues".into()));
    }
    Ok(fs::read_to_string(full)?)
}
