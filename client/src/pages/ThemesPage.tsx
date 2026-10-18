import { useEffect, useState } from 'react';
import { ACCENT_PRESETS, DEFAULT_PREFS, THEMES, loadPrefs, savePrefs, type RadiusId, type ThemeMeta, type ThemePrefs } from '../lib/theme';
import { IconCheck } from '../components/Icons';

function MiniPreview({ t, accent }: { t: ThemeMeta; accent: string | null }) {
    const [canvas, chrome, themeAccent, t1, t2, t3] = t.swatch;
    const acc = accent || themeAccent;
    const card = t.dark && t.id === 'midnight' ? '#171b25' : t.dark ? '#f6f8fc' : '#ffffff';
    return (
        <div className="flex h-28 overflow-hidden rounded-[var(--radius-ctl)] border border-line" style={{ background: canvas }} aria-hidden>
            <div className="w-1/5" style={{ background: chrome }}>
                <div className="m-1.5 mt-3 h-1.5 rounded-full bg-white/80" />
                <div className="m-1.5 h-1.5 rounded-full bg-white/35" />
                <div className="m-1.5 h-1.5 rounded-full bg-white/35" />
            </div>
            <div className="flex-1 space-y-1.5 p-2">
                <div className="flex gap-1.5">
                    {[t1, t2, t3].map((c, i) => <div key={i} className="h-7 flex-1 rounded-md" style={{ background: c }} />)}
                </div>
                <div className="rounded-md p-1.5" style={{ background: card }}>
                    <div className="mb-1 h-1.5 w-2/3 rounded-full" style={{ background: 'rgba(120,120,150,.35)' }} />
                    <div className="mb-1.5 h-1.5 w-1/2 rounded-full" style={{ background: 'rgba(120,120,150,.2)' }} />
                    <div className="h-3 w-10 rounded" style={{ background: acc }} />
                </div>
            </div>
        </div>
    );
}

export default function ThemesPage() {
    const [prefs, setPrefs] = useState<ThemePrefs>(loadPrefs);
    // stay in sync when the sidebar quick-switch changes the theme
    useEffect(() => {
        const sync = () => setPrefs(loadPrefs());
        window.addEventListener('eip-theme-change', sync);
        return () => window.removeEventListener('eip-theme-change', sync);
    }, []);
    const update = (patch: Partial<ThemePrefs>) => {
        const next = { ...prefs, ...patch };
        setPrefs(next);
        savePrefs(next);
    };
    const radii: { id: RadiusId; label: string }[] = [
        { id: 'sharp', label: 'Sharp' },
        { id: 'default', label: 'Rounded' },
        { id: 'soft', label: 'Extra soft' }
    ];
    const themeAccent = THEMES.find(t => t.id === prefs.theme)!.swatch[2];

    return (
        <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
            <div>
                <h1 className="text-[2rem] font-extrabold tracking-tight text-on-canvas">Themes</h1>
                <p className="text-sm text-on-canvas-muted">Change how the whole platform looks. Your choice is saved on this device.</p>
            </div>

            <section aria-labelledby="theme-h" className="glass p-5 sm:p-6">
                <h2 id="theme-h" className="mb-4 font-extrabold text-ink">Colour theme</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {THEMES.map(t => {
                        const on = prefs.theme === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => update({ theme: t.id })}
                                aria-pressed={on}
                                className={`relative h-full rounded-[var(--radius-card)] border-2 bg-surface-2 p-3 text-left transition-all hover:-translate-y-0.5 ${on ? 'border-accent shadow-lg' : 'border-line'}`}
                            >
                                <MiniPreview t={t} accent={on ? prefs.accent : null} />
                                <div className="mt-3 flex items-start justify-between gap-2">
                                    <div>
                                        <p className="font-extrabold text-ink">{t.name}</p>
                                        <p className="text-xs text-muted">{t.blurb}</p>
                                    </div>
                                    {on && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><IconCheck size={14} /></span>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
                <section aria-labelledby="accent-h" className="glass p-5 sm:p-6">
                    <h2 id="accent-h" className="mb-1 font-extrabold text-ink">Accent colour</h2>
                    <p className="mb-4 text-xs text-muted">Buttons, links and highlights. Leave on the theme's own colour or pick yours.</p>
                    <div className="flex flex-wrap items-center gap-2.5">
                        {ACCENT_PRESETS.map(c => (
                            <button
                                key={c}
                                type="button"
                                aria-label={`Accent ${c}`}
                                aria-pressed={prefs.accent === c}
                                onClick={() => update({ accent: c })}
                                className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${prefs.accent === c ? 'border-ink scale-110' : 'border-line'}`}
                                style={{ background: c }}
                            />
                        ))}
                        <label className="ml-1 flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-soft">
                            <input type="color" aria-label="Custom accent colour" value={prefs.accent || themeAccent} onChange={e => update({ accent: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent p-0" />
                            Custom
                        </label>
                    </div>
                    {prefs.accent && (
                        <button type="button" onClick={() => update({ accent: null })} className="btn-soft mt-4 px-3 py-1.5 text-xs">Use theme's accent</button>
                    )}
                </section>

                <section aria-labelledby="corner-h" className="glass p-5 sm:p-6">
                    <h2 id="corner-h" className="mb-1 font-extrabold text-ink">Corner style</h2>
                    <p className="mb-4 text-xs text-muted">How round cards, buttons and inputs are.</p>
                    <div className="inline-flex rounded-[var(--radius-ctl)] border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Corner style">
                        {radii.map(r => (
                            <button
                                key={r.id}
                                type="button"
                                role="radio"
                                aria-checked={prefs.radius === r.id}
                                onClick={() => update({ radius: r.id })}
                                className={`rounded-[var(--radius-ctl)] px-4 py-1.5 text-sm font-semibold transition-colors ${prefs.radius === r.id ? 'bg-accent text-accent-ink shadow' : 'text-ink-soft hover:text-ink'}`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </section>
            </div>

            <section aria-labelledby="live-h" className="glass p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h2 id="live-h" className="font-extrabold text-ink">Live preview</h2>
                    <button type="button" onClick={() => { setPrefs({ ...DEFAULT_PREFS }); savePrefs({ ...DEFAULT_PREFS }); }} className="btn-soft px-3 py-1.5 text-xs">Reset to default</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    {[['Attempts today', '128', 'tint-1'], ['Average score', '71%', 'tint-2'], ['Flagged', '6', 'tint-3']].map(([l, v, c]) => (
                        <div key={l} className={`tinted ${c} p-4`}>
                            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{l}</p>
                            <p className="text-2xl font-extrabold text-ink">{v}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button type="button" className="btn-primary px-4 py-2 text-sm">Primary button</button>
                    <button type="button" className="btn-secondary px-4 py-2 text-sm">Secondary</button>
                    <button type="button" className="btn-soft px-4 py-2 text-sm">Soft</button>
                    <span className="chip bg-accent/12 text-accent border border-accent/30">Status chip</span>
                    <input className="input-glass max-w-[14rem]" placeholder="Input field" aria-label="Preview input" />
                </div>
            </section>
        </div>
    );
}
