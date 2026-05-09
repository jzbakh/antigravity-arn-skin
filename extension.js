const vscode = require('vscode');

// =========================================================================
// COLOR UTILITIES
// =========================================================================

const colorUtils = {
    hexToRgb: (hex) => {
        hex = hex.replace(/^#/, '');
        if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
        const num = parseInt(hex.substring(0, 6), 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    },
    rgbToHex: (r, g, b) => {
        const clamp = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
        const v = ((1 << 24) | (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16);
        return "#" + v.slice(1).toUpperCase();
    },
    rgbToHsl: (r, g, b) => {
        r /= 255, g /= 255, b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, l };
    },
    hslToRgb: (h, s, l) => {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    },
    adjustLightness: (hex, percentDelta) => {
        if (!hex || typeof hex !== 'string') return hex;
        const rgb = colorUtils.hexToRgb(hex);
        const hsl = colorUtils.rgbToHsl(rgb.r, rgb.g, rgb.b);
        hsl.l = Math.max(0, Math.min(1, hsl.l + percentDelta));
        const newRgb = colorUtils.hslToRgb(hsl.h, hsl.s, hsl.l);
        const alpha = hex.length === 9 ? hex.substring(7) : '';
        return colorUtils.rgbToHex(newRgb.r, newRgb.g, newRgb.b) + alpha;
    },
    normalizeHex: (hex) => {
        if (!hex || typeof hex !== 'string') return hex;
        let h = hex.replace(/^#/, '');
        if (h.length === 3) h = h.split('').map(x => x + x).join('');
        if (h.length === 4) h = h.split('').map(x => x + x).join('');
        return '#' + h.toUpperCase();
    },
    addAlpha: (hex, alphaHex) => {
        if (!hex || typeof hex !== 'string') return hex;
        const normalized = colorUtils.normalizeHex(hex);
        return normalized.substring(0, 7) + alphaHex;
    },
    // True channel-wise blend of two RGB colours. ratio=0 returns hexA unchanged,
    // ratio=1 returns hexB. Alpha channels are stripped on input. Used by toggles
    // that need a "tint" (e.g. status bar tinted toward accent) — addAlpha would
    // give a fake/translucent result that depends on what's behind it.
    mix: (hexA, hexB, ratio) => {
        if (!hexA || !hexB || typeof hexA !== 'string' || typeof hexB !== 'string') return hexA;
        const a = colorUtils.hexToRgb(hexA);
        const b = colorUtils.hexToRgb(hexB);
        const r = Math.max(0, Math.min(1, ratio));
        return colorUtils.rgbToHex(
            a.r * (1 - r) + b.r * r,
            a.g * (1 - r) + b.g * r,
            a.b * (1 - r) + b.b * r
        );
    },
    cleanUndefined: (obj) => {
        const cleaned = {};
        for (const key in obj) {
            const v = obj[key];
            if (v !== undefined && v !== null) cleaned[key] = v;
        }
        return cleaned;
    }
};

// =========================================================================
// JSONC PARSING (shared between theme loading and advanced file)
// =========================================================================

function parseJsonc(text) {
    const clean = text.replace(
        /("([^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        (m, s) => s ? s : ''
    );
    try {
        return JSON.parse(clean);
    } catch (firstErr) {
        try {
            return JSON.parse(clean.replace(/,(?=\s*[}\]])/g, ''));
        } catch (secondErr) {
            // Both attempts failed — surface a clear, actionable error.
            throw new Error(`JSONC parse failed: ${secondErr.message} (initial error: ${firstErr.message})`);
        }
    }
}

// =========================================================================
// THEME BASE COLORS — extract the 12 canonical UI bases from a theme JSON
// Used both to pre-fill the Quick CSS file and to compute dirty-tracking
// during apply (so untouched bases inherit theme defaults).
// Syntax colors are NOT exposed in Quick mode — they're handled exclusively
// in "Advanced: Syntax Colors" because per-language scopes (e.g.
// `entity.name.function.python`) override generic Quick keys via TextMate
// specificity, making Quick syntax customisation unreliable.
// =========================================================================

function extractBaseColorsFromTheme(themeJson) {
    const themeColors = themeJson.colors || {};
    const pick = (k, fallback) => themeColors[k] || fallback;
    const bg = pick('editor.background', '#1e1e1e');
    const bgSec = pick('sideBar.background', '#252526');
    const accent = pick('button.background', '#007acc');
    return {
        bg,
        text: pick('editor.foreground', '#d4d4d4'),
        accent,
        bgSec,
        surfaceElevated: pick('editorWidget.background', colorUtils.adjustLightness(bgSec, 0.03)),
        border: pick('sideBar.border', '#333333'),
        activeBorder: pick('focusBorder', accent),
        selection: pick('editor.selectionBackground', colorUtils.addAlpha(accent, '40')),
        warning: pick('list.warningForeground', '#d0b860'),
        error: pick('list.errorForeground', '#e85850'),
        success: pick('gitDecoration.addedResourceForeground', '#70d888'),
        info: pick('notificationsInfoIcon.foreground', accent),
    };
}

// =========================================================================
// QUICK THEME GENERATION — workbench colour keys derived from 12 base colours
// Each derived key declares its source base(s) and is only emitted when at
// least one of its sources has been modified from the theme default (see
// `dirty` parameter). Untouched bases let the theme's own values pass
// through, so a Quick customisation never silently overrides palette
// decisions the user did not intend to change.
// =========================================================================

function generateQuickTheme(parsedUi, dirty, themeType) {
    const bg = parsedUi["ui.baseBackground"];
    const text = parsedUi["ui.baseForeground"];
    const accent = parsedUi["ui.accentPrimary"];
    const bgSec = parsedUi["ui.secondaryBackground"];
    const surfaceElevated = parsedUi["ui.surfaceElevated"];
    const border = parsedUi["ui.borders"];
    const activeBorder = parsedUi["ui.activeBorder"];
    const selection = parsedUi["ui.selection"];
    const warning = parsedUi["status.warning"];
    const error = parsedUi["status.error"];
    const success = parsedUi["status.success"];
    const info = parsedUi["status.info"];

    const borderless = parsedUi["ui.borderless"];
    const pureBlack = parsedUi["ui.pureBlack"];
    const activeTabHighlight = parsedUi["ui.activeTabHighlight"];
    const vividSelection = parsedUi["ui.vividSelection"];
    const cursorLineGlow = parsedUi["ui.cursorLineGlow"];

    const L = colorUtils.adjustLightness;
    const A = colorUtils.addAlpha;
    const M = colorUtils.mix;
    const isLight = themeType === 'vs' || themeType === 'light';

    // Borderless toggle:
    //   YES     → force all border keys transparent (truly borderless)
    //   NO      → force visible borders. If user customized --Borders, use
    //             that; otherwise derive a subtle visible border from `text`
    //             at ~12% opacity. This is critical for the ARN themes that
    //             ship with sideBar.border = "#00000000": without the
    //             derivation, NO would be visually identical to YES because
    //             `border` would still be the theme's transparent default.
    //   INHERIT → leave border keys untouched (theme defaults pass through)
    let borderFinal;
    if (borderless === 'yes') {
        borderFinal = '#00000000';
    } else if (borderless === 'no') {
        if (dirty.border && border) {
            borderFinal = border;
        } else {
            borderFinal = text ? A(text, '20') : '#80808033';
        }
    } else {
        borderFinal = undefined;
    }

    const colors = {};
    // Gated emitter — a key is only written when its source base is dirty.
    // This lets untouched bases fall through to the theme's own values.
    const add = (key, value, dep) => { if (dirty[dep]) colors[key] = value; };

    // ---- Editor core
    add('editor.background', bg, 'bg');
    add('editor.foreground', text, 'text');
    add('editor.lineHighlightBackground', L(bg, 0.04), 'bg');
    add('editor.selectionBackground', selection, 'selection');
    add('editor.selectionHighlightBackground', A(selection, '60'), 'selection');
    add('editor.inactiveSelectionBackground', A(selection, '50'), 'selection');
    add('editor.wordHighlightBackground', A(accent, '22'), 'accent');
    add('editor.wordHighlightStrongBackground', A(accent, '33'), 'accent');
    add('editor.findMatchBackground', A(accent, '55'), 'accent');
    add('editor.findMatchHighlightBackground', A(accent, '33'), 'accent');
    add('editor.findRangeHighlightBackground', A(accent, '15'), 'accent');
    add('editor.hoverHighlightBackground', A(accent, '20'), 'accent');
    add('editor.rangeHighlightBackground', A(accent, '15'), 'accent');
    add('editorCursor.foreground', accent, 'accent');
    add('editorCursor.background', bg, 'bg');
    add('editorLink.activeForeground', accent, 'accent');

    // ---- Line numbers, rulers, whitespace, indent guides
    add('editorLineNumber.foreground', L(text, -0.4), 'text');
    add('editorLineNumber.activeForeground', accent, 'accent');
    add('editorIndentGuide.background1', L(bg, 0.1), 'bg');
    add('editorIndentGuide.activeBackground1', A(accent, '45'), 'accent');
    add('editorRuler.foreground', L(text, -0.5), 'text');
    add('editorWhitespace.foreground', A(text, '30'), 'text');

    // ---- Bracket match & highlight — sourced from the UI palette so the
    // 6-level rainbow stays consistent across every theme without forcing
    // the user to also tune syntax colours in Quick mode.
    add('editorBracketMatch.background', A(accent, '20'), 'accent');
    add('editorBracketMatch.border', accent, 'accent');
    add('editorBracketHighlight.foreground1', accent, 'accent');
    add('editorBracketHighlight.foreground2', info, 'info');
    add('editorBracketHighlight.foreground3', success, 'success');
    add('editorBracketHighlight.foreground4', warning, 'warning');
    add('editorBracketHighlight.foreground5', activeBorder, 'activeBorder');
    add('editorBracketHighlight.foreground6', A(text, '99'), 'text');
    add('editorBracketHighlight.unexpectedBracket.foreground', error, 'error');

    // ---- Overview ruler
    add('editorOverviewRuler.border', bg, 'bg');
    add('editorOverviewRuler.findMatchForeground', A(accent, '80'), 'accent');
    add('editorOverviewRuler.errorForeground', A(error, '80'), 'error');
    add('editorOverviewRuler.warningForeground', A(warning, '80'), 'warning');
    add('editorOverviewRuler.infoForeground', A(accent, '80'), 'accent');
    add('editorOverviewRuler.addedForeground', A(success, '80'), 'success');
    add('editorOverviewRuler.deletedForeground', A(error, '80'), 'error');
    add('editorOverviewRuler.modifiedForeground', A(accent, '80'), 'accent');
    add('editorOverviewRuler.selectionHighlightForeground', A(accent, '60'), 'accent');
    add('editorOverviewRuler.wordHighlightForeground', A(accent, '60'), 'accent');
    add('editorOverviewRuler.wordHighlightStrongForeground', A(accent, '80'), 'accent');

    // ---- Editor widgets — surface-elevated palette
    add('editorWidget.background', surfaceElevated, 'surfaceElevated');
    add('editorWidget.foreground', text, 'text');
    add('editorHoverWidget.background', surfaceElevated, 'surfaceElevated');
    add('editorHoverWidget.foreground', text, 'text');
    add('editorSuggestWidget.background', surfaceElevated, 'surfaceElevated');
    add('editorSuggestWidget.foreground', text, 'text');
    add('editorSuggestWidget.highlightForeground', accent, 'accent');
    add('editorSuggestWidget.selectedBackground', A(accent, '33'), 'accent');
    add('editorSuggestWidget.focusHighlightForeground', accent, 'accent');

    // ---- Side bar
    add('sideBar.background', bgSec, 'bgSec');
    add('sideBar.foreground', text, 'text');
    add('sideBarTitle.foreground', text, 'text');
    add('sideBarSectionHeader.background', L(bgSec, 0.04), 'bgSec');
    add('sideBarSectionHeader.foreground', text, 'text');

    // ---- Activity bar
    add('activityBar.background', bgSec, 'bgSec');
    add('activityBar.foreground', accent, 'accent');
    add('activityBar.inactiveForeground', L(text, -0.4), 'text');
    add('activityBar.activeBorder', activeBorder, 'activeBorder');
    add('activityBar.activeBackground', A(accent, '10'), 'accent');
    add('activityBarBadge.background', accent, 'accent');
    add('activityBarBadge.foreground', bg, 'bg');
    add('activityBarTop.foreground', accent, 'accent');
    add('activityBarTop.inactiveForeground', L(text, -0.4), 'text');

    // ---- Status bar
    add('statusBar.background', L(bgSec, -0.03), 'bgSec');
    add('statusBar.foreground', L(text, -0.2), 'text');
    add('statusBar.debuggingBackground', accent, 'accent');
    add('statusBar.debuggingForeground', bg, 'bg');
    add('statusBar.noFolderBackground', L(bgSec, 0.02), 'bgSec');
    add('statusBar.noFolderForeground', L(text, -0.2), 'text');
    add('statusBarItem.remoteBackground', accent, 'accent');
    add('statusBarItem.remoteForeground', bg, 'bg');
    add('statusBarItem.hoverBackground', A(accent, '15'), 'accent');
    add('statusBarItem.activeBackground', A(accent, '20'), 'accent');
    add('statusBarItem.prominentBackground', A(accent, '20'), 'accent');
    add('statusBarItem.prominentForeground', accent, 'accent');
    add('statusBarItem.prominentHoverBackground', A(accent, '30'), 'accent');
    add('statusBarItem.errorBackground', error, 'error');
    add('statusBarItem.errorForeground', bg, 'bg');
    add('statusBarItem.warningBackground', warning, 'warning');
    add('statusBarItem.warningForeground', bg, 'bg');

    // ---- Title bar
    add('titleBar.activeBackground', bgSec, 'bgSec');
    add('titleBar.activeForeground', text, 'text');
    add('titleBar.inactiveBackground', L(bgSec, -0.05), 'bgSec');
    add('titleBar.inactiveForeground', L(text, -0.3), 'text');

    // ---- Tabs
    add('tab.activeBackground', bg, 'bg');
    add('tab.activeForeground', text, 'text');
    add('tab.activeBorderTop', activeBorder, 'activeBorder');
    add('tab.inactiveBackground', bgSec, 'bgSec');
    add('tab.inactiveForeground', L(text, -0.3), 'text');
    add('tab.hoverBackground', L(bgSec, 0.03), 'bgSec');
    add('tab.hoverForeground', text, 'text');
    add('tab.unfocusedActiveBackground', L(bg, 0.02), 'bg');
    add('tab.unfocusedActiveForeground', L(text, -0.2), 'text');
    add('tab.unfocusedInactiveBackground', bgSec, 'bgSec');
    add('tab.unfocusedInactiveForeground', L(text, -0.4), 'text');
    add('editorGroupHeader.tabsBackground', bgSec, 'bgSec');

    // ---- Panel
    add('panel.background', bg, 'bg');
    add('panelTitle.activeForeground', text, 'text');
    add('panelTitle.activeBorder', activeBorder, 'activeBorder');
    add('panelTitle.inactiveForeground', L(text, -0.3), 'text');
    add('panelInput.border', border, 'border');
    add('panelSectionHeader.background', L(bgSec, 0.02), 'bgSec');
    add('panelSectionHeader.foreground', text, 'text');

    // ---- Terminal
    add('terminal.background', bg, 'bg');
    add('terminal.foreground', text, 'text');
    add('terminal.selectionBackground', selection, 'selection');
    add('terminalCursor.foreground', accent, 'accent');
    add('terminalCursor.background', bg, 'bg');
    add('terminal.ansiBlack', bg, 'bg');
    add('terminal.ansiRed', error, 'error');
    add('terminal.ansiGreen', success, 'success');
    add('terminal.ansiYellow', warning, 'warning');
    add('terminal.ansiBlue', accent, 'accent');
    add('terminal.ansiMagenta', activeBorder, 'activeBorder');
    add('terminal.ansiCyan', info, 'info');
    add('terminal.ansiWhite', text, 'text');
    add('terminal.ansiBrightBlack', L(bg, 0.2), 'bg');
    add('terminal.ansiBrightRed', L(error, 0.1), 'error');
    add('terminal.ansiBrightGreen', L(success, 0.1), 'success');
    add('terminal.ansiBrightYellow', L(warning, 0.1), 'warning');
    add('terminal.ansiBrightBlue', L(accent, 0.1), 'accent');
    add('terminal.ansiBrightMagenta', L(activeBorder, 0.1), 'activeBorder');
    add('terminal.ansiBrightCyan', L(info, 0.1), 'info');
    add('terminal.ansiBrightWhite', L(text, 0.1), 'text');

    // ---- Debug
    add('debugIcon.breakpointForeground', error, 'error');
    add('debugIcon.breakpointDisabledForeground', L(error, -0.3), 'error');
    add('debugIcon.breakpointUnverifiedForeground', warning, 'warning');
    add('debugIcon.startForeground', success, 'success');
    add('debugIcon.pauseForeground', accent, 'accent');
    add('debugIcon.stopForeground', error, 'error');
    add('debugIcon.disconnectForeground', warning, 'warning');
    add('debugIcon.restartForeground', success, 'success');
    add('debugIcon.stepOverForeground', accent, 'accent');
    add('debugIcon.stepIntoForeground', accent, 'accent');
    add('debugIcon.stepOutForeground', accent, 'accent');
    add('debugIcon.continueForeground', success, 'success');
    add('debugToolBar.background', L(bgSec, 0.02), 'bgSec');
    add('editor.stackFrameHighlightBackground', A(warning, '33'), 'warning');
    add('editor.focusedStackFrameHighlightBackground', A(success, '33'), 'success');

    // ---- Git decoration
    add('gitDecoration.addedResourceForeground', success, 'success');
    add('gitDecoration.modifiedResourceForeground', warning, 'warning');
    add('gitDecoration.deletedResourceForeground', error, 'error');
    add('gitDecoration.renamedResourceForeground', accent, 'accent');
    add('gitDecoration.untrackedResourceForeground', success, 'success');
    add('gitDecoration.ignoredResourceForeground', L(text, -0.5), 'text');
    add('gitDecoration.conflictingResourceForeground', error, 'error');
    add('gitDecoration.stageModifiedResourceForeground', warning, 'warning');
    add('gitDecoration.stageDeletedResourceForeground', error, 'error');
    add('gitDecoration.submoduleResourceForeground', accent, 'accent');

    // ---- Diff editor
    add('diffEditor.insertedTextBackground', A(success, '20'), 'success');
    add('diffEditor.removedTextBackground', A(error, '20'), 'error');
    add('diffEditor.insertedLineBackground', A(success, '10'), 'success');
    add('diffEditor.removedLineBackground', A(error, '10'), 'error');
    add('diffEditorOverview.insertedForeground', A(success, '80'), 'success');
    add('diffEditorOverview.removedForeground', A(error, '80'), 'error');

    // ---- Merge conflicts
    add('merge.currentHeaderBackground', A(accent, '50'), 'accent');
    add('merge.currentContentBackground', A(accent, '20'), 'accent');
    add('merge.incomingHeaderBackground', A(success, '50'), 'success');
    add('merge.incomingContentBackground', A(success, '20'), 'success');
    add('merge.commonHeaderBackground', A(warning, '50'), 'warning');
    add('merge.commonContentBackground', A(warning, '20'), 'warning');
    add('mergeEditor.change.background', A(accent, '15'), 'accent');
    add('mergeEditor.change.word.background', A(accent, '30'), 'accent');

    // ---- Peek view
    add('peekView.border', accent, 'accent');
    add('peekViewEditor.background', L(bg, 0.01), 'bg');
    add('peekViewEditor.matchHighlightBackground', A(accent, '50'), 'accent');
    add('peekViewEditorGutter.background', L(bg, 0.01), 'bg');
    add('peekViewResult.background', bgSec, 'bgSec');
    add('peekViewResult.fileForeground', text, 'text');
    add('peekViewResult.lineForeground', L(text, -0.2), 'text');
    add('peekViewResult.matchHighlightBackground', A(accent, '50'), 'accent');
    add('peekViewResult.selectionBackground', A(accent, '30'), 'accent');
    add('peekViewResult.selectionForeground', text, 'text');
    add('peekViewTitle.background', surfaceElevated, 'surfaceElevated');
    add('peekViewTitleDescription.foreground', L(text, -0.2), 'text');
    add('peekViewTitleLabel.foreground', text, 'text');

    // ---- Button & checkbox
    add('button.background', accent, 'accent');
    add('button.foreground', bg, 'bg');
    add('button.hoverBackground', L(accent, 0.08), 'accent');
    add('button.secondaryBackground', L(bgSec, 0.05), 'bgSec');
    add('button.secondaryForeground', text, 'text');
    add('button.secondaryHoverBackground', L(bgSec, 0.1), 'bgSec');
    add('checkbox.background', L(bg, -0.02), 'bg');
    add('checkbox.foreground', text, 'text');

    // ---- Input
    add('input.background', L(bg, -0.02), 'bg');
    add('input.foreground', text, 'text');
    add('input.placeholderForeground', L(text, -0.4), 'text');
    add('inputValidation.errorBackground', A(error, '20'), 'error');
    add('inputValidation.errorForeground', text, 'text');
    add('inputValidation.warningBackground', A(warning, '20'), 'warning');
    add('inputValidation.warningForeground', text, 'text');
    add('inputValidation.infoBackground', A(accent, '20'), 'accent');
    add('inputValidation.infoForeground', text, 'text');
    add('inputOption.activeBackground', A(accent, '33'), 'accent');
    add('inputOption.activeBorder', accent, 'accent');
    add('inputOption.activeForeground', accent, 'accent');

    // ---- Dropdown
    add('dropdown.background', bgSec, 'bgSec');
    add('dropdown.foreground', text, 'text');
    add('dropdown.listBackground', bgSec, 'bgSec');

    // ---- List & tree
    add('list.activeSelectionBackground', A(accent, '33'), 'accent');
    add('list.activeSelectionForeground', text, 'text');
    add('list.activeSelectionIconForeground', accent, 'accent');
    add('list.inactiveSelectionBackground', A(accent, '20'), 'accent');
    add('list.inactiveSelectionForeground', text, 'text');
    add('list.hoverBackground', A(text, '1A'), 'text');
    add('list.hoverForeground', text, 'text');
    add('list.focusBackground', A(accent, '22'), 'accent');
    add('list.focusForeground', text, 'text');
    add('list.focusHighlightForeground', accent, 'accent');
    add('list.focusOutline', accent, 'accent');
    add('list.highlightForeground', accent, 'accent');
    add('list.warningForeground', warning, 'warning');
    add('list.errorForeground', error, 'error');
    add('list.filterMatchBackground', A(accent, '40'), 'accent');
    add('list.filterMatchBorder', accent, 'accent');
    add('list.dropBackground', A(accent, '30'), 'accent');

    // ---- Menu
    add('menu.background', bgSec, 'bgSec');
    add('menu.foreground', text, 'text');
    add('menu.selectionBackground', A(accent, '33'), 'accent');
    add('menu.selectionForeground', text, 'text');
    add('menu.separatorBackground', A(text, '20'), 'text');
    add('menubar.selectionBackground', A(accent, '20'), 'accent');
    add('menubar.selectionForeground', text, 'text');

    // ---- Notifications
    add('notifications.background', bgSec, 'bgSec');
    add('notifications.foreground', text, 'text');
    add('notificationCenterHeader.background', L(bgSec, 0.05), 'bgSec');
    add('notificationCenterHeader.foreground', text, 'text');
    add('notificationLink.foreground', accent, 'accent');
    add('notificationsErrorIcon.foreground', error, 'error');
    add('notificationsWarningIcon.foreground', warning, 'warning');
    add('notificationsInfoIcon.foreground', info, 'info');

    // ---- Badges
    add('badge.background', accent, 'accent');
    add('badge.foreground', bg, 'bg');

    // ---- Breadcrumb
    add('breadcrumb.background', bg, 'bg');
    add('breadcrumb.foreground', L(text, -0.2), 'text');
    add('breadcrumb.focusForeground', accent, 'accent');
    add('breadcrumb.activeSelectionForeground', accent, 'accent');
    add('breadcrumbPicker.background', bgSec, 'bgSec');

    // ---- Quick input / picker
    add('quickInput.background', bgSec, 'bgSec');
    add('quickInput.foreground', text, 'text');
    add('quickInputList.focusBackground', A(accent, '33'), 'accent');
    add('quickInputList.focusForeground', text, 'text');
    add('quickInputList.focusIconForeground', accent, 'accent');
    add('quickInputTitle.background', L(bgSec, 0.03), 'bgSec');
    add('pickerGroup.foreground', accent, 'accent');

    // ---- Progress bar & scrollbar
    add('progressBar.background', accent, 'accent');
    add('scrollbarSlider.background', A(text, '1A'), 'text');
    add('scrollbarSlider.hoverBackground', A(text, '33'), 'text');
    add('scrollbarSlider.activeBackground', A(text, '4D'), 'text');

    // ---- Text links
    add('textLink.foreground', accent, 'accent');
    add('textLink.activeForeground', L(accent, 0.1), 'accent');

    // ---- Welcome page
    add('welcomePage.background', bg, 'bg');

    // ---- Focus
    add('focusBorder', activeBorder, 'activeBorder');

    // ---- Chat / inline chat — full coverage of the chat.* surface keys.
    // Bubble backgrounds and the diff line markers are registered by VSCode
    // with `needsTransparency: true`, so we always emit them with an alpha
    // channel — feeding an opaque colour back through the user's customisation
    // would only earn a "must be transparent" warning in the Advanced editor.
    add('chat.requestBackground', L(bg, 0.02), 'bg');
    add('chat.requestBorder', border, 'border');
    add('chat.requestBubbleBackground', A(L(bgSec, 0.02), '66'), 'bgSec');
    add('chat.requestBubbleHoverBackground', A(L(bgSec, 0.05), '99'), 'bgSec');
    add('chat.requestCodeBorder', A(accent, '40'), 'accent');
    add('chat.editedFileForeground', accent, 'accent');
    add('chat.linesAddedForeground', A(success, 'CC'), 'success');
    add('chat.linesRemovedForeground', A(error, 'CC'), 'error');
    add('chat.slashCommandBackground', A(accent, '15'), 'accent');
    add('chat.slashCommandForeground', accent, 'accent');
    add('chat.avatarBackground', L(bgSec, 0.03), 'bgSec');
    add('chat.avatarForeground', text, 'text');
    add('inlineChat.background', L(bgSec, 0.02), 'bgSec');
    add('inlineChat.border', A(accent, '40'), 'accent');
    add('inlineChatInput.border', A(accent, '40'), 'accent');
    add('inlineChatInput.focusBorder', accent, 'accent');
    add('inlineChatInput.placeholderForeground', L(text, -0.4), 'text');
    add('inlineChatInput.background', L(bgSec, 0.05), 'bgSec');
    add('inlineChatDiff.inserted', A(success, '18'), 'success');
    add('inlineChatDiff.removed', A(error, '18'), 'error');

    // ---- Ghost text / inlay hints
    add('editorGhostText.foreground', L(text, -0.5), 'text');
    add('editorGhostText.background', A(accent, '08'), 'accent');
    add('editorInlayHint.foreground', L(text, -0.5), 'text');
    add('editorInlayHint.typeForeground', A(activeBorder, 'a0'), 'activeBorder');
    add('editorInlayHint.parameterForeground', A(info, 'a0'), 'info');

    // Borders group — only touch border keys when toggle is not INHERIT
    const BORDER_KEYS = [
        'sideBar.border', 'panel.border', 'editorGroup.border',
        'activityBar.border', 'tab.activeBorder', 'tab.border',
        'titleBar.border', 'menu.border', 'dropdown.border',
        'input.border', 'notifications.border', 'statusBar.border',
        'editorGroupHeader.border',
        'panelSection.border', 'panelSectionHeader.border',
        'notificationCenter.border', 'notificationToast.border',
        'editorWidget.border', 'editorHoverWidget.border',
        'editorSuggestWidget.border', 'diffEditor.border',
        'checkbox.border', 'button.border', 'pickerGroup.border',
        'inputValidation.errorBorder', 'inputValidation.warningBorder',
        'inputValidation.infoBorder', 'menubar.selectionBorder'
    ];
    if (borderless === 'inherit') {
        // Mark every border key as undefined so cleanUndefined() drops them
        // from the output — the theme's own values pass through unchanged.
        BORDER_KEYS.forEach(k => { colors[k] = undefined; });
    } else {
        BORDER_KEYS.forEach(k => { colors[k] = borderFinal; });
    }

    // ---- Pure Black Mode (OLED-friendly maximum contrast)
    //   YES     → push every background to the extreme of the theme's
    //             polarity: pure black on dark themes (#000000 for the
    //             editor, near-black for panels/menus/widgets), pure
    //             white on light themes. Maximises code-area readability
    //             and saves OLED battery on dark themes.
    //   NO      → soften the contrast — backgrounds are lifted on dark
    //             themes (and lowered on light) so the eyes don't fight
    //             the deep black. Useful for long sessions.
    //   INHERIT → leave the keys alone.
    if (pureBlack === 'yes') {
        const primary = isLight ? '#FFFFFF' : '#000000';
        const secondary = isLight ? '#F5F5F5' : '#050505';
        const lift = isLight ? '#EDEDED' : '#0A0A0A';
        // Code-area surfaces — pure extreme.
        colors['editor.background'] = primary;
        colors['terminal.background'] = primary;
        colors['breadcrumb.background'] = primary;
        colors['panel.background'] = primary;
        colors['tab.activeBackground'] = primary;
        // Side panels — slightly differentiated from primary.
        colors['sideBar.background'] = secondary;
        colors['activityBar.background'] = secondary;
        colors['statusBar.background'] = secondary;
        colors['titleBar.activeBackground'] = secondary;
        colors['titleBar.inactiveBackground'] = secondary;
        colors['editorGroupHeader.tabsBackground'] = secondary;
        colors['tab.inactiveBackground'] = secondary;
        // Floating widgets / menus — lifted enough to read against pure-black.
        colors['editorWidget.background'] = lift;
        colors['editorHoverWidget.background'] = lift;
        colors['editorSuggestWidget.background'] = lift;
        colors['dropdown.background'] = lift;
        colors['quickInput.background'] = lift;
        colors['quickInputList.focusBackground'] = M(lift, accent || '#888888', 0.15);
        colors['menu.background'] = lift;
        colors['notifications.background'] = lift;
        colors['input.background'] = lift;
    } else if (pureBlack === 'no' && bg && bgSec) {
        // Soften — lift backgrounds on dark, lower on light.
        const liftDelta = isLight ? -0.04 : 0.03;
        const widgetDelta = isLight ? -0.07 : 0.5;
        const primary = L(bg, liftDelta);
        const secondary = L(bgSec, liftDelta);
        const lift = L(bgSec, widgetDelta);
        colors['editor.background'] = primary;
        colors['terminal.background'] = primary;
        colors['breadcrumb.background'] = primary;
        colors['panel.background'] = primary;
        colors['tab.activeBackground'] = primary;
        colors['sideBar.background'] = secondary;
        colors['activityBar.background'] = secondary;
        colors['statusBar.background'] = secondary;
        colors['titleBar.activeBackground'] = secondary;
        colors['titleBar.inactiveBackground'] = secondary;
        colors['editorGroupHeader.tabsBackground'] = secondary;
        colors['tab.inactiveBackground'] = secondary;
        colors['editorWidget.background'] = lift;
        colors['editorHoverWidget.background'] = lift;
        colors['editorSuggestWidget.background'] = lift;
        colors['dropdown.background'] = lift;
        colors['quickInput.background'] = lift;
        colors['menu.background'] = lift;
        colors['notifications.background'] = lift;
        colors['input.background'] = lift;
    }

    // ---- Active Tab Highlight (Material Theme inspired)
    //   YES     → strong accent presence on the active tab: tinted bg,
    //             accent foreground, accent borders top + bottom.
    //   NO      → flat active tab matching inactive — only the foreground
    //             text colour distinguishes it (no borders, no bg tint).
    //   INHERIT → leave the keys alone.
    if (activeTabHighlight === 'yes' && accent && bg) {
        colors['tab.activeBackground'] = M(bg, accent, 0.10);
        colors['tab.activeForeground'] = accent;
        colors['tab.activeBorderTop'] = accent;
        colors['tab.activeBorder'] = accent;
        colors['tab.unfocusedActiveBackground'] = M(bg, accent, 0.05);
        colors['tab.unfocusedActiveForeground'] = M(text, accent, 0.30);
    } else if (activeTabHighlight === 'no' && bg) {
        colors['tab.activeBackground'] = bg;
        colors['tab.activeForeground'] = text;
        colors['tab.activeBorderTop'] = '#00000000';
        colors['tab.activeBorder'] = '#00000000';
        colors['tab.unfocusedActiveBackground'] = bg;
        colors['tab.unfocusedActiveForeground'] = L(text, -0.2);
    }

    // ---- Vivid Selection (Tokyo Night inspired)
    //   YES     → saturated accent-coloured selection (~31% opacity) so
    //             selected text pops out. Highlight backgrounds for word
    //             matches and inactive selections scale with it.
    //   NO      → CLEAR neutral selection: opaque mix of bg and text so
    //             the selection is obviously visible without colour bias.
    //             Auto-adapts: lighter mid-grey on dark themes, darker
    //             mid-grey on light themes (Jupiter).
    //   INHERIT → leave the keys alone.
    if (vividSelection === 'yes' && accent) {
        colors['editor.selectionBackground'] = A(accent, '50');
        colors['editor.selectionHighlightBackground'] = A(accent, '30');
        colors['editor.inactiveSelectionBackground'] = A(accent, '28');
        colors['editor.wordHighlightBackground'] = A(accent, '38');
        colors['editor.wordHighlightStrongBackground'] = A(accent, '48');
    } else if (vividSelection === 'no' && text) {
        // Neutral grey selection at ~33% opacity. On dark themes the light
        // text gives a clear pale wash; on Jupiter the dark text gives a
        // crisp grey over white. The companion highlights track the same
        // alpha curve so word matches stay visible without competing with
        // the active selection.
        colors['editor.selectionBackground'] = A(text, '55');
        colors['editor.selectionHighlightBackground'] = A(text, '30');
        colors['editor.inactiveSelectionBackground'] = A(text, '38');
        colors['editor.wordHighlightBackground'] = A(text, '35');
        colors['editor.wordHighlightStrongBackground'] = A(text, '48');
    }

    // ---- Cursor & Active Line Glow
    //   YES     → bright accent cursor with an accent-tinted line
    //             highlight and matching outline around the active line —
    //             the cursor never gets lost in any code file.
    //   NO      → muted cursor and zero line highlight (flat editing).
    //   INHERIT → leave the keys alone.
    if (cursorLineGlow === 'yes' && accent) {
        colors['editorCursor.foreground'] = accent;
        colors['editor.lineHighlightBackground'] = A(accent, '20');
        colors['editor.lineHighlightBorder'] = A(accent, '60');
        colors['editorLineNumber.activeForeground'] = accent;
    } else if (cursorLineGlow === 'no' && text) {
        colors['editorCursor.foreground'] = L(text, isLight ? 0.2 : -0.2);
        colors['editor.lineHighlightBackground'] = '#00000000';
        colors['editor.lineHighlightBorder'] = '#00000000';
        colors['editorLineNumber.activeForeground'] = text;
    }

    return {
        colors: colorUtils.cleanUndefined(colors),
    };
}

// =========================================================================
// FILE NAMING & STATE
// =========================================================================

function sanitizeLabel(label) {
    return String(label).toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Known planets for icon lookup. Expected icon path: media/<planet>.png
const PLANETS = ['Spaceport', 'Nebula', 'Neptune', 'Uranus', 'Io', 'Jupiter', 'Mars'];

function planetOf(label) {
    return PLANETS.find(p => label.includes(p)) || null;
}

function quickUriFor(context, themeLabel) {
    return vscode.Uri.joinPath(context.globalStorageUri, `quick-${sanitizeLabel(themeLabel)}.css`);
}

function advancedUIUriFor(context, themeLabel) {
    return vscode.Uri.joinPath(context.globalStorageUri, `advanced-ui-${sanitizeLabel(themeLabel)}.jsonc`);
}

function advancedSyntaxUriFor(context, themeLabel) {
    return vscode.Uri.joinPath(context.globalStorageUri, `advanced-syntax-${sanitizeLabel(themeLabel)}.jsonc`);
}

// Infer customization mode from a file URI.
// Returns 'quick' | 'advanced-ui' | 'advanced-syntax' | null.
// Robust across VSCode restarts — no in-memory state needed.
// Path normalization handles Windows backslashes vs Unix forward slashes.
function inferCustomizationMode(uri, context) {
    const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
    const fsPath = norm(uri.fsPath);
    const storagePath = norm(context.globalStorageUri.fsPath);
    if (!fsPath.startsWith(storagePath)) return null;
    const name = uri.path.split('/').pop() || '';
    if (name.startsWith('quick-') && name.endsWith('.css')) return 'quick';
    if (name.startsWith('advanced-ui-') && name.endsWith('.jsonc')) return 'advanced-ui';
    if (name.startsWith('advanced-syntax-') && name.endsWith('.jsonc')) return 'advanced-syntax';
    return null;
}

// Close any open editor tabs for the three customisation files of `themeLabel`.
// Called before switching themes so the user is never left editing a file
// whose name corresponds to a theme that is no longer active. Also called
// from resetTheme to clean up tabs after deleting the underlying file.
//
// `skipReapplySet` is an optional Set<string>. When provided, every URI we
// are about to close is added to it. The activate-level onDidCloseTextDocument
// handler consults this set and skips its re-apply pass for programmatic
// closes — without this, closing Mars's Quick file during a Mars→Nebula
// switch would race with `wb.update('colorTheme')` and end up writing
// Mars's content as Nebula's customisation entry.
async function closeCustomisationFilesForTheme(themeLabel, skipReapplySet) {
    const sanitized = sanitizeLabel(themeLabel);
    const targets = new Set([
        `quick-${sanitized}.css`,
        `advanced-ui-${sanitized}.jsonc`,
        `advanced-syntax-${sanitized}.jsonc`,
    ]);

    const tabsToClose = [];
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (!input || !(input instanceof vscode.TabInputText)) continue;
            const basename = input.uri.path.split('/').pop() || '';
            if (targets.has(basename)) tabsToClose.push(tab);
        }
    }
    if (tabsToClose.length === 0) return;

    // Stamp every URI we're about to close so the close handler bails out.
    if (skipReapplySet) {
        for (const tab of tabsToClose) {
            skipReapplySet.add(tab.input.uri.toString());
        }
    }

    // Save dirty docs first so we never lose user edits to the close.
    for (const tab of tabsToClose) {
        const doc = vscode.workspace.textDocuments.find(
            d => d.uri.toString() === tab.input.uri.toString()
        );
        if (doc && doc.isDirty) {
            try { await doc.save(); } catch { /* fall through to close */ }
        }
    }

    await vscode.window.tabGroups.close(tabsToClose);
}

// Close the two customisation tabs OTHER than `keepMode` for `themeLabel`.
// Used when the user picks a customisation mode from the Skin menu so that
// only one customisation tab is ever open at a time — regardless of whether
// the previously open tab had pending edits. Dirty documents are saved
// before close, so no user input is lost.
async function closeOtherCustomisationFilesForTheme(themeLabel, keepMode) {
    const sanitized = sanitizeLabel(themeLabel);
    const byMode = {
        'quick':           `quick-${sanitized}.css`,
        'advanced-ui':     `advanced-ui-${sanitized}.jsonc`,
        'advanced-syntax': `advanced-syntax-${sanitized}.jsonc`,
    };
    const targets = new Set();
    for (const [mode, basename] of Object.entries(byMode)) {
        if (mode !== keepMode) targets.add(basename);
    }

    const tabsToClose = [];
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (!input || !(input instanceof vscode.TabInputText)) continue;
            const basename = input.uri.path.split('/').pop() || '';
            if (targets.has(basename)) tabsToClose.push(tab);
        }
    }
    if (tabsToClose.length === 0) return;

    // Save dirty docs first so the user's pending edits land on disk and
    // are realigned with settings via the on-close re-apply pass.
    for (const tab of tabsToClose) {
        const doc = vscode.workspace.textDocuments.find(
            d => d.uri.toString() === tab.input.uri.toString()
        );
        if (doc && doc.isDirty) {
            try { await doc.save(); } catch { /* fall through to close */ }
        }
    }

    await vscode.window.tabGroups.close(tabsToClose);
}

