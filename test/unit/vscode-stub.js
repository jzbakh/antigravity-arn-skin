// Intercepts `require('vscode')` during unit tests.
// The real `vscode` module is only available inside the VS Code extension host,
// so unit tests (pure Mocha, outside VS Code) need a stub to allow
// `require('../../extension')` to load without throwing.
//
// The stubbed pure helpers never actually touch the vscode API surface,
// so an empty object is sufficient.
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (id, ...rest) {
    if (id === 'vscode') return require.resolve('./vscode-mock.js');
    return origResolve.call(this, id, ...rest);
};
