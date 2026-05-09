// Integration tests for the apply* pipeline (Quick, Advanced UI, Advanced
// Syntax) and the resetTheme cleanup path. These tests boot a real VSCode
// instance, activate an ARN theme, exercise the helpers exposed through
// __testing and assert against the actual configuration the editor sees.
//
// Critical coverage:
//   • Round-trip Quick CSS → workbench.colorCustomizations
//   • Each Quick toggle (Borderless, Pure-Black, Active-Tab-Highlight,
//     Vivid-Selection, Cursor-Line-Glow) writes the right keys on YES/NO
//     and purges them on INHERIT.
//   • applyAdvancedUI / applyAdvancedSyntax JSONC happy + error paths.
//   • applyQuick owns workbench.colorCustomizations exclusively; Advanced
//     Syntax owns editor.tokenColorCustomizations. Each surface is left
//     untouched by the other.
//   • resetTheme is idempotent, theme-scoped, and explicitly closes its
//     customisation tabs (stock VSCode does not auto-close them on delete).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vscode = require('vscode');
const { __testing } = require('../../extension');

const {
    applyQuick, applyAdvancedUI, applyAdvancedSyntax, resetTheme,
    parseJsonc, extractBaseColorsFromTheme,
    closeCustomisationFilesForTheme, closeOtherCustomisationFilesForTheme,
    ensureQuickFile, ensureAdvancedUIFile, ensureAdvancedSyntaxFile,
} = __testing;

const REPO_ROOT = path.join(__dirname, '..', '..');

// Mars is the primary test theme — dark, structurally identical to the
// other 6, and exercises the dark-branch of every light/dark split.
const TEST_THEME_LABEL = 'Arn · Mars — Amber Storm';
const TEST_THEME_FILE  = path.join(REPO_ROOT, 'themes', 'arn-mars.json');

// Build a Quick CSS string. Defaults to the theme's exact bases so the
// dirty tracker sees them as untouched (no override is emitted). Pass
// `overrides` to flip individual bases dirty, and `toggles` to set
// yes/no/inherit on any of the five Quick toggles.
function buildCss(bases, overrides = {}, toggles = {}) {
    const o = {
        bg: bases.bg, text: bases.text, accent: bases.accent,
        bgSec: bases.bgSec, surfaceElevated: bases.surfaceElevated,
        border: bases.border, activeBorder: bases.activeBorder,
        selection: bases.selection,
        warning: bases.warning, error: bases.error, success: bases.success, info: bases.info,
        ...overrides,
    };
    const t = {
        borderless: 'INHERIT',
        pureBlack: 'INHERIT',
        activeTabHighlight: 'INHERIT',
        vividSelection: 'INHERIT',
        cursorLineGlow: 'INHERIT',
        ...toggles,
    };
    return `:root {
        --Global-Background:        ${o.bg};
        --Main-Text:                ${o.text};
        --Accentuation:             ${o.accent};
        --Secondary-Background:     ${o.bgSec};
        --Surface-Elevated:         ${o.surfaceElevated};
        --Borders:                  ${o.border};
        --Active-Border:            ${o.activeBorder};
        --Selection:                ${o.selection};
        --Status-Warning:           ${o.warning};
        --Status-Error:             ${o.error};
        --Status-Success:           ${o.success};
        --Status-Info:              ${o.info};
        --Opt-Borderless-Mode:      ${t.borderless};
        --Opt-Pure-Black-Mode:      ${t.pureBlack};
        --Opt-Active-Tab-Highlight: ${t.activeTabHighlight};
        --Opt-Vivid-Selection:      ${t.vividSelection};
        --Opt-Cursor-Line-Glow:     ${t.cursorLineGlow};
    }`;
}

function getColorCustomizations() {
    return vscode.workspace.getConfiguration('workbench').get('colorCustomizations') || {};
}
function getTokenCustomizations() {
    return vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations') || {};
}
function ourColors() {
    return getColorCustomizations()[`[${TEST_THEME_LABEL}]`] || {};
}
function ourTokens() {
    return getTokenCustomizations()[`[${TEST_THEME_LABEL}]`] || {};
}