// =========================================================================
// QUICK CSS FILE
// =========================================================================

function buildQuickCssContent(baseValues, toggles) {
    const safe = (v) => (v && typeof v === 'string') ? v : '#000000';

    return `/*
==========================================================
  QUICK CUSTOMIZATION — ARN SKIN
==========================================================
  Change any color via the gutter color picker.
  Changes apply in real-time (debounced 400ms).

  For syntax colors, use "Advanced: Syntax Colors" — it
  exposes all per-language scopes that the theme defines.
==========================================================
*/

:root {
    /* ---- UI base palette ---- */
    --Global-Background:     ${safe(baseValues.baseBackground)};
    --Main-Text:             ${safe(baseValues.baseForeground)};
    --Accentuation:          ${safe(baseValues.accentPrimary)};
    --Secondary-Background:  ${safe(baseValues.secondaryBackground)};
    --Surface-Elevated:      ${safe(baseValues.surfaceElevated)};
    --Borders:               ${safe(baseValues.borders)};
    --Active-Border:         ${safe(baseValues.activeBorder)};
    --Selection:             ${safe(baseValues.selection)};

    /* ---- Status palette (debug / git / diagnostics) ---- */
    --Status-Warning:        ${safe(baseValues.statusWarning)};
    --Status-Error:          ${safe(baseValues.statusError)};
    --Status-Success:        ${safe(baseValues.statusSuccess)};
    --Status-Info:           ${safe(baseValues.statusInfo)};

    /* ========================================================= */
    /* DISPLAY OPTIONS (Accepted values: YES / NO / INHERIT)     */
    /* ========================================================= */

  /* INHERIT = keep the theme's default behaviour */

  /* YES: Highlights current line and cursor with an accent glow.
     NO:  Removes the line highlight entirely. */
    --Opt-Cursor-Line-Glow:   ${toggles.cursorLineGlow};

  /* YES: Enables maximum-contrast surfaces.
     NO:  Softens the background contrast to reduce eye strain. */
    --Opt-Pure-Black-Mode:    ${toggles.pureBlack};

  /* YES: Enables accent-colored background for selected text.
     NO:  Uses a neutral grey selection, tuned for readability. */
    --Opt-Vivid-Selection:    ${toggles.vividSelection};

  /* YES: Hides all UI borders (panels, tabs, side bar, widgets).
     NO:  Applies a subtle, text-tinted border. */
    --Opt-Borderless-Mode:    ${toggles.borderless};

  /* YES: Highlights the active tab with an accent background,
          text color, and top/bottom borders.
     NO:  Keeps all tabs uniform. */
    --Opt-Active-Tab-Highlight: ${toggles.activeTabHighlight};
}
`;
}

