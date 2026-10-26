import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken, getAuthUser } from '../lib/api';
import ThemeDots from '../components/ThemeDots';
import { IconLogo } from '../components/Icons';

function consumeSessionExpiredFlag(): boolean {
    try {
        if (sessionStorage.getItem('eip_session_expired') !== '1') return false;
        sessionStorage.removeItem('eip_session_expired');
        return true;
    } catch {
        return false;
    }
}

export default function LoginPage({ onAuthed }: { onAuthed: () => void }) {
    const navigate = useNavigate();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('student');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [sessionExpired] = useState(consumeSessionExpiredFlag);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            if (mode === 'login') {
                const data = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: { email, password } });
                setToken(data.token);
            } else {
                await api('/api/auth/register', { method: 'POST', body: { name, email, password, role } });
                const data = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: { email, password } });
                setToken(data.token);
            }
            onAuthed();
            const user = getAuthUser();
            navigate(user?.role === 'instructor' ? '/instructor' : user?.role === 'admin' ? '/admin' : '/student', { replace: true });
        } catch (err: any) {
            setError(err.message || 'Something went wrong');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10 relative">
            <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
                <div className="absolute -top-24 right-1/4 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
                <div className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
            </div>
            <div className="w-full max-w-sm glass-strong p-6 sm:p-8">
                <div className="mb-5 flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-[var(--radius-ctl)] bg-accent text-accent-ink shadow-lg"><IconLogo size={24} /></span>
                    <ThemeDots className="text-ink" />
                </div>
                <h1 className="text-[1.45rem] font-extrabold tracking-tight text-ink">Exam Integrity Platform</h1>
                <p className="text-sm text-muted mb-6">
                    {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
                </p>

                {sessionExpired && (
                    <div className="mb-4 text-sm text-ink-2 bg-accent/10 border border-accent/25 rounded-lg px-3 py-2">
                        Your session expired after a period of inactivity. Please log in again.
                    </div>
                )}

                <form onSubmit={submit} className="space-y-4">
                    {mode === 'register' && (
                        <div>
                            <label htmlFor="reg-name" className="label">Full name</label>
                            <input id="reg-name" name="name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required className="input-glass" />
                        </div>
                    )}
                    <div>
                        <label htmlFor="email" className="label">Email</label>
                        <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-glass" />
                    </div>
                    <div>
                        <label htmlFor="password" className="label">Password</label>
                        <input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="input-glass" />
                    </div>
                    {mode === 'register' && (
                        <div>
                            <label htmlFor="role" className="label">Role</label>
                            <select id="role" name="role" value={role} onChange={e => setRole(e.target.value)} className="input-glass bg-surface">
                                <option value="student">Student</option>
                                <option value="instructor">Instructor</option>
                            </select>
                        </div>
                    )}

                    {error && (
                        <div className="text-sm text-danger bg-danger/8 border border-danger/25 rounded-lg px-3 py-2">{error}</div>
                    )}

                    <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
                        {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
                    </button>
                </form>

                <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                    className="mt-4 w-full text-sm text-accent hover:text-accent-strong hover:underline">
                    {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
                </button>

                <div className="mt-6 pt-4 border-t border-line">
                    <p className="text-[0.7rem] uppercase tracking-wider text-muted mb-2.5 font-extrabold">How the system works</p>
                    <ul className="space-y-1.5 text-xs text-muted">
                        <li><span className="chip bg-ink-2/8 text-ink-2 mr-2">AI</span>Live face detection — presence, multiple faces, gaze tracking</li>
                        <li><span className="chip bg-ink-2/8 text-ink-2 mr-2">Devices</span>Phone and voice detection during the exam</li>
                        <li><span className="chip bg-ink-2/8 text-ink-2 mr-2">Timeline</span>Every integrity event lands in a reviewable timeline</li>
                        <li><span className="chip bg-ink-2/8 text-ink-2 mr-2">Rules</span>Violation rules can auto-submit attempts</li>
                        <li><span className="chip bg-ink-2/8 text-ink-2 mr-2">Offline</span>Answers are saved safely on network drop and sync on reconnect</li>
                    </ul>
                </div>

                <p className="mt-4 text-xs text-muted text-center">
                    Demo logins: instructor@demo.com · student@demo.com · admin@demo.com — password123
                </p>
            </div>
        </div>
    );
}