describe('Apply pipeline — full integration', function () {
    this.timeout(15000); // Configuration writes can be slow on CI.

    let tmpDir;
    let fakeCtx;
    let themeJson;
    let themeBases;
    let originalTheme;
    let originalColorCC;
    let originalTokenCC;

    before(async () => {
        themeJson = parseJsonc(fs.readFileSync(TEST_THEME_FILE, 'utf8'));
        themeBases = extractBaseColorsFromTheme(themeJson);

        // Snapshot the user's settings so we can restore them at the end.
        const wb = vscode.workspace.getConfiguration('workbench');
        const ed = vscode.workspace.getConfiguration('editor');
        originalTheme = wb.get('colorTheme');
        originalColorCC = wb.get('colorCustomizations');
        originalTokenCC = ed.get('tokenColorCustomizations');

        // Activate the ARN test theme so getActiveThemeData() picks it up.
        await wb.update('colorTheme', TEST_THEME_LABEL, vscode.ConfigurationTarget.Global);
    });

    after(async () => {
        const wb = vscode.workspace.getConfiguration('workbench');
        const ed = vscode.workspace.getConfiguration('editor');
        await wb.update('colorTheme', originalTheme, vscode.ConfigurationTarget.Global);
        await wb.update('colorCustomizations', originalColorCC, vscode.ConfigurationTarget.Global);
        await ed.update('tokenColorCustomizations', originalTokenCC, vscode.ConfigurationTarget.Global);
    });

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arn-apply-'));
        fakeCtx = {
            extensionUri: vscode.Uri.file(REPO_ROOT),
            globalStorageUri: vscode.Uri.file(tmpDir),
        };
        // Clean override state before each test so assertions are deterministic.
        const wb = vscode.workspace.getConfiguration('workbench');
        const ed = vscode.workspace.getConfiguration('editor');
        await wb.update('colorCustomizations', undefined, vscode.ConfigurationTarget.Global);
        await ed.update('tokenColorCustomizations', undefined, vscode.ConfigurationTarget.Global);
    });

    afterEach(async () => {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    // ---------------------------------------------------------------------
    // applyQuick — happy path
    // ---------------------------------------------------------------------

    describe('applyQuick — INHERIT baseline', () => {
        it('emits no override entry when the CSS matches the theme bases exactly', async () => {
            const css = buildCss(themeBases);
            await applyQuick(fakeCtx, css);

            const cc = getColorCustomizations();
            assert.equal(cc[`[${TEST_THEME_LABEL}]`], undefined,
                'no override should be set when nothing diverges from the theme');
        });

        it('does not write any tokenColorCustomizations entry on pure INHERIT', async () => {
            const css = buildCss(themeBases);
            await applyQuick(fakeCtx, css);
            const tc = getTokenCustomizations();
            assert.equal(tc[`[${TEST_THEME_LABEL}]`], undefined);
        });
    });

    describe('applyQuick — base color drives derived keys', () => {
        it('changing Global-Background writes editor.background AND derived chat.requestBackground', async () => {
            const css = buildCss(themeBases, { bg: '#ABCDEF' });
            await applyQuick(fakeCtx, css);

            const c = ourColors();
            assert.equal(c['editor.background'], '#ABCDEF');
            assert.ok(c['chat.requestBackground'],
                'chat.requestBackground must be derived when bg is dirty');
        });

        it('changing Status-Success drives chat.linesAddedForeground (with required alpha)', async () => {
            const css = buildCss(themeBases, { success: '#11CC22' });
            await applyQuick(fakeCtx, css);
            const v = ourColors()['chat.linesAddedForeground'] || '';
            assert.ok(v.toUpperCase().startsWith('#11CC22'),
                `expected colour prefix #11CC22, got ${v}`);
            const alpha = parseInt(v.slice(-2), 16);
            assert.ok(alpha > 0 && alpha < 0xFF, `expected non-FF alpha, got ${v.slice(-2)}`);
        });

        it('changing Status-Error drives chat.linesRemovedForeground (with required alpha)', async () => {
            const css = buildCss(themeBases, { error: '#FF0000' });
            await applyQuick(fakeCtx, css);
            const v = ourColors()['chat.linesRemovedForeground'] || '';
            assert.ok(v.toUpperCase().startsWith('#FF0000'),
                `expected colour prefix #FF0000, got ${v}`);
            const alpha = parseInt(v.slice(-2), 16);
            assert.ok(alpha > 0 && alpha < 0xFF, `expected non-FF alpha, got ${v.slice(-2)}`);
        });

        it('changing Accentuation drives chat.editedFileForeground and chat.slashCommandForeground', async () => {
            const css = buildCss(themeBases, { accent: '#0077FF' });
            await applyQuick(fakeCtx, css);
            const c = ourColors();
            assert.equal(c['chat.editedFileForeground'], '#0077FF');
            assert.equal(c['chat.slashCommandForeground'], '#0077FF');
        });

        it('changing Selection drives editor.selectionBackground (independent of accent)', async () => {
            const css = buildCss(themeBases, { selection: '#11223344' });
            await applyQuick(fakeCtx, css);
            assert.equal(ourColors()['editor.selectionBackground'], '#11223344');
        });

        it('changing Active-Border drives focusBorder and tab.activeBorderTop', async () => {
            const css = buildCss(themeBases, { activeBorder: '#FF8800' });
            await applyQuick(fakeCtx, css);
            const c = ourColors();
            assert.equal(c['focusBorder'], '#FF8800');
            assert.equal(c['tab.activeBorderTop'], '#FF8800');
        });

        it('changing Surface-Elevated drives editorWidget.background', async () => {
            const css = buildCss(themeBases, { surfaceElevated: '#2A2A2A' });
            await applyQuick(fakeCtx, css);
            assert.equal(ourColors()['editorWidget.background'], '#2A2A2A');
        });

        it('changing Status-Info drives notificationsInfoIcon.foreground', async () => {
            const css = buildCss(themeBases, { info: '#3FE5FF' });
            await applyQuick(fakeCtx, css);
            assert.equal(ourColors()['notificationsInfoIcon.foreground'], '#3FE5FF');
        });
    });

    describe('applyQuick — Borderless toggle', () => {
        it('YES forces every border key to transparent', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { borderless: 'YES' }));
            const c = ourColors();
            assert.equal(c['sideBar.border'], '#00000000');
            assert.equal(c['panel.border'], '#00000000');
            assert.equal(c['editorGroup.border'], '#00000000');
        });

        it('NO derives a visible text-tinted border on themes that ship borderless', async () => {
            // Mars ships sideBar.border = "#00000000". Without the smart
            // derivation, NO would produce the same transparent value as YES.
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { borderless: 'NO' }));
            const sideBar = ourColors()['sideBar.border'];
            assert.ok(sideBar, 'sideBar.border must be set');
            assert.notEqual(sideBar, '#00000000',
                'NO must NOT match the theme transparent default — would be invisible');
        });

        it('INHERIT after YES purges every border key', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { borderless: 'YES' }));
            assert.equal(ourColors()['sideBar.border'], '#00000000');
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { borderless: 'INHERIT' }));
            assert.equal(ourColors()['sideBar.border'], undefined);
            assert.equal(ourColors()['panel.border'], undefined);
        });
    });

    describe('applyQuick — Pure-Black-Mode toggle', () => {
        it('YES forces editor.background to pure black on a dark ARN theme', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { pureBlack: 'YES' }));
            const c = ourColors();
            assert.equal(c['editor.background'], '#000000');
            assert.equal(c['terminal.background'], '#000000');
            assert.equal(c['panel.background'], '#000000');
            assert.equal(c['sideBar.background'], '#050505');
            assert.equal(c['menu.background'], '#0A0A0A');
            assert.equal(c['editorWidget.background'], '#0A0A0A');
        });

        it('NO lifts the editor background away from the theme default (softer contrast)', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { pureBlack: 'NO' }));
            const bg = ourColors()['editor.background'];
            assert.ok(bg, 'editor.background must be set');
            assert.notEqual(bg, '#000000');
            assert.notEqual(bg.toLowerCase(), themeBases.bg.toLowerCase(),
                'NO must lift the bg — should differ from the raw theme value');
        });

        it('INHERIT after YES purges every Pure-Black surface key', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { pureBlack: 'YES' }));
            assert.equal(ourColors()['editor.background'], '#000000');
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { pureBlack: 'INHERIT' }));
            assert.equal(ourColors()['editor.background'], undefined);
            assert.equal(ourColors()['menu.background'], undefined);
            assert.equal(ourColors()['editorWidget.background'], undefined);
        });
    });

    describe('applyQuick — Active-Tab-Highlight toggle', () => {
        it('YES paints the active tab with accent fg / borders / tinted bg', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { activeTabHighlight: 'YES' }));
            const c = ourColors();
            assert.equal((c['tab.activeForeground'] || '').toLowerCase(),
                themeBases.accent.toLowerCase());
            assert.equal((c['tab.activeBorderTop'] || '').toLowerCase(),
                themeBases.accent.toLowerCase());
            assert.equal((c['tab.activeBorder'] || '').toLowerCase(),
                themeBases.accent.toLowerCase());
            assert.ok(c['tab.activeBackground'],
                'tab.activeBackground must be tinted');
        });

        it('NO flattens the active tab to match inactives', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { activeTabHighlight: 'NO' }));
            const c = ourColors();
            assert.equal(c['tab.activeBorderTop'], '#00000000');
            assert.equal(c['tab.activeBorder'], '#00000000');
            assert.equal((c['tab.activeBackground'] || '').toLowerCase(),
                themeBases.bg.toLowerCase());
        });

        it('INHERIT purges the tab keys (no override remains)', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { activeTabHighlight: 'YES' }));
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { activeTabHighlight: 'INHERIT' }));
            assert.equal(ourColors()['tab.activeForeground'], undefined);
            assert.equal(ourColors()['tab.activeBorderTop'], undefined);
        });
    });

    describe('applyQuick — Vivid-Selection toggle', () => {
        it('YES uses the accent colour for the selection (saturated)', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { vividSelection: 'YES' }));
            const sel = ourColors()['editor.selectionBackground'] || '';
            assert.ok(sel.toUpperCase().startsWith(themeBases.accent.toUpperCase()),
                `selection must use accent prefix, got ${sel}`);
        });

        it('NO uses a clearly visible neutral grey (alpha >= 0x40)', async () => {
            // Visibility floor: anything lighter than 0x40 alpha disappears
            // into the background on Spaceport-class dark themes.
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { vividSelection: 'NO' }));
            const sel = ourColors()['editor.selectionBackground'] || '';
            assert.ok(sel.toUpperCase().startsWith(themeBases.text.toUpperCase()),
                `NO selection must use text prefix, got ${sel}`);
            const alpha = parseInt(sel.slice(-2), 16);
            assert.ok(alpha >= 0x40,
                `NO selection alpha must be >= 0x40 for visibility, got 0x${alpha.toString(16)}`);
        });

        it('INHERIT purges the selection keys', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { vividSelection: 'YES' }));
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { vividSelection: 'INHERIT' }));
            assert.equal(ourColors()['editor.selectionBackground'], undefined);
            assert.equal(ourColors()['editor.wordHighlightBackground'], undefined);
        });
    });

    describe('applyQuick — Cursor-Line-Glow toggle', () => {
        it('YES paints cursor + active line + active line number with the accent', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { cursorLineGlow: 'YES' }));
            const c = ourColors();
            assert.equal((c['editorCursor.foreground'] || '').toLowerCase(),
                themeBases.accent.toLowerCase());
            assert.equal((c['editorLineNumber.activeForeground'] || '').toLowerCase(),
                themeBases.accent.toLowerCase());
            const bg = c['editor.lineHighlightBackground'] || '';
            const border = c['editor.lineHighlightBorder'] || '';
            assert.ok(bg.toUpperCase().startsWith(themeBases.accent.toUpperCase()));
            assert.ok(border.toUpperCase().startsWith(themeBases.accent.toUpperCase()));
        });

        it('NO removes the line highlight and softens the cursor', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { cursorLineGlow: 'NO' }));
            const c = ourColors();
            assert.equal(c['editor.lineHighlightBackground'], '#00000000');
            assert.equal(c['editor.lineHighlightBorder'], '#00000000');
            assert.ok(c['editorCursor.foreground'],
                'cursor foreground must be set to a muted value, not undefined');
        });

        it('INHERIT purges all cursor/line keys', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { cursorLineGlow: 'YES' }));
            await applyQuick(fakeCtx, buildCss(themeBases, {}, { cursorLineGlow: 'INHERIT' }));
            assert.equal(ourColors()['editor.lineHighlightBackground'], undefined);
            assert.equal(ourColors()['editor.lineHighlightBorder'], undefined);
            assert.equal(ourColors()['editorCursor.foreground'], undefined);
        });
    });

    // ---------------------------------------------------------------------
    // applyQuick — surface ownership
    // applyQuick owns `workbench.colorCustomizations` exclusively. The
    // sibling `editor.tokenColorCustomizations` belongs to Advanced Syntax
    // and applyQuick must never read or write it.
    // ---------------------------------------------------------------------

    describe('applyQuick — surface ownership', () => {
        it('does not touch tokenColorCustomizations entries set by Advanced Syntax', async () => {
            // Advanced Syntax sets a foreground (the user owns this surface).
            await applyAdvancedSyntax(fakeCtx, `{
                "semanticTokenColors": { "keyword": { "foreground": "#AABBCC" } },
                "tokenColors": []
            }`);
            assert.equal(ourTokens().semanticTokenColors.keyword.foreground, '#AABBCC');

            // applyQuick must leave tokenColorCustomizations entirely alone.
            await applyQuick(fakeCtx, buildCss(themeBases, { bg: '#ABCDEF' }));

            const kw = ourTokens().semanticTokenColors && ourTokens().semanticTokenColors.keyword;
            assert.ok(kw, 'Advanced Syntax entry must survive an applyQuick call');
            assert.equal(kw.foreground, '#AABBCC',
                'Advanced Syntax foreground must remain untouched by applyQuick');
        });

        it('does not write its own entry into tokenColorCustomizations', async () => {
            await applyQuick(fakeCtx, buildCss(themeBases, { bg: '#ABCDEF' }));
            const tc = getTokenCustomizations();
            assert.equal(tc[`[${TEST_THEME_LABEL}]`], undefined,
                'applyQuick must not produce any tokenColorCustomizations entry');
        });
    });

    // ---------------------------------------------------------------------
    // applyAdvancedUI
    // ---------------------------------------------------------------------

    describe('applyAdvancedUI', () => {
        it('writes user-supplied colors verbatim into workbench.colorCustomizations', async () => {
            const jsonc = `{
                // user-edited
                "colors": {
                    "editor.background": "#000011",
                    "chat.linesAddedForeground": "#22FF22"
                }
            }`;
            await applyAdvancedUI(fakeCtx, jsonc);
            const c = ourColors();
            assert.equal(c['editor.background'], '#000011');
            assert.equal(c['chat.linesAddedForeground'], '#22FF22');
        });

        it('does not crash on malformed JSONC and leaves config untouched', async () => {
            // Pre-set a known state.
            await applyAdvancedUI(fakeCtx, `{"colors": {"editor.background": "#111111"}}`);
            assert.equal(ourColors()['editor.background'], '#111111');

            // Invalid input — must not throw, must not wipe state.
            await assert.doesNotReject(applyAdvancedUI(fakeCtx, '{ this is not json }'));
            assert.equal(ourColors()['editor.background'], '#111111',
                'previous state must be preserved when JSONC fails to parse');
        });

        it('strips undefined entries and accepts empty colors object', async () => {
            await applyAdvancedUI(fakeCtx, `{"colors": {}}`);
            // Empty colors → entry cleared (theme is at defaults).
            const cc = getColorCustomizations();
            assert.equal(cc[`[${TEST_THEME_LABEL}]`], undefined,
                'empty colors object must clear the customisation entry');
        });

        it('clears the customisation entry when the file matches the theme defaults exactly', async () => {
            // First, write a real customisation so we have something to clear.
            await applyAdvancedUI(fakeCtx, `{"colors": {"editor.background": "#111111"}}`);
            assert.equal(ourColors()['editor.background'], '#111111');

            // Now feed the theme's exact colours back through apply — this is
            // what happens after a close-without-save: the document text
            // reverts to the on-disk default, the close handler re-applies it.
            const themeColorsJsonc = JSON.stringify({ colors: themeJson.colors });
            await applyAdvancedUI(fakeCtx, themeColorsJsonc);

            const cc = getColorCustomizations();
            assert.equal(cc[`[${TEST_THEME_LABEL}]`], undefined,
                'entry must be cleared when the file matches theme defaults — ' +
                'this is the regression guard for the phantom "Customized" status bar bug');
        });
    });

    // ---------------------------------------------------------------------
    // applyAdvancedSyntax
    // ---------------------------------------------------------------------

    describe('applyAdvancedSyntax', () => {
        it('writes semanticTokenColors and tokenColors into editor.tokenColorCustomizations', async () => {
            const jsonc = `{
                "semanticTokenColors": {
                    "keyword": { "foreground": "#AABBCC" }
                },
                "tokenColors": [
                    { "scope": "string", "settings": { "foreground": "#CCBBAA" } }
                ]
            }`;
            await applyAdvancedSyntax(fakeCtx, jsonc);

            const t = ourTokens();
            assert.deepEqual(t.semanticTokenColors.keyword, { foreground: '#AABBCC' });
            assert.ok(Array.isArray(t.textMateRules));
            const stringRule = t.textMateRules.find(r => r.scope === 'string');
            assert.ok(stringRule);
            assert.equal(stringRule.settings.foreground, '#CCBBAA');
        });

        it('does not crash on malformed JSONC', async () => {
            await assert.doesNotReject(applyAdvancedSyntax(fakeCtx, '{ broken'));
        });

        it('clears the customisation entry when the file matches the theme defaults exactly', async () => {
            // Seed a real customisation
            await applyAdvancedSyntax(fakeCtx, `{
                "semanticTokenColors": { "keyword": { "foreground": "#AABBCC" } },
                "tokenColors": []
            }`);
            assert.ok(ourTokens().semanticTokenColors,
                'precondition: tokens entry must be present');

            // Build the canonical "theme-default" payload (matches what
            // ensureAdvancedSyntaxFile would write on a fresh open).
            const themeSem = {};
            for (const [k, v] of Object.entries(themeJson.semanticTokenColors || {})) {
                if (typeof v === 'string') themeSem[k] = { foreground: v };
                else if (v && typeof v === 'object') themeSem[k] = v;
            }
            const defaultPayload = JSON.stringify({
                semanticTokenColors: themeSem,
                tokenColors: themeJson.tokenColors || [],
            });
            await applyAdvancedSyntax(fakeCtx, defaultPayload);

            const tc = getTokenCustomizations();
            assert.equal(tc[`[${TEST_THEME_LABEL}]`], undefined,
                'entry must be cleared when both semantic and TextMate sections ' +
                'match the theme — guards the close-without-save scenario');
        });
    });


    // ---------------------------------------------------------------------
    // resetTheme
    // ---------------------------------------------------------------------

    // resetTheme removes the user's customisation entries for a given theme
    // — the theme itself stays installed; only the overrides go away.
    describe('resetTheme — clears user customisations for the active theme', () => {
        it('clears the user customisation entries (the theme itself stays installed)', async () => {
            // Seed both with overrides.
            await applyAdvancedUI(fakeCtx, `{"colors": {"editor.background": "#111111"}}`);
            await applyAdvancedSyntax(fakeCtx, `{
                "semanticTokenColors": { "keyword": { "foreground": "#AABBCC" } },
                "tokenColors": []
            }`);
            assert.ok(ourColors()['editor.background']);
            assert.ok(ourTokens().semanticTokenColors);

            await resetTheme(fakeCtx, TEST_THEME_LABEL);

            const cc = getColorCustomizations();
            const tc = getTokenCustomizations();
            assert.equal(cc[`[${TEST_THEME_LABEL}]`], undefined,
                'colorCustomizations entry for this theme must be deleted');
            assert.equal(tc[`[${TEST_THEME_LABEL}]`], undefined,
                'tokenColorCustomizations entry for this theme must be deleted');
        });

        it('is a no-op when there is nothing to reset (does not throw)', async () => {
            await assert.doesNotReject(resetTheme(fakeCtx, TEST_THEME_LABEL));
        });

        it('is idempotent — calling reset twice in a row leaves a clean state', async () => {
            // Seed overrides on both surfaces so both deletion paths run.
            await applyAdvancedUI(fakeCtx, `{"colors": {"editor.background": "#111111"}}`);
            await applyAdvancedSyntax(fakeCtx, `{
                "semanticTokenColors": { "keyword": { "foreground": "#AABBCC" } },
                "tokenColors": []
            }`);
            assert.ok(ourColors()['editor.background']);
            assert.ok(ourTokens().semanticTokenColors);

            await resetTheme(fakeCtx, TEST_THEME_LABEL);
            await assert.doesNotReject(resetTheme(fakeCtx, TEST_THEME_LABEL),
                'second reset must succeed even though everything was already cleared');

            assert.equal(getColorCustomizations()[`[${TEST_THEME_LABEL}]`], undefined);
            assert.equal(getTokenCustomizations()[`[${TEST_THEME_LABEL}]`], undefined);
        });

        it('regression — an applyQuick that fires AFTER reset reinstates state (the contract the timer-cancel fix protects)', async () => {
            // This test pins the contract that resetTheme alone CANNOT defeat:
            // if a pending debounced applyQuick fires after reset, the
            // customisations come back. The activate() command handler is
            // therefore responsible for cancelling that pending timer before
            // calling resetTheme — that guard is exercised by the live UI
            // flow, and this test documents WHY the cancel is necessary.
            const css = buildCss(themeBases, { bg: '#ABCDEF' });

            await applyQuick(fakeCtx, css);
            assert.equal(ourColors()['editor.background'], '#ABCDEF');

            await resetTheme(fakeCtx, TEST_THEME_LABEL);
            assert.equal(getColorCustomizations()[`[${TEST_THEME_LABEL}]`], undefined,
                'reset clears the entry');

            // Simulate a late-firing debounced apply with the cached CSS.
            await applyQuick(fakeCtx, css);
            assert.equal(ourColors()['editor.background'], '#ABCDEF',
                'a late apply DOES reinstate state — confirming why the activate() ' +
                'command handler must clearTimeout(applyTimeout) before invoking reset');
        });

        it('does not touch other themes\' customisations', async () => {
            // Seed ARN theme + a fake "other theme" override.
            await applyAdvancedUI(fakeCtx, `{"colors": {"editor.background": "#111111"}}`);

            // getConfiguration returns a snapshot — re-fetch after each update.
            let wb = vscode.workspace.getConfiguration('workbench');
            const cc = { ...(wb.get('colorCustomizations') || {}) };
            cc['[Default Dark+]'] = { 'editor.background': '#999999' };
            await wb.update('colorCustomizations', cc, vscode.ConfigurationTarget.Global);

            await resetTheme(fakeCtx, TEST_THEME_LABEL);

            // Refresh the configuration handle to read post-reset state.
            wb = vscode.workspace.getConfiguration('workbench');
            const after = wb.get('colorCustomizations') || {};
            assert.equal(after[`[${TEST_THEME_LABEL}]`], undefined,
                'ARN entry must be deleted by resetTheme');
            assert.deepEqual(after['[Default Dark+]'], { 'editor.background': '#999999' },
                'unrelated theme overrides must be preserved');
        });
    });
});

