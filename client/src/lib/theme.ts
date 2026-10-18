export type ThemeId = 'lavender' | 'charcoal' | 'classic' | 'midnight' | 'forest' | 'sunset';
export type RadiusId = 'sharp' | 'default' | 'soft';

export interface ThemeMeta {
    id: ThemeId;
    name: string;
    blurb: string;
    dark: boolean;
    // preview swatches: canvas, chrome, accent, tint1, tint2, tint3
    swatch: [string, string, string, string, string, string];
}

export const THEMES: ThemeMeta[] = [
    { id: 'lavender', name: 'Lavender', blurb: 'Soft violet sidebar with pastel cards. The default.', dark: false, swatch: ['#dfe7fb', '#5b4bb7', '#5b4bb7', '#e6e4fb', '#f6e2fb', '#fde0e6'] },
    { id: 'charcoal', name: 'Charcoal', blurb: 'Dark rail, clean white panels, mint and butter tiles.', dark: false, swatch: ['#e3edf9', '#17191d', '#1a1c21', '#e7ddf7', '#d6f0df', '#f8f0cd'] },
    { id: 'classic', name: 'Classic', blurb: 'The original crimson on deep navy.', dark: true, swatch: ['#0a1322', '#0d1830', '#e2231a', '#fdecec', '#fff3d4', '#e6edf9'] },
    { id: 'midnight', name: 'Midnight', blurb: 'Full dark mode for late-night marking.', dark: true, swatch: ['#0d1017', '#121520', '#5b6cf0', '#232a47', '#2b2342', '#1f3236'] },
    { id: 'forest', name: 'Forest', blurb: 'Calm greens, easy on the eyes.', dark: false, swatch: ['#e4f1e8', '#14432a', '#15803d', '#dcf3e3', '#fdf3cf', '#d9ecf7'] },
    { id: 'sunset', name: 'Sunset', blurb: 'Warm oranges and cream.', dark: false, swatch: ['#fdeee2', '#7c2d12', '#ea580c', '#ffe4d1', '#fff1c2', '#fde2ec'] }
];

export const ACCENT_PRESETS = ['#5b4bb7', '#2563eb', '#0891b2', '#15803d', '#ea580c', '#db2777', '#e2231a', '#1a1c21'];

export interface ThemePrefs {
    theme: ThemeId;
    radius: RadiusId;
    accent: string | null; // null = use the theme's own accent
}

const KEY = 'eip_theme_prefs';
export const DEFAULT_PREFS: ThemePrefs = { theme: 'lavender', radius: 'default', accent: null };
const HEX = /^#[0-9a-fA-F]{6}$/;

export function loadPrefs(): ThemePrefs {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (!raw) return { ...DEFAULT_PREFS };
        return {
            theme: THEMES.some(t => t.id === raw.theme) ? raw.theme : DEFAULT_PREFS.theme,
            radius: ['sharp', 'default', 'soft'].includes(raw.radius) ? raw.radius : 'default',
            accent: typeof raw.accent === 'string' && HEX.test(raw.accent) ? raw.accent : null
        };
    } catch {
        return { ...DEFAULT_PREFS };
    }
}

export function applyPrefs(p: ThemePrefs) {
    const root = document.documentElement;
    root.setAttribute('data-theme', p.theme);
    if (p.radius === 'default') root.removeAttribute('data-radius');
    else root.setAttribute('data-radius', p.radius);
    if (p.accent) root.style.setProperty('--accent', p.accent);
    else root.style.removeProperty('--accent');
}

export function savePrefs(p: ThemePrefs) {
    applyPrefs(p);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event('eip-theme-change'));
}
