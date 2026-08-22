# Build Prompt: Exam Integrity Platform (MVP)

Copy everything below into your coding agent (Claude Code, Cursor, etc.) as the
starting instruction. It describes exactly what to build, in what order, and
what to leave out for now.

---

## Project summary

Build a web application called **Exam Integrity Platform** — a secure online
exam delivery system for educational institutions. The core value is
**reducing exam malpractice**, not any single exam format. The platform must
support **multiple exam types** (multiple choice, essay/written, and a basic
practical/text-submission type) inside one consistent security layer, so it
is not limited to IT/CS or coding exams.

This is a semester/MVP build. Do **not** implement Docker-based code
sandboxing, Judge0, Piston, or any per-submission container execution engine
— that is explicitly out of scope for this phase. Practical exams in this
version are text/file submission based (e.g. paste code or upload a file),
not executed or auto-graded.

## Business context (for the agent's understanding, not to build)

- Target customers: universities, colleges, TEVETA-accredited technical
  colleges, and eventually professional bodies/corporate hiring.
- Revenue model: institutional subscription, per-exam pricing, premium
  add-ons (not part of this build — no billing system needed yet).
- Differentiator vs. Moodle/Proctorio/ProctorU: integrity features are core
  and built-in, not a bolted-on plugin; designed to be lightweight enough to
  run on modest hosting and slower internet connections.

## Tech stack

- **Frontend:** React (Vite), TypeScript, Tailwind CSS
- **Backend:** Node.js with Express (or Fastify), TypeScript
- **Database:** PostgreSQL
- **Auth:** JWT-based session auth, with role-based access control
- **Real-time:** WebSockets (Socket.IO) for live exam monitoring events
- **Hosting target:** Render-friendly — no privileged Docker access, no
  Docker-in-Docker, no long-running child processes spawning containers.
  Everything must run as a normal web service + worker process.

## User roles

1. **Student** — takes exams
2. **Instructor** — creates exams, grades, views integrity reports
3. **Admin** — manages users, institutions, system-wide settings and logs

## Core features — Phase 1 (build this now)

### 1. Authentication & user management
- Email/password login and registration
- Role assignment (student / instructor / admin)
- Password reset flow
- Basic institution/organization grouping (so exams and users are scoped to
  one institution)

### 2. Exam creation (instructor)
- Create an exam with: title, description, time limit, start/end window,
  randomize-question-order toggle
- Add questions of three types:
  - Multiple choice (one or more correct answers, auto-graded)
  - Written/essay (free text, word/character limit, manual grading)
  - Practical/text submission (code or long-form text pasted into a text
    area, or a single file upload; manual grading — **no execution**)
- Set point values per question
- Publish / unpublish an exam
- Duplicate an existing exam

### 3. Exam-taking experience (student)
- Student sees only exams assigned to them, within the active time window
- On start: request full-screen mode; show a clear notice of what is being
  monitored before the exam begins (consent screen)
- Timer visible at all times; auto-submit when time expires
- Auto-save answers periodically (every ~15–30 seconds) so a crash or
  refresh doesn't lose work
- Manual "Submit Exam" button with a confirmation step

### 4. Integrity monitoring (build these, keep them lightweight)
- **Tab/window visibility tracking**: log every time the student switches
  tabs, minimizes, or loses window focus, with a timestamp
- **Full-screen exit detection**: log and warn if the student exits
  full-screen during the exam
- **Copy/paste blocking** on the exam question area (block right-click and
  paste into answer fields; still allow typing)
