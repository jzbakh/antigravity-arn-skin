// Lint config for the whole project. ESLint itself lives in test/package.json:
// the root manifest ships to users and only carries @types/* devDependencies.
const js = require('./test/node_modules/@eslint/js');
const globals = require('./test/node_modules/globals');

module.exports = [
    {
        ignores: [
            'test/node_modules/**',
            'test/.vscode-test/**',
            'test/coverage/**',
            'html_presentation/**',
            'vsix/**',
        ],
    },
    js.configs.recommended,
    {
        // The extension and the build scripts are plain CommonJS running on the
        // Node that VSCode embeds.
        files: ['extension.js', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
            },
        },
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.mocha,
            },
        },
    },
    {
        files: ['test/.vscode-test.mjs', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: globals.node,
        },
    },
];