async function ensureQuickFile(context, themeLabel, themeJson) {
    const uri = quickUriFor(context, themeLabel);

    let exists = false;
    try {
        await vscode.workspace.fs.stat(uri);
        exists = true;
    } catch { /* missing */ }

    if (exists) return uri;

    await vscode.workspace.fs.createDirectory(context.globalStorageUri);

    const wb = vscode.workspace.getConfiguration('workbench');
    const userColors = (wb.get('colorCustomizations') || {})[`[${themeLabel}]`] || {};

    const themeBases = extractBaseColorsFromTheme(themeJson);

    // Prefer an existing user override (from a prior customisation) so the
    // CSS file opens pre-populated with the values currently in effect.
    const baseValues = {
        baseBackground: userColors['editor.background'] || themeBases.bg,
        baseForeground: userColors['editor.foreground'] || themeBases.text,
        accentPrimary: userColors['button.background'] || themeBases.accent,
        secondaryBackground: userColors['sideBar.background'] || themeBases.bgSec,
        surfaceElevated: userColors['editorWidget.background'] || themeBases.surfaceElevated,
        borders: userColors['sideBar.border'] || themeBases.border,
        activeBorder: userColors['focusBorder'] || themeBases.activeBorder,
        selection: userColors['editor.selectionBackground'] || themeBases.selection,
        statusWarning: userColors['list.warningForeground'] || themeBases.warning,
        statusError: userColors['list.errorForeground'] || themeBases.error,
        statusSuccess: userColors['gitDecoration.addedResourceForeground'] || themeBases.success,
        statusInfo: userColors['notificationsInfoIcon.foreground'] || themeBases.info,
    };

    // On first open we start from INHERIT so the theme's own defaults apply
    const toggles = {
        borderless: 'INHERIT',
        pureBlack: 'INHERIT',
        activeTabHighlight: 'INHERIT',
        vividSelection: 'INHERIT',
        cursorLineGlow: 'INHERIT',
    };

    const content = buildQuickCssContent(baseValues, toggles);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
    return uri;
}

