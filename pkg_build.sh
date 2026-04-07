#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLG_FILE="${ROOT_DIR}/statsview.plus.plg"
SOURCE_DIR="${ROOT_DIR}/source/statsview.plus"
ARCHIVE_DIR="${ROOT_DIR}/archive"
ARCHIVE_PREFIX="statsview.plus"
RELEASE_GUARD_SCRIPT="${ROOT_DIR}/scripts/release_guard.sh"
ENSURE_CHANGES_ENTRY_SCRIPT="${ROOT_DIR}/scripts/ensure_plg_changes_entry.sh"
VERSION_OVERRIDE="${STATSVIEW_PLUS_VERSION_OVERRIDE:-}"
BRANCH_OVERRIDE="${STATSVIEW_PLUS_BUILD_BRANCH:-}"
TODAY_VERSION="$(date +"%Y.%m.%d")"
DRY_RUN=false
VALIDATE_AFTER_BUILD=true
TMPDIR_PATH=""

cleanup_tmpdir() {
    if [ -n "${TMPDIR_PATH:-}" ] && [ -d "${TMPDIR_PATH}" ]; then
        rm -rf "${TMPDIR_PATH}"
    fi
}

print_usage() {
    cat <<'EOF'
Usage: bash pkg_build.sh [options]
  --branch NAME   Force manifest URLs to branch NAME
  --dry-run       Show the computed version and output paths without writing files
  --validate      Run scripts/release_guard.sh after build (default)
  --no-validate   Skip post-build validation
  -h, --help      Show this help
EOF
}

require_commands() {
    local missing=()
    local cmd=""
    for cmd in "$@"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing+=("$cmd")
        fi
    done
    if [ "${#missing[@]}" -gt 0 ]; then
        echo "ERROR: Missing required commands: ${missing[*]}" >&2
        exit 1
    fi
}

ensure_repo_layout() {
    if [ ! -f "${PLG_FILE}" ]; then
        echo "ERROR: Missing plugin manifest: ${PLG_FILE}" >&2
        exit 1
    fi
    if [ ! -d "${SOURCE_DIR}" ]; then
        echo "ERROR: Missing plugin source directory: ${SOURCE_DIR}" >&2
        exit 1
    fi
}

