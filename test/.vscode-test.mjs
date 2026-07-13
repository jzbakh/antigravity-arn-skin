import { defineConfig } from '@vscode/test-cli';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

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
    launchArgs: [
        '--user-data-dir', join(tmpdir(), 'arn-skin-test-data'),
        '--password-store=basic',
    ],
});
