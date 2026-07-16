//! Proves moid can reconstruct the two id shapes it is meant to replace:
//! colophon's internal file id and diaryx's ARK blades.

use moid::{Alphabet, Minter, SeededRng};

/// colophon's internal file id: 6 betanumeric + check, no prefix.
fn colophon_file_id_minter() -> Minter {
    Minter::new(Alphabet::betanumeric(), 6)
}

/// diaryx's ARK workspace blade: `dx` shoulder + 6 betanumeric + check-over-all.
fn ark_workspace_minter() -> Minter {
    Minter::new(Alphabet::betanumeric(), 6)
        .with_prefix("dx")
        .expect("\"dx\" is in the betanumeric alphabet")
}

#[test]
fn colophon_file_id_shape() {
    let m = colophon_file_id_minter();
    let id = m.mint_seeded(&mut SeededRng::new(1));
    assert_eq!(id.chars().count(), 7); // colophon's BLADE_LEN with random_len = 6
    assert!(m.validate(&id).is_ok());
}

#[test]
fn ark_workspace_blade_shape() {
    let m = ark_workspace_minter();
    let blade = m.mint_seeded(&mut SeededRng::new(2));
    assert!(blade.starts_with("dx"));
    assert_eq!(blade.chars().count(), 9); // dx + 6 + check
    assert!(m.validate(&blade).is_ok());
}

#[test]
fn a_permalink_is_just_composition_over_two_mints() {
    // diaryx composes the ARK; the *file blade is colophon's file id* (unified),
    // not a second, independently minted id.
    let ws = ark_workspace_minter().mint_seeded(&mut SeededRng::new(3));
    let file = colophon_file_id_minter().mint_seeded(&mut SeededRng::new(4));
    let permalink = format!("ark:99999/{ws}/{file}");
    assert!(permalink.starts_with("ark:99999/dx"));
    // Both components independently validatable by their respective minters.
    assert!(ark_workspace_minter().validate(&ws).is_ok());
    assert!(colophon_file_id_minter().validate(&file).is_ok());
}
