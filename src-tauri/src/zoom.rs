//! Neutralise le pincement-pour-zoomer natif de WebKitGTK (Linux uniquement).
//!
//! Sur Linux, le pincement (tactile comme trackpad) est géré par WebKit
//! lui-même, sous le DOM : ni le viewport, ni `touch-action`, ni
//! `preventDefault` ne peuvent l'atteindre. WebKit attache à chaque
//! `WebView` un `GtkGestureZoom` interne (qdata `"wk-view-zoom-gesture"`).
//!
//! Technique issue de tauri-apps/wry#544 : on détruit les handlers de
//! ce geste. L'objet lui-même N'EST PAS libéré — le faire provoque un
//! segfault quand du JS annule certains événements.
//!
//! Idempotent et best-effort : appelé au démarrage ET à chaque page
//! chargée (le geste existe à coup sûr une fois la webview réalisée).

use tauri::{Webview, WebviewWindow};

/// Désactive le zoom natif sur la fenêtre principale (si présente).
pub fn disable_on_main_window(window: &WebviewWindow) {
    if let Err(e) = window.with_webview(|platform| disable_on_native(&platform.inner())) {
        log::warn!("Inkly: pincement-pour-zoomer natif toujours actif ({e})");
    }
}

/// Désactive le zoom natif sur une webview (appelée à chaque page chargée).
pub fn disable_on_webview(webview: &Webview) {
    if let Err(e) = webview.with_webview(|platform| disable_on_native(&platform.inner())) {
        log::warn!("Inkly: pincement-pour-zoomer natif toujours actif ({e})");
    }
}

fn disable_on_native(native: &webkit2gtk::WebView) {
    use gtk::glib::object::ObjectType;
    use gtk::glib::translate::IntoGlib;

    // Pointeur brut du GtkGestureZoom interne (qdata posée par WebKit).
    // Volontairement opaque : pas de transmutation vers un wrapper Rust.
    let gesture = unsafe {
        gtk::glib::gobject_ffi::g_object_get_qdata(
            native.as_ptr() as *mut _,
            gtk::glib::Quark::from_str("wk-view-zoom-gesture").into_glib(),
        )
    };
    if gesture.is_null() {
        // WebKit sans ce geste (version future ?) : rien à faire.
        return;
    }
    // Détruit TOUS les handlers du geste : le pincement ne zoome plus.
    // Signature mono-argument (gobject-sys 0.18) : tout est supprimé.
    unsafe { gtk::glib::gobject_ffi::g_signal_handlers_destroy(gesture as *mut _) };
    log::info!("Inkly: pincement-pour-zoomer WebKitGTK désactivé");
}
