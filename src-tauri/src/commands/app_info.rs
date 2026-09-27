//! Métadonnées applicatives exposées au frontend.

use serde::Serialize;
use tauri::AppHandle;

/// Informations de base sur l'application.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
}

/// Retourne le nom / version / identifiant Tauri.
#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    let info = app.package_info();
    AppInfo {
        name: info.name.clone(),
        version: info.version.to_string(),
        identifier: app.config().identifier.clone(),
    }
}
