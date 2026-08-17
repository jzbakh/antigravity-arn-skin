// Drives the arn.manageSkin command end to end.
//
// The rest of the suite calls the helpers directly, which leaves the extension's
// only public entry point — the Skin menu and its action branches — untested.
// These tests stub the window prompts, run the real command, and assert what it
// did to the editor: which buffer it opened, what it wrote to settings, what it
// deleted.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const MARS = 'Arn · Mars — Amber Storm';
const NEBULA = 'Arn · Nebula — Amethyst Void';
const SANITIZED = 'arn-mars-amber-storm';

const wb = () => vscode.workspace.getConfiguration('workbench');
const ed = () => vscode.workspace.getConfiguration('editor');

describe('arn.manageSkin — menu actions', function () {
    this.timeout(60000);

    let originals;
    let originalTheme;
    let originalCC;
    let originalTC;

    before(async () => {
        const ext = vscode.extensions.getExtension('jzbakh.antigravity-arn-skin');
        assert.ok(ext, 'extension must be discoverable');
        await ext.activate();

        originalTheme = wb().get('colorTheme');
        originalCC = wb().get('colorCustomizations');
        originalTC = ed().get('tokenColorCustomizations');
        await wb().update('colorTheme', MARS, vscode.ConfigurationTarget.Global);
    });

    after(async () => {
        await wb().update('colorTheme', originalTheme, vscode.ConfigurationTarget.Global);
        await wb().update('colorCustomizations', originalCC, vscode.ConfigurationTarget.Global);
        await ed().update('tokenColorCustomizations', originalTC, vscode.ConfigurationTarget.Global);
    });

    beforeEach(() => {
        originals = {
            showQuickPick: vscode.window.showQuickPick,
            showTextDocument: vscode.window.showTextDocument,
            showWarningMessage: vscode.window.showWarningMessage,
            showInformationMessage: vscode.window.showInformationMessage,
            showErrorMessage: vscode.window.showErrorMessage,
        };
    });

    afterEach(async () => {
        Object.assign(vscode.window, originals);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    // Answer the first quick pick with the entry carrying `action`, and every
    // later one with `then`.
    function stubMenu(action, then) {
        let seen = 0;
        vscode.window.showQuickPick = async (items) => {
            const list = await items;
            seen++;
            if (seen === 1) return list.find(i => i.action === action);
            return typeof then === 'function' ? then(list) : then;
        };
    }

    function captureOpenedDocument() {
        const opened = [];
        vscode.window.showTextDocument = async (doc) => {
            opened.push(doc.uri ? doc.uri.fsPath : String(doc));
            return { document: doc };
        };
        return opened;
    }

    for (const [action, expected] of [
        ['quick', `quick-${SANITIZED}.css`],
        ['advanced-ui', `advanced-ui-${SANITIZED}.jsonc`],
        ['advanced-syntax', `advanced-syntax-${SANITIZED}.jsonc`],
    ]) {
        it(`opens ${expected} for the "${action}" action`, async () => {
            const opened = captureOpenedDocument();
            stubMenu(action);

            await vscode.commands.executeCommand('arn.manageSkin');

            assert.equal(opened.length, 1, 'exactly one buffer should be opened');
            assert.equal(path.basename(opened[0]), expected);
            assert.ok(fs.existsSync(opened[0]), 'the file must exist on disk');
        });
    }

    it('does nothing when the menu is dismissed', async () => {
        const opened = captureOpenedDocument();
        vscode.window.showQuickPick = async () => undefined;

        await vscode.commands.executeCommand('arn.manageSkin');

        assert.deepEqual(opened, []);
    });

    it('offers Reset only once the theme carries a customization', async () => {
        await wb().update('colorCustomizations', undefined, vscode.ConfigurationTarget.Global);
        let labels = [];
        vscode.window.showQuickPick = async (items) => {
            labels = (await items).map(i => i.action);
            return undefined;
        };
        await vscode.commands.executeCommand('arn.manageSkin');
        assert.equal(labels.includes('reset'), false, 'no Reset entry on a pristine theme');

        await wb().update('colorCustomizations',
            { [`[${MARS}]`]: { 'editor.background': '#ABCDEF' } },
            vscode.ConfigurationTarget.Global);
        await vscode.commands.executeCommand('arn.manageSkin');
        assert.ok(labels.includes('reset'), 'Reset appears once a customization exists');
    });

    it('reset clears the theme entry after confirmation', async () => {
        await wb().update('colorCustomizations',
            { [`[${MARS}]`]: { 'editor.background': '#ABCDEF' } },
            vscode.ConfigurationTarget.Global);
        stubMenu('reset');
        vscode.window.showWarningMessage = async () => 'Reset';
        vscode.window.showInformationMessage = async () => undefined;

        await vscode.commands.executeCommand('arn.manageSkin');

        const cc = wb().get('colorCustomizations') || {};
        assert.equal(cc[`[${MARS}]`], undefined, 'the entry must be gone');
    });

    it('reset leaves the entry alone when the confirmation is declined', async () => {
        await wb().update('colorCustomizations',
            { [`[${MARS}]`]: { 'editor.background': '#ABCDEF' } },
            vscode.ConfigurationTarget.Global);
        stubMenu('reset');
        vscode.window.showWarningMessage = async () => undefined;

        await vscode.commands.executeCommand('arn.manageSkin');

        const cc = wb().get('colorCustomizations') || {};
        assert.deepEqual(cc[`[${MARS}]`], { 'editor.background': '#ABCDEF' });
    });

    it('changeTheme switches workbench.colorTheme to the picked theme', async () => {
        stubMenu('changeTheme', (items) => items.find(i => i.label === NEBULA));

        await vscode.commands.executeCommand('arn.manageSkin');

        assert.equal(wb().get('colorTheme'), NEBULA);
        await wb().update('colorTheme', MARS, vscode.ConfigurationTarget.Global);
    });

    it('changeTheme keeps the current theme when the same one is picked', async () => {
        stubMenu('changeTheme', (items) => items.find(i => i.label === MARS));

        await vscode.commands.executeCommand('arn.manageSkin');

        assert.equal(wb().get('colorTheme'), MARS);
    });

    it('changeTheme lists every contributed ARN theme, marking the active one', async () => {
        let themeItems = [];
        stubMenu('changeTheme', (items) => { themeItems = items; return undefined; });

        await vscode.commands.executeCommand('arn.manageSkin');

        assert.equal(themeItems.length, 7, 'all seven themes are offered');
        const active = themeItems.filter(i => i.description === '(Active)');
        assert.equal(active.length, 1);
        assert.equal(active[0].label, MARS);
    });

    for (const [action, label] of [
        ['quick', 'Quick'],
        ['advanced-ui', 'Advanced UI'],
        ['advanced-syntax', 'Advanced Syntax'],
    ]) {
        it(`surfaces an error instead of throwing when the ${label} buffer cannot be opened`, async () => {
            const errors = [];
            vscode.window.showErrorMessage = async (msg) => { errors.push(msg); return undefined; };
            vscode.window.showTextDocument = async () => { throw new Error('boom'); };
            stubMenu(action);

            await vscode.commands.executeCommand('arn.manageSkin');

            assert.equal(errors.length, 1);
            assert.match(errors[0], new RegExp(`Unable to open ${label} file: boom`));
        });
    }

    it('surfaces an error instead of throwing when the theme list cannot be built', async () => {
        const errors = [];
        vscode.window.showErrorMessage = async (msg) => { errors.push(msg); return undefined; };
        let seen = 0;
        vscode.window.showQuickPick = async (items) => {
            const list = await items;
            if (++seen === 1) return list.find(i => i.action === 'changeTheme');
            throw new Error('boom');
        };

        await vscode.commands.executeCommand('arn.manageSkin');

        assert.equal(errors.length, 1);
        assert.match(errors[0], /Unable to list themes: boom/);
    });

    it('does nothing at all when the active theme is not an ARN theme', async () => {
        await wb().update('colorTheme', 'Default Dark+', vscode.ConfigurationTarget.Global);
        let asked = false;
        vscode.window.showQuickPick = async () => { asked = true; return undefined; };

        await vscode.commands.executeCommand('arn.manageSkin');

        assert.equal(asked, false, 'the menu must not even open');
        await wb().update('colorTheme', MARS, vscode.ConfigurationTarget.Global);
    });
});
