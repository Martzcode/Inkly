//! Projet Inkly : dossier contenant des notes Markdown + graphe de liaisons.
//!
//! Format de persistance (propre à l'app) :
//! `<projet>/.inkly/canvas.json`
//! ```json
//! {
//!   "version": 1,
//!   "nodes": { "note.md": { "x": 120.0, "y": 80.0 } },
//!   "edges": [{ "id": "…", "from": "a.md", "to": "b.md", "directed": true }],
//!   "favorites": ["note.md"]
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
    /// Noms de fichiers épinglés en favoris (propres au projet).
    #[serde(default)]
    pub favorites: Vec<String>,
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
            favorites: Vec::new(),
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
    // Favoris : dédoublonne + ne garde que des noms de fichiers markdown valides.
    {
        let mut seen_fav = std::collections::HashSet::new();
        doc.favorites
            .retain(|f| validate_file_id(f).is_ok() && seen_fav.insert(f.clone()));
        doc.favorites.sort();
    }
    let raw = serde_json::to_string_pretty(&doc)
        .map_err(|e| AppError::Internal(format!("cannot serialize canvas: {e}")))?;
    std::fs::write(&file, raw)
        .map_err(|e| AppError::Internal(format!("cannot write canvas file: {e}")))?;
    Ok(())
}

/// Valide un identifiant de fichier (nom simple, sans chemin).
fn validate_file_id(file_id: &str) -> Result<(), AppError> {
    if file_id.is_empty() || file_id.len() > 255 {
        return Err(AppError::InvalidInput("invalid file id".into()));
    }
    if file_id.contains('/') || file_id.contains('\\') || file_id.contains("..") {
        return Err(AppError::InvalidInput(
            "file id must be a plain file name".into(),
        ));
    }
    if !is_markdown(Path::new(file_id)) {
        return Err(AppError::InvalidInput(
            "only markdown files can be opened".into(),
        ));
    }
    Ok(())
}

/// Lit le contenu brut d'une note Markdown du projet (racine uniquement).
#[tauri::command]
pub fn read_markdown_file(project_path: String, file_id: String) -> Result<String, AppError> {
    validate_file_id(&file_id)?;
    let root = PathBuf::from(&project_path);
    if !root.is_absolute() {
        return Err(AppError::InvalidInput(
            "project path must be absolute".into(),
        ));
    }
    let full = root.join(&file_id);
    // Garde-fou anti path-traversal : le chemin résolu doit rester dans le projet.
    if !full.starts_with(&root) {
        return Err(AppError::InvalidInput("file is outside the project".into()));
    }
    let meta = std::fs::metadata(&full)
        .map_err(|_| AppError::InvalidInput("file not found".into()))?;
    if !meta.is_file() {
        return Err(AppError::InvalidInput("file not found".into()));
    }
    // Limite v1 : 1 Mio de texte.
    if meta.len() > 1_048_576 {
        return Err(AppError::InvalidInput("file is too large".into()));
    }
    std::fs::read_to_string(&full)
        .map_err(|e| AppError::Internal(format!("cannot read note: {e}")))
}

/// Écrit le contenu Markdown d'une note du projet (racine uniquement).
/// Le fichier est créé s'il n'existe pas encore.
#[tauri::command]
pub fn write_markdown_file(
    project_path: String,
    file_id: String,
    content: String,
) -> Result<(), AppError> {
    validate_file_id(&file_id)?;
    if content.len() > 1_048_576 {
        return Err(AppError::InvalidInput("content is too large".into()));
    }
    let root = PathBuf::from(&project_path);
    if !root.is_absolute() {
        return Err(AppError::InvalidInput(
            "project path must be absolute".into(),
        ));
    }
    if !root.is_dir() {
        return Err(AppError::InvalidInput("project folder not found".into()));
    }
    let full = root.join(&file_id);
    // Garde-fou anti path-traversal : le chemin résolu doit rester dans le projet.
    if !full.starts_with(&root) {
        return Err(AppError::InvalidInput("file is outside the project".into()));
    }
    std::fs::write(&full, content)
        .map_err(|e| AppError::Internal(format!("cannot write note: {e}")))
}

/// Un fichier Markdown contenant le mot recherché.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub name: String,
    /// Nombre d'occurrences (insensible à la casse).
    pub match_count: usize,
    /// Première ligne contenant le mot, tronquée (aperçu).
    pub excerpt: String,
}