// =========================================================================
// Cross-theme integration coverage
// The detailed suite above runs against Mars only (it's enough to exercise
// every code path). This block reruns a smaller, representative set of
// scenarios for each of the 7 themes, to confirm the pipeline is wired
// correctly for every label and that switching the active theme between
// runs does not corrupt state.
// =========================================================================

const ALL_THEMES = [
    { label: 'Arn · Spaceport — Tungsten Grid', file: 'arn-spaceport.json' },
    { label: 'Arn · Nebula — Amethyst Void',    file: 'arn-nebula.json'    },
    { label: 'Arn · Neptune — Glacial Navy',    file: 'arn-neptune.json'   },
    { label: 'Arn · Uranus — Glacial Teal',     file: 'arn-uranus.json'    },
    { label: 'Arn · Io — Acid Haze',            file: 'arn-io.json'        },
    { label: 'Arn · Jupiter — Amber Light',     file: 'arn-jupiter.json'   },
    { label: 'Arn · Mars — Amber Storm',        file: 'arn-mars.json'      },
];

describe('Apply pipeline — covers all 7 ARN themes', function () {
    this.timeout(60000);

    let originalTheme;
    let originalColorCC;
    let originalTokenCC;

    before(() => {
        const wb = vscode.workspace.getConfiguration('workbench');
        const ed = vscode.workspace.getConfiguration('editor');
        originalTheme = wb.get('colorTheme');
        originalColorCC = wb.get('colorCustomizations');
        originalTokenCC = ed.get('tokenColorCustomizations');
    });

    after(async () => {
        const wb = vscode.workspace.getConfiguration('workbench');
        const ed = vscode.workspace.getConfiguration('editor');
        await wb.update('colorTheme', originalTheme, vscode.ConfigurationTarget.Global);
        await wb.update('colorCustomizations', originalColorCC, vscode.ConfigurationTarget.Global);
        await ed.update('tokenColorCustomizations', originalTokenCC, vscode.ConfigurationTarget.Global);
    });

    for (const { label, file } of ALL_THEMES) {
        describe(label, function () {
            let tmpDir;
            let fakeCtx;
            let themeJson;
            let themeBases;

            const cust = () => {
                const cc = vscode.workspace.getConfiguration('workbench').get('colorCustomizations') || {};
                return cc[`[${label}]`] || {};
            };

            before(async () => {
                themeJson = parseJsonc(fs.readFileSync(path.join(REPO_ROOT, 'themes', file), 'utf8'));
                themeBases = extractBaseColorsFromTheme(themeJson);
                // Activate this theme so getActiveThemeData() picks it up.
                await vscode.workspace.getConfiguration('workbench')
                    .update('colorTheme', label, vscode.ConfigurationTarget.Global);
            });

            beforeEach(async () => {
                tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arn-cross-'));
                fakeCtx = {
                    extensionUri: vscode.Uri.file(REPO_ROOT),
                    globalStorageUri: vscode.Uri.file(tmpDir),
                };
                // Clean override state so each test starts from a known baseline.
                const wb = vscode.workspace.getConfiguration('workbench');
                const ed = vscode.workspace.getConfiguration('editor');
                await wb.update('colorCustomizations', undefined, vscode.ConfigurationTarget.Global);
                await ed.update('tokenColorCustomizations', undefined, vscode.ConfigurationTarget.Global);
            });

            afterEach(async () => {
                await fs.promises.rm(tmpDir, { recursive: true, force: true });
            });

            it('applyQuick with bases at theme defaults emits no override', async () => {
                await applyQuick(fakeCtx, buildCss(themeBases));
                assert.deepEqual(cust(), {},
                    `${label}: no override expected when CSS matches theme bases`);
            });

            it('applyQuick propagates Status-Success to chat.linesAddedForeground (alpha-tagged)', async () => {
                await applyQuick(fakeCtx, buildCss(themeBases, { success: '#11CC22' }));
                const v = cust()['chat.linesAddedForeground'] || '';
                assert.ok(v.toUpperCase().startsWith('#11CC22'),
                    `${label}: expected #11CC22 prefix, got ${v}`);
                assert.ok(parseInt(v.slice(-2), 16) < 0xFF,
                    `${label}: chat.linesAddedForeground must keep a non-FF alpha`);
            });

            it('applyQuick propagates Status-Error to chat.linesRemovedForeground (alpha-tagged)', async () => {
                await applyQuick(fakeCtx, buildCss(themeBases, { error: '#FF0000' }));
                const v = cust()['chat.linesRemovedForeground'] || '';
                assert.ok(v.toUpperCase().startsWith('#FF0000'),
                    `${label}: expected #FF0000 prefix, got ${v}`);
                assert.ok(parseInt(v.slice(-2), 16) < 0xFF,
                    `${label}: chat.linesRemovedForeground must keep a non-FF alpha`);
            });

            it('applyQuick honours activeTabHighlight=YES (accent-painted active tab)', async () => {
                await applyQuick(fakeCtx, buildCss(themeBases, {}, { activeTabHighlight: 'YES' }));
                const c = cust();
                assert.equal((c['tab.activeForeground'] || '').toLowerCase(),
                    themeBases.accent.toLowerCase(),
                    `${label}: tab.activeForeground must be the theme accent`);
                assert.equal((c['tab.activeBorderTop'] || '').toLowerCase(),
                    themeBases.accent.toLowerCase(),
                    `${label}: tab.activeBorderTop must be the theme accent`);
            });

            it('applyQuick honours pureBlack=YES (theme-polarity-aware)', async () => {
                await applyQuick(fakeCtx, buildCss(themeBases, {}, { pureBlack: 'YES' }));
                const expectedBg = (themeJson.type === 'light' || themeJson.type === 'vs')
                    ? '#FFFFFF' : '#000000';
                assert.equal(cust()['editor.background'], expectedBg,
                    `${label}: editor.background must be ${expectedBg} when Pure-Black-Mode=YES`);
            });

            it('resetTheme wipes the user customisation entry for this theme', async () => {
                // First, write something so there's actually state to reset.
                await applyAdvancedUI(fakeCtx, `{"colors": {"editor.background": "#111111"}}`);
                assert.ok(cust()['editor.background'],
                    `${label}: precondition — customisation must be present before reset`);

                await resetTheme(fakeCtx, label);

                // Re-read fresh from VSCode (snapshot semantics).
                const cc = vscode.workspace.getConfiguration('workbench').get('colorCustomizations') || {};
                assert.equal(cc[`[${label}]`], undefined,
                    `${label}: customisation entry must be cleared after reset`);
            });
        });
    }
});

