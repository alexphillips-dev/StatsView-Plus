#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLG_FILE="${ROOT_DIR}/statsview.plus.plg"
VERSION="$(sed -n 's/^<!ENTITY version[[:space:]]*"\([^"]*\)".*/\1/p' "${PLG_FILE}" | head -n1)"

if [ -z "${VERSION}" ]; then
    echo "ERROR: Failed to parse manifest version from ${PLG_FILE}" >&2
    exit 1
fi

if grep -q "^###${VERSION}$" "${PLG_FILE}"; then
    exit 0
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}"' EXIT

awk -v version="${VERSION}" '
    BEGIN { inserted = 0 }
    {
        print
        if (!inserted && $0 == "##StatsView Plus") {
            print ""
            print "###" version
            print "- Maintenance: Refresh package metadata and build artifacts"
            inserted = 1
        }
    }
' "${PLG_FILE}" > "${TMP_FILE}"

mv "${TMP_FILE}" "${PLG_FILE}"
