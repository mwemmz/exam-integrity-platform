import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { getSocket, joinExamRoom, leaveExamRoom } from '../../lib/socket';
import type { AttemptUpdatePayload, TimeExtendedPayload } from '../../lib/socket';

interface Exam {
    id: number;
    title: string;
    status: string;
    time_limit_minutes: number | null;
}

interface LiveRow {
    studentId: number;
    studentName: string;
    studentEmail: string;
    attemptId: number | null;
    status: string;
    endTime: string | null;
    integrityCount: number;
    flagged: boolean;
    remainingSeconds: number;
}

function fmt(s: number): string {
    if (s <= 0) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export default function LiveDashboard() {
    const { examId = '' } = useParams();
    const [exam, setExam] = useState<Exam | null>(null);
    const [rows, setRows] = useState<LiveRow[]>([]);
    const [msgTo, setMsgTo] = useState<number | ''>('');
    const [msgText, setMsgText] = useState('');
    const [busyMsg, setBusyMsg] = useState(false);
    const [extendBusy, setExtendBusy] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [toast, setToast] = useState('');
    const msgTextRef = useRef(msgText);
    const msgToRef = useRef(msgTo);
    msgTextRef.current = msgText;
    msgToRef.current = msgTo;

    const live = useCallback((rowsIn: LiveRow[] | null = null) => {
        api<LiveRow[]>(`/api/instructor/exams/${examId}/live`)
            .then(r => setRows(rowsIn ? mergeRows(rowsIn, r) : r))
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load live view'));
    }, [examId]);

    const mergeRows = (prev: LiveRow[], next: LiveRow[]) => {
        const map = new Map(prev.map(r => [r.studentId, r]));
        for (const r of next) map.set(r.studentId, r);
        return Array.from(map.values());
    };

    useEffect(() => {
        api<Exam>(`/api/exams/${examId}`).then(setExam).catch(() => {});
        live();
        const iv = setInterval(() => live(), 10000);
        return () => clearInterval(iv);
    }, [examId, live]);

    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;
        joinExamRoom(examId);
        const onUpdate = (p: AttemptUpdatePayload) => {
            setRows(prev => {
                const idx = prev.findIndex(r => r.studentId === p.studentId);
                if (idx === -1) return prev;
                const next = [...prev];
                next[idx] = {
                    ...next[idx],
                    attemptId: p.attemptId ?? next[idx].attemptId,
                    status: p.status ?? next[idx].status,
                    integrityCount: p.integrityCount,
                    flagged: p.flagged,
                    endTime: p.endTime ?? next[idx].endTime,
                    remainingSeconds: p.remainingSeconds
                };
                return next;
            });
            if (p.reopened) setToast('Attempt reopened — student can resume.');
        };
        const onExtend = (p: TimeExtendedPayload) => {
            setRows(prev => prev.map(r => r.attemptId === p.attemptId ? { ...r, endTime: p.endTime } : r));
            setToast('Time extended. Student timer updated in real time.');
        };
        socket.on('attempt_update', onUpdate);
        socket.on('time_extended', onExtend);
        setTimeout(() => setToast(''), 3000);
        return () => {
            leaveExamRoom(examId);
            socket.off('attempt_update', onUpdate);
            socket.off('time_extended', onExtend);
        };
    }, [examId]);

    const tick = useCallback(() => {
        setRows(prev => prev.map(r => r.status === 'in_progress' && r.remainingSeconds > 0
            ? { ...r, remainingSeconds: r.remainingSeconds - 1 }
            : r));
    }, []);
    useEffect(() => {
        const iv = setInterval(tick, 1000);
        return () => clearInterval(iv);
    }, [tick]);

    const sendMessage = async () => {
        if (!msgText.trim()) return;
        setBusyMsg(true);
        try {
            await api(`/api/instructor/exams/${examId}/message`, {
                method: 'POST',
                body: { studentId: msgTo === '' ? null : msgTo, message: msgText.trim() }
            });
            setMsgText('');
            setToast(msgTo === '' ? 'Message broadcast to all students.' : 'Message sent to that student.');
            setTimeout(() => setToast(''), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send message');
        } finally {
            setBusyMsg(false);
        }
    };

    const extendTime = async (row: LiveRow) => {
        const minutes = window.prompt(`Extra minutes for ${row.studentName}:`, '5');
        if (minutes === null) return;
        const n = Number(minutes);
        if (!Number.isFinite(n) || n <= 0) return;
        setExtendBusy(row.attemptId);
        try {
            await api(`/api/instructor/attempts/${row.attemptId}/extend`, { method: 'POST', body: { minutes: n } });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to extend time');
        } finally {
            setExtendBusy(null);
        }
    };

    const statusPill = (s: string) => {
        if (s === 'in_progress') return 'bg-ink-2/8 text-ink-2 border border-line';
        if (s === 'submitted') return 'bg-ok/10 text-ok border border-ok/30';
        if (s === 'auto_submitted') return 'bg-danger/10 text-danger border border-danger/25';
        return 'bg-surface text-muted border border-line';
    };

    return (
        <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <Link to="/instructor" className="text-accent hover:text-accent-strong hover:underline text-sm font-medium">← All exams</Link>
                    <h1 className="text-[2rem] font-extrabold tracking-tight text-on-canvas">{exam ? `${exam.title} — Live` : 'Live Monitoring'}</h1>
                </div>
                <div className="flex gap-2">
                    <Link to={`/instructor/exams/${examId}/analytics`} className="btn-soft px-4 py-2 text-sm">Analytics</Link>
                    <Link to={`/instructor/exams/${examId}/gradebook`} className="btn-soft px-4 py-2 text-sm">Gradebook</Link>
                </div>
            </div>

            {toast && <div className="text-sm text-ok bg-ok/10 border border-ok/30 rounded-lg px-4 py-2.5">{toast}</div>}
            {error && <div className="text-sm text-danger bg-danger/8 border border-danger/25 rounded-lg px-3 py-2">{error}</div>}

            <div className="glass-strong p-4 space-y-3">
                <h2 className="font-extrabold text-ink">Send a message</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                    <select value={msgTo} onChange={e => setMsgTo(e.target.value === '' ? '' : Number(e.target.value))} className="input-glass bg-surface sm:w-56">
                        <option value="">All students</option>
                        {rows.filter(r => r.attemptId).map(r => <option key={r.studentId} value={r.studentId}>{r.studentName}</option>)}
                    </select>
                    <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void sendMessage(); }} placeholder="Type a message…" className="input-glass flex-1" />
                    <button onClick={() => void sendMessage()} disabled={busyMsg || !msgText.trim()} className="btn-primary px-4 py-2 text-sm">
                        {busyMsg ? 'Sending…' : 'Send'}
                    </button>
                </div>
                <p className="text-xs text-muted">Delivered instantly as a small banner on the student's exam screen. It never interrupts typing.</p>
            </div>

            <div className="glass overflow-hidden">
                <div className="scroll-x">
                    <table className="tbl w-full text-sm min-w-[720px]">
                        <thead>
                            <tr>
                                <th className="th">Student</th>
                                <th className="th">Status</th>
                                <th className="th">Time left</th>
                                <th className="th">Integrity events</th>
                                <th className="th"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr><td colSpan={5} className="td text-center text-muted py-8">No students enrolled in this exam.</td></tr>
                            )}
                            {rows.map(r => {
                                const highlighted = r.status === 'in_progress' && (r.integrityCount > 0 || r.flagged);
                                return (
                                    <tr key={r.studentId} className={highlighted ? 'bg-accent/8' : ''}>
                                        <td className="td">
                                            <p className="font-extrabold text-ink">{r.studentName}</p>
                                            <p className="text-xs text-muted">{r.studentEmail}</p>
                                            {r.flagged && <span className="chip bg-danger/10 border border-danger/25 text-danger mt-1">flagged for review</span>}
                                        </td>
                                        <td className="td">
                                            <span className={`chip ${statusPill(r.status)}`}>{r.status === 'not_started' ? 'not started' : r.status.replace('_', ' ')}</span>
                                        </td>
                                        <td className="td font-mono font-extrabold text-ink">
                                            {r.status === 'in_progress' ? fmt(r.remainingSeconds) : '—'}
                                        </td>
                                        <td className="td">
                                            {r.integrityCount > 0
                                                ? <span className={`chip ${highlighted ? 'bg-danger/10 text-danger border border-danger/25' : 'bg-warm/12 text-warm-ink border border-warm/40'}`}>{r.integrityCount}</span>
                                                : <span className="text-muted">0</span>}
                                        </td>
                                        <td className="td text-right whitespace-nowrap">
                                            {r.attemptId && (
                                                <>
                                                    <Link to={`/instructor/exams/${examId}/attempts/${r.attemptId}`} className="text-accent hover:text-accent-strong hover:underline font-semibold text-xs">Review</Link>
                                                    {r.status === 'in_progress' && (
                                                        <button onClick={() => void extendTime(r)} disabled={extendBusy === r.attemptId} className="ml-2 btn-light px-2.5 py-1 text-xs border-ok/30 text-ok">+ Extend</button>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <p className="text-xs text-muted">Rows turn red while a student is in progress and already flagged by the AI. “+ Extend” adds time live.</p>
        </div>
    );
}