// =========================================================================
// closeCustomisationFilesForTheme — close open editor tabs for a theme's
// customisation files. Called before switching themes so the user is never
// left editing a file whose name belongs to the previous theme.
// =========================================================================

describe('closeCustomisationFilesForTheme', function () {
    this.timeout(15000);

    let tmpDir;
    let fakeCtx;
    let themeJson;

    before(() => {
        themeJson = parseJsonc(fs.readFileSync(TEST_THEME_FILE, 'utf8'));
    });

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arn-close-'));
        fakeCtx = {
            extensionUri: vscode.Uri.file(REPO_ROOT),
            globalStorageUri: vscode.Uri.file(tmpDir),
        };
    });

    afterEach(async () => {
        // Make sure no test leaves stale tabs around for the next one.
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        // Brief pause so VSCode releases its file-watcher handles before we rm
        // the tmpdir on Windows (avoids EBUSY when the watcher is still alive).
        await new Promise(r => setTimeout(r, 300));
        try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch {}
    });

    const openBasenames = () => vscode.window.tabGroups.all
        .flatMap(g => g.tabs)
        .map(t => t.input && t.input.uri && t.input.uri.path.split('/').pop())
        .filter(Boolean);

    it('closes the 3 customisation tabs (quick + advanced-ui + advanced-syntax) for the named theme', async () => {
        // Open all three customisation files for Mars.
        for (const ensure of [ensureQuickFile, ensureAdvancedUIFile, ensureAdvancedSyntaxFile]) {
            const uri = await ensure(fakeCtx, TEST_THEME_LABEL, themeJson);
            await vscode.window.showTextDocument(
                await vscode.workspace.openTextDocument(uri),
                { preview: false }
            );
        }

        const before = openBasenames();
        assert.ok(before.includes('quick-arn-mars-amber-storm.css'),
            'precondition: quick tab must be open');
        assert.ok(before.includes('advanced-ui-arn-mars-amber-storm.jsonc'),
            'precondition: advanced-ui tab must be open');
        assert.ok(before.includes('advanced-syntax-arn-mars-amber-storm.jsonc'),
            'precondition: advanced-syntax tab must be open');

        await closeCustomisationFilesForTheme(TEST_THEME_LABEL);

        const after = openBasenames();
        assert.equal(after.includes('quick-arn-mars-amber-storm.css'), false,
            'quick tab must be closed');
        assert.equal(after.includes('advanced-ui-arn-mars-amber-storm.jsonc'), false,
            'advanced-ui tab must be closed');
        assert.equal(after.includes('advanced-syntax-arn-mars-amber-storm.jsonc'), false,
            'advanced-syntax tab must be closed');
    });

    it('stamps the skipReapplySet with every URI it is about to close (race-condition guard)', async () => {
        // Cross-theme contamination scenario this guards against:
        //   1. user has Mars Quick file open
        //   2. clicks "Change Theme" → Nebula
        //   3. changeTheme handler calls closeCustomisationFilesForTheme(Mars, skipReapplySet)
        //   4. tabs close → onDidCloseTextDocument fires asynchronously
        //   5. the close handler reads the set; if the URI is there, it skips the
        //      re-apply pass (otherwise the apply races with `wb.update('colorTheme')`
        //      and writes Mars's content as Nebula's customisation entry).
        // Without the stamp, step 5 contaminates Nebula. This test asserts the
        // stamp is laid before the actual close fires.
        const uri = await ensureQuickFile(fakeCtx, TEST_THEME_LABEL, themeJson);
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(uri), { preview: false });

        const skipReapplySet = new Set();
        await closeCustomisationFilesForTheme(TEST_THEME_LABEL, skipReapplySet);

        assert.ok(skipReapplySet.has(uri.toString()),
            'the closed Quick URI must be in the skip set so the close handler ' +
            'bails out of its disk-readback re-apply');
    });

    it('only closes tabs of the named theme — other themes\' tabs survive', async () => {
        const SPACEPORT_LABEL = 'Arn · Spaceport — Tungsten Grid';
        const spaceportTheme = parseJsonc(fs.readFileSync(
            path.join(REPO_ROOT, 'themes', 'arn-spaceport.json'), 'utf8'
        ));

        const marsUri  = await ensureQuickFile(fakeCtx, TEST_THEME_LABEL, themeJson);
        const spaceUri = await ensureQuickFile(fakeCtx, SPACEPORT_LABEL, spaceportTheme);
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(marsUri), { preview: false });
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(spaceUri), { preview: false });

        await closeCustomisationFilesForTheme(TEST_THEME_LABEL);

        const after = openBasenames();
        assert.equal(after.includes('quick-arn-mars-amber-storm.css'), false,
            'Mars tab must be closed');
        assert.ok(after.includes('quick-arn-spaceport-tungsten-grid.css'),
            'Spaceport tab must survive — closeCustomisationFilesForTheme is theme-scoped');
    });

    it('is a no-op when no matching tabs are open', async () => {
        await assert.doesNotReject(closeCustomisationFilesForTheme(TEST_THEME_LABEL));
    });
});

