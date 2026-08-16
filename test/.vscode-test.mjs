import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    label: 'integration',
    version: process.env.VSCODE_VERSION || 'stable',
    files: 'integration/**/*.test.js',
    extensionDevelopmentPath: resolve(__dirname, '..'),
    mocha: {
        ui: 'bdd',
        timeout: 60000,
        color: true,
    },
    // CI has nobody to answer a prompt, and the macOS Keychain is the one that
    // blocks on an authorisation dialog (--password-store only covers Linux).
    // The editor writes debug logs under the user data dir, kept inside the
    // build tree so a failing job can upload them.
    launchArgs: [
        '--user-data-dir', resolve(__dirname, '.vscode-test', 'user-data'),
        '--password-store=basic',
        '--use-inmemory-secretstorage',
        '--disable-gpu',
        '--disable-updates',
        '--disable-telemetry',
        '--disable-crash-reporter',
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
        '--log=debug',
    ],
});
