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

// VSCode flags some colour keys with needsTransparency=true; opaque values
// on them trigger an "obscures content" warning. Suite A asserts our themes
// against the frozen list below (no bundle scan = can't break from minifier
// changes). Suite B scans the bundle and fails on new keys not yet in the
// list. Removals are ignored — keeping an extra key is harmless.

// Frozen from VSCode 1.122.1 (2026-05-27). Append new keys when suite B
// flags them.
const TRANSPARENCY_REQUIRED = [
    'chat.inputWorkingBorderColor1',
    'chat.inputWorkingBorderColor2',
    'chat.inputWorkingBorderColor3',
    'chat.linesAddedForeground',
    'chat.linesRemovedForeground',
    'chat.requestBubbleBackground',
    'chat.requestBubbleHoverBackground',
    'chat.requestCodeBorder',
    'chat.thinkingShimmer',
    'commandCenter.debuggingBackground',
    'diffEditor.insertedLineBackground',
    'diffEditor.insertedTextBackground',
    'diffEditor.removedLineBackground',
    'diffEditor.removedTextBackground',
    'editor.findMatchHighlightBackground',
    'editor.findMatchHighlightForeground',
    'editor.findRangeHighlightBackground',
    'editor.findRangeHighlightBorder',
    'editor.foldBackground',
    'editor.hoverHighlightBackground',
    'editor.inactiveSelectionBackground',
    'editor.rangeHighlightBackground',
    'editor.selectionHighlightBackground',
    'editor.symbolHighlightBackground',
    'editor.wordHighlightBackground',
    'editor.wordHighlightStrongBackground',
    'editor.wordHighlightTextBackground',
    'editorError.background',
    'editorInfo.background',
    'editorOverviewRuler.findMatchForeground',
    'editorOverviewRuler.rangeHighlightForeground',
    'editorOverviewRuler.selectionHighlightForeground',
    'editorOverviewRuler.wordHighlightForeground',
    'editorOverviewRuler.wordHighlightStrongForeground',
    'editorOverviewRuler.wordHighlightTextForeground',
    'editorWarning.background',
    'inlineEdit.modifiedBackground',
    'inlineEdit.modifiedChangedLineBackground',
    'inlineEdit.modifiedChangedTextBackground',
    'inlineEdit.originalBackground',
    'inlineEdit.originalChangedLineBackground',
    'inlineEdit.originalChangedTextBackground',
    'merge.commonContentBackground',
    'merge.commonHeaderBackground',
    'merge.currentContentBackground',
    'merge.currentHeaderBackground',
    'merge.incomingContentBackground',
    'merge.incomingHeaderBackground',
    'minimap.findMatchHighlight',
    'minimap.selectionHighlight',
    'minimap.selectionOccurrenceHighlight',
    'terminal.dropBackground',
    'terminal.findMatchBackground',
    'terminal.findMatchHighlightBackground',
];

function isOpaque(val) {
    if (typeof val !== 'string' || !val.startsWith('#')) return false;
    const h = val.slice(1);
    if (h.length === 3 || h.length === 6) return true;
    if (h.length === 4) return h[3].toLowerCase() === 'f';
    if (h.length === 8) return h.slice(6).toLowerCase() === 'ff';
    return false;
}

describe('Theme colour values — transparency contract', function () {
    for (const themeFile of THEMES) {
        it(`${themeFile} has no opaque value on any transparency-required key`, () => {
            const theme = parseJsonc(fs.readFileSync(path.join(REPO_ROOT, 'themes', themeFile), 'utf8'));
            const colors = theme.colors || {};
            const violations = [];
            for (const key of TRANSPARENCY_REQUIRED) {
                if (key in colors && isOpaque(colors[key])) {
                    violations.push(`${key} = ${colors[key]}`);
                }
            }
            assert.deepEqual(violations, [],
                `${themeFile}: ${violations.length} value(s) opaque on a transparency-required key. Append an alpha channel (e.g. CC for ~80%, 99 for ~60%, 66 for ~40%):\n  ${violations.join('\n  ')}`);
        });
    }
});

// Drift detector: discover the minified `registerColor` via SENTINELS
// (stable transparency keys) so we survive minifier renames, then diff the
// bundle's full set against TRANSPARENCY_REQUIRED.
describe('Theme colour values — transparency drift detector', function () {
    this.timeout(120000);

    const SENTINELS = new Set([
        'editor.findMatchHighlightBackground',
        'editor.wordHighlightBackground',
        'editor.selectionHighlightBackground',
    ]);

    function extractFromBundle(rootDir) {
        const callsByFname = new Map(); // minified fname -> Set<colorKey>
        const startRe = /\b([a-zA-Z_$][a-zA-Z0-9_$]{0,3})\("([a-zA-Z][a-zA-Z0-9._-]*)",/g;
        function scanFile(buf) {
            let m;
            while ((m = startRe.exec(buf)) !== null) {
                const fname = m[1];
                const name = m[2];
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
                if (!/,\s*!0\s*$/.test(tail)) continue;
                let bucket = callsByFname.get(fname);
                if (!bucket) { bucket = new Set(); callsByFname.set(fname, bucket); }
                bucket.add(name);
            }
            startRe.lastIndex = 0;
        }
        function walk(dir) {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                if (ent.isDirectory()) {
                    if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
                    walk(path.join(dir, ent.name));
                } else if (ent.isFile() && ent.name.endsWith('.js')) {
                    try { scanFile(fs.readFileSync(path.join(dir, ent.name), 'utf8')); } catch { /* unreadable */ }
                }
            }
        }
        walk(rootDir);
        // Highest-scoring bucket = registerColor.
        let best = null, bestScore = 0;
        for (const [fname, names] of callsByFname) {
            let score = 0;
            for (const s of SENTINELS) if (names.has(s)) score++;
            if (score > bestScore) { bestScore = score; best = fname; }
        }
        return { keys: best ? callsByFname.get(best) : new Set(), score: bestScore };
    }

    it('TRANSPARENCY_REQUIRED is in sync with the installed VSCode bundle', function () {
        if (!VSCODE_APP) { this.skip(); return; } // bundle not downloaded
        const { keys: bundleKeys, score } = extractFromBundle(VSCODE_APP);
        if (score === 0) {
            assert.fail(
                'Drift detector blind: no sentinel matched any minified call. ' +
                'Likely a VSCode registry restructure or sentinel rename — update SENTINELS.');
        }
        const declared = new Set(TRANSPARENCY_REQUIRED);
        const additions = [...bundleKeys].filter(k => !declared.has(k)).sort();
        assert.deepEqual(additions, [],
            `VSCode has new transparency-required key(s) not in TRANSPARENCY_REQUIRED. ` +
            `Add alpha (CC/99/66) where used in any theme, then append:\n  ${additions.join('\n  ')}`);
    });
});