// =========================================================================
// ADVANCED JSONC FILE
// =========================================================================

// Find the `"colors": { ... }` block in a raw theme JSONC file and return
// it verbatim (including category comments and blank lines). Walks the
// text counting braces while honouring strings and comments so nested
// objects inside `colors` (none in our themes today, but cheap to handle)
// don't trip the matcher. Returns null if the block can't be located.
function extractColorsBlockFromTheme(themeRaw) {
    const colorsKeyRe = /"colors"\s*:\s*\{/;
    const m = themeRaw.match(colorsKeyRe);
    if (!m) return null;
    const openBraceIdx = m.index + m[0].length - 1;

    let depth = 1;
    let p = openBraceIdx + 1;
    let inStr = false, esc = false, inLineCmt = false, inBlockCmt = false;
    while (p < themeRaw.length && depth > 0) {
        const c = themeRaw[p], n = themeRaw[p + 1];
        if (inLineCmt) {
            if (c === '\n') inLineCmt = false;
            p++; continue;
        }
        if (inBlockCmt) {
            if (c === '*' && n === '/') { inBlockCmt = false; p += 2; continue; }
            p++; continue;
        }
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            p++; continue;
        }
        if (c === '"') { inStr = true; p++; continue; }
        if (c === '/' && n === '/') { inLineCmt = true; p += 2; continue; }
        if (c === '/' && n === '*') { inBlockCmt = true; p += 2; continue; }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) break;
        }
        p++;
    }
    if (depth !== 0) return null;
    return themeRaw.slice(openBraceIdx, p + 1); // includes opening { and closing }
}

