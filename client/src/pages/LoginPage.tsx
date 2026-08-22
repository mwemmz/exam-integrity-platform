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
        <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
            <div className="w-full max-w-sm bg-white rounded-xl shadow-md p-8">
                <h1 className="text-xl font-bold text-indigo-700 mb-1">Exam Integrity Platform</h1>
                <p className="text-sm text-slate-500 mb-6">
                    {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
                </p>

                <form onSubmit={submit} className="space-y-4">
                    {mode === 'register' && (
                        <div>
                            <label htmlFor="reg-name" className="block text-sm font-medium mb-1">Full name</label>
                            <input id="reg-name" name="name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        </div>
                    )}
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
                        <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
                        <input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                    {mode === 'register' && (
                        <div>
                            <label htmlFor="role" className="block text-sm font-medium mb-1">Role</label>
                            <select id="role" name="role" value={role} onChange={e => setRole(e.target.value)}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white">
                                <option value="student">Student</option>
                                <option value="instructor">Instructor</option>
                            </select>
                        </div>
                    )}

                    {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

                    <button type="submit" disabled={busy}
                        className="w-full bg-indigo-600 text-white rounded-lg py-2 font-medium hover:bg-indigo-700 disabled:opacity-50">
                        {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Register'}
                    </button>
                </form>

                <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                    className="mt-4 w-full text-sm text-indigo-600 hover:underline">
                    {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
                </button>

                <p className="mt-6 text-xs text-slate-400 text-center">
                    Demo (after seeding): instructor@demo.com / student@demo.com — password123
                </p>
            </div>
        </div>
    );
}
