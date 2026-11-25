//! The packaged Electron binary the CLI runs as Node.
//!
//! Why the name comes from a file: electron-builder names the binary from
//! `win.executableName`, and when that changed to `DolphinCode` (dc4849e0c9) the
//! launcher kept looking for `Dolphin.exe` and every CLI command failed. Both now
//! read `config/windows-executable-name.txt`, so they cannot drift apart again;
//! afterPack also checks that the packaged launcher carries the packaged name.
//!
//! The legacy names stay as fallbacks for installs made before a rename.

use std::path::{Path, PathBuf};

const CURRENT_NAME_FILE: &str = include_str!("../../../config/windows-executable-name.txt");

/// Names the binary had in earlier releases, newest first.
const LEGACY_NAMES: &[&str] = &["Dolphin"];

/// The current name without `.exe`, as electron-builder's `executableName` takes it.
pub fn current_name() -> &'static str {
    CURRENT_NAME_FILE.trim()
}

/// Every file name worth trying, current first.
pub fn candidate_file_names() -> Vec<String> {
    let current = current_name();
    std::iter::once(current)
        .chain(
            LEGACY_NAMES
                .iter()
                .copied()
                .filter(|legacy| !legacy.eq_ignore_ascii_case(current)),
        )
        .map(|name| format!("{name}.exe"))
        .collect()
}

/// The first candidate that exists in the app directory.
pub fn locate(app_directory: &Path) -> Option<PathBuf> {
    candidate_file_names()
        .into_iter()
        .map(|name| app_directory.join(name))
        .find(|path| path.is_file())
}

/// `DolphinCode.exe (or Dolphin.exe)`, for the error a user reads.
pub fn describe_candidates() -> String {
    let names = candidate_file_names();
    match names.split_first() {
        Some((first, [])) => first.clone(),
        Some((first, rest)) => format!("{first} (or {})", rest.join(", ")),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn scratch_directory(label: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "dolphin-launcher-{label}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn the_name_file_holds_a_bare_file_stem() {
        let name = current_name();
        assert!(!name.is_empty());
        assert!(!name.to_ascii_lowercase().ends_with(".exe"));
        assert!(name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')));
    }

    #[test]
    fn the_current_name_comes_first_and_legacy_is_kept() {
        let names = candidate_file_names();
        assert_eq!(names[0], format!("{}.exe", current_name()));
        assert!(names.iter().any(|name| name == "Dolphin.exe"));
    }

    #[test]
    fn prefers_the_current_binary_when_both_exist() {
        let directory = scratch_directory("both");
        fs::write(directory.join(format!("{}.exe", current_name())), b"").unwrap();
        fs::write(directory.join("Dolphin.exe"), b"").unwrap();
        assert_eq!(
            locate(&directory),
            Some(directory.join(format!("{}.exe", current_name())))
        );
        let _ = fs::remove_dir_all(&directory);
    }

    #[test]
    fn falls_back_to_the_legacy_binary() {
        let directory = scratch_directory("legacy");
        fs::write(directory.join("Dolphin.exe"), b"").unwrap();
        assert_eq!(locate(&directory), Some(directory.join("Dolphin.exe")));
        let _ = fs::remove_dir_all(&directory);
    }

    #[test]
    fn finds_nothing_in_an_empty_directory() {
        let directory = scratch_directory("empty");
        assert_eq!(locate(&directory), None);
        let _ = fs::remove_dir_all(&directory);
    }
}
