//! Proves moid can reconstruct the two id shapes it is meant to replace:
//! prov's internal file id and diaryx's ARK blades.
//!
//! Both projects have since moved to the NOID vocabulary
//! ([`Alphabet::noid_xdigit`]), so the betanumeric shapes below are the ones
//! that already exist in the wild rather than the ones being minted today.
//! Reconstructing them is exactly the point: ids outlive the vocabulary they
//! were minted under, and a minter configured this way still reads them.

use moid::{Alphabet, Minter, SeededRng};

/// prov's internal file id, pre-move: 6 betanumeric + check, no prefix.
fn prov_file_id_minter() -> Minter {
    Minter::new(Alphabet::betanumeric(), 6)
}

/// diaryx's ARK workspace blade, pre-move: `dx` shoulder + 6 betanumeric +
/// check-over-all.
fn ark_workspace_minter() -> Minter {
    Minter::new(Alphabet::betanumeric(), 6)
        .with_prefix("dx")
        .expect("\"dx\" is in the betanumeric alphabet")
}

#[test]
fn prov_file_id_shape() {
    let m = prov_file_id_minter();
    let id = m.mint_seeded(&mut SeededRng::new(1));
    assert_eq!(id.chars().count(), 7); // prov's BLADE_LEN with random_len = 6
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
    // diaryx composes the ARK; the *file blade is prov's file id* (unified),
    // not a second, independently minted id.
    let ws = ark_workspace_minter().mint_seeded(&mut SeededRng::new(3));
    let file = prov_file_id_minter().mint_seeded(&mut SeededRng::new(4));
    let permalink = format!("ark:99999/{ws}/{file}");
    assert!(permalink.starts_with("ark:99999/dx"));
    // Both components independently validatable by their respective minters.
    assert!(ark_workspace_minter().validate(&ws).is_ok());
    assert!(prov_file_id_minter().validate(&file).is_ok());
}
