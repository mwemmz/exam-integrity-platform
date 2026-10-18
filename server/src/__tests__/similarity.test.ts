import test from 'node:test';
import assert from 'node:assert/strict';
import { findSimilar, jaccard, shingles, normalise } from '../lib/similarity';

const essay = 'The market economy allocates resources through prices and competition between firms which respond to consumer demand over time and across regions';

test('identical answers score 1', () => {
    const s = shingles(normalise(essay));
    assert.equal(jaccard(s, s), 1);
});

test('copied answer with light edits is flagged, unrelated answer is not', () => {
    const copied = essay.replace('allocates', 'distributes').replace('regions', 'areas');
    const other = 'Photosynthesis converts light energy into chemical energy stored in glucose inside the chloroplasts of green plant cells during daylight hours';
    const m = findSimilar([
        { attemptId: 1, questionId: 10, text: essay },
        { attemptId: 2, questionId: 10, text: copied },
        { attemptId: 3, questionId: 10, text: other }
    ], { threshold: 0.5 });
    assert.equal(m.length, 1);
    assert.deepEqual([m[0].attemptA, m[0].attemptB], [1, 2]);
});

test('short answers and different questions are ignored', () => {
    assert.equal(findSimilar([
        { attemptId: 1, questionId: 1, text: 'yes it is' },
        { attemptId: 2, questionId: 1, text: 'yes it is' }
    ]).length, 0);
    assert.equal(findSimilar([
        { attemptId: 1, questionId: 1, text: essay },
        { attemptId: 2, questionId: 2, text: essay }
    ]).length, 0);
});
