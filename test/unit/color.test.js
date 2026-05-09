const assert = require('node:assert/strict');
const { __testing } = require('../../extension');
const { colorUtils } = __testing;

describe('colorUtils.hexToRgb', () => {
    it('parses 6-char hex', () => {
        assert.deepEqual(colorUtils.hexToRgb('#FF0000'), { r: 255, g: 0, b: 0 });
        assert.deepEqual(colorUtils.hexToRgb('#00FF00'), { r: 0, g: 255, b: 0 });
        assert.deepEqual(colorUtils.hexToRgb('#0000FF'), { r: 0, g: 0, b: 255 });
    });

    it('expands 3-char shorthand', () => {
        assert.deepEqual(colorUtils.hexToRgb('#F00'), { r: 255, g: 0, b: 0 });
        assert.deepEqual(colorUtils.hexToRgb('#ABC'), { r: 0xAA, g: 0xBB, b: 0xCC });
    });

    it('is case-insensitive', () => {
        assert.deepEqual(colorUtils.hexToRgb('#ff00aa'), { r: 255, g: 0, b: 170 });
        assert.deepEqual(colorUtils.hexToRgb('#Ff00aA'), { r: 255, g: 0, b: 170 });
    });

    it('handles hex without leading #', () => {
        assert.deepEqual(colorUtils.hexToRgb('FF0000'), { r: 255, g: 0, b: 0 });
    });
});

describe('colorUtils.rgbToHex', () => {
    it('formats standard values', () => {
        assert.equal(colorUtils.rgbToHex(255, 0, 0), '#FF0000');
        assert.equal(colorUtils.rgbToHex(0, 255, 0), '#00FF00');
        assert.equal(colorUtils.rgbToHex(0, 0, 0), '#000000');
        assert.equal(colorUtils.rgbToHex(255, 255, 255), '#FFFFFF');
    });

    it('pads single-digit components', () => {
        assert.equal(colorUtils.rgbToHex(1, 2, 3), '#010203');
        assert.equal(colorUtils.rgbToHex(0, 16, 0), '#001000');
    });

    it('round-trips with hexToRgb', () => {
        const samples = ['#FF0000', '#00FF00', '#0000FF', '#123456', '#ABCDEF', '#010203'];
        for (const hex of samples) {
            const { r, g, b } = colorUtils.hexToRgb(hex);
            assert.equal(colorUtils.rgbToHex(r, g, b), hex.toUpperCase());
        }
    });
});

describe('colorUtils.rgbToHsl / hslToRgb', () => {
    it('white has lightness 1', () => {
        const { h, s, l } = colorUtils.rgbToHsl(255, 255, 255);
        assert.equal(l, 1);
        assert.equal(s, 0);
    });

    it('black has lightness 0', () => {
        const { l, s } = colorUtils.rgbToHsl(0, 0, 0);
        assert.equal(l, 0);
        assert.equal(s, 0);
    });

    it('round-trips within ±1 per channel', () => {
        const samples = [
            [255, 0, 0], [0, 255, 0], [0, 0, 255],
            [128, 64, 32], [200, 150, 75], [50, 200, 180],
        ];
        for (const [r, g, b] of samples) {
            const hsl = colorUtils.rgbToHsl(r, g, b);
            const back = colorUtils.hslToRgb(hsl.h, hsl.s, hsl.l);
            assert.ok(Math.abs(back.r - r) <= 1, `r: ${back.r} vs ${r}`);
            assert.ok(Math.abs(back.g - g) <= 1, `g: ${back.g} vs ${g}`);
            assert.ok(Math.abs(back.b - b) <= 1, `b: ${back.b} vs ${b}`);
        }
    });
});

describe('colorUtils.adjustLightness', () => {
    it('lightens gray (positive delta)', () => {
        const before = colorUtils.rgbToHsl(...Object.values(colorUtils.hexToRgb('#808080'))).l;
        const after = colorUtils.adjustLightness('#808080', 0.2);
        const afterL = colorUtils.rgbToHsl(...Object.values(colorUtils.hexToRgb(after))).l;
        assert.ok(afterL > before, 'lightness should increase');
    });

    it('darkens gray (negative delta)', () => {
        const after = colorUtils.adjustLightness('#808080', -0.3);
        const { l } = colorUtils.rgbToHsl(...Object.values(colorUtils.hexToRgb(after)));
        assert.ok(l < 0.5);
    });

    it('clamps at white ceiling', () => {
        assert.equal(colorUtils.adjustLightness('#FFFFFF', 0.5), '#FFFFFF');
    });

    it('clamps at black floor', () => {
        assert.equal(colorUtils.adjustLightness('#000000', -0.5), '#000000');
    });

    it('preserves alpha channel on 8-char hex', () => {
        const result = colorUtils.adjustLightness('#80808080', 0.2);
        assert.equal(result.length, 9, 'result must be 9 chars (#RRGGBBAA)');
        assert.equal(result.slice(-2), '80', 'alpha must be preserved');
    });

    it('passes through non-string input unchanged', () => {
        assert.equal(colorUtils.adjustLightness(null, 0.2), null);
        assert.equal(colorUtils.adjustLightness(undefined, 0.2), undefined);
    });
});

describe('colorUtils.normalizeHex', () => {
    it('expands 3-char form to 6-char uppercase', () => {
        assert.equal(colorUtils.normalizeHex('#f00'), '#FF0000');
        assert.equal(colorUtils.normalizeHex('#abc'), '#AABBCC');
    });

    it('expands 4-char form to 8-char uppercase (with alpha)', () => {
        assert.equal(colorUtils.normalizeHex('#f00a'), '#FF0000AA');
    });

    it('uppercases 6-char form', () => {
        assert.equal(colorUtils.normalizeHex('#abcdef'), '#ABCDEF');
    });

    it('leaves 8-char form uppercase', () => {
        assert.equal(colorUtils.normalizeHex('#abcdef80'), '#ABCDEF80');
    });

    it('passes through non-string unchanged', () => {
        assert.equal(colorUtils.normalizeHex(null), null);
        assert.equal(colorUtils.normalizeHex(undefined), undefined);
    });
});

describe('colorUtils.addAlpha', () => {
    it('appends alpha to 6-char hex', () => {
        assert.equal(colorUtils.addAlpha('#FF0000', '80'), '#FF000080');
    });

    it('replaces alpha on 8-char hex', () => {
        assert.equal(colorUtils.addAlpha('#FF000000', '80'), '#FF000080');
    });

    it('normalizes 3-char hex before appending', () => {
        assert.equal(colorUtils.addAlpha('#F00', '80'), '#FF000080');
    });
});

describe('colorUtils.cleanUndefined', () => {
    it('strips undefined and null', () => {
        const input = { a: 1, b: undefined, c: null, d: 'x' };
        assert.deepEqual(colorUtils.cleanUndefined(input), { a: 1, d: 'x' });
    });

    it('keeps other falsy values (0, empty string, false)', () => {
        const input = { a: 0, b: '', c: false, d: undefined };
        assert.deepEqual(colorUtils.cleanUndefined(input), { a: 0, b: '', c: false });
    });

    it('returns empty object for all-undefined input', () => {
        assert.deepEqual(colorUtils.cleanUndefined({ a: undefined, b: null }), {});
    });
});
