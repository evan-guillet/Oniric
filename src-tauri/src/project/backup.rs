//! Dated copies of a project in a folder chosen by the user (architecture, 7.4) [SAV-03, SAV-05].
//!
//! ```text
//! <dossier de sauvegarde>/Les Heures Bleues (5f6a7b8c)/
//! ├── bases/2026-10-21_09-30-00_auto.db
//! ├── medias/            mirror of the project's medias, each file copied once
//! └── sauvegarde.json    list of the copies
//! ```

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use super::{fsx, quick_check, uuid_v7, Error, Manifest, Result, DB, FOLDERS, FORMAT_VERSION, MANIFEST};
use crate::system;

pub const INDEX: &str = "sauvegarde.json";
const BEFORE_MIGRATION: &str = "avant-migration";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "app", derive(specta::Type))]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// None: the default folder, `Documents\Oniric\Sauvegardes`.
    pub dir: Option<String>,
    pub every_minutes: u32,
    pub keep: u32,
    /// Reminder when the last copy is older than this many days; 0 turns it off.
    pub remind_days: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { dir: None, every_minutes: 30, keep: 20, remind_days: 7 }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "app", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub file: String,
    /// `auto`, `fermeture`, `manuelle` or `avant-migration-vN`.
    pub kind: String,
    pub at: String,
    pub bytes: u32,
    pub sha256: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Index {
    project_id: String,
    title: String,
    oniric: String,
    copies: Vec<Entry>,
}

/// The folder of one project inside the backup folder; the end of the id tells apart two projects with the same title.
/// A renamed project keeps the folder of its earlier copies.
pub fn folder(root: &Path, manifest: &Manifest) -> PathBuf {
    let tail = &manifest.id[manifest.id.len().saturating_sub(8)..];
    let named = root.join(format!("{} ({tail})", system::file_name(&manifest.title)));
    if named.exists() {
        return named;
    }
    let end = format!(" ({tail})");
    fs::read_dir(root)
        .ok()
        .and_then(|entries| entries.flatten().map(|e| e.path()).find(|p| p.is_dir() && p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.ends_with(&end))))
        .unwrap_or(named)
}

