# Exam Integrity Platform (ExamTech Zambia)

Secure online examinations: timed delivery, browser lockdown, on-device AI proctoring, automatic marking,
instructor review tools, answer-similarity checks and Moodle (LTI) integration.

**Stack:** React 19 + TypeScript + Vite + Tailwind (client) · Node/Express 5 + socket.io (server) · PostgreSQL.

## What is implemented

| Capability | Where |
| --- | --- |
| Timed exams, autosave, offline queue, auto-submit on timeout | `client/src/pages/student/ExamPage.tsx`, `client/src/lib/offline.ts` |
| Browser lockdown: full-screen enforcement, tab-visibility tracking, paste blocked, context menu disabled | `ExamPage.tsx` |
| On-device AI proctoring (MediaPipe): no face, multiple faces, gaze away, phone, voice | `client/src/lib/proctor.ts` |
| Webcam snapshots (~60 s) + event timeline | `server/src/routes/attempts/snapshots.ts`, `integrity.ts` |
| Rule engine with per-exam policy: `auto_submit` or `flag_only` (human review, exam continues) | `integrity.ts`, `exams.proctoring_policy` |
| Automatic marking (MCQ) + manual marking (essay/practical) | `attempts.ts`, `instructor.ts` |
| Answer similarity check between students (word 3-gram Jaccard) | `server/src/lib/similarity.ts`, `/api/instructor/similarity/:examId`, Gradebook > Similarity |
| Moodle / LMS integration: LTI 1.1 launch + grade return | `server/src/lib/lti.ts`, `server/src/routes/lti.ts` |
| Live monitoring, gradebook, analytics, violation tracker, groups, accommodations | instructor pages |

### Known limits
- Software-only proctoring cannot see a second device outside the camera and can false-flag (lighting, movement).
  Use `flag_only` for high-stakes exams so a human decides.
- The similarity check compares students *within one exam*; it is not an internet plagiarism database.
- LTI is 1.1 (Moodle "External tool"); LTI 1.3 is not implemented. Verify against your Moodle before a pilot.
- Free-tier hosting is not in-country. For Data Protection Act compliance deploy to Zambian infrastructure.

## Run locally
```bash
psql "$DATABASE_URL" -f server/database/schema.sql && psql "$DATABASE_URL" -f server/database/migrations.sql
cd server && cp .env.example .env && npm install && npm run seed && npm run build && npm start
cd client && cp .env.example .env && npm install && npm run dev
cd server && npm test        # unit tests (similarity, LTI signing)
```
Apply new migrations to an existing database: `node server/scripts/migrate-live.mjs` (needs `DATABASE_URL`).

## Moodle (LTI 1.1) setup
1. Set `LTI_CONSUMER_KEY`, `LTI_SHARED_SECRET`, `PUBLIC_API_URL`, `CLIENT_URL` on the server (see `server/.env.example`).
2. In Moodle: *Site administration > Plugins > Activity modules > External tool > Manage tools > configure a tool manually*.
   Tool URL `<PUBLIC_API_URL>/api/lti/launch`, LTI 1.1, the key/secret above, accept grades from the tool, share name and email.
3. Add an *External tool* activity to a course with custom parameter `exam_id=<ExamTech exam id>`.
4. Learners land on the exam consent page (accounts are created on first launch). Scores return to the Moodle gradebook on
   submission; instructors can re-send all scores with `POST /api/lti/sync/:examId`.

`GET /api/lti/config` shows the values to enter in the LMS.

## Security notes
- `JWT_SECRET` is mandatory in production (the server refuses to start without it).
- Self-registration is limited to student/instructor; auth endpoints are rate limited; Helmet is enabled.
- Snapshot and integrity-event endpoints accept only the owning student's attempt.
- Snapshots are stored under `UPLOADS_DIR`; mount a persistent volume (Render free disks are ephemeral).
