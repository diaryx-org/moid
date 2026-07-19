{
  description = "moid — an opaque-ID minter CLI and library";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # The workspace version (single source of truth in [workspace.package]).
        # Parse it so the flake reports the same number as `moid --version`.
        version =
          let m = builtins.match ".*\n[[:blank:]]*version = \"([^\"]+)\".*"
                    (builtins.readFile ./Cargo.toml);
          in if m == null
             then throw "moid flake: could not find workspace version in Cargo.toml"
             else builtins.head m;
      in {
        packages = rec {
          default = moid;

          moid = pkgs.rustPlatform.buildRustPackage {
            pname = "moid";
            inherit version;
            src = ./.;

            cargoLock.lockFile = ./Cargo.lock;

            # Build/test only the CLI crate; the library is pulled in as a
            # path dependency.
            cargoBuildFlags = [ "-p" "moid-cli" ];
            cargoTestFlags = [ "-p" "moid-cli" ];

            meta = {
              description = "Command-line companion for the moid opaque-ID minter";
              homepage = "https://github.com/diaryx-org/moid";
              license = with pkgs.lib.licenses; [ mit asl20 ];
              mainProgram = "moid";
              platforms = pkgs.lib.platforms.unix;
            };
          };
        };

        apps.default = {
          type = "app";
          program = "${self.packages.${system}.moid}/bin/moid";
        };

        devShells.default = pkgs.mkShell {
          nativeBuildInputs = [ pkgs.cargo pkgs.rustc ];
        };
      });
}
