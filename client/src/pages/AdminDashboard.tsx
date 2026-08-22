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
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

            <section>
                <h2 className="font-semibold mb-2">Institutions</h2>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                            <tr><th className="px-4 py-2">ID</th><th className="px-4 py-2">Name</th></tr>
                        </thead>
                        <tbody>
                            {institutions.map(i => (
                                <tr key={i.id} className="border-t border-slate-100">
                                    <td className="px-4 py-2 text-slate-400">{i.id}</td>
                                    <td className="px-4 py-2">{i.name}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section>
                <h2 className="font-semibold mb-2">Users ({users.length})</h2>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                            <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Email</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Institution</th></tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.id} className="border-t border-slate-100">
                                    <td className="px-4 py-2 font-medium">{u.name}</td>
                                    <td className="px-4 py-2 text-slate-500">{u.email}</td>
                                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'instructor' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{u.role}</span></td>
                                    <td className="px-4 py-2 text-slate-400">{u.institution_id ?? '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
