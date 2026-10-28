//! A project folder edited through a local working copy (architecture, section 7).
//!
//! The database in the project folder is only ever replaced as a whole, by a complete and checked file,
//! so a removed USB key or a sync client never sees a half-written database.

pub mod backup;
pub mod fsx;
pub mod lock;
pub mod migrations;

use rusqlite::{Connection, OpenFlags, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::db::history::{self, History};
use fsx::sibling;
pub use lock::{LockInfo, LockState};

pub const FORMAT_VERSION: u32 = 1;
pub const DB: &str = "donnees.db";
pub const MANIFEST: &str = "projet.oniric";
pub const LOCK: &str = ".verrou";
pub const FOLDERS: [&str; 3] = ["medias", "exports", "versions"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: String,
    pub format_version: u32,
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_with: Option<String>,
    pub database: String,
}

#[derive(Debug)]
pub enum Error {
    NotAProject(String),
    FolderNotEmpty(PathBuf),
    NewerFormat(u32),
    LockedElsewhere(LockInfo),
    AlreadyOpenHere(LockInfo),
    Damaged(String),
    Io(io::Error),
    Sql(rusqlite::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NotAProject(why) => write!(f, "ce dossier n'est pas un projet Oniric ({why})"),
            Error::FolderNotEmpty(p) => write!(f, "le dossier {} existe déjà et n'est pas vide", p.display()),
            Error::NewerFormat(v) => write!(f, "projet créé par une version plus récente d'Oniric (format {v})"),
            Error::LockedElsewhere(i) => write!(f, "ce projet semble ouvert sur {} (processus {})", i.host, i.pid),
            Error::AlreadyOpenHere(i) => write!(f, "ce projet est déjà ouvert sur ce PC (processus {})", i.pid),
            Error::Damaged(why) => write!(f, "projet endommagé : {why}"),
            Error::Io(e) => write!(f, "erreur de fichier : {e}"),
            Error::Sql(e) => write!(f, "erreur de base de données : {e}"),
        }
    }
}

impl From<io::Error> for Error {
    fn from(e: io::Error) -> Self {
        Error::Io(e)
    }
}

impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        Error::Sql(e)
    }
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CrashChoice {
    Restore,
    Discard,
}

#[derive(Debug, Clone)]
pub struct OpenOptions {
    pub work_root: PathBuf,
    pub on_crash: CrashChoice,
    pub force_lock: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    ProjectFolder,
    RestoredWorkingCopy,
    RepairedFromWorkingCopy,
}

#[derive(Debug)]
pub struct OpenReport {
    pub source: Source,
    pub previous_crash: bool,
    pub kept_aside: Option<PathBuf>,
    pub notes: Vec<String>,
    /// Copy of the database taken before a format update.
    pub migration_backup: Option<PathBuf>,
}

