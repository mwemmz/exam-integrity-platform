import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

const BASE = import.meta.env.VITE_API_BASE_URL || '';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
    if (socket && socket.connected) return socket;
    const token = getToken();
    if (!token) return null;
    socket = io(BASE, { auth: { token }, transports: ['websocket', 'polling'] });
    return socket;
}

export function joinExamRoom(examId: string | number): void {
    getSocket()?.emit('join_exam_room', examId);
}

export function leaveExamRoom(examId: string | number): void {
    getSocket()?.emit('leave_exam_room', examId);
}

export interface ExamMessagePayload {
    id: number;
    examId: number;
    instructorId: number;
    studentId: number | null;
    message: string;
    sentAt: string;
}

export interface TimeExtendedPayload {
    attemptId: number;
    endTime: string;
    minutes: number;
}

export interface AttemptUpdatePayload {
    attemptId: number | null;
    status: string | null;
    remainingSeconds: number;
    integrityCount: number;
    flagged: boolean;
    studentId: number;
    studentName: string;
    studentEmail: string;
    endTime: string | null;
    reopened?: boolean;
}