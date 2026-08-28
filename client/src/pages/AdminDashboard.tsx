import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface User {
    id: number;
    name: string;
    email: string;
    role: string;
    institution_id: number | null;
    created_at: string;
}

interface Institution {
    id: number;
    name: string;
}

export default function AdminDashboard() {
    const [users, setUsers] = useState<User[]>([]);
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {
        api<User[]>('/api/admin/users').then(setUsers).catch(err => setError(err instanceof Error ? err.message : 'Failed to load users'));
        api<Institution[]>('/api/admin/institutions').then(setInstitutions).catch(() => {});
    }, []);

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-300 to-violet-400 text-transparent bg-clip-text glow-text">Admin Dashboard</h1>
            {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">{error}</div>}

            <section>
                <h2 className="font-semibold mb-2 text-slate-200">Institutions</h2>
                <div className="glass rounded-xl overflow-hidden">
                    <div className="scroll-x">
                        <table className="tbl w-full text-sm min-w-[480px]">
                            <thead>
                                <tr><th className="th">ID</th><th className="th">Name</th></tr>
                            </thead>
                            <tbody>
                                {institutions.map(i => (
                                    <tr key={i.id}>
                                        <td className="td text-slate-400">{i.id}</td>
                                        <td className="td">{i.name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section>
                <h2 className="font-semibold mb-2 text-slate-200">Users ({users.length})</h2>
                <div className="glass rounded-xl overflow-hidden">
                    <div className="scroll-x">
                        <table className="tbl w-full text-sm min-w-[560px]">
                            <thead>
                                <tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Institution</th></tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td className="td font-medium">{u.name}</td>
                                        <td className="td text-slate-400">{u.email}</td>
                                        <td className="td"><span className={`chip border ${u.role === 'admin' ? 'bg-purple-500/15 border-purple-400/40 text-purple-300' : u.role === 'instructor' ? 'bg-blue-500/15 border-blue-400/40 text-blue-300' : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'}`}>{u.role}</span></td>
                                        <td className="td text-slate-400">{u.institution_id ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
}