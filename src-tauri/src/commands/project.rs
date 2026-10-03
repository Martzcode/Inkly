//! Projet Inkly : dossier contenant des notes Markdown + graphe de liaisons.
//!
//! Format de persistance (propre à l'app) :
//! `<projet>/.inkly/canvas.json`
//! ```json
//! {
//!   "version": 1,
//!   "nodes": { "note.md": { "x": 120.0, "y": 80.0 } },
//!   "edges": [{ "id": "…", "from": "a.md", "to": "b.md", "directed": true }]
//! }
//! ```

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::AppError;

const CANVAS_DIR: &str = ".inkly";
const CANVAS_FILE: &str = "canvas.json";
const CANVAS_VERSION: u32 = 1;

/// Un fichier Markdown du projet (niveau racine, non récursif pour la v1).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    /// Nom du fichier, ex. `note.md` (sert d'identifiant stable).
    pub id: String,
    pub name: String,
}

/// Position d'une icône sur le canvas.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
}

/// Une liaison entre deux fichiers, façon mind-mapping :
/// - `directed = false` → simple trait (flèche sans tête)
/// - `directed = true` → flèche avec pointe.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    #[serde(default = "default_directed")]
    pub directed: bool,
}

fn default_directed() -> bool {
    true
}

/// Document canvas complet, sérialisé dans `.inkly/canvas.json`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDoc {
    #[serde(default = "canvas_version")]
    pub version: u32,
    #[serde(default)]
    pub nodes: HashMap<String, NodePosition>,
    #[serde(default)]
    pub edges: Vec<CanvasEdge>,
}

fn canvas_version() -> u32 {
    CANVAS_VERSION
}

impl Default for CanvasDoc {
    fn default() -> Self {
        Self {
            version: CANVAS_VERSION,
            nodes: HashMap::new(),
            edges: Vec::new(),
        }
    }
}

fn is_markdown(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown"),
        None => false,
    }
}

fn canvas_file_for(project_path: &str) -> Result<PathBuf, AppError> {
    let root = PathBuf::from(project_path);
    if !root.is_absolute() {
        return Err(AppError::InvalidInput(
            "project path must be absolute".into(),
        ));
    }
    Ok(root.join(CANVAS_DIR).join(CANVAS_FILE))
}

/// Liste les fichiers Markdown à la racine du dossier projet.
#[tauri::command]
pub fn list_markdown_files(project_path: String) -> Result<Vec<ProjectFile>, AppError> {
    let root = PathBuf::from(&project_path);
    if !root.is_absolute() {
        return Err(AppError::InvalidInput(
            "project path must be absolute".into(),
        ));
    }
    let entries = std::fs::read_dir(&root).map_err(|e| {
        AppError::InvalidInput(format!("cannot read project folder: {e}"))
    })?;

    let mut files: Vec<ProjectFile> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file() && is_markdown(p))
        .filter_map(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|name| ProjectFile {
                    id: name.to_string(),
                    name: name.to_string(),
                })
        })
        .collect();

    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(files)
}

/// Charge le canvas du projet (`<projet>/.inkly/canvas.json`).
/// Retourne un document vide si le fichier n'existe pas encore.
#[tauri::command]
pub fn load_canvas(project_path: String) -> Result<CanvasDoc, AppError> {
    let file = canvas_file_for(&project_path)?;
    if !file.exists() {
        return Ok(CanvasDoc::default());
    }
    let raw = std::fs::read_to_string(&file)
        .map_err(|e| AppError::Internal(format!("cannot read canvas file: {e}")))?;
    let mut doc: CanvasDoc = serde_json::from_str(&raw)
        .map_err(|e| AppError::Internal(format!("invalid canvas file: {e}")))?;
    doc.version = CANVAS_VERSION;
    Ok(doc)
}

/// Sauvegarde le canvas du projet (crée `<projet>/.inkly/` si besoin).
#[tauri::command]
pub fn save_canvas(project_path: String, canvas: CanvasDoc) -> Result<(), AppError> {
    let file = canvas_file_for(&project_path)?;
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Internal(format!("cannot create .inkly dir: {e}")))?;
    }
    let mut doc = canvas;
    doc.version = CANVAS_VERSION;
    // Nettoyage léger : pas d'auto-liaison, pas de doublon exact.
    let mut seen = std::collections::HashSet::new();
    doc.edges.retain(|e| {
        if e.from == e.to {
            return false;
        }
        let key = if e.directed {
            format!("d:{}->{}", e.from, e.to)
        } else {
            let (mut a, mut b) = (e.from.clone(), e.to.clone());
            if b < a {
                std::mem::swap(&mut a, &mut b);
            }
            format!("u:{a}<->{b}")
        };
        seen.insert(key)
    });
    let raw = serde_json::to_string_pretty(&doc)
        .map_err(|e| AppError::Internal(format!("cannot serialize canvas: {e}")))?;
    std::fs::write(&file, raw)
        .map_err(|e| AppError::Internal(format!("cannot write canvas file: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_markdown_matches_expected_extensions() {
        assert!(is_markdown(Path::new("note.md")));
        assert!(is_markdown(Path::new("NOTE.MD")));
        assert!(is_markdown(Path::new("doc.markdown")));
        assert!(!is_markdown(Path::new("image.png")));
        assert!(!is_markdown(Path::new("noext")));
    }

    #[test]
    fn list_markdown_files_filters_and_sorts() {
        let dir = std::env::temp_dir().join(format!("inkly-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["b.md", "a.md", "ignore.txt", "C.MARKDOWN"] {
            std::fs::write(dir.join(name), "# test").unwrap();
        }

        let files = list_markdown_files(dir.to_string_lossy().to_string()).unwrap();
        let names: Vec<_> = files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, vec!["a.md", "b.md", "C.MARKDOWN"]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_then_load_canvas_roundtrip() {
        let dir = std::env::temp_dir().join(format!("inkly-canvas-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let mut nodes = HashMap::new();
        nodes.insert("a.md".to_string(), NodePosition { x: 10.0, y: 20.0 });
        let doc = CanvasDoc {
            version: CANVAS_VERSION,
            nodes,
            edges: vec![CanvasEdge {
                id: "e1".into(),
                from: "a.md".into(),
                to: "b.md".into(),
                directed: false,
            }],
        };
        let path = dir.to_string_lossy().to_string();
        save_canvas(path.clone(), doc).unwrap();
        assert!(dir.join(".inkly").join("canvas.json").exists());

        let loaded = load_canvas(path).unwrap();
        assert_eq!(loaded.nodes["a.md"], NodePosition { x: 10.0, y: 20.0 });
        assert_eq!(loaded.edges.len(), 1);
        assert!(!loaded.edges[0].directed);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_canvas_missing_file_returns_default() {
        let dir = std::env::temp_dir().join(format!("inkly-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let loaded =
            load_canvas(dir.to_string_lossy().to_string()).unwrap();
        assert_eq!(loaded, CanvasDoc::default());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
