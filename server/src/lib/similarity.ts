// Text similarity used for the plagiarism / collusion check between students' written answers.
// Method: normalise -> word 3-gram shingles -> Jaccard similarity. Pure functions, no I/O.

export function normalise(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

export function shingles(words: string[], size = 3): Set<string> {
    const out = new Set<string>();
    if (words.length < size) {
        if (words.length) out.add(words.join(' '));
        return out;
    }
    for (let i = 0; i <= words.length - size; i++) out.add(words.slice(i, i + size).join(' '));
    return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    for (const s of small) if (large.has(s)) inter++;
    return inter / (a.size + b.size - inter);
}

export interface AnswerInput {
    attemptId: number;
    questionId: number;
    text: string;
}

export interface SimilarityMatch {
    questionId: number;
    attemptA: number;
    attemptB: number;
    similarity: number; // 0..1
}

export function findSimilar(
    answers: AnswerInput[],
    opts: { threshold?: number; minWords?: number } = {}
): SimilarityMatch[] {
    const threshold = opts.threshold ?? 0.6;
    const minWords = opts.minWords ?? 20;

    const byQuestion = new Map<number, { attemptId: number; sh: Set<string> }[]>();
    for (const a of answers) {
        const words = normalise(a.text || '');
        if (words.length < minWords) continue;
        const list = byQuestion.get(a.questionId) || [];
        list.push({ attemptId: a.attemptId, sh: shingles(words) });
        byQuestion.set(a.questionId, list);
    }

    const matches: SimilarityMatch[] = [];
    for (const [questionId, list] of byQuestion) {
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                if (list[i].attemptId === list[j].attemptId) continue;
                const similarity = jaccard(list[i].sh, list[j].sh);
                if (similarity >= threshold) {
                    matches.push({ questionId, attemptA: list[i].attemptId, attemptB: list[j].attemptId, similarity: Number(similarity.toFixed(3)) });
                }
            }
        }
    }
    return matches.sort((x, y) => y.similarity - x.similarity);
}