// Splice user-side colour overrides into the theme's verbatim block.
// Existing keys get a value-only substitution (preserving every comment
// and indent in the surrounding text). User-only keys (added through
// Quick mode, or VSCode tokens not present in the theme) are appended
// in a clearly-labelled block right before the closing `}`.
function mergeUserColorsIntoBlock(block, userColors) {
    if (!block) return null;
    let parsed;
    try { parsed = parseJsonc(block); } catch { return null; }
    const themeBlockKeys = new Set(Object.keys(parsed));

    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let result = block;

    for (const [key, value] of Object.entries(userColors)) {
        if (typeof value !== 'string') continue;
        if (!themeBlockKeys.has(key)) continue;
        const re = new RegExp(`("${escRe(key)}"\\s*:\\s*)("[^"]*")`);
        result = result.replace(re, (full, prefix) => prefix + JSON.stringify(value));
    }

    const userOnlyKeys = Object.keys(userColors).filter(k =>
        !themeBlockKeys.has(k) && typeof userColors[k] === 'string');
    if (userOnlyKeys.length > 0) {
        const indent = '    ';
        // Strip the trailing `}` (and any whitespace before it) to splice in
        // the appended user keys, then close the block again.
        const closeIdx = result.lastIndexOf('}');
        let beforeClose = result.slice(0, closeIdx).replace(/\s*$/, '');
        if (!beforeClose.endsWith(',')) beforeClose += ',';
        let appended = beforeClose + '\n\n';
        appended += indent + '// ─────────────────────────────────────────────\n';
        appended += indent + '//   USER-ADDED KEYS (not present in the theme)\n';
        appended += indent + '// ─────────────────────────────────────────────\n';
        for (let i = 0; i < userOnlyKeys.length; i++) {
            const k = userOnlyKeys[i];
            const sep = i < userOnlyKeys.length - 1 ? ',' : '';
            appended += indent + JSON.stringify(k) + ': ' + JSON.stringify(userColors[k]) + sep + '\n';
        }
        appended += '  }';
        result = appended;
    }

    return result;
}

