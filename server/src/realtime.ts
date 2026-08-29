import { Server, Socket } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import { pool } from './db';

let io: Server | null = null;

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export function initRealtime(server: http.Server): Server {
    io = new Server(server, { cors: { origin: '*' }, transports: ['websocket', 'polling'] });

    io.use((socket, next) => {
        try {
            const token = (socket.handshake.auth && (socket.handshake.auth as any).token) ||
                (socket.handshake.query.token as string);
            if (token) {
                const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
                (socket as any).data.user = decoded;
            }
        } catch {
            // unauthenticated sockets are allowed but get no rooms
        }
        next();
    });

    io.on('connection', (socket: Socket) => {
        const user = (socket as any).data.user;
        if (user) {
            socket.join(`user:${user.userId}`);
            socket.join(`role:${user.role}`);
            socket.on('join_exam_room', (examId: string | number) => {
                socket.join(`exam:${examId}`);
            });
            socket.on('leave_exam_room', (examId: string | number) => {
                socket.leave(`exam:${examId}`);
            });
        }
    });

    return io;
}

export function getIO(): Server | null {
    return io;
}

export function emitToExam(examId: string | number, event: string, payload: unknown): void {
    io?.to(`exam:${examId}`).emit(event, payload);
}

export interface LiveAttemptPayload {
    attemptId: number | null;
    status: string | null;
    remainingSeconds: number;
    integrityCount: number;
    flagged: boolean;
    studentId: number;
    studentName: string;
    studentEmail: string;
    endTime: string | null;
}

export async function fetchLiveAttempt(examId: string | number, attemptId: string | number): Promise<LiveAttemptPayload | null> {
    const result = await pool.query(
        `SELECT u.id AS student_id, u.name AS student_name, u.email AS student_email,
                a.id AS attempt_id, a.status, a.end_time, a.flagged_for_review
         FROM exam_attempts a JOIN users u ON a.student_id = u.id
         WHERE a.id = $1 AND a.exam_id = $2`,
        [attemptId, examId]
    );
    if (!result.rows.length) return null;
    const r = result.rows[0];
    return {
        attemptId: r.attempt_id,
        status: r.status,
        remainingSeconds: r.status === 'in_progress' && r.end_time
            ? Math.max(0, Math.round((new Date(r.end_time).getTime() - Date.now()) / 1000))
            : 0,
        integrityCount: 0,
        flagged: !!r.flagged_for_review,
        studentId: r.student_id,
        studentName: r.student_name,
        studentEmail: r.student_email,
        endTime: r.end_time
    };
}

export async function broadcastAttemptUpdate(examId: string | number, attemptId: string | number): Promise<void> {
    try {
        const live = await fetchLiveAttempt(examId, attemptId);
        const count = await pool.query('SELECT COUNT(*)::int AS n FROM integrity_events WHERE attempt_id = $1', [attemptId]);
        if (live) {
            live.integrityCount = count.rows[0].n;
            emitToExam(examId, 'attempt_update', live);
        }
    } catch {
        // best-effort realtime push
    }
}