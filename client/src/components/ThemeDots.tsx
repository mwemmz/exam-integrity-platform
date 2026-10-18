import { useEffect, useState } from 'react';
import { THEMES, loadPrefs, savePrefs } from '../lib/theme';

// Compact one-click theme switcher (sidebar footer, login page).
export default function ThemeDots({ className = '' }: { className?: string }) {
    const [prefs, setPrefs] = useState(loadPrefs);
    useEffect(() => {
        const sync = () => setPrefs(loadPrefs());
        window.addEventListener('eip-theme-change', sync);
        return () => window.removeEventListener('eip-theme-change', sync);
    }, []);
    return (
        <div className={`flex items-center gap-1.5 ${className}`} role="group" aria-label="Quick theme switch">
            {THEMES.map(t => (
                <button
                    key={t.id}
                    type="button"
                    title={t.name}
                    aria-label={`${t.name} theme`}
                    aria-pressed={prefs.theme === t.id}
                    onClick={() => savePrefs({ ...loadPrefs(), theme: t.id })}
                    className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${prefs.theme === t.id ? 'border-current scale-110' : 'border-transparent'}`}
                    style={{ background: `linear-gradient(135deg, ${t.swatch[1]} 50%, ${t.swatch[0]} 50%)`, boxShadow: '0 0 0 1px rgba(128,128,160,.45)' }}
                />
            ))}
        </div>
    );
}
