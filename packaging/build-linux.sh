#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
ARCH="$(uname -m)"
[[ "$ARCH" == x86_64 ]] || { printf 'Only x86_64 builds are configured (found %s).\n' "$ARCH" >&2; exit 1; }

for tool in go ar tar zstd rpmbuild sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'Missing packaging tool: %s\n' "$tool" >&2; exit 1; }
done

BUILD="$ROOT/build/linux"
PACKAGES="$ROOT/packages"
rm -rf "$BUILD"
mkdir -p "$BUILD" "$BUILD/go-cache" "$PACKAGES"

printf 'Building native Linux command…\n'
GOCACHE="$BUILD/go-cache" GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go -C "$ROOT/launcher" build -buildvcs=false -trimpath -ldflags='-s -w' -o "$BUILD/dompile"
install -m 0755 "$BUILD/dompile" "$PACKAGES/dompile-linux-x86_64"

STAGE="$BUILD/root"
install -D -m 0755 "$BUILD/dompile" "$STAGE/usr/bin/dompile"
install -D -m 0644 "$ROOT/dompile.js" "$STAGE/usr/lib/dompile/dompile.js"
install -D -m 0644 "$ROOT/package.json" "$STAGE/usr/lib/dompile/package.json"
install -D -m 0644 "$ROOT/README.md" "$STAGE/usr/share/doc/dompile/README.md"
install -D -m 0644 "$ROOT/LICENSE" "$STAGE/usr/share/doc/dompile/LICENSE"

printf 'Building Debian package…\n'
DEBROOT="$BUILD/deb"
mkdir -p "$DEBROOT/DEBIAN" "$DEBROOT/usr/bin" "$DEBROOT/usr/lib/dompile" "$DEBROOT/usr/share/doc/dompile"
cp -a "$STAGE/usr/." "$DEBROOT/usr/"
cat > "$DEBROOT/DEBIAN/control" <<EOF
Package: dompile
Version: ${VERSION}
Section: devel
Priority: optional
Architecture: amd64
Depends: nodejs (>= 18)
Maintainer: Dompile contributors
Description: Compile web source into portable DTML documents
 Dompile combines HTML, CSS, and JavaScript into one document and can
 produce browser-ready websites or Electron application scaffolds.
EOF
DEB="$PACKAGES/dompile_${VERSION}_amd64.deb"
printf '2.0\n' > "$BUILD/debian-binary"
tar --sort=name --owner=0 --group=0 --numeric-owner -C "$DEBROOT/DEBIAN" -czf "$BUILD/control.tar.gz" .
tar --sort=name --owner=0 --group=0 --numeric-owner -C "$DEBROOT" -czf "$BUILD/data.tar.gz" ./usr
rm -f "$DEB"
ar rcs "$DEB" "$BUILD/debian-binary" "$BUILD/control.tar.gz" "$BUILD/data.tar.gz"

printf 'Building RPM package…\n'
RPMROOT="$BUILD/rpmbuild"
mkdir -p "$RPMROOT/SOURCES" "$BUILD/rpm-tmp"
cp "$STAGE/usr/bin/dompile" "$RPMROOT/SOURCES/dompile"
cp "$STAGE/usr/lib/dompile/dompile.js" "$RPMROOT/SOURCES/dompile.js"
cp "$STAGE/usr/lib/dompile/package.json" "$RPMROOT/SOURCES/package.json"
cp "$ROOT/README.md" "$RPMROOT/SOURCES/README.md"
cp "$ROOT/LICENSE" "$RPMROOT/SOURCES/LICENSE"
sed "s/^Version:.*/Version:        ${VERSION}/" "$ROOT/packaging/dompile.spec" > "$BUILD/dompile.spec"
rpmbuild -bb "$BUILD/dompile.spec" --define "_topdir $RPMROOT" --define "_tmppath $BUILD/rpm-tmp" --define '_build_id_links none'
find "$RPMROOT/RPMS" -type f -name '*.rpm' -exec cp {} "$PACKAGES/" \;

printf 'Building Arch package archive…\n'
ARCHROOT="$BUILD/arch"
cp -a "$STAGE" "$ARCHROOT"
cat > "$ARCHROOT/.PKGINFO" <<EOF
pkgname = dompile
pkgbase = dompile
pkgver = ${VERSION}-1
pkgdesc = Compile HTML CSS and JavaScript into portable DTML documents
url = https://github.com/SysTest-official/dompile
builddate = $(date +%s)
packager = Dompile contributors
size = $(du -sb "$ARCHROOT/usr" | cut -f1)
arch = x86_64
license = MIT
depend = nodejs>=18
EOF
ARCHIVE="$PACKAGES/dompile-${VERSION}-1-x86_64.pkg.tar.zst"
tar --sort=name --owner=0 --group=0 --numeric-owner --zstd -cf "$ARCHIVE" -C "$ARCHROOT" .PKGINFO ./usr

(cd "$PACKAGES" && sha256sum "dompile-linux-x86_64" "dompile_${VERSION}_amd64.deb" "dompile-${VERSION}-1.x86_64.rpm" "dompile-${VERSION}-1-x86_64.pkg.tar.zst" > SHA256SUMS)
printf '\nBuilt packages and executable:\n'
ls -lh "$PACKAGES/dompile-linux-x86_64" "$DEB" "$PACKAGES/dompile-${VERSION}-1.x86_64.rpm" "$ARCHIVE" "$PACKAGES/SHA256SUMS"
