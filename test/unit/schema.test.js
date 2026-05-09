// Validation of the JSON schema bound to the advanced-*.jsonc files.
// The schema drives IntelliSense in VSCode — if it breaks, the user loses
// autocomplete and the gutter colour picker on hundreds of workbench keys
// (including the chat.* surface keys exposed by the Chat panel).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { __testing } = require('../../extension');
const { parseJsonc } = __testing;

const REPO_ROOT = path.join(__dirname, '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'schemas', 'arn-advanced.schema.json');
const REF_THEME_PATH = path.join(REPO_ROOT, 'themes', 'arn-spaceport.json');

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

function loadSchema() {
    return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

describe('schemas/arn-advanced.schema.json — file & format', () => {
    it('exists at the expected path', () => {
        assert.ok(fs.existsSync(SCHEMA_PATH));
    });

    it('parses as strict JSON (no comments, no trailing commas)', () => {
        // Schemas live in a JSON tooling ecosystem — they must be parseable
        // by every consumer (VSCode, Ajv, json-schema-faker, etc.).
        assert.doesNotThrow(() => JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')));
    });

    it('declares the JSON-Schema Draft-07 dialect', () => {
        const s = loadSchema();
        assert.equal(s.$schema, 'http://json-schema.org/draft-07/schema#');
    });

    it('describes an object with type, title and properties', () => {
        const s = loadSchema();
        assert.equal(s.type, 'object');
        assert.equal(typeof s.title, 'string');
        assert.ok(s.properties && typeof s.properties === 'object');
    });
});

describe('schemas — top-level sections', () => {
    let schema;
    before(() => { schema = loadSchema(); });

    it('declares a "colors" section as an object with properties', () => {
        const colors = schema.properties.colors;
        assert.ok(colors);
        assert.equal(colors.type, 'object');
        assert.ok(colors.properties && typeof colors.properties === 'object');
    });

    it('"colors" accepts additional keys (additionalProperties)', () => {
        // The extension must not reject keys VSCode adds in future versions.
        const colors = schema.properties.colors;
        assert.ok(colors.additionalProperties);
    });

    it('declares a "semanticTokenColors" section', () => {
        const sem = schema.properties.semanticTokenColors;
        assert.ok(sem);
        assert.equal(sem.type, 'object');
    });

    it('declares a "tokenColors" section as an array', () => {
        const tc = schema.properties.tokenColors;
        assert.ok(tc);
        assert.equal(tc.type, 'array');
    });
});

describe('schemas — colors.properties coverage', () => {
    let schema;
    before(() => { schema = loadSchema(); });

    it('exposes at least 400 explicit color keys (matches the reference theme)', () => {
        const count = Object.keys(schema.properties.colors.properties).length;
        assert.ok(count >= 400,
            `expected >= 400 color keys, got ${count} — the schema may have lost coverage`);
    });

    it('explicitly enumerates every required chat.* key for IntelliSense', () => {
        const props = schema.properties.colors.properties;
        const missing = REQUIRED_CHAT_KEYS.filter(k => !(k in props));
        assert.deepEqual(missing, [],
            `chat.* keys missing from schema (autocomplete will not suggest them): ${missing.join(', ')}`);
    });

    it('every explicit color property is shaped like a hex-string declaration', () => {
        const props = schema.properties.colors.properties;
        for (const [k, v] of Object.entries(props)) {
            assert.equal(v.type, 'string', `${k}.type must be "string"`);
            assert.ok(v.pattern, `${k}.pattern must be set`);
        }
    });

    it('covers every key declared in the reference theme arn-spaceport.json', () => {
        const refColors = parseJsonc(fs.readFileSync(REF_THEME_PATH, 'utf8')).colors;
        const props = schema.properties.colors.properties;
        const refKeys = Object.keys(refColors);
        const missing = refKeys.filter(k => !(k in props));
        assert.deepEqual(missing, [],
            `${missing.length} keys present in arn-spaceport but absent from schema: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
    });
});

describe('schemas — semanticTokenColors coverage', () => {
    let schema;
    before(() => { schema = loadSchema(); });

    it('exposes at least 30 semantic token entries', () => {
        const count = Object.keys(schema.properties.semanticTokenColors.properties).length;
        assert.ok(count >= 30,
            `expected >= 30 semantic tokens in schema, got ${count}`);
    });

    it('covers every key declared in the reference theme', () => {
        const refSem = parseJsonc(fs.readFileSync(REF_THEME_PATH, 'utf8')).semanticTokenColors;
        const props = schema.properties.semanticTokenColors.properties;
        const refKeys = Object.keys(refSem);
        const missing = refKeys.filter(k => !(k in props));
        assert.deepEqual(missing, []);
    });

    it('each semantic property declares the flat object form (no anyOf)', () => {
        // Regression guard: the gutter color picker only fires when the
        // schema declares `format: "color-hex"` on a directly-reachable
        // property. Wrapping the per-token entry in `anyOf` breaks the
        // resolver's traversal and silently disables the swatch, even
        // though validation still passes. Keep semanticTokenColors[X]
        // as a plain `type: object` with a `foreground` property whose
        // own `format: "color-hex"` lights up the picker.
        const props = schema.properties.semanticTokenColors.properties;
        for (const [k, v] of Object.entries(props)) {
            assert.equal(v.anyOf, undefined,
                `semantic ${k} must NOT use anyOf — that wrapping disables the color picker`);
            assert.equal(v.type, 'object',
                `semantic ${k} must be type: object`);
            assert.ok(v.properties && v.properties.foreground,
                `semantic ${k} must declare a foreground property for the picker to fire`);
            assert.equal(v.properties.foreground.format, 'color-hex',
                `semantic ${k}.foreground must declare format: "color-hex"`);
        }
    });
});

describe('schemas — tokenColors items shape', () => {
    let schema;
    before(() => { schema = loadSchema(); });

    it('items.scope accepts both string and array of strings', () => {
        const items = schema.properties.tokenColors.items;
        assert.ok(items.properties.scope);
        assert.ok(Array.isArray(items.properties.scope.anyOf));
    });

    it('items.settings declares foreground, background and fontStyle', () => {
        const settings = schema.properties.tokenColors.items.properties.settings;
        assert.ok(settings);
        assert.ok(settings.properties.foreground);
        assert.ok(settings.properties.background);
        assert.ok(settings.properties.fontStyle);
    });
});

describe('schemas — hex pattern correctness', () => {
    let schema;
    before(() => { schema = loadSchema(); });

    // Build a tiny pattern matcher to test sample values against the schema's regex.
    function patternFor(prop) {
        return new RegExp(prop.pattern);
    }

    it('accepts canonical hex variants (#RGB / #RGBA / #RRGGBB / #RRGGBBAA)', () => {
        const props = schema.properties.colors.properties;
        const sample = props['chat.linesAddedForeground'] || Object.values(props)[0];
        const re = patternFor(sample);
        for (const valid of ['#fff', '#ffff', '#ffffff', '#ffffffff', '#ABCDEF', '#ABCDEF00']) {
            assert.ok(re.test(valid), `pattern should accept ${valid}`);
        }
    });

    it('rejects clearly invalid hex strings', () => {
        const props = schema.properties.colors.properties;
        const sample = props['chat.linesAddedForeground'] || Object.values(props)[0];
        const re = patternFor(sample);
        for (const bad of ['fff', '#ff', '#fffff', '#fffffff', '#GGG', 'red', '']) {
            assert.equal(re.test(bad), false, `pattern should reject ${JSON.stringify(bad)}`);
        }
    });
});

describe('schemas — schema is consumable by a JSON parser strictly', () => {
    it('content has no surprises: only standard JSON, no NaN/Infinity', () => {
        // Read raw bytes; ensure no UTF-8 BOM or weird encoding artefacts that
        // would trip strict consumers (Ajv, the VSCode JSON validator, etc.).
        const buf = fs.readFileSync(SCHEMA_PATH);
        // BOM = 0xEF 0xBB 0xBF
        assert.notEqual(buf[0], 0xEF, 'schema must not start with a UTF-8 BOM');
        const text = buf.toString('utf8');
        assert.equal(text.includes('NaN'), false);
        assert.equal(text.includes('Infinity'), false);
    });
});
