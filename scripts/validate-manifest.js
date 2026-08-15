// Manifest gate shared by the GitLab and GitHub pipelines.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const REQUIRED_FIELDS = [
    'name', 'displayName', 'description', 'version',
    'publisher', 'engines', 'contributes', 'main', 'license'
];
const EXPECTED_THEME_COUNT = 7;

const errors = [];

function readJson(relPath) {
    try {
        return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8'));
    } catch (err) {
        errors.push(`${relPath} — ${err.message}`);
        return null;
    }
}

function exists(relPath) {
    return fs.existsSync(path.join(REPO_ROOT, relPath));
}

const pkg = readJson('package.json');
readJson('schemas/arn-advanced.schema.json');

if (pkg) {
    const missing = REQUIRED_FIELDS.filter(key => !pkg[key]);
    if (missing.length) {
        errors.push(`package.json is missing required fields: ${missing.join(', ')}`);
    }

    const themes = pkg.contributes?.themes ?? [];
    if (themes.length !== EXPECTED_THEME_COUNT) {
        errors.push(`package.json must contribute exactly ${EXPECTED_THEME_COUNT} themes (got ${themes.length})`);
    }

    // A theme declared in the manifest but absent from disk ships a broken
    // extension: the marketplace accepts it and the editor fails at load.
    for (const theme of themes) {
        if (!theme.path) {
            errors.push(`theme "${theme.label ?? '(unnamed)'}" has no path`);
        } else if (!exists(theme.path)) {
            errors.push(`theme file not found: ${theme.path}`);
        }
    }

    if (pkg.main && !exists(pkg.main)) {
        errors.push(`entry point not found: ${pkg.main}`);
    }

    if (pkg.icon && !exists(pkg.icon)) {
        errors.push(`icon not found: ${pkg.icon}`);
    }
}

if (errors.length) {
    for (const error of errors) {
        console.error(`FAIL ${error}`);
    }
    console.error(`\n${errors.length} manifest check(s) failed.`);
    process.exit(1);
}

console.log(`OK   manifest — required fields, ${EXPECTED_THEME_COUNT} themes, referenced files present`);
