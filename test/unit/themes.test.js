// Structural validation of the 7 ARN themes.
// These tests do not depend on the extension — they verify the *assets*
// shipped inside the .vsix. The goals are to catch regressions on:
//   • cross-theme consistency (same set of keys exposed by every theme)
//   • colour validity (well-formed hex, no fg/bg collisions)
//   • full coverage of the chat.* surface keys

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { __testing } = require('../../extension');
const { parseJsonc } = __testing;

const REPO_ROOT = path.join(__dirname, '..', '..');
const THEME_DIR = path.join(REPO_ROOT, 'themes');

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const EXPECTED_THEMES = [
    'arn-spaceport.json',
    'arn-nebula.json',
    'arn-neptune.json',
    'arn-uranus.json',
    'arn-io.json',
    'arn-jupiter.json',
    'arn-mars.json',
];

// chat.* surface keys every theme must declare. Missing any of these would
// silently ship a half-styled Chat surface, so the tests below guard them.
const REQUIRED_CHAT_KEYS = [
    'chat.requestBackground',
    'chat.requestBorder',
    'chat.requestBubbleBackground',
    'chat.requestBubbleHoverBackground',
    'chat.requestCodeBorder',
    'chat.editedFileForeground',
    'chat.linesAddedForeground',
    'chat.linesRemovedForeground',
    'chat.slashCommandBackground',
    'chat.slashCommandForeground',
    'chat.avatarBackground',
    'chat.avatarForeground',
];

// Reference theme for structural cross-checks.
const REF_NAME = 'arn-spaceport.json';

function load(name) {
    return parseJsonc(fs.readFileSync(path.join(THEME_DIR, name), 'utf8'));
}

function collectInvalidHex(themeJson) {
    const bad = [];
    for (const [k, v] of Object.entries(themeJson.colors || {})) {
        if (typeof v !== 'string') {
            bad.push(`colors.${k} is not a string (got ${typeof v})`);
            continue;
        }
        if (v.startsWith('#') && !HEX_RE.test(v)) {
            bad.push(`colors.${k} = ${v}`);
        }
    }
    for (const [k, v] of Object.entries(themeJson.semanticTokenColors || {})) {
        const fg = typeof v === 'string' ? v : (v && v.foreground);
        if (fg && typeof fg === 'string' && fg.startsWith('#') && !HEX_RE.test(fg)) {
            bad.push(`semanticTokenColors.${k} foreground = ${fg}`);
        }
    }
    (themeJson.tokenColors || []).forEach((rule, i) => {
        if (!rule.settings) return;
        for (const [k, v] of Object.entries(rule.settings)) {
            if (k === 'fontStyle') continue;
            if (typeof v === 'string' && v.startsWith('#') && !HEX_RE.test(v)) {
                bad.push(`tokenColors[${i}].settings.${k} = ${v}`);
            }
        }
    });
    return bad;
}

describe('Themes — file existence & parsing', () => {
    it('all 7 expected themes are present on disk', () => {
        // We scan the directory tolerantly — extra files (e.g. user-created
        // themes like `arn-nebula_02.json`) are allowed; missing ones are not.
        const found = new Set(fs.readdirSync(THEME_DIR).filter(f => f.endsWith('.json')));
        const missing = EXPECTED_THEMES.filter(t => !found.has(t));
        assert.deepEqual(missing, [],
            `expected theme files missing from disk: ${missing.join(', ')}`);
    });

    for (const name of EXPECTED_THEMES) {
        it(`${name} parses as valid JSONC`, () => {
            assert.doesNotThrow(() => load(name));
        });
    }
});

describe('Themes — top-level shape', () => {
    for (const name of EXPECTED_THEMES) {
        describe(name, () => {
            let theme;
            before(() => { theme = load(name); });

            it('has name and type', () => {
                assert.equal(typeof theme.name, 'string');
                assert.ok(theme.type === 'dark' || theme.type === 'light',
                    `type must be "dark" or "light", got ${theme.type}`);
            });

            it('has the three colour sections', () => {
                assert.ok(theme.colors && typeof theme.colors === 'object');
                assert.ok(theme.semanticTokenColors && typeof theme.semanticTokenColors === 'object');
                assert.ok(Array.isArray(theme.tokenColors));
            });
        });
    }

    it('exactly Jupiter is light, the other 6 are dark', () => {
        const types = {};
        for (const name of EXPECTED_THEMES) {
            types[name] = load(name).type;
        }
        assert.equal(types['arn-jupiter.json'], 'light');
        for (const name of EXPECTED_THEMES) {
            if (name === 'arn-jupiter.json') continue;
            assert.equal(types[name], 'dark', `${name} should be dark`);
        }
    });
});

