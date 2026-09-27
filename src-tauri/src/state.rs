//! État global partagé (injecté via `.manage()`).

use std::sync::atomic::{AtomicU64, Ordering};

/// État applicatif accessible depuis les commandes via `State<AppState>`.
#[derive(Debug)]
pub struct AppState {
    /// Compteur de requêtes — exemple de mutable partagé.
    pub request_count: AtomicU64,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            request_count: AtomicU64::new(0),
        }
    }

    pub fn bump_requests(&self) -> u64 {
        self.request_count.fetch_add(1, Ordering::Relaxed) + 1
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