async function ensureAdvancedUIFile(context, themeLabel, themeJson) {
    const uri = advancedUIUriFor(context, themeLabel);

    let exists = false;
    try {
        await vscode.workspace.fs.stat(uri);
        exists = true;
    } catch { /* missing */ }

    if (exists) return uri;

    await vscode.workspace.fs.createDirectory(context.globalStorageUri);

    const wb = vscode.workspace.getConfiguration('workbench');
    const userColors = (wb.get('colorCustomizations') || {})[`[${themeLabel}]`] || {};

    const header =
        `/*
==========================================================
  ADVANCED · UI COLORS — ARN SKIN
  Theme: ${themeLabel}
==========================================================
  Every workbench color is listed below, grouped by the
  same categories as the source theme. Click the gutter
  color swatch to pick a new color. Changes apply in
  real-time (400ms debounce).

  For syntax highlighting, use "Advanced: Syntax Colors".
  To restore defaults, pick "Reset" from the Skin menu.
==========================================================
*/
`;

    // Read the source theme file so we can copy its `colors` block verbatim,
    // category comments and all. Falls back to a stringified payload if the
    // file can't be located or parsed (defensive — should never happen with
    // a valid published theme).
    let body;
    try {
        const packageUri = vscode.Uri.joinPath(context.extensionUri, 'package.json');
        const packageJson = parseJsonc(new TextDecoder().decode(
            await vscode.workspace.fs.readFile(packageUri)));
        const themeEntry = packageJson.contributes.themes.find(t => t.label === themeLabel);
        if (themeEntry) {
            const themeFileUri = vscode.Uri.joinPath(context.extensionUri, themeEntry.path);
            const themeRaw = new TextDecoder().decode(
                await vscode.workspace.fs.readFile(themeFileUri));
            const block = extractColorsBlockFromTheme(themeRaw);
            const merged = mergeUserColorsIntoBlock(block, userColors);
            if (merged) {
                body = `{\n  "$schema": "vscode://schemas/color-theme",\n  "colors": ${merged}\n}\n`;
            }
        }
    } catch { /* fall through to flat-JSON fallback */ }

    if (!body) {
        const KEY_RE = /^[a-zA-Z][a-zA-Z0-9.]*$/;
        const filterKeys = (obj) => {
            const out = {};
            for (const [k, v] of Object.entries(obj || {})) {
                if (KEY_RE.test(k)) out[k] = v;
            }
            return out;
        };
        const payload = {
            "$schema": "vscode://schemas/color-theme",
            colors: { ...filterKeys(themeJson.colors), ...filterKeys(userColors) },
        };
        body = JSON.stringify(payload, null, 2);
    }

    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(header + body));
    return uri;
}

async function ensureAdvancedSyntaxFile(context, themeLabel, themeJson) {
    const uri = advancedSyntaxUriFor(context, themeLabel);

    let exists = false;
    try {
        await vscode.workspace.fs.stat(uri);
        exists = true;
    } catch { /* missing */ }

    if (exists) return uri;

    await vscode.workspace.fs.createDirectory(context.globalStorageUri);

    const ed = vscode.workspace.getConfiguration('editor');
    const userTokens = (ed.get('tokenColorCustomizations') || {})[`[${themeLabel}]`] || {};

    // Force every semantic token to the `{ foreground: "…" }` object form.
    // The JSON color picker fires reliably on object-shaped values whose
    // `foreground` property has a `format: "color-hex"` declaration, but
    // does NOT fire on string-shorthand values when the property's schema
    // is wrapped in `anyOf` (every recent VSCode + Antigravity build).
    // Pair this with the schema fix that drops `anyOf` from each semantic
    // entry: together they put a working color swatch in the gutter for
    // every entry — exactly what the user expects when editing this file.
    const rawSemantic = { ...(themeJson.semanticTokenColors || {}), ...(userTokens.semanticTokenColors || {}) };
    const semanticTokenColors = {};
    for (const [k, v] of Object.entries(rawSemantic)) {
        if (typeof v === 'string') semanticTokenColors[k] = { foreground: v };
        else if (v && typeof v === 'object') semanticTokenColors[k] = v;
    }

    // No `$schema` line is written here. Declaring `vscode://schemas/color-theme`
    // would pin the file to VSCode's built-in color-theme schema, whose
    // semanticTokenColors entry uses a dynamic `$ref` to
    // `vscode://schemas/token-styling`. That ref provides validation but
    // DOES NOT carry a `format: "color-hex"` hint reachable by the gutter
    // color decorator, so the picker silently fails to render the swatch on
    // every semantic entry. Leaving `$schema` unset lets our extension's
    // `jsonValidation` binding (declared in `package.json` against
    // `fileMatch: "advanced-*.jsonc"`) be the sole authority — it puts an
    // explicit `format: "color-hex"` on every
    // `semanticTokenColors[token].foreground` in the resolver's path.
    const payload = {
        semanticTokenColors,
        // Merge — never replace. The theme's tokenColors come first, then
        // any textMateRules already present in the user's configuration
        // append at the end so the cascade puts customisations on top via
        // TextMate ordering. Replacing would silently erase the theme's
        // per-language scopes the moment the user opens this file.
        tokenColors: [
            ...(Array.isArray(themeJson.tokenColors) ? themeJson.tokenColors : []),
            ...(Array.isArray(userTokens.textMateRules) ? userTokens.textMateRules : []),
        ],
    };

    const header =
        `/*
==========================================================
  ADVANCED · SYNTAX COLORS — ARN SKIN
  Theme: ${themeLabel}
==========================================================
  Semantic tokens and TextMate rules for code highlighting
  are listed below. Click the gutter color swatch to pick a
  new color. Changes apply in real-time (400ms).

  For UI chrome, use "Advanced: UI Colors".
  To restore defaults, pick "Reset" from the Skin menu.

==========================================================
Color picker tip for Advanced Syntax editing

The Advanced: Syntax Colors file lists ~900+ TextMate rules
(per-language scopes + cross-platform bracket cumul rules).
By default VSCode renders the gutter color swatch on the first
500 entries only. To get the picker on every entry, add this
to your user settings:

    "editor.colorDecoratorsLimit": 1000

⚠️ WARNING: Render hundreds of extra color decorators consumes 
heavy resources. It may cause the editor to freeze or become 
slow while editing this file.
==========================================================
*/
`;
    const body = JSON.stringify(payload, null, 2);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(header + body));
    return uri;
}

// =========================================================================
// CSS PARSING for QUICK mode
// =========================================================================

function parseQuickCss(text) {
    const parseHex = (varName) => {
        const re = new RegExp(`--${varName}:\\s*(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3}))(?![0-9a-fA-F])`, 'i');
        const m = text.match(re);
        return m ? colorUtils.normalizeHex(m[1]) : null;
    };
    const parseToggle = (varName) => {
        const re = new RegExp(`--${varName}:\\s*(yes|no|inherit)\\b`, 'i');
        const m = text.match(re);
        return m ? m[1].toLowerCase() : 'inherit';
    };

    return {
        "ui.baseBackground": parseHex("Global-Background"),
        "ui.baseForeground": parseHex("Main-Text"),
        "ui.accentPrimary": parseHex("Accentuation"),
        "ui.secondaryBackground": parseHex("Secondary-Background"),
        "ui.surfaceElevated": parseHex("Surface-Elevated"),
        "ui.borders": parseHex("Borders"),
        "ui.activeBorder": parseHex("Active-Border"),
        "ui.selection": parseHex("Selection"),
        "status.warning": parseHex("Status-Warning"),
        "status.error": parseHex("Status-Error"),
        "status.success": parseHex("Status-Success"),
        "status.info": parseHex("Status-Info"),
        "ui.borderless": parseToggle("Opt-Borderless-Mode"),
        "ui.pureBlack": parseToggle("Opt-Pure-Black-Mode"),
        "ui.activeTabHighlight": parseToggle("Opt-Active-Tab-Highlight"),
        "ui.vividSelection": parseToggle("Opt-Vivid-Selection"),
        "ui.cursorLineGlow": parseToggle("Opt-Cursor-Line-Glow"),
    };
}

// =========================================================================
// APPLY — writes customizations to workbench/editor configuration
// =========================================================================

async function applyQuick(context, cssText) {
    const active = await getActiveThemeData(context);
    if (!active) return;
    const { themeLabel, themeJson } = active;

    const parsed = parseQuickCss(cssText);

    // Surface missing/unparseable colour variables to the user (rate-limited).
    // Toggles never carry a colour so they're excluded from this check.
    const TOGGLE_KEYS = new Set([
        'ui.borderless', 'ui.pureBlack', 'ui.activeTabHighlight',
        'ui.vividSelection', 'ui.cursorLineGlow',
    ]);
    const missing = Object.entries(parsed)
        .filter(([k]) => k.startsWith('ui.') || k.startsWith('status.'))
        .filter(([k]) => !TOGGLE_KEYS.has(k))
        .filter(([, v]) => v == null)
        .map(([k]) => k);
    if (missing.length > 0 && typeof context.__arnReportMissingVars === 'function') {
        context.__arnReportMissingVars(missing);
    }

    // Dirty tracking — a base is "dirty" when its CSS value diverges from
    // the theme default. Derived keys are only emitted for dirty bases, so
    // untouched bases let the theme's own values transparently pass through.
    const themeBases = extractBaseColorsFromTheme(themeJson);
    const toRgba8 = hex => {
        if (!hex || typeof hex !== 'string') return null;
        const n = colorUtils.normalizeHex(hex);
        return n.length === 7 ? n + 'FF' : n;
    };
    const eq = (a, b) => {
        const A = toRgba8(a);
        const B = toRgba8(b);
        return A !== null && A === B;
    };
    const dirty = {
        bg: !eq(parsed['ui.baseBackground'], themeBases.bg),
        text: !eq(parsed['ui.baseForeground'], themeBases.text),
        accent: !eq(parsed['ui.accentPrimary'], themeBases.accent),
        bgSec: !eq(parsed['ui.secondaryBackground'], themeBases.bgSec),
        surfaceElevated: !eq(parsed['ui.surfaceElevated'], themeBases.surfaceElevated),
        border: !eq(parsed['ui.borders'], themeBases.border),
        activeBorder: !eq(parsed['ui.activeBorder'], themeBases.activeBorder),
        selection: !eq(parsed['ui.selection'], themeBases.selection),
        warning: !eq(parsed['status.warning'], themeBases.warning),
        error: !eq(parsed['status.error'], themeBases.error),
        success: !eq(parsed['status.success'], themeBases.success),
        info: !eq(parsed['status.info'], themeBases.info),
    };

    const { colors } = generateQuickTheme(parsed, dirty, themeJson.type);

    const wb = vscode.workspace.getConfiguration('workbench');

    // Replace the entire entry rather than merging into it: a base that has
    // been reset to its theme default must drop every key that depended on
    // it, otherwise stale derived keys would linger across edits.
    const cleanedColors = colorUtils.cleanUndefined(colors);
    const existingCC = { ...(wb.get('colorCustomizations') || {}) };
    if (Object.keys(cleanedColors).length === 0) {
        delete existingCC[`[${themeLabel}]`];
    } else {
        existingCC[`[${themeLabel}]`] = cleanedColors;
    }
    const finalCC = Object.keys(existingCC).length ? existingCC : undefined;
    await wb.update('colorCustomizations', finalCC, vscode.ConfigurationTarget.Global);
    // Quick mode does not own `editor.tokenColorCustomizations` — that
    // surface belongs exclusively to Advanced Syntax. We leave it alone so
    // any semantic / TextMate overrides the user set elsewhere survive.
}

