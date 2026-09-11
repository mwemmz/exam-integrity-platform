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
                <div className="absolute -top-24 right-1/4 h-80 w-80 rounded-full bg-[#1d2c4a]/60 blur-3xl" />
                <div className="absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-[#13203c]/70 blur-3xl" />
            </div>
            <div className="w-full max-w-sm glass-strong rounded-2xl p-6 sm:p-8">
                <h1 className="text-[1.45rem] font-extrabold tracking-tight text-[#0a1322]">Exam Integrity Platform</h1>
                <p className="text-sm text-[#5b6b84] mb-6">
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
                            <select id="role" name="role" value={role} onChange={e => setRole(e.target.value)} className="input-glass bg-white">
                                <option value="student">Student</option>
                                <option value="instructor">Instructor</option>
                            </select>
                        </div>
                    )}

                    {error && (
                        <div className="text-sm text-[#b81e16] bg-[#e2231a]/8 border border-[#e2231a]/25 rounded-lg px-3 py-2">{error}</div>
                    )}

                    <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
                        {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
                    </button>
                </form>

                <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                    className="mt-4 w-full text-sm text-[#e2231a] hover:text-[#b81e16] hover:underline">
                    {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
                </button>

                <div className="mt-6 pt-4 border-t border-[#e2e8f2]">
                    <p className="text-[0.7rem] uppercase tracking-wider text-[#5b6b84] mb-2.5 font-extrabold">How the system works</p>
                    <ul className="space-y-1.5 text-xs text-[#5b6b84]">
                        <li><span className="chip bg-[#13203c]/8 text-[#13203c] mr-2">AI</span>Live face detection — presence, multiple faces, gaze tracking</li>
                        <li><span className="chip bg-[#13203c]/8 text-[#13203c] mr-2">Devices</span>Phone and voice detection during the exam</li>
                        <li><span className="chip bg-[#13203c]/8 text-[#13203c] mr-2">Timeline</span>Every integrity event lands in a reviewable timeline</li>
                        <li><span className="chip bg-[#13203c]/8 text-[#13203c] mr-2">Rules</span>Violation rules can auto-submit attempts</li>
                        <li><span className="chip bg-[#13203c]/8 text-[#13203c] mr-2">Offline</span>Answers are saved safely on network drop and sync on reconnect</li>
                    </ul>
                </div>

                <p className="mt-4 text-xs text-[#5b6b84] text-center">
                    Demo logins: instructor@demo.com · student@demo.com · admin@demo.com — password123
                </p>
            </div>
        </div>
    );
}