describe('Themes — structural consistency vs reference (arn-spaceport)', () => {
    let ref;
    before(() => { ref = load(REF_NAME); });

    for (const name of EXPECTED_THEMES) {
        if (name === REF_NAME) continue;
        describe(name, () => {
            let theme;
            before(() => { theme = load(name); });

            it('has the same set of colors keys as the reference', () => {
                const refKeys = new Set(Object.keys(ref.colors));
                const themeKeys = new Set(Object.keys(theme.colors));
                const missing = [...refKeys].filter(k => !themeKeys.has(k));
                const extra = [...themeKeys].filter(k => !refKeys.has(k));
                assert.deepEqual(missing, [], `missing keys: ${missing.join(', ')}`);
                assert.deepEqual(extra, [], `extra keys: ${extra.join(', ')}`);
            });

            it('has the same set of semanticTokenColors keys as the reference', () => {
                const refKeys = new Set(Object.keys(ref.semanticTokenColors));
                const themeKeys = new Set(Object.keys(theme.semanticTokenColors));
                const missing = [...refKeys].filter(k => !themeKeys.has(k));
                const extra = [...themeKeys].filter(k => !refKeys.has(k));
                assert.deepEqual(missing, []);
                assert.deepEqual(extra, []);
            });

            it('has roughly the same number of tokenColors rules as the reference (±5)', () => {
                // Per-theme design variations (Mars-only `Rust lifetime '` /
                // `SQL DML override`, Spaceport's `Rust * in-fn L2`, Uranus' MD-JSON
                // overrides, Io's `support.type.exception`, etc.) cause small
                // differences in total rule count. ±5 catches catastrophic
                // regressions while permitting intentional design choices.
                const diff = Math.abs(theme.tokenColors.length - ref.tokenColors.length);
                assert.ok(diff <= 5,
                    `tokenColors count drifted by ${diff} (theme: ${theme.tokenColors.length}, ref: ${ref.tokenColors.length})`);
            });
        });
    }
});

describe('Themes — chat.* surface coverage', () => {
    for (const name of EXPECTED_THEMES) {
        it(`${name} declares all ${REQUIRED_CHAT_KEYS.length} required chat.* keys`, () => {
            const theme = load(name);
            const keys = Object.keys(theme.colors);
            const missing = REQUIRED_CHAT_KEYS.filter(k => !keys.includes(k));
            assert.deepEqual(missing, [], `missing chat keys: ${missing.join(', ')}`);
        });

        it(`${name}'s chat.* values are all valid hex`, () => {
            const theme = load(name);
            for (const k of REQUIRED_CHAT_KEYS) {
                const v = theme.colors[k];
                assert.ok(typeof v === 'string' && HEX_RE.test(v),
                    `${k} = ${v} is not a valid hex`);
            }
        });
    }
});

describe('Themes — hex format validation', () => {
    for (const name of EXPECTED_THEMES) {
        it(`${name} contains no malformed hex values`, () => {
            const bad = collectInvalidHex(load(name));
            assert.deepEqual(bad, [], `invalid hex entries:\n  ${bad.join('\n  ')}`);
        });
    }
});

describe('Themes — basic visual sanity', () => {
    for (const name of EXPECTED_THEMES) {
        describe(name, () => {
            let theme;
            before(() => { theme = load(name); });

            it('editor.background and editor.foreground differ', () => {
                const bg = theme.colors['editor.background'];
                const fg = theme.colors['editor.foreground'];
                assert.ok(bg && fg, 'both keys must be present');
                assert.notEqual(bg.toLowerCase(), fg.toLowerCase(),
                    `editor.background and editor.foreground must differ (both ${bg})`);
            });

            it('terminal.background and terminal.foreground differ', () => {
                const bg = theme.colors['terminal.background'];
                const fg = theme.colors['terminal.foreground'];
                if (bg && fg) {
                    assert.notEqual(bg.toLowerCase(), fg.toLowerCase());
                }
            });

            it('declares editor.background and editor.foreground', () => {
                assert.ok(theme.colors['editor.background']);
                assert.ok(theme.colors['editor.foreground']);
            });
        });
    }
});

describe('Themes — semanticTokenColors integrity', () => {
    for (const name of EXPECTED_THEMES) {
        it(`${name}'s semantic tokens are either strings or shaped objects`, () => {
            const theme = load(name);
            for (const [k, v] of Object.entries(theme.semanticTokenColors || {})) {
                if (typeof v === 'string') {
                    assert.ok(HEX_RE.test(v), `semantic ${k} string value invalid: ${v}`);
                } else {
                    assert.ok(v && typeof v === 'object', `semantic ${k} should be string or object`);
                    if (v.foreground !== undefined) {
                        assert.ok(typeof v.foreground === 'string' && HEX_RE.test(v.foreground),
                            `semantic ${k}.foreground invalid: ${v.foreground}`);
                    }
                }
            }
        });
    }
});

describe('Themes — tokenColors integrity', () => {
    for (const name of EXPECTED_THEMES) {
        it(`${name}'s tokenColors entries are well-formed`, () => {
            const theme = load(name);
            theme.tokenColors.forEach((rule, i) => {
                assert.ok(rule.scope, `tokenColors[${i}] missing scope`);
                assert.ok(rule.settings, `tokenColors[${i}] missing settings`);
                assert.ok(typeof rule.settings === 'object',
                    `tokenColors[${i}].settings must be object`);
                const scopeOk = typeof rule.scope === 'string'
                    || (Array.isArray(rule.scope) && rule.scope.every(s => typeof s === 'string'));
                assert.ok(scopeOk, `tokenColors[${i}].scope must be string or string[]`);
            });
        });
    }
});