// Deep-equality between two plain JSON values (null/string/number/bool/
// array/object). We can't use `===` because the customisation JSONC is
// freshly parsed each apply and never identity-equal to the theme JSON.
function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;
    const aArr = Array.isArray(a), bArr = Array.isArray(b);
    if (aArr !== bArr) return false;
    if (aArr) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
        return true;
    }
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) if (!deepEqual(a[k], b[k])) return false;
    return true;
}

async function applyAdvancedUI(context, jsonText) {
    const active = await getActiveThemeData(context);
    if (!active) return;
    const { themeLabel, themeJson } = active;

    let payload;
    try {
        payload = parseJsonc(jsonText);
    } catch (err) {
        console.warn('[ARN] Advanced UI JSONC parse error:', err.message);
        return;
    }
    if (!payload || typeof payload !== 'object') return;

    const colors = colorUtils.cleanUndefined(payload.colors || {});

    // If the user's edited file matches the theme's colours exactly, the
    // user has no actual customisation to persist. Clearing the entry
    // means the status bar reverts to "Skin" (no "Customized" badge),
    // which is the correct state after a close-without-save scenario:
    // the document text reverts to the on-disk default, the close
    // handler re-applies that default, and we land here with a
    // theme-equal payload.
    const wb = vscode.workspace.getConfiguration('workbench');
    const existingCC = { ...(wb.get('colorCustomizations') || {}) };
    if (deepEqual(colors, themeJson.colors || {}) || Object.keys(colors).length === 0) {
        delete existingCC[`[${themeLabel}]`];
    } else {
        existingCC[`[${themeLabel}]`] = colors;
    }
    const finalCC = Object.keys(existingCC).length ? existingCC : undefined;
    await wb.update('colorCustomizations', finalCC, vscode.ConfigurationTarget.Global);
}

async function applyAdvancedSyntax(context, jsonText) {
    const active = await getActiveThemeData(context);
    if (!active) return;
    const { themeLabel, themeJson } = active;

    let payload;
    try {
        payload = parseJsonc(jsonText);
    } catch (err) {
        console.warn('[ARN] Advanced Syntax JSONC parse error:', err.message);
        return;
    }
    if (!payload || typeof payload !== 'object') return;

    const semanticTokenColors = colorUtils.cleanUndefined(payload.semanticTokenColors || {});
    const tokenColors = Array.isArray(payload.tokenColors) ? payload.tokenColors : [];

    // Re-normalise the theme's semantic tokens to the object form so the
    // matchesTheme comparison stays in lock-step with the way
    // ensureAdvancedSyntaxFile writes its output. A theme that ships
    // string shorthand for some tokens still reads as "no change" the
    // moment the user opens the file unedited.
    const themeSemRaw = themeJson.semanticTokenColors || {};
    const themeSem = {};
    for (const [k, v] of Object.entries(themeSemRaw)) {
        if (typeof v === 'string') themeSem[k] = { foreground: v };
        else if (v && typeof v === 'object') themeSem[k] = v;
    }
    const themeTokenColors = Array.isArray(themeJson.tokenColors) ? themeJson.tokenColors : [];

    const matchesTheme =
        deepEqual(semanticTokenColors, themeSem) &&
        deepEqual(tokenColors, themeTokenColors);

    const ed = vscode.workspace.getConfiguration('editor');
    const existingTC = { ...(ed.get('tokenColorCustomizations') || {}) };
    if (matchesTheme) {
        delete existingTC[`[${themeLabel}]`];
    } else {
        // Preserve any non-syntax keys (defensive — normally there are none)
        const prev = existingTC[`[${themeLabel}]`] || {};
        existingTC[`[${themeLabel}]`] = {
            ...prev,
            semanticTokenColors,
            textMateRules: tokenColors,
        };
    }
    const finalTC = Object.keys(existingTC).length ? existingTC : undefined;
    await ed.update('tokenColorCustomizations', finalTC, vscode.ConfigurationTarget.Global);
}

// =========================================================================
// RESET — remove customizations and delete open files for the given theme
// =========================================================================

async function resetTheme(context, themeLabel, skipReapplySet) {
    // Close any open customisation tabs first. Stock VSCode does NOT
    // auto-close tabs whose underlying file gets deleted (some forks like
    // Antigravity IDE do, but we cannot rely on that). The skipReapplySet
    // (when supplied by activate) prevents the close handler from re-
    // applying the about-to-be-deleted file's content back into settings
    // during the close → delete race.
    await closeCustomisationFilesForTheme(themeLabel, skipReapplySet);

    const wb = vscode.workspace.getConfiguration('workbench');
    const ed = vscode.workspace.getConfiguration('editor');

    const cc = { ...(wb.get('colorCustomizations') || {}) };
    delete cc[`[${themeLabel}]`];
    const newCC = Object.keys(cc).length ? cc : undefined;
    await wb.update('colorCustomizations', newCC, vscode.ConfigurationTarget.Global);

    const tc = { ...(ed.get('tokenColorCustomizations') || {}) };
    delete tc[`[${themeLabel}]`];
    const newTC = Object.keys(tc).length ? tc : undefined;
    await ed.update('tokenColorCustomizations', newTC, vscode.ConfigurationTarget.Global);

    // Delete associated files (best-effort, ignore if missing)
    const filesToDelete = [
        quickUriFor(context, themeLabel),
        advancedUIUriFor(context, themeLabel),
        advancedSyntaxUriFor(context, themeLabel),
    ];
    for (const uri of filesToDelete) {
        try {
            await vscode.workspace.fs.delete(uri);
        } catch { /* already gone */ }
    }
}

// =========================================================================
// THEME DATA LOADER
// =========================================================================

async function getActiveThemeData(context) {
    const themeLabel = vscode.workspace.getConfiguration('workbench').get('colorTheme');
    if (!themeLabel || !themeLabel.startsWith('Arn')) return null;

    const extUri = context.extensionUri;
    const packageJsonUri = vscode.Uri.joinPath(extUri, 'package.json');
    const pkgData = await vscode.workspace.fs.readFile(packageJsonUri);
    const packageJson = parseJsonc(new TextDecoder().decode(pkgData));

    const themeEntry = packageJson.contributes.themes.find(t => t.label === themeLabel);
    if (!themeEntry) return null;

    const liveFileUri = vscode.Uri.joinPath(extUri, themeEntry.path);
    const themeData = await vscode.workspace.fs.readFile(liveFileUri);
    const themeString = new TextDecoder().decode(themeData);

    let themeJson;
    try {
        themeJson = parseJsonc(themeString);
    } catch (finalError) {
        vscode.window.showErrorMessage(`Theme Syntax Error: [${themeLabel}] contains invalid structure.`);
        console.error(`[ARN] JSON Parse Error on ${themeLabel}:`, finalError);
        return null;
    }

    return { themeLabel, themeJson, packageJson };
}

// =========================================================================
// ACTIVATE
// =========================================================================

