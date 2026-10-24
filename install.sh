#!/usr/bin/env bash
set -euo pipefail

VERSION="1.0.0"
REPOSITORY="SysTest-official/dompile"
BASE_URL="https://raw.githubusercontent.com/${REPOSITORY}/main/packages"

fail() { printf 'Dompile installer: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == Linux ]] || fail 'This installer currently supports Linux distributions only.'
case "$(uname -m)" in
  x86_64|amd64) ARCH=x86_64 ;;
  *) fail "Unsupported CPU architecture: $(uname -m). Available packages target x86_64." ;;
esac

[[ -r /etc/os-release ]] || fail 'Cannot identify this Linux distribution (/etc/os-release is missing).'
# shellcheck disable=SC1091
source /etc/os-release
DISTRO="${ID:-unknown} ${ID_LIKE:-}"
case " $DISTRO " in
  *" debian "*|*" ubuntu "*|*" linuxmint "*|*" pop "*)
    PACKAGE="dompile_${VERSION}_amd64.deb"
    FORMAT=deb
    ;;
  *" fedora "*|*" rhel "*|*" centos "*|*" rocky "*|*" almalinux "*|*" ol "*)
    PACKAGE="dompile-${VERSION}-1.x86_64.rpm"
    FORMAT=rpm
    ;;
  *" arch "*|*" manjaro "*|*" endeavouros "*)
    PACKAGE="dompile-${VERSION}-1-x86_64.pkg.tar.zst"
    FORMAT=arch
    ;;
  *" opensuse "*|*" suse "*)
    PACKAGE="dompile-${VERSION}-1.x86_64.rpm"
    FORMAT=suse
    ;;
  *) fail "Unsupported distribution: ${ID:-unknown}. Supported families: Debian/Ubuntu, Fedora/RHEL, Arch, and openSUSE." ;;
esac

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
else
  SCRIPT_DIR=""
fi
LOCAL_PACKAGE="${SCRIPT_DIR}/packages/${PACKAGE}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ -f "$LOCAL_PACKAGE" && -f "${SCRIPT_DIR}/packages/SHA256SUMS" ]]; then
  PACKAGE_PATH="$LOCAL_PACKAGE"
  SUMS_PATH="${SCRIPT_DIR}/packages/SHA256SUMS"
else
  command -v curl >/dev/null 2>&1 || fail 'curl is required to download the installer package.'
  PACKAGE_PATH="${TMP_DIR}/${PACKAGE}"
  SUMS_PATH="${TMP_DIR}/SHA256SUMS"
  curl --fail --silent --show-error --location "${BASE_URL}/${PACKAGE}" --output "$PACKAGE_PATH" || fail "Could not download ${PACKAGE}."
  curl --fail --silent --show-error --location "${BASE_URL}/SHA256SUMS" --output "$SUMS_PATH" || fail 'Could not download package checksums.'
fi

EXPECTED_SUM="$(awk -v name="$PACKAGE" '$2 == name || $2 == "packages/" name { print $1; exit }' "$SUMS_PATH")"
[[ -n "$EXPECTED_SUM" ]] || fail "No checksum found for ${PACKAGE}."
ACTUAL_SUM="$(sha256sum "$PACKAGE_PATH" | awk '{print $1}')"
[[ "$ACTUAL_SUM" == "$EXPECTED_SUM" ]] || fail "Checksum mismatch for ${PACKAGE}; refusing to install it."

if (( EUID == 0 )); then
  SUDO=()
else
  command -v sudo >/dev/null 2>&1 || fail 'Run as root or install sudo so the package manager can install Dompile.'
  SUDO=(sudo)
fi

printf 'Installing Dompile %s for %s (%s)…\n' "$VERSION" "${ID:-Linux}" "$FORMAT"
case "$FORMAT" in
  deb)
    command -v apt-get >/dev/null 2>&1 || fail 'apt-get is required to install the Debian package and its Node.js dependency.'
    "${SUDO[@]}" apt-get update
    "${SUDO[@]}" apt-get install -y "$PACKAGE_PATH"
    ;;
  rpm)
    command -v dnf >/dev/null 2>&1 || fail 'dnf is required to install the RPM and its Node.js dependency.'
    "${SUDO[@]}" dnf install -y "$PACKAGE_PATH"
    ;;
  suse)
    command -v zypper >/dev/null 2>&1 || fail 'zypper is required to install the RPM and its Node.js dependency.'
    "${SUDO[@]}" zypper --non-interactive install "$PACKAGE_PATH"
    ;;
  arch)
    command -v pacman >/dev/null 2>&1 || fail 'pacman is required to install the Arch package.'
    "${SUDO[@]}" pacman -S --needed --noconfirm nodejs
    "${SUDO[@]}" pacman -U --noconfirm "$PACKAGE_PATH"
    ;;
esac

printf '\nDompile is installed. Try: dompile --help\n'
dompile --version
