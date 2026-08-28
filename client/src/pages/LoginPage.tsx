import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken, getAuthUser } from '../lib/api';

export default function LoginPage({ onAuthed }: { onAuthed: () => void }) {
    const navigate = useNavigate();
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('student');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

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
                <div className="absolute -top-24 right-1/4 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
                <div className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
            </div>
            <div className="w-full max-w-sm glass-strong glass-glow rounded-2xl p-6 sm:p-8">
                <h1 className="text-xl font-bold mb-1 bg-gradient-to-r from-sky-300 to-cyan-300 text-transparent bg-clip-text glow-text">Exam Integrity Platform</h1>
                <p className="text-sm text-slate-400 mb-6">
                    {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
                </p>

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
                            <select id="role" name="role" value={role} onChange={e => setRole(e.target.value)} className="input-glass bg-[#141831]">
                                <option value="student" className="bg-[#141831]">Student</option>
                                <option value="instructor" className="bg-[#141831]">Instructor</option>
                            </select>
                        </div>
                    )}

                    {error && (
                        <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</div>
                    )}

                    <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
                        {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
                    </button>
                </form>

                <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                    className="mt-4 w-full text-sm text-sky-300 hover:text-sky-200 hover:underline">
                    {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
                </button>

                <p className="mt-6 text-xs text-slate-500 text-center">
                    Demo: instructor@demo.com / student@demo.com — password123
                </p>
            </div>
        </div>
    );
}