detect_git_branch() {
    local detected=""
    if command -v git >/dev/null 2>&1 && git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        detected="$(git -C "${ROOT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
        if [ -z "${detected}" ] || [ "${detected}" = "HEAD" ]; then
            detected="${GITHUB_REF_NAME:-}"
            detected="${detected#refs/heads/}"
        fi
    fi
    printf '%s' "${detected}"
}

extract_manifest_version() {
    sed -n 's/^<!ENTITY version[[:space:]]*"\([^"]*\)".*/\1/p' "${PLG_FILE}" | head -n1
}

stable_date_part() {
    local input="${1:-}"
    if [[ "${input}" =~ ^([0-9]{4}\.[0-9]{2}\.[0-9]{2})(\.[0-9]+)?$ ]]; then
        echo "${BASH_REMATCH[1]}"
        return
    fi
    echo ""
}

normalize_version_for_unraid() {
    local input="${1:-}"
    if [[ "${input}" =~ ^([0-9]{4}\.[0-9]{2}\.[0-9]{2})$ ]]; then
        echo "${BASH_REMATCH[1]}.01"
        return
    fi
    if [[ "${input}" =~ ^([0-9]{4}\.[0-9]{2}\.[0-9]{2})\.([0-9]+)$ ]]; then
        printf '%s.%02d\n' "${BASH_REMATCH[1]}" "$((10#${BASH_REMATCH[2]}))"
        return
    fi
    echo "${input}"
}

next_patch_version() {
    local input="${1:-}"
    if [[ "${input}" =~ ^([0-9]{4}\.[0-9]{2}\.[0-9]{2})\.([0-9]+)$ ]]; then
        printf '%s.%02d\n' "${BASH_REMATCH[1]}" "$((10#${BASH_REMATCH[2]} + 1))"
        return
    fi
    echo "${input}.01"
}

highest_archive_version_for_date() {
    local target_date="${1:-}"
    local archive=""
    local versions=()
    shopt -s nullglob
    for archive in "${ARCHIVE_DIR}/${ARCHIVE_PREFIX}-"*-x86_64-1.txz; do
        local name="${archive##*/}"
        if [[ "${name}" =~ ^${ARCHIVE_PREFIX}-(.+)-x86_64-1\.txz$ ]]; then
            local archive_version="${BASH_REMATCH[1]}"
            if [ "$(stable_date_part "${archive_version}")" = "${target_date}" ]; then
                versions+=("$(normalize_version_for_unraid "${archive_version}")")
            fi
        fi
    done
    shopt -u nullglob
    if [ "${#versions[@]}" -eq 0 ]; then
        return
    fi
    printf '%s\n' "${versions[@]}" | sort -V | tail -n1
}

next_version_for_date() {
    local target_date="${1:-}"
    local highest_archive_version=""
    local current_manifest_version=""
    local baseline="${target_date}.00"

    highest_archive_version="$(highest_archive_version_for_date "${target_date}" || true)"
    current_manifest_version="$(normalize_version_for_unraid "$(extract_manifest_version || true)")"

    if [ -n "${highest_archive_version}" ]; then
        baseline="${highest_archive_version}"
    fi
    if [ -n "${current_manifest_version}" ] && [ "$(stable_date_part "${current_manifest_version}")" = "${target_date}" ]; then
        baseline="$(printf '%s\n%s\n' "${baseline}" "${current_manifest_version}" | sort -V | tail -n1)"
    fi
    next_patch_version "${baseline}"
}

rewrite_manifest_branch_metadata() {
    local target_file="${1:-}"
    local target_branch="${2:-}"
    if [ -z "${target_file}" ] || [ -z "${target_branch}" ]; then
        echo "ERROR: rewrite_manifest_branch_metadata requires a file and branch." >&2
        exit 1
    fi

    sed -E -i 's|^<!ENTITY pluginURL ".*">|<!ENTITY pluginURL "https://raw.githubusercontent.com/\&github;/'"${target_branch}"'/\&name;.plg">|' "${target_file}"
    perl -0pi -e 's{<!-- SOURCE PACKAGE -->.*?<!-- SYSSTAT PACKAGE \(bundled for legacy Unraid support\) -->}{<!-- SOURCE PACKAGE -->\n<FILE Name="/boot/config/plugins/&name;/&name;-&version;-x86_64-1.txz" Run="upgradepkg --install-new --reinstall">\n<URL>https://raw.githubusercontent.com/&github;/'"${target_branch}"'/archive/&name;-&version;-x86_64-1.txz</URL>\n<MD5>&MD5;</MD5>\n</FILE>\n\n<!-- SYSSTAT PACKAGE (bundled for legacy Unraid support) -->}s' "${target_file}"
}

normalize_manifest_packaging_blocks() {
    local target_file="${1:-}"
    if [ -z "${target_file}" ]; then
        echo "ERROR: normalize_manifest_packaging_blocks requires a file." >&2
        exit 1
    fi

    perl -0pi -e 's{# Remove old '\''source'\'' packages.*?\n</INLINE>}{# Remove old '\''source'\'' packages\nrm -f \$(ls /boot/config/plugins/&name;/&name;*.txz 2>/dev/null | grep -v '\''&version;'\'')\n</INLINE>}s' "${target_file}"
    perl -0pi -e 's{removepkg &name;}{removepkg &name;-&version;-x86_64-1 || true}g' "${target_file}"
}

validate_manifest_branch_matrix() {
    local source_file="${1:-}"
    local branch_name=""
    for branch_name in dev main; do
        local probe_file=""
        local entity_url=""
        local archive_url=""
        local expected_entity_url="https://raw.githubusercontent.com/&github;/${branch_name}/&name;.plg"
        local expected_archive_url="https://raw.githubusercontent.com/&github;/${branch_name}/archive/&name;-&version;-x86_64-1.txz"

        probe_file="$(mktemp)"
        cp "${source_file}" "${probe_file}"
        rewrite_manifest_branch_metadata "${probe_file}" "${branch_name}"
        entity_url="$(grep -m1 '^<!ENTITY pluginURL ' "${probe_file}" | sed -E 's/^<!ENTITY pluginURL "([^"]+)".*/\1/' || true)"
        archive_url="$(grep -m1 '<URL>https://raw.githubusercontent.com/&github;/' "${probe_file}" | sed -E 's|.*<URL>(https://raw.githubusercontent.com/&github;/[^<]*/archive/&name;-&version;-x86_64-1.txz)</URL>.*|\1|' || true)"
        rm -f "${probe_file}"

        if [ "${entity_url}" != "${expected_entity_url}" ]; then
            echo "ERROR: Manifest pluginURL rewrite mismatch for ${branch_name}." >&2
            exit 1
        fi
        if [ "${archive_url}" != "${expected_archive_url}" ]; then
            echo "ERROR: Manifest archive URL rewrite mismatch for ${branch_name}." >&2
            exit 1
        fi
    done
}

while [[ $# -gt 0 ]]; do
    case "${1:-}" in
        --dry-run)
            DRY_RUN=true
            ;;
        --branch)
            if [ -z "${2:-}" ]; then
                echo "ERROR: --branch requires a branch name." >&2
                exit 1
            fi
            BRANCH_OVERRIDE="${2:-}"
            shift
            ;;
        --validate)
            VALIDATE_AFTER_BUILD=true
            ;;
        --no-validate)
            VALIDATE_AFTER_BUILD=false
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "ERROR: Unknown argument: ${1}" >&2
            print_usage >&2
            exit 1
            ;;
    esac
    shift
done

trap cleanup_tmpdir EXIT
ensure_repo_layout
require_commands tar sed date awk grep sort head tail mktemp md5sum perl cp mkdir rm

if [ -n "${BRANCH_OVERRIDE}" ]; then
    BRANCH="${BRANCH_OVERRIDE}"
else
    DETECTED_BRANCH="$(detect_git_branch)"
    if [ "${DETECTED_BRANCH}" = "dev" ]; then
        BRANCH="dev"
    else
        BRANCH="main"
    fi
fi

if ! [[ "${BRANCH}" =~ ^[A-Za-z0-9._/-]+$ ]]; then
    echo "ERROR: Invalid branch name: ${BRANCH}" >&2
    exit 1
fi

if [ -n "${VERSION_OVERRIDE}" ]; then
    VERSION="$(normalize_version_for_unraid "${VERSION_OVERRIDE}")"
    if [ "$(stable_date_part "${VERSION}")" != "${TODAY_VERSION}" ]; then
        echo "ERROR: STATSVIEW_PLUS_VERSION_OVERRIDE must use today's date (${TODAY_VERSION})." >&2
        exit 1
    fi
else
    VERSION="$(next_version_for_date "${TODAY_VERSION}")"
fi

FILENAME="${ARCHIVE_DIR}/${ARCHIVE_PREFIX}-${VERSION}-x86_64-1.txz"
while [ -f "${FILENAME}" ]; do
    VERSION="$(next_patch_version "${VERSION}")"
    FILENAME="${ARCHIVE_DIR}/${ARCHIVE_PREFIX}-${VERSION}-x86_64-1.txz"
done

if [ "${DRY_RUN}" = true ]; then
    echo "Dry run: no files will be written."
    echo "Version: ${VERSION}"
    echo "Branch: ${BRANCH}"
    echo "Archive target: ${FILENAME}"
    echo "Manifest: ${PLG_FILE}"
    exit 0
fi

mkdir -p "${ARCHIVE_DIR}"
TMPDIR_PATH="$(mktemp -d)"
PACKAGE_ROOT="${TMPDIR_PATH}/package"
mkdir -p "${PACKAGE_ROOT}"
cp -R "${SOURCE_DIR}/." "${PACKAGE_ROOT}/"

tar --sort=name \
    --mtime='UTC 1970-01-01' \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -cJf "${FILENAME}" \
    -C "${PACKAGE_ROOT}" .

MD5_VALUE="$(md5sum "${FILENAME}" | awk '{print $1}')"

sed -i 's|<!ENTITY version[[:space:]].*>|<!ENTITY version   "'"${VERSION}"'">|' "${PLG_FILE}"
sed -i 's|<!ENTITY MD5 ".*">|<!ENTITY MD5 "'"${MD5_VALUE}"'">|' "${PLG_FILE}"
normalize_manifest_packaging_blocks "${PLG_FILE}"
rewrite_manifest_branch_metadata "${PLG_FILE}" "${BRANCH}"
validate_manifest_branch_matrix "${PLG_FILE}"

if [ -f "${ENSURE_CHANGES_ENTRY_SCRIPT}" ]; then
    bash "${ENSURE_CHANGES_ENTRY_SCRIPT}"
fi
if [ "${VALIDATE_AFTER_BUILD}" = true ] && [ -f "${RELEASE_GUARD_SCRIPT}" ]; then
    bash "${RELEASE_GUARD_SCRIPT}"
fi

echo "Package created: ${FILENAME}"
echo "Version: ${VERSION}"
echo "MD5: ${MD5_VALUE}"
echo "Branch: ${BRANCH}"
