// Covers the live-preview path registered by activate().
//
// Everywhere else the suite calls applyQuick directly, so the wiring around it
// — the 400 ms debounce that turns every keystroke into a settings write — is
// never exercised. That handler edits the user's configuration, so a regression
// there stays invisible until it corrupts someone's theme.

const assert = require('node:assert/strict');
const path = require('node:path');
const vscode = require('vscode');

const MARS = 'Arn · Mars — Amber Storm';
const DEBOUNCE_MS = 400;

const wb = () => vscode.workspace.getConfiguration('workbench');
const ourColors = () => (wb().get('colorCustomizations') || {})[`[${MARS}]`] || {};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

describe('live apply — editing a customisation buffer', function () {
    this.timeout(60000);

    let quickUri;
    let originalTheme;
    let originalCC;

    before(async () => {
        const ext = vscode.extensions.getExtension('jzbakh.antigravity-arn-skin');
        await ext.activate();

        originalTheme = wb().get('colorTheme');
        originalCC = wb().get('colorCustomizations');
        await wb().update('colorTheme', MARS, vscode.ConfigurationTarget.Global);

        // Let the command create the Quick buffer where the extension expects
        // it: the handler only reacts to files under its own storage.
        const originalShowDoc = vscode.window.showTextDocument;
        const originalPick = vscode.window.showQuickPick;
        vscode.window.showQuickPick = async (items) => (await items).find(i => i.action === 'quick');
        vscode.window.showTextDocument = async (doc) => { quickUri = doc.uri; return { document: doc }; };
        await vscode.commands.executeCommand('arn.manageSkin');
        vscode.window.showTextDocument = originalShowDoc;
        vscode.window.showQuickPick = originalPick;

        assert.ok(quickUri, 'the Quick buffer must have been created');
        assert.equal(path.extname(quickUri.fsPath), '.css');
    });

    after(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await wb().update('colorTheme', originalTheme, vscode.ConfigurationTarget.Global);
        await wb().update('colorCustomizations', originalCC, vscode.ConfigurationTarget.Global);
    });

    it('writes an edited base colour into settings once the debounce elapses', async () => {
        const doc = await vscode.workspace.openTextDocument(quickUri);
        const editor = await vscode.window.showTextDocument(doc);
        const whole = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        await editor.edit(b => b.replace(whole, `:root {
            --Global-Background: #ABCDEF;
            --Main-Text: #C8D3E0;
            --Accentuation: #3DD7C7;
            --Secondary-Background: #0D1420;
            --Surface-Elevated: #141C2B;
            --Borders: #1E2A3A;
            --Active-Border: #3DD7C7;
            --Selection: #204A46;
            --Status-Warning: #E5C07B;
            --Status-Error: #E06C75;
            --Status-Success: #98C379;
            --Status-Info: #61AFEF;
            --Opt-Borderless-Mode: INHERIT;
            --Opt-Pure-Black-Mode: INHERIT;
            --Opt-Active-Tab-Highlight: INHERIT;
            --Opt-Vivid-Selection: INHERIT;
            --Opt-Cursor-Line-Glow: INHERIT;
        }`));

        await wait(DEBOUNCE_MS * 3);

        assert.equal(ourColors()['editor.background'], '#ABCDEF',
            'the live handler should have pushed the edit into settings');
    });
});
