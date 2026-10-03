//! Inkly backend — point d'entrée partagé (desktop + mobile).
//!
//! `lib.rs` reste volontairement fin : il câble les plugins,
//! l'état global et les handlers de commandes. La logique vit dans `commands/`.

mod commands;
mod error;
mod state;
#[cfg(target_os = "linux")]
mod zoom;
#[cfg(target_os = "linux")]
use tauri::Manager;

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
            commands::project::read_markdown_file,
            commands::project::write_markdown_file,
            commands::project::search_notes,
        ])
        .setup(|app| {
            tracing_init();
            log::info!("Inkly started (v{})", app.package_info().version);
            // Tentative précoce (best-effort) : la webview n'est pas
            // forcément réalisée, `on_page_load` prend le relais.
            #[cfg(target_os = "linux")]
            if let Some(main) = app.get_webview_window("main") {
                zoom::disable_on_main_window(&main);
            }
            Ok(())
        })
        .on_page_load(|webview, _| {
            // Ici la webview est réalisée : le geste WebKit existe.
            #[cfg(target_os = "linux")]
            zoom::disable_on_webview(webview);
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
