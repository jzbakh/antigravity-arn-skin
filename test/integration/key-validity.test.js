// Validates that every colour token shipped by an ARN theme is registered
// either by VSCode core or by one of the bundled extensions (git, github,
// markdown, etc.). Catches invalid tokens before they reach the marketplace
// — they would only confuse the Advanced UI editor and provide no styling.
//
// The validation indexes every quoted string literal in the installed
// VSCode JS bundle (under test/.vscode-test/), giving us a precise local
// reference of what tokens the host editor actually understands.
//
// Tokens we knowingly ship for popular 3rd-party extensions (Error Lens,
// GitLens) are allowed via the THIRD_PARTY_PREFIXES list — they are valid
// when the relevant extension is installed and harmless otherwise.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { __testing } = require('../../extension');
const { parseJsonc, generateQuickTheme } = __testing;

const REPO_ROOT = path.join(__dirname, '..', '..');
const THEMES = ['arn-spaceport.json', 'arn-nebula.json', 'arn-neptune.json',
                'arn-uranus.json', 'arn-io.json', 'arn-jupiter.json', 'arn-mars.json'];

// 3rd-party extension keys we deliberately ship support for.
const THIRD_PARTY_PREFIXES = ['errorLens.', 'gitlens.'];

// Locate the bundled VSCode under test/.vscode-test/. The folder name
// includes the version (e.g. vscode-win32-x64-archive-1.118.1) and a hash
// directory inside, so we discover both at runtime instead of hardcoding.
function findVSCodeAppDir() {
    const root = path.join(REPO_ROOT, 'test', '.vscode-test');
    if (!fs.existsSync(root)) return null;

    const versions = fs.readdirSync(root)
        .filter(n => n.startsWith('vscode-'))
        .map(n => path.join(root, n))
        .filter(p => fs.statSync(p).isDirectory());

    for (const verDir of versions) {
        for (const ent of fs.readdirSync(verDir, { withFileTypes: true })) {
            if (!ent.isDirectory()) continue;
            const candidate = path.join(verDir, ent.name, 'resources', 'app');
            if (fs.existsSync(path.join(candidate, 'out'))) return candidate;
        }
    }
    return null;
}

function indexStringLiterals(rootDir) {
    const literals = new Set();
    const re = /"([a-zA-Z][a-zA-Z0-9._-]*)"/g;
    function walk(dir) {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            if (ent.isDirectory()) {
                if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
                walk(path.join(dir, ent.name));
            } else if (ent.isFile() && ent.name.endsWith('.js')) {
                try {
                    const buf = fs.readFileSync(path.join(dir, ent.name), 'utf8');
                    let m;
                    while ((m = re.exec(buf)) !== null) literals.add(m[1]);
                    re.lastIndex = 0;
                } catch { /* unreadable — ignore */ }
            }
        }
    }
    walk(rootDir);
    return literals;
}

const VSCODE_APP = findVSCodeAppDir();

const isThirdParty = (key) => THIRD_PARTY_PREFIXES.some(p => key.startsWith(p));

describe('Theme colour keys — valid against the installed VSCode bundle', function () {
    // The bundle is ~95 MB of minified JS. Indexing it once takes a few
    // seconds on SSD and noticeably longer on CI runners — give the setup
    // hook plenty of headroom and reuse the result across every test in
    // this suite (do NOT re-scan per `it`).
    this.timeout(120000);

    let literals = null;

    before(function () {
        if (!VSCODE_APP) {
            // The integration suite downloads the VSCode bundle on first
            // run. If a fresh checkout invokes only `npm run test:unit`
            // the directory is empty — skip rather than fail.
            this.skip();
            return;
        }
        literals = indexStringLiterals(VSCODE_APP);
    });

    for (const themeFile of THEMES) {
        it(`${themeFile} contains no invalid VSCode colour tokens`, () => {
            const theme = parseJsonc(fs.readFileSync(path.join(REPO_ROOT, 'themes', themeFile), 'utf8'));
            const keys = Object.keys(theme.colors || {});

            const invalid = keys.filter(k => !literals.has(k) && !isThirdParty(k));
            assert.deepEqual(invalid, [],
                `${themeFile}: ${invalid.length} colour key(s) are not registered by VSCode core or any bundled extension and are not in the 3rd-party allowlist (${THIRD_PARTY_PREFIXES.join(', ')}). Remove them or add the extension prefix to the allowlist:\n  ${invalid.join('\n  ')}`);
        });
    }

    it('the schema does not enumerate any invalid VSCode colour tokens', () => {
        const schema = JSON.parse(fs.readFileSync(
            path.join(REPO_ROOT, 'schemas', 'arn-advanced.schema.json'), 'utf8'));
        const declaredKeys = Object.keys(schema.properties.colors.properties);

        const invalid = declaredKeys.filter(k => !literals.has(k) && !isThirdParty(k));
        assert.deepEqual(invalid, [],
            `schema declares ${invalid.length} colour key(s) the host editor will not recognise:\n  ${invalid.join('\n  ')}`);
    });

    // Quick mode writes its output directly into workbench.colorCustomizations,
    // so any invalid key it emits would land in the user's settings file and
    // surface as an "Unknown configuration" warning in the editor. This test
    // permutes every toggle state across both light and dark theme polarities
    // and asserts every emitted key is a token the host editor recognises.
    it('generateQuickTheme never emits a colour key the host editor will not recognise', () => {
        const baseline = {
            'ui.baseBackground':      '#1E1E1E',
            'ui.baseForeground':      '#D4D4D4',
            'ui.accentPrimary':       '#007ACC',
            'ui.secondaryBackground': '#252526',
            'ui.surfaceElevated':     '#2D2D30',
            'ui.borders':             '#333333',
            'ui.activeBorder':        '#007ACC',
            'ui.selection':           '#007ACC40',
            'status.warning':         '#D0B860',
            'status.error':           '#E85850',
            'status.success':         '#70D888',
            'status.info':            '#4FB4FF',
        };
        const allDirty = Object.fromEntries([
            'bg', 'text', 'accent', 'bgSec', 'surfaceElevated',
            'border', 'activeBorder', 'selection',
            'warning', 'error', 'success', 'info',
        ].map(k => [k, true]));
        const toggleStates = ['inherit', 'yes', 'no'];

        const allEmitted = new Set();
        for (const b of toggleStates)
            for (const p of toggleStates)
                for (const a of toggleStates)
                    for (const v of toggleStates)
                        for (const c of toggleStates) {
                            const parsed = {
                                ...baseline,
                                'ui.borderless':         b,
                                'ui.pureBlack':          p,
                                'ui.activeTabHighlight': a,
                                'ui.vividSelection':     v,
                                'ui.cursorLineGlow':     c,
                            };
                            for (const themeType of ['dark', 'light']) {
                                const out = generateQuickTheme(parsed, allDirty, themeType);
                                for (const k of Object.keys(out.colors)) allEmitted.add(k);
                            }
                        }

        const invalid = [...allEmitted]
            .filter(k => !literals.has(k) && !isThirdParty(k))
            .sort();
        assert.deepEqual(invalid, [],
            `generateQuickTheme emits ${invalid.length} colour key(s) the host editor will not recognise. ` +
            `These would land in workbench.colorCustomizations and trigger "Unknown configuration" warnings:\n  ${invalid.join('\n  ')}`);
    });
});

