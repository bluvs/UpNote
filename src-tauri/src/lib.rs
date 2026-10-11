use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

fn resolve_safe_path(base: &str, target: &str) -> Result<PathBuf, String> {
    let base_path = PathBuf::from(base).canonicalize().map_err(|e| e.to_string())?;
    let target_path = Path::new(base).join(target);

    let resolved_target = target_path.canonicalize().unwrap_or(target_path);

    if !resolved_target.starts_with(&base_path) {
        return Err("Path traversal attempt detected!".to_string());
    }

    Ok(resolved_target)
}

#[tauri::command]
fn list_directory(workspace_path: String, relative_path: String) -> Result<Vec<FileEntry>, String> {
    let target_dir = resolve_safe_path(&workspace_path, &relative_path)?;

    if !target_dir.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(target_dir).map_err(|e| e.to_string())?;

    for entry_res in read_dir {
        let entry = entry_res.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();

        let mut entry_path = relative_path.clone();
        if !entry_path.is_empty() && !entry_path.ends_with('/') {
            entry_path.push('/');
        }
        entry_path.push_str(&name);

        if metadata.is_dir() || name.ends_with(".md") || name.ends_with(".txt") {
            entries.push(FileEntry {
                name,
                path: entry_path,
                is_dir: metadata.is_dir(),
                children: None,
            });
        }
    }

    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(entries)
}

#[tauri::command]
fn read_file(workspace_path: String, relative_path: String) -> Result<String, String> {
    let target_file = resolve_safe_path(&workspace_path, &relative_path)?;

    if !target_file.is_file() {
        return Err("Path is not a file".to_string());
    }

    fs::read_to_string(target_file).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(workspace_path: String, relative_path: String, content: String) -> Result<(), String> {
    let base_path = PathBuf::from(&workspace_path).canonicalize().map_err(|e| e.to_string())?;
    let target_path = Path::new(&workspace_path).join(&relative_path);

    let normalized_relative = target_path.strip_prefix(Path::new(&workspace_path)).map_err(|_| "Invalid path".to_string())?;
    for component in normalized_relative.components() {
        if component == std::path::Component::ParentDir {
             return Err("Path traversal attempt detected!".to_string());
        }
    }

    if let Some(parent) = target_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let canonical_parent = parent.canonicalize().map_err(|e| e.to_string())?;
        if !canonical_parent.starts_with(&base_path) {
            return Err("Path traversal attempt detected!".to_string());
        }
    }

    fs::write(target_path, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_directory,
            read_file,
            write_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