fn read_index(dir: &Path) -> Index {
    fs::read_to_string(dir.join(INDEX)).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn write_index(dir: &Path, index: &Index) -> io::Result<()> {
    fsx::write_atomically(&dir.join(INDEX), serde_json::to_string_pretty(index).unwrap().as_bytes())
}

pub fn sha256_file(path: &Path) -> io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

pub fn sha256_bytes(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

fn unique(dir: &Path, stem: &str) -> PathBuf {
    let mut path = dir.join(format!("{stem}.db"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem}-{n}.db"));
        n += 1;
    }
    path
}

/// A media edited in place can keep its size: its date tells it apart. A copy carries the date of its source.
fn changed(source: &fs::Metadata, target: &Path) -> bool {
    match fs::metadata(target) {
        Ok(t) => t.len() != source.len() || t.modified().ok() != source.modified().ok(),
        Err(_) => true,
    }
}

/// Copies new or changed files of `from` into `to`, recursively; files already there are not copied again.
fn mirror(from: &Path, to: &Path) -> io::Result<()> {
    let entries = match fs::read_dir(from) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        let target = to.join(&name);
        if entry.file_type()?.is_dir() {
            mirror(&entry.path(), &target)?;
        } else {
            let meta = entry.metadata()?;
            if changed(&meta, &target) {
                fs::create_dir_all(to)?;
                fsx::copy_atomically(&entry.path(), &target)?;
                if let Ok(at) = meta.modified() {
                    fs::File::options().write(true).open(&target)?.set_modified(at)?;
                }
            }
        }
    }
    Ok(())
}

fn record(dir: &Path, manifest: &Manifest, file: &Path, kind: &str, keep: u32) -> Result<Entry> {
    let entry = Entry {
        file: file.file_name().unwrap().to_string_lossy().into_owned(),
        kind: kind.into(),
        at: system::iso_utc(system::now_secs()),
        bytes: fs::metadata(file)?.len().min(u32::MAX as u64) as u32,
        sha256: sha256_file(file)?,
    };
    let mut index = read_index(dir);
    index.project_id = manifest.id.clone();
    index.title = manifest.title.clone();
    index.oniric = env!("CARGO_PKG_VERSION").into();
    index.copies.push(entry.clone());
    let prunable: Vec<usize> = (0..index.copies.len()).filter(|&i| !index.copies[i].kind.starts_with(BEFORE_MIGRATION)).collect();
    let excess = prunable.len().saturating_sub(keep.max(1) as usize);
    let dropped: Vec<usize> = prunable.into_iter().take(excess).collect();
    for &i in &dropped {
        let _ = fs::remove_file(dir.join("bases").join(&index.copies[i].file));
    }
    let mut i = 0;
    index.copies.retain(|_| {
        i += 1;
        !dropped.contains(&(i - 1))
    });
    write_index(dir, &index)?;
    Ok(entry)
}

/// A database copy made, whose medias and listing are still to come.
#[must_use]
pub struct PendingCopy {
    dir: PathBuf,
    project_dir: PathBuf,
    manifest: Manifest,
    target: PathBuf,
    kind: String,
}

impl PendingCopy {
    /// Copies the medias, lists the copy, then removes the oldest copies beyond `keep`. Needs no access to the database.
    pub fn finish(self, keep: u32) -> Result<Entry> {
        mirror(&self.project_dir.join("medias"), &self.dir.join("medias"))?;
        record(&self.dir, &self.manifest, &self.target, &self.kind, keep)
    }
}

/// A complete, checked copy of the open database; `finish` adds the medias.
pub fn run(conn: &Connection, project_dir: &Path, manifest: &Manifest, root: &Path, kind: &str) -> Result<PendingCopy> {
    let dir = folder(root, manifest);
    let bases = dir.join("bases");
    fs::create_dir_all(&bases)?;
    let target = unique(&bases, &format!("{}_{kind}", system::local_stamp()));
    let tmp = fsx::sibling(&target, ".tmp");
    let _ = fs::remove_file(&tmp);
    conn.execute("VACUUM INTO ?1", [tmp.to_string_lossy()])?;
    {
        let snapshot = Connection::open(&tmp)?;
        let _: String = snapshot.query_row("PRAGMA journal_mode = DELETE", [], |r| r.get(0))?;
        quick_check(&snapshot).map_err(|e| Error::Damaged(format!("copie de sauvegarde invalide : {e}")))?;
    }
    fsx::sync_file(&tmp)?;
    fsx::replace_atomically(&tmp, &target)?;
    Ok(PendingCopy { dir, project_dir: project_dir.to_path_buf(), manifest: manifest.clone(), target, kind: kind.into() })
}

/// Stores an existing database file (the copy taken before a migration) among the backups.
pub fn store(file: &Path, manifest: &Manifest, root: &Path, kind: &str) -> Result<Entry> {
    let dir = folder(root, manifest);
    let bases = dir.join("bases");
    fs::create_dir_all(&bases)?;
    let target = unique(&bases, &format!("{}_{kind}", system::local_stamp()));
    fsx::copy_atomically(file, &target)?;
    record(&dir, manifest, &target, kind, u32::MAX)
}

/// The copies of a project, most recent first; files removed by hand are left out.
pub fn list(root: &Path, manifest: &Manifest) -> Vec<Entry> {
    let dir = folder(root, manifest);
    let mut copies = read_index(&dir).copies;
    copies.retain(|c| dir.join("bases").join(&c.file).exists());
    copies.reverse();
    copies
}

fn is_empty_dir(dir: &Path) -> bool {
    fs::read_dir(dir).map(|mut e| e.next().is_none()).unwrap_or(true)
}

/// Rebuilds a complete project folder from a copy, inside `dest_parent`, without touching the original.
/// The new project gets its own id, so that it can be open beside the original.
pub fn restore(file: &Path, dest_parent: &Path) -> Result<PathBuf> {
    let bases = file.parent().ok_or_else(|| Error::NotAProject("copie sans dossier".into()))?;
    let dir = bases.parent().ok_or_else(|| Error::NotAProject("copie hors d'un dossier de sauvegarde".into()))?;
    {
        let conn = Connection::open_with_flags(file, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        quick_check(&conn).map_err(Error::Damaged)?;
    }
    let index = read_index(dir);
    let title = if index.title.is_empty() { "Projet restauré".to_string() } else { index.title };
    let stamp: String = file.file_stem().unwrap_or_default().to_string_lossy().chars().take(16).collect();
    let target = dest_parent.join(system::file_name(&format!("{title} (restauré, copie du {})", stamp.replace('_', " "))));
    if !is_empty_dir(&target) {
        return Err(Error::FolderNotEmpty(target));
    }
    fs::create_dir_all(&target)?;
    for f in FOLDERS {
        fs::create_dir_all(target.join(f))?;
    }
    fsx::copy_atomically(file, &target.join(DB))?;
    mirror(&dir.join("medias"), &target.join("medias"))?;
    let id = uuid_v7(&Connection::open_in_memory()?)?;
    let manifest = Manifest {
        format: "oniric-project".into(),
        format_version: FORMAT_VERSION,
        id,
        title,
        created_with: Some(env!("CARGO_PKG_VERSION").into()),
        database: DB.into(),
    };
    fsx::write_atomically(&target.join(MANIFEST), serde_json::to_string_pretty(&manifest).unwrap().as_bytes())?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::super::{CrashChoice, OpenOptions, Project};
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oniric-sauvegarde-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn copies_prunes_and_restores() {
        let root = temp("racine");
        let opts = OpenOptions { work_root: root.join("travail"), on_crash: CrashChoice::Restore, force_lock: false };
        let mut p = Project::create(&root.join("Projets").join("Essai"), "Essai", &opts).unwrap();
        fs::write(p.dir().join("medias").join("affiche.png"), b"png").unwrap();
        let backups = root.join("Sauvegardes");
        for i in 0..4 {
            p.write(|tx| tx.execute("INSERT INTO project_setting VALUES (?1, 'x', 'now')", [format!("k{i}")])).unwrap();
            assert!(p.needs_backup());
            p.backup(&backups, "auto").unwrap().finish(3).unwrap();
            assert!(!p.needs_backup());
        }
        let copies = list(&backups, p.manifest());
        assert_eq!(copies.len(), 3);
        let dir = folder(&backups, p.manifest());
        assert_eq!(fs::read_dir(dir.join("bases")).unwrap().count(), 3);
        assert!(dir.join("medias").join("affiche.png").exists());

        let file = dir.join("bases").join(&copies[0].file);
        assert_eq!(sha256_file(&file).unwrap(), copies[0].sha256);
        let restored = restore(&file, &root.join("Restaurés")).unwrap();
        assert!(restored.join("medias").join("affiche.png").exists());
        let original_id = p.manifest().id.clone();
        p.close().unwrap();
        let (q, _) = Project::open(&restored, &opts).unwrap();
        assert_ne!(q.manifest().id, original_id);
        assert_eq!(q.manifest().title, "Essai");
        let n: i64 = q.conn().query_row("SELECT count(*) FROM project_setting", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 4);
        q.close().unwrap();
        let _ = fs::remove_dir_all(&root);
    }
}
