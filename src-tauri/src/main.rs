#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::Path;

/// A project passed on the command line: its folder, or its `projet.oniric` file (double-click in the Explorer).
fn project_argument(arg: &str) -> Option<String> {
    let path = Path::new(arg);
    let dir = if path.is_dir() { path } else { path.parent()? };
    dir.join(oniric_lib::project::MANIFEST).exists().then(|| dir.display().to_string())
}

fn main() {
    let started = std::time::Instant::now();
    let args: Vec<String> = std::env::args().collect();
    if let [_, flag, path] = args.as_slice() {
        if flag == "--exporter-types" {
            if let Err(e) = oniric_lib::export_types(path) {
                eprintln!("{e}");
                std::process::exit(1);
            }
            return;
        }
    }
    let project = args.get(1).and_then(|a| project_argument(a));
    oniric_lib::run(started, project);
}