// =========================================================================
// closeOtherCustomisationFilesForTheme — when the user picks a customisation
// mode from the Skin menu, the other two customisation tabs of the same
// theme should close so only one is open at a time. Dirty documents must
// be saved (not discarded) before the close, otherwise the user's pending
// edits would silently disappear.
// =========================================================================

describe('closeOtherCustomisationFilesForTheme', function () {
    this.timeout(15000);

    let tmpDir;
    let fakeCtx;
    let themeJson;

    before(() => {
        themeJson = parseJsonc(fs.readFileSync(TEST_THEME_FILE, 'utf8'));
    });

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arn-keep-'));
        fakeCtx = {
            extensionUri: vscode.Uri.file(REPO_ROOT),
            globalStorageUri: vscode.Uri.file(tmpDir),
        };
    });

    afterEach(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await new Promise(r => setTimeout(r, 300));
        try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch {}
    });

    const openBasenames = () => vscode.window.tabGroups.all
        .flatMap(g => g.tabs)
        .map(t => t.input && t.input.uri && t.input.uri.path.split('/').pop())
        .filter(Boolean);

    it('keeps the chosen mode open and closes the other two (no dirty state)', async () => {
        for (const ensure of [ensureQuickFile, ensureAdvancedUIFile, ensureAdvancedSyntaxFile]) {
            const uri = await ensure(fakeCtx, TEST_THEME_LABEL, themeJson);
            await vscode.window.showTextDocument(
                await vscode.workspace.openTextDocument(uri),
                { preview: false }
            );
        }
        assert.equal(openBasenames().filter(n => n.includes('arn-mars')).length, 3,
            'precondition: all 3 customisation tabs must be open');

        await closeOtherCustomisationFilesForTheme(TEST_THEME_LABEL, 'quick');

        const remaining = openBasenames().filter(n => n.includes('arn-mars'));
        assert.deepEqual(remaining.sort(), ['quick-arn-mars-amber-storm.css'],
            'only the Quick tab should remain after keeping="quick"');
    });

    it('saves dirty docs before closing them (the user does not lose pending edits)', async () => {
        // Open Advanced UI and dirty the document.
        const uri = await ensureAdvancedUIFile(fakeCtx, TEST_THEME_LABEL, themeJson);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        await editor.edit(eb => eb.insert(new vscode.Position(0, 0), '/* user edit */\n'));
        assert.equal(doc.isDirty, true, 'precondition: doc must be dirty before close');

        // Open Quick (the kept mode) so the dirty Advanced UI tab gets closed.
        const quickUri = await ensureQuickFile(fakeCtx, TEST_THEME_LABEL, themeJson);
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(quickUri),
            { preview: false }
        );

        await closeOtherCustomisationFilesForTheme(TEST_THEME_LABEL, 'quick');

        // The Advanced UI tab must be gone …
        const remaining = openBasenames().filter(n => n.includes('arn-mars'));
        assert.equal(remaining.includes('advanced-ui-arn-mars-amber-storm.jsonc'), false,
            'Advanced UI tab must close even when it had pending edits');

        // … and the user's edit must have been persisted to disk before the close.
        const onDisk = await fs.promises.readFile(uri.fsPath, 'utf8');
        assert.ok(onDisk.startsWith('/* user edit */'),
            'pending edits must be saved to disk before the close, got first chars: ' +
            JSON.stringify(onDisk.slice(0, 30)));
    });

    it('is a no-op when only the kept mode is already open', async () => {
        const uri = await ensureQuickFile(fakeCtx, TEST_THEME_LABEL, themeJson);
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(uri), { preview: false });

        await assert.doesNotReject(
            closeOtherCustomisationFilesForTheme(TEST_THEME_LABEL, 'quick'));
        assert.ok(openBasenames().includes('quick-arn-mars-amber-storm.css'),
            'the kept tab must survive');
    });

    it('does not touch tabs of other themes', async () => {
        const SPACEPORT_LABEL = 'Arn · Spaceport — Tungsten Grid';
        const spaceportTheme = parseJsonc(fs.readFileSync(
            path.join(REPO_ROOT, 'themes', 'arn-spaceport.json'), 'utf8'));

        // Mars: open all 3
        for (const ensure of [ensureQuickFile, ensureAdvancedUIFile, ensureAdvancedSyntaxFile]) {
            const uri = await ensure(fakeCtx, TEST_THEME_LABEL, themeJson);
            await vscode.window.showTextDocument(
                await vscode.workspace.openTextDocument(uri), { preview: false });
        }
        // Spaceport: open Advanced UI
        const spaceUri = await ensureAdvancedUIFile(fakeCtx, SPACEPORT_LABEL, spaceportTheme);
        await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(spaceUri), { preview: false });

        await closeOtherCustomisationFilesForTheme(TEST_THEME_LABEL, 'quick');

        const after = openBasenames();
        assert.ok(after.includes('quick-arn-mars-amber-storm.css'),
            'Mars Quick must survive');
        assert.ok(after.includes('advanced-ui-arn-spaceport-tungsten-grid.jsonc'),
            'Spaceport Advanced UI must survive — it is a different theme');
        assert.equal(after.includes('advanced-ui-arn-mars-amber-storm.jsonc'), false,
            'Mars Advanced UI must close');
        assert.equal(after.includes('advanced-syntax-arn-mars-amber-storm.jsonc'), false,
            'Mars Advanced Syntax must close');
    });
});

