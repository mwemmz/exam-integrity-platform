const PREFIX = 'exam-offline:';

export function isOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine;
}

export function loadAnswers(attemptId: string): Record<number, string> {
    try {
        const raw = localStorage.getItem(`${PREFIX}answers:${attemptId}`);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export function persistAnswers(attemptId: string, answers: Record<number, string>): void {
    try {
        localStorage.setItem(`${PREFIX}answers:${attemptId}`, JSON.stringify(answers));
    } catch {
        // storage full or unavailable: best-effort only
    }
}

export function clearAnswers(attemptId: string): void {
    try {
        localStorage.removeItem(`${PREFIX}answers:${attemptId}`);
    } catch {
        // ignore
    }
}

export function loadDirty(attemptId: string): Set<number> {
    try {
        const raw = localStorage.getItem(`${PREFIX}dirty:${attemptId}`);
        return new Set<number>(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
}

export function persistDirty(attemptId: string, dirty: Set<number>): void {
    try {
        localStorage.setItem(`${PREFIX}dirty:${attemptId}`, JSON.stringify(Array.from(dirty)));
    } catch {
        // ignore
    }
}

export function clearDirty(attemptId: string): void {
    try {
        localStorage.removeItem(`${PREFIX}dirty:${attemptId}`);
    } catch {
        // ignore
    }
}