- **Auto-submission rule engine**: define simple rules (e.g. "more than N
  tab switches" or "full-screen exited for more than X seconds") that flag
  or auto-submit an exam
- Store all monitoring events tied to the student + exam attempt, viewable
  later by the instructor
- **Basic webcam snapshot capture (nice-to-have, build if time allows):**
  request webcam permission on the consent screen, then capture a still
  image from the browser's webcam every 60–90 seconds during the exam and
  upload it tied to the attempt. No live video streaming, no face-detection
  or AI analysis — just periodic snapshots the instructor can flick through
  afterward alongside the integrity timeline. Keep it simple:
  `getUserMedia` → draw a video frame to a canvas → compress to JPEG →
  upload. This keeps bandwidth and storage low and avoids the much harder
  problem of real-time ML-based face/person detection, which stays out of
  scope for this phase (see below).

### 5. Grading & review (instructor)
- Auto-grading for multiple choice
- Manual grading interface for essay and practical/text questions, with a
  score field and optional feedback comment per question
- View a per-student "integrity timeline" for each exam attempt: list of
  tab-switch events, full-screen exits, and any auto-submission triggers,
  in chronological order
- Basic gradebook: table of all students, their scores, and submission
  status for a given exam

### 6. Admin panel
- List/manage users and their roles
- List/manage institutions
- View system-wide exam activity log (who created what, who took what,
  when)

## Explicitly out of scope for this build (do not implement)

- Docker/container-based code execution or sandboxing (Judge0, Piston, or
  custom)
- Live webcam video streaming, AI face/person detection, or any ML-based
  proctoring analysis (periodic still-image snapshots are in scope — see
  above; analyzing them automatically is not)
- Device fingerprinting beyond basic browser/user-agent logging
- Plagiarism/similarity detection against external sources
- Payments/billing
- LMS integrations (Moodle, Canvas, etc.)
- Mobile apps (web-responsive is enough)

## Data model (starting point — adjust as needed)

- `institutions` (id, name)
- `users` (id, institution_id, name, email, password_hash, role)
- `exams` (id, institution_id, instructor_id, title, description,
  time_limit_minutes, starts_at, ends_at, randomize_order, published)
- `questions` (id, exam_id, type [mcq|essay|practical], prompt, points,
  order_index, options JSON for mcq, correct_answer JSON for mcq)
- `exam_attempts` (id, exam_id, student_id, started_at, submitted_at, status
  [in_progress|submitted|auto_submitted], total_score)
- `answers` (id, attempt_id, question_id, response_text or file_url,
  auto_score, manual_score, feedback)
- `integrity_events` (id, attempt_id, event_type [tab_switch|fullscreen_exit|
  paste_blocked|auto_submit_triggered], timestamp, metadata JSON)
- `webcam_snapshots` (id, attempt_id, image_url, captured_at)

## Screens to build

**Student:** Login → Dashboard (list of available exams) → Exam consent
screen → Exam-taking screen → Submission confirmation → Results (once
released)

**Instructor:** Login → Dashboard (my exams) → Exam builder (add/edit
questions) → Gradebook per exam → Attempt detail view (answers +
integrity timeline + webcam snapshot filmstrip, if enabled)

**Admin:** Login → Users list → Institutions list → System activity log

## Non-functional requirements

- Works reasonably well on slower connections — avoid heavy real-time video,
  keep payloads small, paginate long lists
- Responsive layout (works on laptop and tablet screen sizes at minimum)
- Clear, honest UI copy on the consent screen — tell students exactly what
  is tracked: tab switches, full-screen exits, paste blocking, and (if
  enabled for that exam) periodic webcam snapshots. Students must explicitly
  grant camera permission; if they decline, let them still take the exam
  without snapshots rather than blocking them entirely
- Basic input validation and error handling throughout; don't let an exam
  attempt silently fail to save

## Build order (suggested)

1. Project scaffold (frontend + backend + Postgres schema/migrations)
2. Auth + user roles + institutions
3. Exam creation (instructor) with all three question types
4. Exam-taking flow (student) with auto-save and timer
5. Integrity event logging (tab switch, full-screen exit, paste blocking)
6. Webcam snapshot capture and storage (optional toggle per exam)
7. Auto-submission rule engine
8. Grading interface + gradebook
9. Admin panel
10. Polish: consent screen copy, empty states, error handling, responsive
    pass

## Acceptance criteria for "done" on this phase

- An instructor can create an exam with all three question types and
  publish it
- A student can log in, see the exam, take it with the timer running, have
  answers auto-save, and submit (manually or via auto-submit)
- Tab switches and full-screen exits during the exam are logged and visible
  to the instructor afterward
- The instructor can grade essay/practical answers manually and see a
  gradebook
- Everything runs as a standard web service with a Postgres database — no
  container orchestration, no code execution engine
- If webcam snapshots are enabled for an exam, the instructor can open an
  attempt and see the captured images in order alongside the integrity
  timeline
