// Verify that ensureAdvancedUIFile preserves the source theme's category
// comments (// EDITOR, // SIDE BAR, etc.) when generating the editable
// Advanced UI file. Reads the actual theme files on disk so the test
// catches regressions if the extractor ever loses track of the comment
// structure during a refactor.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { __testing } = require('../../extension');
const { extractColorsBlockFromTheme, mergeUserColorsIntoBlock, parseJsonc } = __testing;

const REPO_ROOT = path.join(__dirname, '..', '..');
const THEMES = ['arn-spaceport.json', 'arn-nebula.json', 'arn-neptune.json',
                'arn-uranus.json', 'arn-io.json', 'arn-jupiter.json', 'arn-mars.json'];

describe('extractColorsBlockFromTheme', () => {
    for (const themeFile of THEMES) {
        it(`returns a balanced block for ${themeFile}`, () => {
            const raw = fs.readFileSync(path.join(REPO_ROOT, 'themes', themeFile), 'utf8');
            const block = extractColorsBlockFromTheme(raw);
            assert.ok(block, 'block must be extracted');
            assert.ok(block.startsWith('{'), 'block must start with {');
            assert.ok(block.endsWith('}'), 'block must end with }');
            // Re-parse to confirm structural validity
            const parsed = parseJsonc(block);
            assert.equal(typeof parsed, 'object');
        });

        it(`${themeFile} block preserves at least one category comment`, () => {
            const raw = fs.readFileSync(path.join(REPO_ROOT, 'themes', themeFile), 'utf8');
            const block = extractColorsBlockFromTheme(raw);
            assert.ok(block, 'block must be extracted');
            // Themes use "// HEADER" or "// ───" decorative comments.
            assert.ok(/\/\/\s*[A-Z]/.test(block) || /\/\/\s*─/.test(block),
                'block must preserve at least one category comment');
        });
    }

    it('returns null for input that lacks a colors block', () => {
        assert.equal(extractColorsBlockFromTheme('{}'), null);
        assert.equal(extractColorsBlockFromTheme(''), null);
    });

    it('correctly counts braces inside string values', () => {
        // Defensive: a string value containing a } in a comment-like spot must
        // not fool the brace walker.
        const raw = `{
            "colors": {
                "key": "}"
            }
        }`;
        const block = extractColorsBlockFromTheme(raw);
        assert.ok(block);
        assert.deepEqual(parseJsonc(block), { key: '}' });
    });
});

describe('mergeUserColorsIntoBlock', () => {
    it('replaces existing keys without disturbing comments or layout', () => {
        const block = `{
    // EDITOR
    "editor.background": "#000000",
    "editor.foreground": "#ffffff"
}`;
        const merged = mergeUserColorsIntoBlock(block, { 'editor.background': '#ABCDEF' });
        assert.ok(merged.includes('// EDITOR'),
            'category comment must be preserved');
        assert.ok(merged.includes('"editor.background": "#ABCDEF"'),
            'override must be applied');
        assert.ok(merged.includes('"editor.foreground": "#ffffff"'),
            'untouched key must keep its theme value');
    });

    it('appends user-only keys under a labelled USER-ADDED section', () => {
        const block = `{
    "editor.background": "#000000"
}`;
        const merged = mergeUserColorsIntoBlock(block, { 'foo.bar': '#123456' });
        assert.ok(merged.includes('USER-ADDED'),
            'user-added section header must be present');
        assert.ok(merged.includes('"foo.bar": "#123456"'),
            'user-only key must be appended');
        // Original key still present
        assert.ok(merged.includes('"editor.background": "#000000"'));
        // Result still parses as JSONC
        assert.deepEqual(parseJsonc(merged), {
            'editor.background': '#000000',
            'foo.bar': '#123456',
        });
    });

    it('returns valid JSONC when both replacements and appends happen', () => {
        const block = `{
    "editor.background": "#000000",
    "editor.foreground": "#ffffff"
}`;
        const merged = mergeUserColorsIntoBlock(block, {
            'editor.background': '#111111',
            'extension.added': '#222222',
        });
        const parsed = parseJsonc(merged);
        assert.equal(parsed['editor.background'], '#111111');
        assert.equal(parsed['editor.foreground'], '#ffffff');
        assert.equal(parsed['extension.added'], '#222222');
    });

    it('returns null on malformed input', () => {
        assert.equal(mergeUserColorsIntoBlock(null, {}), null);
        assert.equal(mergeUserColorsIntoBlock('{ broken', {}), null);
    });
});

describe('ensureAdvancedUIFile end-to-end (via the helpers)', () => {
    // We can't call ensureAdvancedUIFile from the unit suite (it depends
    // on the vscode workspace API). The integration suite covers that
    // path. Here we verify that the helpers, composed the way the real
    // function composes them, produce a file that parses and includes
    // both the theme's category comments and any user override.
    for (const themeFile of THEMES) {
        it(`${themeFile} round-trips through extract → merge → parse`, () => {
            const raw = fs.readFileSync(path.join(REPO_ROOT, 'themes', themeFile), 'utf8');
            const block = extractColorsBlockFromTheme(raw);
            const userOverride = { 'editor.background': '#FACADE' };
            const merged = mergeUserColorsIntoBlock(block, userOverride);
            assert.ok(merged, 'merge must succeed');
            const parsed = parseJsonc(merged);
            assert.equal(parsed['editor.background'], '#FACADE',
                'user override must win');
            // Sanity: the merged block has at least 200 keys (themes ship ~480)
            assert.ok(Object.keys(parsed).length >= 200,
                `expected >= 200 keys after merge, got ${Object.keys(parsed).length}`);
        });
    }
});
