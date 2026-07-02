use std::{fs, path::PathBuf};

#[test]
fn release_build_uses_the_windows_gui_subsystem() {
    let main_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/main.rs");
    let main_source = fs::read_to_string(main_path).expect("src/main.rs should be readable");
    let first_code_line = main_source
        .lines()
        .find(|line| !line.trim().is_empty())
        .expect("src/main.rs should not be empty");

    assert_eq!(
        first_code_line,
        r#"#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]"#,
        "release builds must use the Windows GUI subsystem so launching Yolo does not open a console window"
    );
}