// =========================================================================
// Theme colour values — transparency contract
// =========================================================================
// VSCode registers some colour tokens with `needsTransparency: true`. When
// such a key is set to an opaque value (no alpha or alpha == FF) the
// editor surfaces "This color must be transparent or it will obscure
// content" warnings on every Advanced UI customisation. The tests below
// extract that flag set from the installed VSCode bundle and assert no
// theme ships an opaque value for any of them.

describe('Theme colour values — transparency contract', function () {
    this.timeout(120000);

    // Same scan strategy as the key-validity suite, but we look for
    // `te(name, defaults, descriptionId, !0)` — the trailing `!0` is
    // the minified `true` of needsTransparency.
    function extractTransparencyKeys(rootDir) {
        const keys = new Set();
        const startRe = /\bte\("([a-zA-Z][a-zA-Z0-9._-]*)",/g;
        function scanFile(buf) {
            let m;
            while ((m = startRe.exec(buf)) !== null) {
                const name = m[1];
                const argsStart = m.index + m[0].length;
                let depth = 1, p = argsStart, inStr = false, strCh = '', esc = false;
                while (p < buf.length && depth > 0) {
                    const c = buf[p];
                    if (inStr) {
                        if (esc) esc = false;
                        else if (c === '\\') esc = true;
                        else if (c === strCh) inStr = false;
                        p++; continue;
                    }
                    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; p++; continue; }
                    if (c === '(') depth++;
                    else if (c === ')') depth--;
                    if (depth === 0) break;
                    p++;
                }
                if (depth !== 0) continue;
                const tail = buf.slice(Math.max(argsStart, p - 4), p);
                if (/,\s*!0\s*$/.test(tail)) keys.add(name);
            }
            startRe.lastIndex = 0;
        }
        function walk(dir) {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                if (ent.isDirectory()) {
                    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
                    walk(path.join(dir, ent.name));
                } else if (ent.isFile() && ent.name.endsWith('.js')) {
                    try {
                        scanFile(fs.readFileSync(path.join(dir, ent.name), 'utf8'));
                    } catch { /* unreadable */ }
                }
            }
        }
        walk(rootDir);
        return keys;
    }

    function isOpaque(val) {
        if (typeof val !== 'string' || !val.startsWith('#')) return false;
        const h = val.slice(1);
        if (h.length === 3 || h.length === 6) return true;
        if (h.length === 4) return h[3].toLowerCase() === 'f';
        if (h.length === 8) return h.slice(6).toLowerCase() === 'ff';
        return false;
    }

    let transparencyKeys = null;

    before(function () {
        if (!VSCODE_APP) {
            this.skip();
            return;
        }
        transparencyKeys = extractTransparencyKeys(VSCODE_APP);
        // Sanity: VSCode 1.117+ ships at least 30 such keys. If we got far
        // fewer the regex broke and the suite would silently pass.
        if (transparencyKeys.size < 30) {
            throw new Error(
                `transparency-key extractor returned only ${transparencyKeys.size} keys; ` +
                'the bundle layout likely changed and the regex needs updating');
        }
    });

    for (const themeFile of THEMES) {
        it(`${themeFile} has no opaque value on any transparency-required key`, () => {
            const theme = parseJsonc(fs.readFileSync(path.join(REPO_ROOT, 'themes', themeFile), 'utf8'));
            const colors = theme.colors || {};
            const violations = [];
            for (const key of transparencyKeys) {
                if (key in colors && isOpaque(colors[key])) {
                    violations.push(`${key} = ${colors[key]}`);
                }
            }
            assert.deepEqual(violations, [],
                `${themeFile}: ${violations.length} value(s) opaque on a transparency-required key. Append an alpha channel (e.g. CC for ~80%, 99 for ~60%, 66 for ~40%):\n  ${violations.join('\n  ')}`);
        });
    }
});
