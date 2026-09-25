pub fn normalize_player_name(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn is_valid_player_name(name: &str) -> bool {
    let normalized = normalize_player_name(name);
    let len = normalized.chars().count();
    (1..=24).contains(&len)
}

pub fn is_name_taken<'a>(name: &str, existing: impl IntoIterator<Item = &'a str>) -> bool {
    let target = normalize_player_name(name).to_lowercase();
    existing
        .into_iter()
        .any(|existing| normalize_player_name(existing).to_lowercase() == target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_whitespace() {
        assert_eq!(normalize_player_name("  Buddy   Dog  "), "Buddy Dog");
    }

    #[test]
    fn rejects_empty_names() {
        assert!(!is_valid_player_name("   "));
    }

    #[test]
    fn detects_case_insensitive_clashes() {
        assert!(is_name_taken("Buddy", ["buddy", "Rex"]));
        assert!(!is_name_taken("Max", ["buddy", "Rex"]));
    }
}
