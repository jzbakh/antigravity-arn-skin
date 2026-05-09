const assert = require('node:assert/strict');
const { __testing } = require('../../extension');
const { sanitizeLabel, planetOf, inferCustomizationMode } = __testing;

// Real ARN theme labels — kept in sync with package.json `contributes.themes`.
const REAL_LABELS = [
    'Arn · Spaceport — Tungsten Grid',
    'Arn · Nebula — Amethyst Void',
    'Arn · Neptune — Glacial Navy',
    'Arn · Uranus — Glacial Teal',
    'Arn · Io — Acid Haze',
    'Arn · Jupiter — Amber Light',
    'Arn · Mars — Amber Storm',
];

describe('sanitizeLabel', () => {
    it('normalizes the real ARN theme labels', () => {
        assert.equal(sanitizeLabel('Arn · Spaceport — Tungsten Grid'), 'arn-spaceport-tungsten-grid');
        assert.equal(sanitizeLabel('Arn · Mars — Amber Storm'),       'arn-mars-amber-storm');
        assert.equal(sanitizeLabel('Arn · Nebula — Amethyst Void'),   'arn-nebula-amethyst-void');
    });

    it('produces a unique sanitized form for every contributed theme', () => {
        const sanitized = REAL_LABELS.map(sanitizeLabel);
        assert.equal(new Set(sanitized).size, REAL_LABELS.length,
            'sanitized labels must remain unique');
    });

    it('is idempotent', () => {
        const once = sanitizeLabel('Arn · Mars — Amber Storm');
        const twice = sanitizeLabel(once);
        assert.equal(once, twice);
    });

    it('never produces leading or trailing dashes', () => {
        assert.equal(sanitizeLabel('---foo---'), 'foo');
        assert.equal(sanitizeLabel('!@#hello!@#'), 'hello');
    });

    it('collapses runs of special characters into a single dash', () => {
        assert.equal(sanitizeLabel('a !!! b'), 'a-b');
        assert.equal(sanitizeLabel('x · · · y'), 'x-y');
    });

    it('lowercases everything', () => {
        assert.equal(sanitizeLabel('ABC XYZ'), 'abc-xyz');
    });

    it('preserves alphanumerics', () => {
        assert.equal(sanitizeLabel('theme123 v2'), 'theme123-v2');
    });
});

describe('planetOf', () => {
    it('recognizes every contributed ARN planet', () => {
        assert.equal(planetOf('Arn · Spaceport — Tungsten Grid'), 'Spaceport');
        assert.equal(planetOf('Arn · Nebula — Amethyst Void'),   'Nebula');
        assert.equal(planetOf('Arn · Neptune — Glacial Navy'),   'Neptune');
        assert.equal(planetOf('Arn · Uranus — Glacial Teal'),    'Uranus');
        assert.equal(planetOf('Arn · Io — Acid Haze'),           'Io');
        assert.equal(planetOf('Arn · Jupiter — Amber Light'),    'Jupiter');
        assert.equal(planetOf('Arn · Mars — Amber Storm'),       'Mars');
    });

    it('returns null for non-ARN labels', () => {
        assert.equal(planetOf('Solarized Dark'), null);
        assert.equal(planetOf('Default Dark+'),  null);
    });
});

describe('inferCustomizationMode', () => {
    // Build a uri-shaped object that satisfies what the function reads.
    const mkUri = (fsPath) => ({
        fsPath,
        path: fsPath.replace(/\\/g, '/'),
    });
    const ctx = { globalStorageUri: mkUri('/tmp/arn-storage') };

    it('returns "quick" for quick-*.css under globalStorageUri', () => {
        const uri = mkUri('/tmp/arn-storage/quick-arn-mars-amber-storm.css');
        assert.equal(inferCustomizationMode(uri, ctx), 'quick');
    });

    it('returns "advanced-ui" for advanced-ui-*.jsonc', () => {
        const uri = mkUri('/tmp/arn-storage/advanced-ui-arn-mars-amber-storm.jsonc');
        assert.equal(inferCustomizationMode(uri, ctx), 'advanced-ui');
    });

    it('returns "advanced-syntax" for advanced-syntax-*.jsonc', () => {
        const uri = mkUri('/tmp/arn-storage/advanced-syntax-arn-mars-amber-storm.jsonc');
        assert.equal(inferCustomizationMode(uri, ctx), 'advanced-syntax');
    });

    it('returns null for files outside globalStorageUri', () => {
        const uri = mkUri('/some/other/path/quick-arn-mars-amber-storm.css');
        assert.equal(inferCustomizationMode(uri, ctx), null);
    });

    it('returns null for unrecognized filenames under the storage dir', () => {
        const uri = mkUri('/tmp/arn-storage/notes.txt');
        assert.equal(inferCustomizationMode(uri, ctx), null);
    });

    it('returns null for advanced-*.jsonc that is not split into ui/syntax', () => {
        const uri = mkUri('/tmp/arn-storage/advanced-arn-mars-amber-storm.jsonc');
        assert.equal(inferCustomizationMode(uri, ctx), null);
    });

    it('handles Windows paths with backslashes (mixed separators)', () => {
        const winCtx = { globalStorageUri: mkUri('C:\\Users\\X\\AppData\\arn') };
        const winUri = mkUri('C:\\Users\\X\\AppData\\arn\\quick-arn-mars-amber-storm.css');
        assert.equal(inferCustomizationMode(winUri, winCtx), 'quick');
    });

    it('is case-insensitive (Windows-friendly)', () => {
        const winCtx = { globalStorageUri: mkUri('C:\\Users\\X\\AppData\\arn') };
        const winUri = mkUri('c:\\users\\x\\appdata\\arn\\quick-arn-mars-amber-storm.css');
        assert.equal(inferCustomizationMode(winUri, winCtx), 'quick');
    });
});
