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
            <h1 className="text-[2rem] font-extrabold tracking-tight text-[#f4f7fc]">Admin Dashboard</h1>
            {error && <div className="text-sm text-[#b81e16] bg-[#e2231a]/8 border border-[#e2231a]/25 rounded-lg px-3 py-2">{error}</div>}

            <section>
                <h2 className="font-extrabold mb-2 text-[#f4f7fc]">Institutions</h2>
                <div className="glass rounded-xl overflow-hidden">
                    <div className="scroll-x">
                        <table className="tbl w-full text-sm min-w-[480px]">
                            <thead>
                                <tr><th className="th">ID</th><th className="th">Name</th></tr>
                            </thead>
                            <tbody>
                                {institutions.map(i => (
                                    <tr key={i.id}>
                                        <td className="td text-[#5b6b84]">{i.id}</td>
                                        <td className="td font-medium text-[#0a1322]">{i.name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section>
                <h2 className="font-extrabold mb-2 text-[#f4f7fc]">Users ({users.length})</h2>
                <div className="glass rounded-xl overflow-hidden">
                    <div className="scroll-x">
                        <table className="tbl w-full text-sm min-w-[560px]">
                            <thead>
                                <tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Institution</th></tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id}>
                                        <td className="td font-semibold text-[#0a1322]">{u.name}</td>
                                        <td className="td text-[#5b6b84]">{u.email}</td>
                                        <td className="td"><span className={`chip border ${u.role === 'admin' ? 'bg-[#e2231a]/10 border-[#e2231a]/25 text-[#b81e16]' : u.role === 'instructor' ? 'bg-[#13203c]/8 border border-[#e2e8f2] text-[#13203c]' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>{u.role}</span></td>
                                        <td className="td text-[#5b6b84]">{u.institution_id ?? '—'}</td>
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