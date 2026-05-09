const assert = require('node:assert/strict');
const { __testing } = require('../../extension');
const { parseJsonc } = __testing;

describe('parseJsonc', () => {
    it('parses plain JSON', () => {
        assert.deepEqual(parseJsonc('{"a": 1, "b": "hello"}'), { a: 1, b: 'hello' });
    });

    it('strips line comments', () => {
        const input = `{
            "a": 1, // trailing comment
            // full-line comment
            "b": 2
        }`;
        assert.deepEqual(parseJsonc(input), { a: 1, b: 2 });
    });

    it('strips block comments', () => {
        const input = `{
            "a": 1, /* inline block */
            /* multi
               line
               block */
            "b": 2
        }`;
        assert.deepEqual(parseJsonc(input), { a: 1, b: 2 });
    });

    it('preserves comment-like content inside strings', () => {
        const result = parseJsonc('{"url": "http://example.com/path"}');
        assert.equal(result.url, 'http://example.com/path');
    });

    it('preserves "// not a comment" inside a string', () => {
        const result = parseJsonc('{"note": "keep // this text"}');
        assert.equal(result.note, 'keep // this text');
    });

    it('preserves "/* not a comment */" inside a string', () => {
        const result = parseJsonc('{"note": "keep /* this */ text"}');
        assert.equal(result.note, 'keep /* this */ text');
    });

    it('tolerates trailing commas in objects', () => {
        assert.deepEqual(parseJsonc('{"a": 1, "b": 2,}'), { a: 1, b: 2 });
    });

    it('tolerates trailing commas in arrays', () => {
        assert.deepEqual(parseJsonc('{"arr": [1, 2, 3,]}'), { arr: [1, 2, 3] });
    });

    it('handles escaped quotes in strings', () => {
        const result = parseJsonc('{"msg": "say \\"hi\\""}');
        assert.equal(result.msg, 'say "hi"');
    });

    it('throws on catastrophically invalid JSON', () => {
        assert.throws(() => parseJsonc('{not json at all}'));
    });
});
