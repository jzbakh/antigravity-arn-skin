// Contract guard for the "Customized" status bar accuracy:
//   1. user opens Advanced UI → file generated with theme defaults
//   2. user types a few changes → live-preview writes to settings
//   3. user closes WITHOUT saving → file reverts on disk to defaults,
//      but settings still hold the live-previewed edits
//   4. without a guard, the status bar would still read "Skin (Customized)"
//      and the "Reset" option would appear though there is nothing to reset
//
// The contract: applyAdvancedUI / applyAdvancedSyntax detect when their
// input equals the theme's defaults and *clear* the customisation entry
// rather than re-writing a redundant copy. Combined with the close-handler
// that re-applies the on-disk text after the document closes, this keeps
// settings in lock-step with the persisted file.

const assert = require('node:assert/strict');
const { __testing } = require('../../extension');
const { deepEqual } = __testing;

describe('deepEqual', () => {
    it('returns true for equal primitives', () => {
        assert.equal(deepEqual(1, 1), true);
        assert.equal(deepEqual('a', 'a'), true);
        assert.equal(deepEqual(null, null), true);
        assert.equal(deepEqual(true, true), true);
    });

    it('returns false for different primitives', () => {
        assert.equal(deepEqual(1, 2), false);
        assert.equal(deepEqual('a', 'b'), false);
        assert.equal(deepEqual(null, undefined), false);
        assert.equal(deepEqual(0, false), false);
    });

    it('returns true for structurally equal objects', () => {
        assert.equal(deepEqual({ a: 1 }, { a: 1 }), true);
        assert.equal(deepEqual({ a: { b: 'c' } }, { a: { b: 'c' } }), true);
    });

    it('returns true regardless of key order', () => {
        assert.equal(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
    });

    it('returns false for objects with different shapes', () => {
        assert.equal(deepEqual({ a: 1 }, { a: 1, b: 2 }), false);
        assert.equal(deepEqual({ a: 1 }, { a: 2 }), false);
    });

    it('returns true for equal arrays', () => {
        assert.equal(deepEqual([1, 2, 3], [1, 2, 3]), true);
        assert.equal(deepEqual([{ a: 1 }], [{ a: 1 }]), true);
    });

    it('returns false for arrays with different elements or order', () => {
        assert.equal(deepEqual([1, 2, 3], [3, 2, 1]), false);
        assert.equal(deepEqual([1, 2], [1, 2, 3]), false);
    });

    it('distinguishes arrays from objects', () => {
        assert.equal(deepEqual([], {}), false);
    });
});
