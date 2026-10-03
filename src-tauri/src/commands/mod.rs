//! Commandes Tauri exposées au frontend Angular.
//!
//! Convention :
//! - un fichier par domaine (`greet.rs`, `app_info.rs`, …),
//! - chaque commande retourne `Result<T, AppError>`,
//! - `mod.rs` ré-exporte pour `generate_handler!`.

pub mod app_info;
pub mod greet;
pub mod project;
