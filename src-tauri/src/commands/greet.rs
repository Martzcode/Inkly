//! Exemple de commande — à remplacer par la logique Inkly.

use crate::AppError;

/// Salue l'utilisateur depuis le backend Rust.
///
/// # Arguments
/// * `name` - Nom à saluer (chaîne vide autorisée).
#[tauri::command]
pub fn greet(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.len() > 100 {
        return Err(AppError::InvalidInput(
            "name must be at most 100 characters".into(),
        ));
    }
    let who = if name.is_empty() { "world" } else { name };
    Ok(format!("Hello, {who}! You've been greeted from Rust!"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greets_named_user() {
        assert_eq!(
            greet("Ada").unwrap(),
            "Hello, Ada! You've been greeted from Rust!"
        );
    }

    #[test]
    fn rejects_overlong_name() {
        assert!(greet(&"x".repeat(101)).is_err());
    }
}
