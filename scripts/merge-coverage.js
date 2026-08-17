// Merges the two coverage runs into one figure.
//
// Neither run sees the whole extension on its own: the unit suite loads
// extension.js in-process and covers the pure helpers, while the integration
// suite drives activate() and the command handlers inside a real editor. Only
// the union describes what the tests actually exercise.
//
// Both runs emit istanbul JSON, so the merge is a straight coverage-map union.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const REQUIRE_FROM = path.join(ROOT, 'test', 'node_modules');
const libCoverage = require(path.join(REQUIRE_FROM, 'istanbul-lib-coverage'));
const libReport = require(path.join(REQUIRE_FROM, 'istanbul-lib-report'));
const reports = require(path.join(REQUIRE_FROM, 'istanbul-reports'));

const INPUTS = [
    path.join(ROOT, 'test', 'coverage-unit', 'coverage-final.json'),
    path.join(ROOT, 'test', 'coverage-int', 'coverage-final.json'),
];
const OUT_DIR = path.join(ROOT, 'test', 'coverage');

// The two runners spell the same absolute path differently on Windows (c:\ vs
// C:\), which would merge as two separate files and halve the figure.
function canonicalise(json) {
    const out = {};
    for (const [key, entry] of Object.entries(json)) {
        let abs = path.resolve(entry.path || key);
        if (/^[a-z]:/.test(abs)) abs = abs[0].toUpperCase() + abs.slice(1);
        out[abs] = { ...entry, path: abs };
    }
    return out;
}

const map = libCoverage.createCoverageMap({});
let merged = 0;
for (const file of INPUTS) {
    if (!fs.existsSync(file)) {
        console.error(`missing coverage input: ${path.relative(ROOT, file)}`);
        continue;
    }
    map.merge(canonicalise(JSON.parse(fs.readFileSync(file, 'utf8'))));
    merged++;
}

if (merged === 0) {
    console.error('no coverage inputs found — run the unit and integration coverage scripts first');
    process.exit(1);
}

const context = libReport.createContext({ dir: OUT_DIR, coverageMap: map });
for (const name of ['text', 'lcov', 'cobertura']) {
    reports.create(name === 'text' ? 'text' : name, {}).execute(context);
}
