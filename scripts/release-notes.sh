#!/bin/sh
# Prints the release notes of one version, taken from CHANGELOG.md.
# Usage: scripts/release-notes.sh 1.1.0 > release-notes.md
set -eu

version="${1:?usage: release-notes.sh <version>}"
changelog="$(dirname "$0")/../CHANGELOG.md"

printf "### What's New in v%s 🎉\n\n" "$version"

awk -v ver="[$version]" '
    /^## \[/ { if (found) exit; found = (index($2, ver) == 1); next }
    /^\[[^]]*\]: / { if (found) exit; next }
    !found { next }
    NF == 0 { blank = started; next }
    {
        if (sub(/^### /, "")) $0 = "**" $0 "**"
        if (blank) print ""
        print
        blank = 0; started = 1
    }
    END { exit started ? 0 : 1 }
' "$changelog"

printf "\n---\n**Enjoying ARN-Skin?** Don't forget to leave a star on [GitHub](https://github.com/jzbakh/arn-skin) or [GitLab](https://gitlab.com/arn_inside/arn-skin) 🌟!\n"