/// What can be known about a project before opening it, to ask the user the right question.
#[derive(Debug)]
pub struct Probe {
    pub manifest: Manifest,
    pub lock: LockState,
    /// A working copy left by a crash holds more recent work than the project folder.
    pub recoverable: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct FlushStats {
    pub duration: Duration,
    pub bytes: u64,
}

pub struct Project {
    dir: PathBuf,
    work_dir: PathBuf,
    manifest: Manifest,
    conn: Connection,
    dirty: bool,
    /// Something was written since the last backup copy.
    unsaved_in_backup: bool,
    /// What Ctrl+Z undoes, for this session only.
    pub history: History,
}

#[derive(Debug, Default)]
struct DbState {
    flush_id: Option<String>,
    /// Every snapshot attempted since the last one known to be in the project folder, that one included.
    flush_history: Vec<String>,
    user_version: u32,
}

impl DbState {
    /// The working copy descends from the project folder if the folder holds one of its snapshots.
    fn descends_from(&self, project: &DbState) -> bool {
        project.flush_id.as_ref().is_some_and(|id| self.flush_id.as_ref() == Some(id) || self.flush_history.contains(id))
    }
}

fn meta_get(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM oniric_meta WHERE key = ?1", [key], |r| r.get(0)).optional()
}

fn meta_set(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO oniric_meta (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        [key, value],
    )?;
    Ok(())
}

fn random_id(conn: &Connection) -> rusqlite::Result<String> {
    conn.query_row("SELECT lower(hex(randomblob(16)))", [], |r| r.get(0))
}

/// UUID version 7: sortable by creation time (architecture, 6.3).
pub fn uuid_v7(conn: &Connection) -> rusqlite::Result<String> {
    let rand: Vec<u8> = conn.query_row("SELECT randomblob(10)", [], |r| r.get(0))?;
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    let mut b = [0u8; 16];
    b[..6].copy_from_slice(&ms.to_be_bytes()[2..]);
    b[6] = 0x70 | (rand[0] & 0x0f);
    b[7] = rand[1];
    b[8] = 0x80 | (rand[2] & 0x3f);
    b[9..].copy_from_slice(&rand[3..10]);
    let h: String = b.iter().map(|x| format!("{x:02x}")).collect();
    Ok(format!("{}-{}-{}-{}-{}", &h[..8], &h[8..12], &h[12..16], &h[16..20], &h[20..]))
}

fn quick_check(conn: &Connection) -> std::result::Result<(), String> {
    let res: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    if res == "ok" {
        Ok(())
    } else {
        Err(res)
    }
}

fn check_db(path: &Path, writable: bool) -> std::result::Result<DbState, String> {
    if !path.exists() {
        return Err("fichier absent".into());
    }
    let flags = if writable { OpenFlags::SQLITE_OPEN_READ_WRITE } else { OpenFlags::SQLITE_OPEN_READ_ONLY };
    let conn = Connection::open_with_flags(path, flags | OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|e| e.to_string())?;
    quick_check(&conn)?;
    let flush_id = meta_get(&conn, "flush_id").map_err(|e| e.to_string())?;
    let flush_history = if writable { flush_history(&conn).map_err(|e| e.to_string())? } else { Vec::new() };
    let user_version = migrations::user_version(&conn).map_err(|e| e.to_string())?;
    Ok(DbState { flush_id, flush_history, user_version })
}

const FLUSH_TABLE: &str = "CREATE TABLE IF NOT EXISTS oniric_flush (n INTEGER PRIMARY KEY, id TEXT NOT NULL) STRICT;";

fn flush_history(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    conn.execute_batch(FLUSH_TABLE)?;
    let mut stmt = conn.prepare("SELECT id FROM oniric_flush ORDER BY n")?;
    let ids = stmt.query_map([], |r| r.get(0))?.collect();
    ids
}

/// Records that the project folder now holds snapshot `id`: older attempts can be forgotten.
fn mark_synced(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute_batch(FLUSH_TABLE)?;
    let n: Option<i64> = conn.query_row("SELECT n FROM oniric_flush WHERE id = ?1", [id], |r| r.get(0)).optional()?;
    match n {
        Some(n) => conn.execute("DELETE FROM oniric_flush WHERE n < ?1", [n])?,
        None => {
            conn.execute("DELETE FROM oniric_flush", [])?;
            conn.execute("INSERT INTO oniric_flush (id) VALUES (?1)", [id])?
        }
    };
    Ok(())
}

fn set_aside(work_dir: &Path, wc: &Path) -> io::Result<PathBuf> {
    let target = work_dir.join("mis-de-cote").join(format!("donnees-{}.db", lock::now_secs()));
    fsx::move_database(wc, &target)?;
    Ok(target)
}

fn is_empty_dir(dir: &Path) -> io::Result<bool> {
    match fs::read_dir(dir) {
        Ok(mut entries) => Ok(entries.next().is_none()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(e) => Err(e),
    }
}

impl Project {
    pub fn create(dir: &Path, title: &str, opts: &OpenOptions) -> Result<Project> {
        if !is_empty_dir(dir)? {
            return Err(Error::FolderNotEmpty(dir.to_path_buf()));
        }
        fs::create_dir_all(dir)?;
        for folder in FOLDERS {
            fs::create_dir_all(dir.join(folder))?;
        }
        let db = dir.join(DB);
        let tmp = sibling(&db, ".creation");
        let _ = fs::remove_file(&tmp);
        let id = {
            let conn = Connection::open(&tmp)?;
            conn.execute_batch("CREATE TABLE oniric_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;")?;
            let id = uuid_v7(&conn)?;
            meta_set(&conn, "format_version", &FORMAT_VERSION.to_string())?;
            let first = random_id(&conn)?;
            meta_set(&conn, "flush_id", &first)?;
            mark_synced(&conn, &first)?;
            migrations::apply(&conn, None)?;
            id
        };
        fsx::sync_file(&tmp)?;
        fsx::replace_atomically(&tmp, &db)?;
        let manifest = Manifest {
            format: "oniric-project".into(),
            format_version: FORMAT_VERSION,
            id,
            title: title.into(),
            created_with: Some(env!("CARGO_PKG_VERSION").into()),
            database: DB.into(),
        };
        fsx::write_atomically(&dir.join(MANIFEST), serde_json::to_string_pretty(&manifest).unwrap().as_bytes())?;
        Ok(Self::open(dir, opts)?.0)
    }

    pub fn read_manifest(dir: &Path) -> Result<Manifest> {
        let text = fs::read_to_string(dir.join(MANIFEST)).map_err(|e| Error::NotAProject(e.to_string()))?;
        let manifest: Manifest = serde_json::from_str(&text).map_err(|e| Error::NotAProject(e.to_string()))?;
        if manifest.format != "oniric-project" {
            return Err(Error::NotAProject(format!("format « {} »", manifest.format)));
        }
        Ok(manifest)
    }

    pub fn probe(dir: &Path, work_root: &Path) -> Result<Probe> {
        let manifest = Self::read_manifest(dir)?;
        if manifest.format_version > FORMAT_VERSION {
            return Err(Error::NewerFormat(manifest.format_version));
        }
        let lock = lock::inspect(&dir.join(LOCK));
        let wc = work_root.join(&manifest.id).join(DB);
        let recoverable = !matches!(lock, LockState::HeldHere(_))
            && wc.exists()
            && match (check_db(&dir.join(DB), false), check_db(&wc, true)) {
                (Ok(p), Ok(w)) => w.descends_from(&p),
                (Err(_), Ok(_)) => true,
                _ => false,
            };
        Ok(Probe { manifest, lock, recoverable })
    }

    pub fn open(dir: &Path, opts: &OpenOptions) -> Result<(Project, OpenReport)> {
        let manifest = Self::read_manifest(dir)?;
        if manifest.format_version > FORMAT_VERSION {
            return Err(Error::NewerFormat(manifest.format_version));
        }
        let lock_path = dir.join(LOCK);
        let mut previous_crash = false;
        match lock::inspect(&lock_path) {
            LockState::Free => {}
            LockState::Stale(_) => previous_crash = true,
            LockState::HeldHere(info) => return Err(Error::AlreadyOpenHere(info)),
            LockState::HeldElsewhere(info) if !opts.force_lock => return Err(Error::LockedElsewhere(info)),
            LockState::HeldElsewhere(_) => {}
        }
        lock::acquire(&lock_path)?;
        let opened = Self::open_locked(dir, manifest, opts, previous_crash);
        if opened.is_err() {
            let _ = lock::release(&lock_path);
        }
        opened
    }

    fn open_locked(dir: &Path, manifest: Manifest, opts: &OpenOptions, mut previous_crash: bool) -> Result<(Project, OpenReport)> {
        let work_dir = opts.work_root.join(&manifest.id);
        fs::create_dir_all(&work_dir)?;
        let wc = work_dir.join(DB);
        let project_db = dir.join(DB);
        let _ = fs::remove_file(sibling(&wc, ".copie"));
        let _ = fs::remove_file(sibling(&project_db, ".tmp"));

        let project = check_db(&project_db, false);
        if let Ok(p) = &project {
            if p.user_version > migrations::LATEST {
                return Err(Error::NewerFormat(p.user_version));
            }
        }
        let mut source = Source::ProjectFolder;
        let mut kept_aside = None;
        let mut notes = Vec::new();

        if wc.exists() {
            previous_crash = true;
            match (&project, check_db(&wc, true)) {
                (Ok(p), Ok(w)) if w.descends_from(p) => match opts.on_crash {
                    CrashChoice::Restore => source = Source::RestoredWorkingCopy,
                    CrashChoice::Discard => kept_aside = Some(set_aside(&work_dir, &wc)?),
                },
                (Ok(_), Ok(_)) => {
                    notes.push("la copie de travail ne descend pas du projet, modifié ailleurs entre-temps : mise de côté".into());
                    kept_aside = Some(set_aside(&work_dir, &wc)?);
                }
                (Err(e), Ok(_)) => {
                    notes.push(format!("base du dossier projet endommagée ({e}) : réparée depuis la copie de travail"));
                    source = Source::RepairedFromWorkingCopy;
                }
                (Ok(_), Err(e)) => {
                    notes.push(format!("copie de travail endommagée ({e}) : mise de côté"));
                    kept_aside = Some(set_aside(&work_dir, &wc)?);
                }
                (Err(a), Err(b)) => return Err(Error::Damaged(format!("dossier projet : {a} ; copie de travail : {b}"))),
            }
        } else if let Err(e) = &project {
            return Err(Error::Damaged(e.clone()));
        }

        if source == Source::ProjectFolder {
            fsx::remove_database(&wc)?;
            fsx::copy_atomically(&project_db, &wc)?;
        }
        let conn = Connection::open(&wc)?;
        let mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
        if mode != "wal" {
            return Err(Error::Damaged(format!("mode de journal inattendu : {mode}")));
        }
        conn.execute_batch("PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;")?;
        match (&project, source) {
            (Ok(p), Source::ProjectFolder | Source::RestoredWorkingCopy) => mark_synced(&conn, p.flush_id.as_deref().unwrap_or(""))?,
            _ => {}
        }
        let backup = work_dir.join("avant-migration");
        let before = migrations::user_version(&conn)?;
        let migrated = migrations::apply(&conn, Some(&backup))?;
        let migration_backup = (migrated > 0).then(|| backup.join(format!("avant-migration-v{}.db", before + 1)));
        if migrated > 0 {
            notes.push(format!("format du projet mis à jour ({migrated} étape(s)) ; copie d'origine dans {}", backup.display()));
        }

        history::install(&conn)?;

        let dirty = source != Source::ProjectFolder || migrated > 0;
        let mut project = Project { dir: dir.to_path_buf(), work_dir, manifest, conn, dirty, unsaved_in_backup: dirty, history: History::default() };
        if source == Source::RepairedFromWorkingCopy {
            project.flush()?;
        }
        Ok((project, OpenReport { source, previous_crash, kept_aside, notes, migration_backup }))
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    pub fn work_dir(&self) -> &Path {
        &self.work_dir
    }

    /// A read-only connection to the working copy: reads run beside the writer thanks to WAL (architecture, 4.3).
    /// It must be closed before the project.
    pub fn open_reader(&self) -> Result<Connection> {
        let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
        Ok(Connection::open_with_flags(self.work_dir.join(DB), flags)?)
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    /// Runs `f` in one transaction on the working copy; once this returns, the change survives a crash.
    pub fn write<T, E: From<rusqlite::Error>>(&mut self, f: impl FnOnce(&Transaction) -> std::result::Result<T, E>) -> std::result::Result<T, E> {
        let tx = self.conn.transaction()?;
        let value = f(&tx)?;
        tx.commit()?;
        self.dirty = true;
        self.unsaved_in_backup = true;
        Ok(value)
    }

    /// A new title, written in the manifest; the folder keeps its name.
    pub fn retitle(&mut self, title: &str) -> Result<()> {
        let mut manifest = self.manifest.clone();
        manifest.title = title.into();
        fsx::write_atomically(&self.dir.join(MANIFEST), serde_json::to_string_pretty(&manifest).unwrap().as_bytes())?;
        self.manifest = manifest;
        Ok(())
    }

    /// The same for a project that is not open, unless another Oniric has it open.
    pub fn retitle_closed(dir: &Path, title: &str) -> Result<()> {
        let mut manifest = Self::read_manifest(dir)?;
        match lock::inspect(&dir.join(LOCK)) {
            LockState::HeldHere(i) => return Err(Error::AlreadyOpenHere(i)),
            LockState::HeldElsewhere(i) => return Err(Error::LockedElsewhere(i)),
            _ => {}
        }
        manifest.title = title.into();
        fsx::write_atomically(&dir.join(MANIFEST), serde_json::to_string_pretty(&manifest).unwrap().as_bytes())?;
        Ok(())
    }

    pub fn needs_backup(&self) -> bool {
        self.unsaved_in_backup
    }

    /// A dated copy in the backup folder `root` [SAV-03].
    pub fn backup(&mut self, root: &Path, kind: &str, keep: u32) -> Result<backup::Entry> {
        let entry = backup::run(&self.conn, &self.dir, &self.manifest, root, kind, keep)?;
        self.unsaved_in_backup = false;
        Ok(entry)
    }

    /// Replaces the project folder database by a complete, checked snapshot of the working copy.
    pub fn flush(&mut self) -> Result<Option<FlushStats>> {
        if !self.dirty {
            return Ok(None);
        }
        let start = Instant::now();
        let id = random_id(&self.conn)?;
        {
            let tx = self.conn.transaction()?;
            tx.execute("INSERT INTO oniric_flush (id) VALUES (?1)", [&id])?;
            meta_set(&tx, "flush_id", &id)?;
            tx.commit()?;
        }
        let target = self.dir.join(DB);
        let tmp = sibling(&target, ".tmp");
        let _ = fs::remove_file(&tmp);
        self.conn.execute("VACUUM INTO ?1", [tmp.to_string_lossy()])?;
        {
            let snapshot = Connection::open(&tmp)?;
            let _: String = snapshot.query_row("PRAGMA journal_mode = DELETE", [], |r| r.get(0))?;
            quick_check(&snapshot).map_err(|e| Error::Damaged(format!("copie produite invalide : {e}")))?;
        }
        fsx::sync_file(&tmp)?;
        let bytes = fs::metadata(&tmp)?.len();
        fsx::replace_atomically(&tmp, &target)?;
        mark_synced(&self.conn, &id)?;
        self.dirty = false;
        Ok(Some(FlushStats { duration: start.elapsed(), bytes }))
    }

    /// Last flush, then removal of the working copy and of the lock. On error, both stay, so nothing is lost;
    /// if the last flush failed, the project is handed back still open.
    pub fn close(mut self) -> std::result::Result<(), CloseFailure> {
        if let Err(error) = self.flush() {
            return Err(CloseFailure { project: Some(self), error });
        }
        let Project { dir, work_dir, conn, .. } = self;
        let fail = |error: Error| CloseFailure { project: None, error };
        conn.close().map_err(|(_, e)| fail(e.into()))?;
        fsx::remove_database(&work_dir.join(DB)).map_err(|e| fail(e.into()))?;
        let _ = fs::remove_dir(&work_dir);
        lock::release(&dir.join(LOCK)).map_err(|e| fail(e.into()))?;
        Ok(())
    }
}

pub struct CloseFailure {
    pub project: Option<Project>,
    pub error: Error,
}

impl fmt::Display for CloseFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.error.fmt(f)
    }
}

impl fmt::Debug for CloseFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "CloseFailure({:?}, projet rendu : {})", self.error, self.project.is_some())
    }
}
