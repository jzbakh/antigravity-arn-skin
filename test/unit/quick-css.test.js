const assert = require('node:assert/strict');
const { __testing } = require('../../extension');
const { parseQuickCss, buildQuickCssContent } = __testing;

describe('parseQuickCss', () => {
    it('extracts a 6-char hex color variable', () => {
        const css = `:root { --Global-Background: #123456; }`;
        const result = parseQuickCss(css);
        assert.equal(result['ui.baseBackground'], '#123456');
    });

    it('normalizes a 3-char shorthand', () => {
        const css = `:root { --Global-Background: #F00; }`;
        assert.equal(parseQuickCss(css)['ui.baseBackground'], '#FF0000');
    });

    it('accepts 4-char and 8-char hex (with alpha)', () => {
        const css = `:root {
            --Main-Text: #F00A;
            --Accentuation: #12345678;
        }`;
        const result = parseQuickCss(css);
        assert.equal(result['ui.baseForeground'], '#FF0000AA');
        assert.equal(result['ui.accentPrimary'], '#12345678');
    });

    it('returns null for missing color variables', () => {
        const result = parseQuickCss(`:root { }`);
        assert.equal(result['ui.baseBackground'], null);
        assert.equal(result['ui.surfaceElevated'], null);
        assert.equal(result['ui.activeBorder'], null);
        assert.equal(result['ui.selection'], null);
        assert.equal(result['status.info'], null);
    });

    it('does not expose any syntax.* keys (syntax editing belongs to Advanced Syntax)', () => {
        const result = parseQuickCss(`:root { }`);
        assert.equal(result['syntax.keywords'], undefined);
        assert.equal(result['syntax.functions'], undefined);
        assert.equal(result['syntax.strings'], undefined);
        assert.equal(result['syntax.variables'], undefined);
        assert.equal(result['syntax.numbers'], undefined);
    });

    it('extracts all 5 toggles yes/no/inherit', () => {
        const css = `:root {
            --Opt-Borderless-Mode: yes;
            --Opt-Pure-Black-Mode: no;
            --Opt-Active-Tab-Highlight: yes;
            --Opt-Vivid-Selection: no;
            --Opt-Cursor-Line-Glow: inherit;
        }`;
        const result = parseQuickCss(css);
        assert.equal(result['ui.borderless'], 'yes');
        assert.equal(result['ui.pureBlack'], 'no');
        assert.equal(result['ui.activeTabHighlight'], 'yes');
        assert.equal(result['ui.vividSelection'], 'no');
        assert.equal(result['ui.cursorLineGlow'], 'inherit');
    });

    it('is case-insensitive for toggle values', () => {
        const css = `:root {
            --Opt-Borderless-Mode: YES;
            --Opt-Pure-Black-Mode: No;
            --Opt-Cursor-Line-Glow: INHERIT;
        }`;
        const result = parseQuickCss(css);
        assert.equal(result['ui.borderless'], 'yes');
        assert.equal(result['ui.pureBlack'], 'no');
        assert.equal(result['ui.cursorLineGlow'], 'inherit');
    });

    it('defaults all missing toggles to "inherit"', () => {
        const result = parseQuickCss(`:root { }`);
        assert.equal(result['ui.borderless'], 'inherit');
        assert.equal(result['ui.pureBlack'], 'inherit');
        assert.equal(result['ui.activeTabHighlight'], 'inherit');
        assert.equal(result['ui.vividSelection'], 'inherit');
        assert.equal(result['ui.cursorLineGlow'], 'inherit');
    });

    it('does not expose any out-of-scope toggle keys', () => {
        const result = parseQuickCss(`:root { }`);
        assert.equal(result['ui.deepShadows'], undefined);
        assert.equal(result['ui.highContrast'], undefined);
        assert.equal(result['ui.dimmedInactive'], undefined);
        assert.equal(result['ui.vividStatusBar'], undefined);
        assert.equal(result['ui.italics'], undefined);
    });

    it('extracts the full 12-variable UI/status palette', () => {
        const css = `:root {
            --Global-Background:     #111111;
            --Main-Text:             #222222;
            --Accentuation:          #333333;
            --Secondary-Background:  #444444;
            --Surface-Elevated:      #4A4A4A;
            --Borders:               #555555;
            --Active-Border:         #5A5A5A;
            --Selection:             #66666666;
            --Status-Warning:        #BBBBBB;
            --Status-Error:          #CCCCCC;
            --Status-Success:        #DDDDDD;
            --Status-Info:           #EEEEEE;
        }`;
        const result = parseQuickCss(css);
        assert.equal(result['ui.baseBackground'], '#111111');
        assert.equal(result['ui.baseForeground'], '#222222');
        assert.equal(result['ui.accentPrimary'], '#333333');
        assert.equal(result['ui.secondaryBackground'], '#444444');
        assert.equal(result['ui.surfaceElevated'], '#4A4A4A');
        assert.equal(result['ui.borders'], '#555555');
        assert.equal(result['ui.activeBorder'], '#5A5A5A');
        assert.equal(result['ui.selection'], '#66666666');
        assert.equal(result['status.warning'], '#BBBBBB');
        assert.equal(result['status.error'], '#CCCCCC');
        assert.equal(result['status.success'], '#DDDDDD');
        assert.equal(result['status.info'], '#EEEEEE');
    });
});

