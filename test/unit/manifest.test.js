// Manifest consistency: package.json ↔ extension.js ↔ disk.
// These tests catch the desyncs that break the extension at *activation*
// time (command declared but never registered, theme file declared but
// missing, etc.) — long before they reach a published .vsix.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { __testing } = require('../../extension');
const { parseJsonc, planetOf } = __testing;

const REPO_ROOT = path.join(__dirname, '..', '..');

function readPkg() {
    return parseJsonc(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
}

function readExtensionSource() {
    return fs.readFileSync(path.join(REPO_ROOT, 'extension.js'), 'utf8');
}

describe('package.json — basic shape', () => {
    let pkg;
    before(() => { pkg = readPkg(); });

    it('declares the required identity fields', () => {
        assert.equal(typeof pkg.name, 'string');
        assert.equal(typeof pkg.displayName, 'string');
        assert.equal(typeof pkg.publisher, 'string');
        assert.equal(typeof pkg.version, 'string');
        assert.equal(typeof pkg.description, 'string');
        assert.equal(pkg.name, 'antigravity-arn-skin');
    });

    it('points main to extension.js', () => {
        assert.equal(pkg.main, './extension.js');
    });

    it('extension.js exists at the declared path', () => {
        const main = path.join(REPO_ROOT, pkg.main);
        assert.ok(fs.existsSync(main), `extension entry not found: ${main}`);
    });

    it('lists "Themes" in categories', () => {
        assert.ok(Array.isArray(pkg.categories));
        assert.ok(pkg.categories.includes('Themes'));
    });

    it('engines.vscode is >= 1.95.0 (required for chat.linesAddedForeground)', () => {
        const range = pkg.engines && pkg.engines.vscode;
        assert.ok(typeof range === 'string', 'engines.vscode must be set');
        // Crude but adequate semver-min check: extract first two numbers
        const m = range.match(/(\d+)\.(\d+)/);
        assert.ok(m, `cannot parse engines.vscode: ${range}`);
        const [, major, minor] = m.map(Number);
        const ok = major > 1 || (major === 1 && minor >= 95);
        assert.ok(ok, `engines.vscode (${range}) must allow >= 1.95.0`);
    });

    it('icon path exists on disk', () => {
        if (!pkg.icon) return; // optional
        assert.ok(fs.existsSync(path.join(REPO_ROOT, pkg.icon)),
            `icon not found: ${pkg.icon}`);
    });

    it('declares activationEvents (or relies on auto-inferred ones)', () => {
        // Either present or omitted — both are valid since VSCode 1.74.
        if (pkg.activationEvents !== undefined) {
            assert.ok(Array.isArray(pkg.activationEvents));
        }
    });
});

describe('package.json — contributes.themes', () => {
    let pkg;
    before(() => { pkg = readPkg(); });

    it('declares 7 themes', () => {
        assert.ok(pkg.contributes && Array.isArray(pkg.contributes.themes));
        assert.equal(pkg.contributes.themes.length, 7);
    });

    it('every theme has the required fields (label, uiTheme, path)', () => {
        for (const t of pkg.contributes.themes) {
            assert.ok(t.label, 'theme missing label');
            assert.ok(t.uiTheme === 'vs' || t.uiTheme === 'vs-dark' || t.uiTheme === 'hc-black' || t.uiTheme === 'hc-light',
                `theme ${t.label} has invalid uiTheme: ${t.uiTheme}`);
            assert.ok(t.path && typeof t.path === 'string', `theme ${t.label} missing path`);
        }
    });

    it('every declared theme path exists on disk', () => {
        for (const t of pkg.contributes.themes) {
            const abs = path.join(REPO_ROOT, t.path);
            assert.ok(fs.existsSync(abs), `theme file missing: ${t.path}`);
        }
    });

    it('every theme label starts with "Arn"', () => {
        for (const t of pkg.contributes.themes) {
            assert.ok(t.label.startsWith('Arn'),
                `label ${t.label} does not start with "Arn" — extension activation logic depends on this`);
        }
    });

    it('every theme label maps to a known planet (planetOf returns non-null)', () => {
        for (const t of pkg.contributes.themes) {
            assert.ok(planetOf(t.label),
                `planetOf(${JSON.stringify(t.label)}) returned null — icon lookup will fail`);
        }
    });

    it('every theme has a corresponding planet icon under media/', () => {
        for (const t of pkg.contributes.themes) {
            const planet = planetOf(t.label);
            const iconPath = path.join(REPO_ROOT, 'media', `${planet.toLowerCase()}.png`);
            assert.ok(fs.existsSync(iconPath),
                `planet icon missing: media/${planet.toLowerCase()}.png (label: ${t.label})`);
        }
    });

    it('Jupiter (light theme) uses uiTheme="vs"', () => {
        const jupiter = pkg.contributes.themes.find(t => planetOf(t.label) === 'Jupiter');
        assert.ok(jupiter, 'Jupiter theme not found');
        assert.equal(jupiter.uiTheme, 'vs',
            'Jupiter is the light theme and must use uiTheme="vs"');
    });

    it('every dark theme uses uiTheme="vs-dark"', () => {
        for (const t of pkg.contributes.themes) {
            if (planetOf(t.label) === 'Jupiter') continue;
            assert.equal(t.uiTheme, 'vs-dark',
                `${t.label} should be vs-dark`);
        }
    });

    it('theme labels are unique', () => {
        const labels = pkg.contributes.themes.map(t => t.label);
        assert.equal(new Set(labels).size, labels.length, 'duplicate theme label');
    });
});

describe('package.json — contributes.commands', () => {
    let pkg;
    before(() => { pkg = readPkg(); });

    it('declares at least one command', () => {
        assert.ok(pkg.contributes && Array.isArray(pkg.contributes.commands));
        assert.ok(pkg.contributes.commands.length >= 1);
    });

    it('every declared command is registered in extension.js', () => {
        const src = readExtensionSource();
        for (const cmd of pkg.contributes.commands) {
            assert.ok(cmd.command, 'command entry missing command id');
            const re = new RegExp(`registerCommand\\s*\\(\\s*['"]${cmd.command.replace(/\./g, '\\.')}['"]`);
            assert.ok(re.test(src),
                `command "${cmd.command}" declared in package.json but never registered via vscode.commands.registerCommand in extension.js`);
        }
    });

    it('every registerCommand in extension.js is declared in package.json', () => {
        const src = readExtensionSource();
        const re = /registerCommand\s*\(\s*['"]([^'"]+)['"]/g;
        const declared = new Set(pkg.contributes.commands.map(c => c.command));
        let m;
        while ((m = re.exec(src)) !== null) {
            const id = m[1];
            assert.ok(declared.has(id),
                `command "${id}" is registered in extension.js but not declared in package.json`);
        }
    });

    it('declares the arn.manageSkin command (the only public command)', () => {
        const ids = pkg.contributes.commands.map(c => c.command);
        assert.ok(ids.includes('arn.manageSkin'));
    });
});

describe('package.json — contributes.jsonValidation', () => {
    let pkg;
    before(() => { pkg = readPkg(); });

    it('declares jsonValidation entries', () => {
        assert.ok(Array.isArray(pkg.contributes.jsonValidation));
        assert.ok(pkg.contributes.jsonValidation.length >= 1);
    });

    it('every jsonValidation.url points to an existing schema file', () => {
        for (const v of pkg.contributes.jsonValidation) {
            const url = v.url;
            // We only validate local "./..." schemas (not http://)
            if (!url.startsWith('./')) continue;
            const abs = path.join(REPO_ROOT, url);
            assert.ok(fs.existsSync(abs), `schema not found: ${url}`);
        }
    });

    it('jsonValidation.fileMatch covers the advanced-* file naming used by the extension', () => {
        const patterns = pkg.contributes.jsonValidation.map(v => v.fileMatch);
        assert.ok(patterns.some(p => p.startsWith('advanced-')),
            'no jsonValidation entry matches the advanced-*.jsonc files written by ensureAdvancedXxxFile');
    });
});

describe('package.json — extension purity (no runtime dependencies)', () => {
    let pkg;
    before(() => { pkg = readPkg(); });

    it('declares no `dependencies` (extension must remain pure)', () => {
        const deps = pkg.dependencies || {};
        assert.deepEqual(Object.keys(deps), [],
            `extension must ship without runtime deps; found: ${Object.keys(deps).join(', ')}`);
    });

    it('only the test harness brings devDependencies (none at the root)', () => {
        const devDeps = pkg.devDependencies || {};
        // The test harness lives in test/package.json. Only @types/* are
        // permitted at the root — they help editors with IntelliSense on
        // the extension source itself but are never bundled into the .vsix.
        for (const k of Object.keys(devDeps)) {
            assert.ok(k.startsWith('@types/'),
                `unexpected root devDependency: ${k} — should live in test/package.json`);
        }
    });
});

describe('extension.js — runtime expectations', () => {
    it('exports activate and deactivate', () => {
        const ext = require('../../extension');
        assert.equal(typeof ext.activate, 'function');
        assert.equal(typeof ext.deactivate, 'function');
    });

    it('exposes the __testing bag for the test harness', () => {
        const ext = require('../../extension');
        assert.ok(ext.__testing && typeof ext.__testing === 'object');
    });

    it('uses the same theme labels as those declared in package.json', () => {
        // Sanity: the test labels we use match what's in package.json.
        const pkg = readPkg();
        for (const t of pkg.contributes.themes) {
            const planet = planetOf(t.label);
            assert.ok(planet, `planetOf failed for ${t.label}`);
        }
    });
});
