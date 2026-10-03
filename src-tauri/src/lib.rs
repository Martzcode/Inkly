//! Inkly backend — point d'entrée partagé (desktop + mobile).
//!
//! `lib.rs` reste volontairement fin : il câble les plugins,
//! l'état global et les handlers de commandes. La logique vit dans `commands/`.

mod commands;
mod error;
mod state;

pub use error::AppError;
pub use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::greet::greet,
            commands::app_info::app_info,
            commands::project::list_markdown_files,
            commands::project::load_canvas,
            commands::project::save_canvas,
        ])
        .setup(|app| {
            tracing_init();
            log::info!("Inkly started (v{})", app.package_info().version);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn tracing_init() {
    // `try_init` pour rester idempotent sous tests.
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();
}
