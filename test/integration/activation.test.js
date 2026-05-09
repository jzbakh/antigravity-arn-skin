const assert = require('node:assert/strict');
const vscode = require('vscode');

const EXT_ID = 'jzbakh.antigravity-arn-skin';

describe('Extension activation', () => {
    it('is discoverable by VS Code', () => {
        const ext = vscode.extensions.getExtension(EXT_ID);
        assert.ok(ext, `extension ${EXT_ID} not found`);
    });

    it('activates without throwing', async () => {
        const ext = vscode.extensions.getExtension(EXT_ID);
        await ext.activate();
        assert.equal(ext.isActive, true);
    });

    it('registers the arn.manageSkin command', async () => {
        const ext = vscode.extensions.getExtension(EXT_ID);
        await ext.activate();
        const cmds = await vscode.commands.getCommands(true);
        assert.ok(cmds.includes('arn.manageSkin'),
            'arn.manageSkin must be registered after activation');
    });

    it('exposes the __testing bag via module.exports', () => {
        const ext = require('../../extension');
        assert.ok(ext.__testing, '__testing must be exported');
        assert.equal(typeof ext.__testing.colorUtils.hexToRgb, 'function');
        assert.equal(typeof ext.__testing.ensureQuickFile, 'function');
    });
});