describe('buildQuickCssContent', () => {
    const baseValues = {
        baseBackground:      '#111111',
        baseForeground:      '#222222',
        accentPrimary:       '#333333',
        secondaryBackground: '#444444',
        surfaceElevated:     '#4A4A4A',
        borders:             '#555555',
        activeBorder:        '#5A5A5A',
        selection:           '#66666666',
        statusWarning:       '#BBBBBB',
        statusError:         '#CCCCCC',
        statusSuccess:       '#DDDDDD',
        statusInfo:          '#EEEEEE',
    };
    const toggles = {
        borderless: 'INHERIT',
        pureBlack: 'INHERIT',
        activeTabHighlight: 'INHERIT',
        vividSelection: 'INHERIT',
        cursorLineGlow: 'INHERIT',
    };

    it('includes all 12 base variables', () => {
        const out = buildQuickCssContent(baseValues, toggles);
        assert.ok(out.includes('--Global-Background:'));
        assert.ok(out.includes('--Main-Text:'));
        assert.ok(out.includes('--Accentuation:'));
        assert.ok(out.includes('--Secondary-Background:'));
        assert.ok(out.includes('--Surface-Elevated:'));
        assert.ok(out.includes('--Borders:'));
        assert.ok(out.includes('--Active-Border:'));
        assert.ok(out.includes('--Selection:'));
        assert.ok(out.includes('--Status-Warning:'));
        assert.ok(out.includes('--Status-Error:'));
        assert.ok(out.includes('--Status-Success:'));
        assert.ok(out.includes('--Status-Info:'));
    });

    it('does not include any --Syntax-* variables (syntax stays in Advanced Syntax)', () => {
        const out = buildQuickCssContent(baseValues, toggles);
        assert.equal(out.includes('--Syntax-Keywords:'), false);
        assert.equal(out.includes('--Syntax-Functions:'), false);
        assert.equal(out.includes('--Syntax-Strings:'), false);
        assert.equal(out.includes('--Syntax-Variables:'), false);
        assert.equal(out.includes('--Syntax-Numbers:'), false);
    });

    it('includes all 5 toggle variables', () => {
        const out = buildQuickCssContent(baseValues, toggles);
        assert.ok(out.includes('--Opt-Borderless-Mode:'));
        assert.ok(out.includes('--Opt-Pure-Black-Mode:'));
        assert.ok(out.includes('--Opt-Active-Tab-Highlight:'));
        assert.ok(out.includes('--Opt-Vivid-Selection:'));
        assert.ok(out.includes('--Opt-Cursor-Line-Glow:'));
    });

    it('does not include any out-of-scope --Opt-* variables', () => {
        const out = buildQuickCssContent(baseValues, toggles);
        assert.equal(out.includes('--Opt-Deep-Shadows:'), false);
        assert.equal(out.includes('--Opt-High-Contrast:'), false);
        assert.equal(out.includes('--Opt-Dimmed-Inactive:'), false);
        assert.equal(out.includes('--Opt-Vivid-Status-Bar:'), false);
        assert.equal(out.includes('--Opt-Semantic-Italics:'), false);
    });

    it('uses the YES:/NO: descriptive comment format for each toggle', () => {
        const out = buildQuickCssContent(baseValues, toggles);
        // Each toggle must explicitly describe both YES and NO behaviours
        // so the user understands the effect without flipping back to a doc.
        assert.ok(out.includes('YES: Hides all UI borders'));
        assert.ok(out.includes('NO:  Applies a subtle, text-tinted border'));
        assert.ok(out.includes('YES: Enables maximum-contrast surfaces'));
        assert.ok(out.includes('NO:  Softens the background contrast'));
        assert.ok(out.includes('YES: Highlights the active tab'));
        assert.ok(out.includes('NO:  Keeps all tabs uniform'));
        assert.ok(out.includes('YES: Enables accent-colored background for selected text'));
        assert.ok(out.includes('NO:  Uses a neutral grey selection'));
        assert.ok(out.includes('YES: Highlights current line and cursor'));
        assert.ok(out.includes('NO:  Removes the line highlight entirely'));
    });

    it('uses the section header that spells out the accepted values', () => {
        const out = buildQuickCssContent(baseValues, toggles);
        assert.ok(out.includes('DISPLAY OPTIONS (Accepted values: YES / NO / INHERIT)'),
            'header must spell out the accepted values');
        assert.ok(out.includes("INHERIT = keep the theme's default behaviour"),
            'INHERIT explanation must remain near the toggles');
    });

    it('does not duplicate the toggle documentation in a top-of-file primer', () => {
        // Each toggle self-documents inline (YES: ... / NO: ...). A
        // separate top-of-file primer would duplicate that prose and drift
        // out of sync the moment a toggle's behaviour is tuned.
        const out = buildQuickCssContent(baseValues, toggles);
        assert.equal(out.includes('Toggles accept: YES, NO, or INHERIT'), false,
            'no duplicated primer block expected');
        assert.equal(out.includes('YES     = force the option on'), false);
        assert.equal(out.includes('NO      = force the option off'), false);
    });

    it('interpolates the actual hex values', () => {
        const out = buildQuickCssContent(baseValues, toggles);
        assert.ok(out.includes('#111111'));
        assert.ok(out.includes('#EEEEEE'));
    });

    it('replaces missing/non-string base values with a safe fallback', () => {
        const partial = { ...baseValues, baseBackground: undefined };
        const out = buildQuickCssContent(partial, toggles);
        // Should not contain the literal "undefined" — the safe() helper substitutes #000000.
        assert.equal(out.includes('--Global-Background:     undefined;'), false);
    });
});
