// Health check on the 6 bracket-pair colorization levels every theme
// declares. VSCode's native bracket pair colorization (default since 1.60)
// reads `editorBracketHighlight.foreground1-6` and applies the colours to
// any language whose grammar declares brackets — which is every language
// except JSON/JSONC for the `(`/`)` pair (JSON's grammar only declares
// `{}` and `[]` as brackets, so parens are never colorised in JSON files
// regardless of the theme).
//
// Asserts, for every theme:
//   1) all 6 levels are declared
//   2) every value is a parseable hex
//   3) no value is fully transparent (alpha == 00 → invisible bracket)
//   4) the 6 values are mutually distinct (no level looks like another)
//   5) every value has a >= 2.0:1 contrast ratio against editor.background
//      (Material Design and Apple HIG both recommend >= 4.5:1 for body
//      text; for chrome elements like brackets >= 2.0 is the practical
//      floor — below that the level disappears into the bg)

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { __testing } = require('../../extension');
const { parseJsonc } = __testing;

const REPO_ROOT = path.join(__dirname, '..', '..');
const THEMES = ['arn-spaceport.json', 'arn-nebula.json', 'arn-neptune.json',
                'arn-uranus.json', 'arn-io.json', 'arn-jupiter.json', 'arn-mars.json'];

function hexToRgba(hex) {
    if (typeof hex !== 'string' || !hex.startsWith('#')) return null;
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('') + 'ff';
    else if (h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join('') + h[3] + h[3];
    else if (h.length === 6) h += 'ff';
    if (h.length !== 8) return null;
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: parseInt(h.slice(6, 8), 16),
    };
}

function relLum({ r, g, b }) {
    const linear = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(c1, c2) {
    const L1 = relLum(c1), L2 = relLum(c2);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

function rgbDistance(a, b) {
    return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

describe('Bracket pair colorization — 6-level health across every ARN theme', () => {
    for (const themeFile of THEMES) {
        describe(themeFile, () => {
            let theme;
            let bg;
            const levels = [1, 2, 3, 4, 5, 6];
            const values = [];

            before(() => {
                theme = parseJsonc(fs.readFileSync(path.join(REPO_ROOT, 'themes', themeFile), 'utf8'));
                bg = hexToRgba((theme.colors || {})['editor.background']);
            });

            it('declares all 6 editorBracketHighlight.foregroundN keys', () => {
                const colors = theme.colors || {};
                values.length = 0;
                for (const lvl of levels) {
                    const key = `editorBracketHighlight.foreground${lvl}`;
                    const val = colors[key];
                    assert.ok(val, `${key} must be declared`);
                    const rgba = hexToRgba(val);
                    assert.ok(rgba, `${key} = ${val} must parse as a valid hex`);
                    values.push({ key, val, rgba });
                }
            });

            it('every level has alpha > 0 (no invisible bracket level)', () => {
                for (const { key, val, rgba } of values) {
                    assert.ok(rgba.a > 0,
                        `${key} = ${val} has alpha 00 → bracket level is invisible in code`);
                }
            });

            it('the 6 levels are mutually distinct (no two levels look identical)', () => {
                for (let i = 0; i < values.length; i++) {
                    for (let j = i + 1; j < values.length; j++) {
                        const dist = rgbDistance(values[i].rgba, values[j].rgba);
                        assert.ok(dist >= 30,
                            `Level ${i + 1} (${values[i].val}) and level ${j + 1} (${values[j].val}) ` +
                            `are too similar (RGB distance ${dist.toFixed(1)}, expected >= 30)`);
                    }
                }
            });

            it('every level has at least 2.0:1 contrast vs editor.background', () => {
                assert.ok(bg, 'editor.background must be defined for contrast check');
                for (const { key, val, rgba } of values) {
                    const ratio = contrastRatio(rgba, bg);
                    assert.ok(ratio >= 2.0,
                        `${key} = ${val} contrast ratio ${ratio.toFixed(2)}:1 against ` +
                        `editor.background — under 2.0 the bracket disappears into the background`);
                }
            });
        });
    }
});
