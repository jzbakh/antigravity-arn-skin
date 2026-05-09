// Pre-flight check used by the CI validate stage.
// Theme files declare `$schema: "vscode://schemas/color-theme"` and use
// JSONC (line / block comments are permitted). Strict `JSON.parse` would
// trip on the first `// EDITOR` block, so we strip comments first while
// preserving anything that looks like a comment inside a string literal.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT  = path.resolve(__dirname, '..');
const THEMES_DIR = path.join(REPO_ROOT, 'themes');

const themes = fs.readdirSync(THEMES_DIR).filter(n => n.endsWith('.json'));
let failed = 0;

for (const name of themes) {
    const fp = path.join(THEMES_DIR, name);
    const text = fs.readFileSync(fp, 'utf8');

    // Strip JSONC comments outside of string literals (mirrors parseJsonc
    // in extension.js so the validate stage stays in lock-step with how
    // the extension itself loads themes at runtime).
    const stripped = text.replace(
        /("([^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        (match, stringLiteral) => stringLiteral ? stringLiteral : ''
    );

    try {
        JSON.parse(stripped);
        console.log('OK   themes/' + name);
    } catch (err) {
        console.error('FAIL themes/' + name + ' — ' + err.message);
        failed++;
    }
}

if (failed > 0) {
    console.error(`\n${failed} theme file(s) failed to parse as JSONC.`);
    process.exit(1);
}
