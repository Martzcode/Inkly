//! Erreur unifiée backend → frontend (sérialisée en `{ code, message }`).

use serde::Serialize;
use thiserror::Error;

/// Erreur applicative exposée aux commandes Tauri.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("internal error: {0}")]
    Internal(String),
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        Self::Internal(err.to_string())
    }
}