function activate(context) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(paintcan) Skin';
    statusBarItem.command = 'arn.manageSkin';
    context.subscriptions.push(statusBarItem);

    let applyTimeout = null;
    let isApplying = false;

    // URIs we are about to programmatically close (during a theme switch
    // or a Reset). The onDidCloseTextDocument handler consults this set
    // and skips its disk-readback re-apply for these closes — without
    // it, closing Mars's Quick file during a Mars→Nebula switch would
    // race with `wb.update('colorTheme')` and write Mars's content as
    // Nebula's customisation. User-initiated closes (Ctrl+W, click X)
    // are NOT in the set, so they still get the close-realigns-disk
    // behaviour that fixes the phantom-customised status bar.
    const skipReapplyUris = new Set();

    // Rate-limited error reporter — surface apply failures in the UI but don't
    // spam the user with toasts when they're typing through a broken state.
    const RATE_LIMIT_MS = 5000;
    let lastNotifiedAt = 0;
    const reportApplyError = (err) => {
        console.warn('[ARN]', err);
        const now = Date.now();
        if (now - lastNotifiedAt < RATE_LIMIT_MS) return;
        lastNotifiedAt = now;
        const msg = (err && err.message) ? err.message : String(err);
        vscode.window.showErrorMessage(`ARN Skin: failed to apply customisation — ${msg}`);
    };

    // One-shot warning when the Quick CSS has missing variables (rare but
    // possible if the user renames a CSS custom property by hand).
    let lastMissingWarningAt = 0;
    const reportMissingVars = (names) => {
        const now = Date.now();
        if (now - lastMissingWarningAt < RATE_LIMIT_MS) return;
        lastMissingWarningAt = now;
        vscode.window.showWarningMessage(
            `ARN Skin: ${names.length} Quick variable(s) missing or unparsed — ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`
        );
    };
    context.__arnReportMissingVars = reportMissingVars;

    const updateStatusBar = () => {
        const theme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
        if (theme && theme.startsWith('Arn')) {
            const cc = vscode.workspace.getConfiguration('workbench').get('colorCustomizations') || {};
            const tc = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations') || {};
            if (cc[`[${theme}]`] || tc[`[${theme}]`]) {
                statusBarItem.text = '$(paintcan) Skin (Customized)';
                statusBarItem.tooltip = 'Customized theme. Click to manage.';
            } else {
                statusBarItem.text = '$(paintcan) Skin';
                statusBarItem.tooltip = 'Customize theme colors.';
            }
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    };
    updateStatusBar();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('workbench.colorTheme') ||
                e.affectsConfiguration('workbench.colorCustomizations') ||
                e.affectsConfiguration('editor.tokenColorCustomizations')) {
                updateStatusBar();
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            const mode = inferCustomizationMode(e.document.uri, context);
            if (!mode) return;
            if (isApplying) return;

            if (applyTimeout) clearTimeout(applyTimeout);
            applyTimeout = setTimeout(async () => {
                try {
                    isApplying = true;
                    const text = e.document.getText();
                    if (mode === 'quick') await applyQuick(context, text);
                    else if (mode === 'advanced-ui') await applyAdvancedUI(context, text);
                    else if (mode === 'advanced-syntax') await applyAdvancedSyntax(context, text);
                } catch (err) {
                    reportApplyError(err);
                } finally {
                    isApplying = false;
                }
            }, 400);
        })
    );

    // When a customisation document is closed, re-apply its on-disk
    // content. The change handler above writes user edits to settings on
    // every keystroke (live preview); if the user closes without saving,
    // the in-memory edits evaporate but the live-preview writes do not —
    // settings would diverge from disk and the status bar would falsely
    // claim the theme is customised. Re-applying the disk content here
    // realigns settings with the persisted file: an unedited or discarded
    // file equals the theme defaults, so applyAdvancedUI / Syntax detect
    // the match and clear the entry.
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(async (doc) => {
            const mode = inferCustomizationMode(doc.uri, context);
            if (!mode) return;
            if (isApplying) return;

            // Programmatic closes (theme switch / reset) flagged this URI
            // before triggering the close. Skip the re-apply so we don't
            // race with the operation that's currently running.
            const uriStr = doc.uri.toString();
            if (skipReapplyUris.has(uriStr)) {
                skipReapplyUris.delete(uriStr);
                return;
            }

            if (applyTimeout) {
                clearTimeout(applyTimeout);
                applyTimeout = null;
            }
            try {
                isApplying = true;
                const buf = await vscode.workspace.fs.readFile(doc.uri);
                const text = new TextDecoder().decode(buf);
                if (mode === 'quick') await applyQuick(context, text);
                else if (mode === 'advanced-ui') await applyAdvancedUI(context, text);
                else if (mode === 'advanced-syntax') await applyAdvancedSyntax(context, text);
            } catch (err) {
                // File missing (Reset deleted it) or unreadable — nothing
                // to realign. Stay silent.
            } finally {
                isApplying = false;
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('arn.manageSkin', async () => {
            const data = await getActiveThemeData(context);
            if (!data) return;
            const { themeLabel, themeJson, packageJson } = data;

            const cc = vscode.workspace.getConfiguration('workbench').get('colorCustomizations') || {};
            const tc = vscode.workspace.getConfiguration('editor').get('tokenColorCustomizations') || {};
            const hasCustomization = !!cc[`[${themeLabel}]`] || !!tc[`[${themeLabel}]`];

            const options = [
                {
                    label: `⚡ Quick Customization`,
                    action: 'quick',
                    description: 'Edit 12 key colors and 5 toggles — every other UI key is derived from them'
                },
                {
                    label: `🌈 Advanced: UI Colors`,
                    action: 'advanced-ui',
                    description: 'Edit every workbench color (tabs, side bar, editor chrome…)'
                },
                {
                    label: `⌨️ Advanced: Syntax Colors`,
                    action: 'advanced-syntax',
                    description: 'Edit semantic tokens and TextMate rules for code highlighting'
                }
            ];

            if (hasCustomization) {
                options.push({
                    label: `♻️ Reset [${themeLabel}]`,
                    action: 'reset',
                    description: 'Remove all customizations and delete associated files'
                });
            }

            options.push({
                label: `✨ Change Theme`,
                action: 'changeTheme',
                description: 'Quickly switch between ARN-Skin themes'
            });

            const choice = await vscode.window.showQuickPick(options, {
                placeHolder: "Theme Management: " + themeLabel
            });
            if (!choice) return;

            if (choice.action === 'quick') {
                try {
                    const uri = await ensureQuickFile(context, themeLabel, themeJson);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc);
                    await closeOtherCustomisationFilesForTheme(themeLabel, 'quick');
                } catch (err) {
                    vscode.window.showErrorMessage("Unable to open Quick file: " + err.message);
                    console.error('[ARN]', err);
                }
                return;
            }

            if (choice.action === 'advanced-ui') {
                try {
                    const uri = await ensureAdvancedUIFile(context, themeLabel, themeJson);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc);
                    await closeOtherCustomisationFilesForTheme(themeLabel, 'advanced-ui');
                } catch (err) {
                    vscode.window.showErrorMessage("Unable to open Advanced UI file: " + err.message);
                    console.error('[ARN]', err);
                }
                return;
            }

            if (choice.action === 'advanced-syntax') {
                try {
                    const uri = await ensureAdvancedSyntaxFile(context, themeLabel, themeJson);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc);
                    await closeOtherCustomisationFilesForTheme(themeLabel, 'advanced-syntax');
                } catch (err) {
                    vscode.window.showErrorMessage("Unable to open Advanced Syntax file: " + err.message);
                    console.error('[ARN]', err);
                }
                return;
            }

            if (choice.action === 'reset') {
                const confirm = await vscode.window.showWarningMessage(
                    `Reset all customizations for ${themeLabel}?`,
                    {
                        modal: true,
                        detail: 'This will delete the Quick / Advanced files and remove every override for this theme. This cannot be undone.'
                    },
                    'Reset'
                );
                if (confirm !== 'Reset') return;

                // The 400ms debounced apply may have been armed by a keystroke
                // moments before the user opened this menu. If we let it fire
                // it would re-write the colorCustomizations entry we are
                // about to delete and the user would have to click Reset
                // twice. Cancel any pending apply and block new ones until
                // resetTheme has finished mutating the configuration.
                if (applyTimeout) {
                    clearTimeout(applyTimeout);
                    applyTimeout = null;
                }
                isApplying = true;
                try {
                    await resetTheme(context, themeLabel, skipReapplyUris);
                    vscode.window.showInformationMessage(`Default colors restored for ${themeLabel}.`);
                } catch (err) {
                    vscode.window.showErrorMessage("Reset failed: " + err.message);
                    console.error('[ARN]', err);
                } finally {
                    isApplying = false;
                }
                return;
            }

            if (choice.action === 'changeTheme') {
                try {
                    // Menu order follows package.json declaration order.
                    const themeItems = packageJson.contributes.themes.map(t => {
                        const planet = planetOf(t.label);
                        return {
                            label: t.label,
                            description: t.label === themeLabel ? '(Active)' : '',
                            iconPath: planet
                                ? vscode.Uri.joinPath(context.extensionUri, 'media', `${planet.toLowerCase()}.png`)
                                : undefined,
                        };
                    });

                    const selected = await vscode.window.showQuickPick(themeItems, {
                        placeHolder: "Choose an ARN theme to apply"
                    });
                    if (selected && selected.label !== themeLabel) {
                        // Cancel any pending debounced apply — its target
                        // is the theme we are leaving, so letting it fire
                        // after the switch would write the outgoing theme's
                        // content as the new theme's customisation.
                        if (applyTimeout) {
                            clearTimeout(applyTimeout);
                            applyTimeout = null;
                        }
                        isApplying = true;
                        try {
                            // Close any open customisation files of the
                            // outgoing theme. The skipReapplyUris stamp
                            // tells the close handler to bail on its
                            // re-apply pass — without it the close would
                            // race with the colorTheme update below and
                            // contaminate the new theme's settings entry.
                            await closeCustomisationFilesForTheme(themeLabel, skipReapplyUris);
                            const wb = vscode.workspace.getConfiguration('workbench');
                            await wb.update('colorTheme', selected.label, vscode.ConfigurationTarget.Global);
                        } finally {
                            isApplying = false;
                        }
                    }
                } catch (err) {
                    vscode.window.showErrorMessage("Unable to list themes: " + err.message);
                    console.error('[ARN]', err);
                }
                return;
            }
        })
    );
}

function deactivate() { }

module.exports = { activate, deactivate };

// =========================================================================
// TEST-ONLY EXPORT
// `__testing` is consumed by the Mocha suite under /test. It is never read
// by VSCode at runtime — the test harness lives in a separate package.json
// (test/package.json) and is excluded from the published .vsix via
// .vscodeignore. Keeping the bag here means tests can exercise pure
// helpers without copy-pasting them.
// =========================================================================
module.exports.__testing = {
    colorUtils,
    parseJsonc,
    deepEqual,
    extractBaseColorsFromTheme,
    generateQuickTheme,
    parseQuickCss,
    buildQuickCssContent,
    sanitizeLabel,
    planetOf,
    inferCustomizationMode,
    closeCustomisationFilesForTheme,
    closeOtherCustomisationFilesForTheme,
    extractColorsBlockFromTheme,
    mergeUserColorsIntoBlock,
    ensureQuickFile,
    ensureAdvancedUIFile,
    ensureAdvancedSyntaxFile,
    applyQuick,
    applyAdvancedUI,
    applyAdvancedSyntax,
    resetTheme,
    getActiveThemeData,
};
