# Dompile

Dompile packages web source into one `.dtml` document. DTML v1 is HTML-compatible and places CSS and JavaScript in the same document. The CLI also downloads static pages, produces hosted HTML, checks document structure, and creates Electron project scaffolds.

## Requirements and commands

Requires Node.js 18 or newer. Dompile itself has no dependencies.

```sh
node dompile.js --help
node dompile.js --version
node dompile.js --features
node dompile.js -h page.html styles.css app.js -o dist/page.dtml
node dompile.js -h page.html --define TITLE="Hello, world" --strict -o page.dtml
node dompile.js -w https://example.com -o example.dtml
node dompile.js --check page.dtml --json
node dompile.js --website page.dtml -o dist/index.html
node dompile.js --application page.dtml -o desktop-app
```

`-h` accepts at most one HTML file and any number of CSS, JS, and MJS files. It inlines local linked stylesheets and classic scripts; inlines local CSS imports and their referenced media; and inlines local image, audio, video, poster, and responsive `srcset` assets. CSS and script values can be supplied with repeatable `--define KEY=VALUE` arguments and referenced in HTML as `{{KEY}}`; values are HTML-escaped. `--strict` makes missing template values an error.

`-w` fetches an HTTP or HTTPS document, follows redirects, and attempts to inline directly linked stylesheets and classic scripts. CSS URLs are made absolute, and relative document links are rewritten so assets left outside the DTML remain addressable. It cannot capture runtime-rendered pages, authenticated state without cookies, or full JavaScript module graphs.

`--check` checks tag nesting, duplicate IDs, fragment targets, and common accessibility/security issues. `--strict` also treats warnings as failures. `--json` emits machine-readable diagnostics. A JSON config file can set `output`, `quiet`, `verbose`, `json`, `strict`, `maxAssetSize`, and string-valued `defines` defaults; command line values take precedence.

`--website` writes the DTML source to an HTML file. `--application` creates `index.html`, `main.js`, and `package.json`; run `npm install` and `npm start` inside that folder to use it. The Electron renderer has context isolation and sandboxing enabled, with Node integration disabled.

Additional options include `--dry-run`, `--quiet`, `--verbose`, `--stats`, `--no-clobber`, `--max-asset-size`, and `--output`. Existing files are overwritten unless `--no-clobber` is specified.

## Tests

Run the ten automated tests with:

```sh
npm test
```

## Linux executable and packages

`launcher/main.go` builds a native x86_64 Linux command named `dompile`. It launches the bundled Dompile compiler and depends on Node.js 18 or newer; each system package declares Node.js as a dependency so the package manager installs the runtime as needed.

On a packaging host with Go, `rpmbuild`, GNU `ar`, GNU `tar`, and `zstd` installed, build the executable and all three packages with:

```sh
./packaging/build-linux.sh
```

The build writes an executable, SHA-256 checksums, a Debian `.deb`, an RPM `.rpm`, and an Arch `.pkg.tar.zst` under `packages/`. Packages currently target x86_64. `install.sh` detects Debian/Ubuntu, Fedora/RHEL, Arch, and openSUSE families, verifies the selected package checksum, then installs it with the appropriate package manager.

After the public GitHub repository and package files are published, install in one command with:

```sh
curl -fsSL https://raw.githubusercontent.com/SysTest-official/dompile/main/install.sh | bash
```

The installer requests `sudo` only for the package-manager install step. Afterward, run `dompile --help`. To uninstall, use `sudo apt remove dompile`, `sudo dnf remove dompile`, `sudo pacman -R dompile`, or `sudo zypper remove dompile`, depending on your distribution.

The build and installer source are in `launcher/`, `packaging/`, and `install.sh`. The Arch recipe is `packaging/arch/PKGBUILD`.

## Limits

The current compiler is a static packager, not a JavaScript transpiler. ES module dependency graphs, CSS features beyond local `@import` and `url()`, arbitrary remote media, and dynamic website behavior are not bundled. The validator is a useful structural check, not a standards-complete HTML conformance checker. See `--features` and [UPDATES.md](/home/andrew/Projects/UPDATES.md) for the shipped capability inventory and its 50 update batches.