// =========================================================================
// resetTheme — closes customisation tabs explicitly. The host editor's
// auto-close behaviour cannot be relied on: some forks (e.g. Antigravity
// IDE) close orphaned tabs when their file is deleted, but stock VSCode
// does not. resetTheme calls closeCustomisationFilesForTheme() at its
// start, and this test pins that contract.
// =========================================================================

describe('resetTheme — closes customisation tabs (contract guard)', function () {
    this.timeout(15000);

    let tmpDir;
    let fakeCtx;
    let themeJson;

    before(() => {
        themeJson = parseJsonc(fs.readFileSync(TEST_THEME_FILE, 'utf8'));
    });

    beforeEach(async () => {
        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'arn-reset-'));
        fakeCtx = {
            extensionUri: vscode.Uri.file(REPO_ROOT),
            globalStorageUri: vscode.Uri.file(tmpDir),
        };
    });

    afterEach(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        // Brief pause so VSCode releases its file-watcher handles before we rm
        // the tmpdir on Windows (avoids EBUSY when the watcher is still alive).
        await new Promise(r => setTimeout(r, 300));
        try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch {}
    });

    it('closes the 3 customisation tabs when reset is invoked', async () => {
        // Open all three customisation files.
        for (const ensure of [ensureQuickFile, ensureAdvancedUIFile, ensureAdvancedSyntaxFile]) {
            const uri = await ensure(fakeCtx, TEST_THEME_LABEL, themeJson);
            await vscode.window.showTextDocument(
                await vscode.workspace.openTextDocument(uri),
                { preview: false }
            );
        }

        await resetTheme(fakeCtx, TEST_THEME_LABEL);

        const stillOpen = vscode.window.tabGroups.all
            .flatMap(g => g.tabs)
            .map(t => t.input && t.input.uri && t.input.uri.path.split('/').pop())
            .filter(Boolean)
            .filter(n => n.startsWith('quick-arn-') ||
                         n.startsWith('advanced-ui-arn-') ||
                         n.startsWith('advanced-syntax-arn-'));

        assert.deepEqual(stillOpen, [],
            'resetTheme must close the 3 customisation tabs explicitly — ' +
            'stock VSCode does not auto-close them when the underlying file is deleted.');
    });
});