/// Recherche un mot dans les notes Markdown du projet :
/// contenu ET nom de fichier. Insensible à la casse,
/// racine du dossier uniquement.
#[tauri::command]
pub fn search_notes(project_path: String, query: String) -> Result<Vec<SearchHit>, AppError> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    if needle.len() > 200 {
        return Err(AppError::InvalidInput("query is too long".into()));
    }
    let root = PathBuf::from(&project_path);
    if !root.is_absolute() {
        return Err(AppError::InvalidInput(
            "project path must be absolute".into(),
        ));
    }
    let entries = std::fs::read_dir(&root)
        .map_err(|e| AppError::InvalidInput(format!("cannot read project folder: {e}")))?;

    let mut names: Vec<String> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file() && is_markdown(p))
        .filter_map(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_string))
        .collect();
    names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));

    let mut hits = Vec::new();
    for name in names {
        let full = root.join(&name);
        // Sécurité + robustesse : on ignore les fichiers illisibles / trop gros.
        let content = match std::fs::metadata(&full) {
            Ok(meta) if meta.is_file() && meta.len() <= 1_048_576 => {
                std::fs::read_to_string(&full).unwrap_or_default()
            }
            _ => continue,
        };
        let lowered = content.to_lowercase();
        let name_hits = name.to_lowercase().matches(needle.as_str()).count();
        let match_count = lowered.matches(needle.as_str()).count() + name_hits;
        if match_count == 0 {
            continue;
        }
        let excerpt = content
            .lines()
            .find(|line| line.to_lowercase().contains(needle.as_str()))
            .map(|line| {
                let trimmed = line.trim();
                if trimmed.chars().count() > 160 {
                    format!("{}…", trimmed.chars().take(160).collect::<String>())
                } else {
                    trimmed.to_string()
                }
            })
            .unwrap_or_default();
        hits.push(SearchHit {
            id: name.clone(),
            name,
            match_count,
            excerpt,
        });
    }
    Ok(hits)
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
            favorites: vec!["b.md".into(), "a.md".into(), "b.md".into()],
        };
        let path = dir.to_string_lossy().to_string();
        save_canvas(path.clone(), doc).unwrap();
        assert!(dir.join(".inkly").join("canvas.json").exists());

        let loaded = load_canvas(path).unwrap();
        assert_eq!(loaded.nodes["a.md"], NodePosition { x: 10.0, y: 20.0 });
        assert_eq!(loaded.edges.len(), 1);
        assert!(!loaded.edges[0].directed);
        assert_eq!(loaded.favorites, vec!["a.md".to_string(), "b.md".to_string()]);

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

    #[test]
    fn read_markdown_file_roundtrip_and_rejections() {
        let dir = std::env::temp_dir().join(format!("inkly-read-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("hello.md"), "# Salut\n\n**gras**").unwrap();
        std::fs::write(dir.join("other.txt"), "nope").unwrap();

        let path = dir.to_string_lossy().to_string();
        let content = read_markdown_file(path.clone(), "hello.md".into()).unwrap();
        assert!(content.contains("**gras**"));

        assert!(read_markdown_file(path.clone(), "../evil.md".into()).is_err());
        assert!(read_markdown_file(path.clone(), "other.txt".into()).is_err());
        assert!(read_markdown_file(path.clone(), "missing.md".into()).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn search_notes_is_case_insensitive() {
        let dir = std::env::temp_dir().join(format!("inkly-search-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), "# Projet\n\nUn MOT important ici.").unwrap();
        std::fs::write(dir.join("b.md"), "rien à voir").unwrap();
        std::fs::write(dir.join("rapport-mot.md"), "contenu neutre").unwrap();
        std::fs::write(dir.join("ignore.txt"), "mot partout").unwrap();

        let path = dir.to_string_lossy().to_string();
        let hits = search_notes(path.clone(), "mot".into()).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].id, "a.md");
        assert_eq!(hits[0].match_count, 1);
        assert!(hits[0].excerpt.to_lowercase().contains("mot"));
        // Match par nom de fichier uniquement : pas d'extrait de contenu.
        assert_eq!(hits[1].id, "rapport-mot.md");
        assert!(hits[1].excerpt.is_empty());

        // MOT en majuscules matche aussi, vide ne matche rien.
        assert_eq!(search_notes(path.clone(), "MOT".into()).unwrap().len(), 2);
        assert!(search_notes(path, "   ".into()).unwrap().is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn write_then_read_markdown_roundtrip() {
        let dir = std::env::temp_dir().join(format!("inkly-write-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let path = dir.to_string_lossy().to_string();
        write_markdown_file(path.clone(), "note.md".into(), "# Titre\n\nTexte.".into()).unwrap();
        let content = read_markdown_file(path.clone(), "note.md".into()).unwrap();
        assert_eq!(content, "# Titre\n\nTexte.");

        assert!(write_markdown_file(path.clone(), "../evil.md".into(), "x".into()).is_err());
        assert!(write_markdown_file(path, "note.txt".into(), "x".into()).is_err());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
