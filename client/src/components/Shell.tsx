import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconAdmin, IconClose, IconExams, IconLogo, IconLogout, IconMenu, IconPalette, IconShield } from './Icons';
import ThemeDots from './ThemeDots';

interface NavDef {
    to: string;
    label: string;
    icon: ReactNode;
    active: (path: string) => boolean;
}

function navFor(role: string): NavDef[] {
    const themes: NavDef = { to: '/themes', label: 'Themes', icon: <IconPalette />, active: p => p === '/themes' };
    if (role === 'instructor') {
        return [
            { to: '/instructor', label: 'Exams', icon: <IconExams />, active: p => p.startsWith('/instructor') && !p.startsWith('/instructor/violations') },
            { to: '/instructor/violations', label: 'Violations', icon: <IconShield />, active: p => p.startsWith('/instructor/violations') },
            themes
        ];
    }
    if (role === 'admin') {
        return [{ to: '/admin', label: 'Admin', icon: <IconAdmin />, active: p => p.startsWith('/admin') }, themes];
    }
    return [{ to: '/student', label: 'My Exams', icon: <IconExams />, active: p => p.startsWith('/student') || p.startsWith('/exam') || p.startsWith('/results') }, themes];
}

function Brand() {
    return (
        <div className="flex items-center gap-3 px-1">
            <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-ctl)] bg-chrome-active text-chrome-active-ink shadow-md"><IconLogo size={22} /></span>
            <span className="leading-tight">
                <span className="block text-[1.05rem] font-extrabold tracking-tight">ExamTech</span>
                <span className="block text-[0.7rem] font-semibold text-chrome-muted">Exam Integrity Platform</span>
            </span>
        </div>
    );
}

export default function Shell({ role, onLogout, children }: { role: string; onLogout: () => void; children: ReactNode }) {
    const { pathname } = useLocation();
    const [open, setOpen] = useState(false);
    useEffect(() => setOpen(false), [pathname]);

    const nav = navFor(role);
    const panel = (
        <div className="flex h-full flex-col gap-6 p-5 text-chrome-ink">
            <Brand />
            <nav className="flex flex-col gap-1.5" aria-label="Main">
                {nav.map(n => (
                    <Link key={n.to} to={n.to} className="nav-item" aria-current={n.active(pathname) ? 'page' : undefined}>
                        {n.icon}
                        {n.label}
                    </Link>
                ))}
            </nav>
            <div className="mt-auto space-y-4">
                <div>
                    <p className="mb-2 px-1 text-[0.68rem] font-extrabold uppercase tracking-wider text-chrome-muted">Quick theme</p>
                    <ThemeDots className="px-1 text-chrome-ink" />
                </div>
                <div className="flex items-center justify-between gap-2 rounded-[var(--radius-ctl)] bg-chrome-ink/10 px-3 py-2.5">
                    <span className="text-sm font-semibold capitalize">{role}</span>
                    <button onClick={onLogout} className="flex items-center gap-1.5 text-xs font-semibold text-chrome-muted hover:text-chrome-ink" aria-label="Log out">
                        <IconLogout size={16} /> Log out
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen md:flex">
            {/* desktop sidebar */}
            <aside className="hidden md:block md:w-64 lg:w-72 shrink-0 bg-chrome sticky top-0 h-screen overflow-y-auto rounded-br-[calc(var(--radius-card)*1.5)]">
                {panel}
            </aside>

            {/* mobile top bar + drawer */}
            <header className="md:hidden sticky top-0 z-40 flex items-center justify-between bg-chrome px-4 py-3 text-chrome-ink">
                <Brand />
                <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-2 hover:bg-chrome-ink/10"><IconMenu /></button>
            </header>
            {open && (
                <div className="md:hidden fixed inset-0 z-50 flex">
                    <div className="w-72 max-w-[85%] bg-chrome overflow-y-auto rounded-r-[var(--radius-card)]">
                        <div className="flex justify-end px-4 pt-4 text-chrome-ink">
                            <button onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-chrome-ink/10"><IconClose /></button>
                        </div>
                        {panel}
                    </div>
                    <button className="flex-1 bg-black/50" onClick={() => setOpen(false)} aria-label="Close menu overlay" />
                </div>
            )}

            <main className="min-w-0 flex-1">{children}</main>
        </div>
    );
}
