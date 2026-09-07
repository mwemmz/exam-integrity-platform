# User Acceptance Testing (UAT) — Exam Integrity Platform

## Purpose
Verify that the Exam Integrity Platform is ready for production by covering every user journey
through scripted, hands-on testing. Each of the **7 developers** owns one module and executes the
test cases below against the **live production deployment**, then records the results.

## Environment & Test Data
| Item | Value |
| --- | --- |
| Client URL | https://exam-integrity-client.onrender.com |
| Server URL (API) | https://exam-integrity-server.onrender.com |
| Instructor account | `instructor@demo.com` / `password123` |
| Student account | `student@demo.com` / `password123` |
| Admin account | `admin@demo.com` / `password123` |
| Seed data | 4 published exams, **all with a 2-minute time limit**: Demo Exam, Math Fundamentals, Computer Science Essentials, English Composition |
| Demo groups | Morning Section = student / alice / carla / eve; Afternoon Section = bob / david (for group-visibility + accommodation tests) |
| Live monitoring | Requires the instructor **Live Dashboard** and the student's exam open in **separate browsers** (socket.io real-time) |
| Proctoring | Best tested in Chrome/Edge with camera + microphone; MediaPipe/AI load from CDN at runtime |

## Team Assignments
| Developer | Module |
| --- | --- |
| Dev 1 | Authentication & Access Control |
| Dev 2 | Student — Exam Discovery & Consent (incl. group visibility & accommodations) |
| Dev 3 | Student — Exam Taking (Timer, Auto-save, Offline, Live Events: messages / extensions / reopen) |
| Dev 4 | Student — AI Proctoring & Integrity Monitoring |
| Dev 5 | Instructor — Exam Builder, Publishing, Question Bank, Duplicate, Groups & Assignments |
| Dev 6 | Instructor — Gradebook, Grading, Attempt Review, Live Monitoring, Bulk Actions & Violation Tracker |
| Dev 7 | Admin System, Responsiveness & Production Health |

## How to record results
For every test case fill in the **Actual Result** column (Pass / Fail / Observation) and a note in
**Remarks** (device/browser, error message, screenshot link). Test cases are listed in order —
execute them in that order where there is a dependency.

---

## Dev 1 — Authentication & Access Control

| Test Case ID | Test Case Title | Procedure | Expected Result | Actual Result | Remarks |
| --- | --- | --- | --- | --- | --- |
| TC-01-01 | Valid student login | Open client URL, enter `student@demo.com` / `password123`, click Log in. | Student is taken to the "My Exams" dashboard showing the 4 seeded exams. | | |
| TC-01-02 | Valid instructor login | Log out, log in as `instructor@demo.com` / `password123`. | Instructor Dashboard loads with the 4 exams listed. | | |
| TC-01-03 | Invalid credentials rejected | Log in with a wrong password. | Error banner shown ("Invalid email or password"-style), no navigation occurs. | | |
| TC-01-04 | Validation for blank / short password | Clear the password and submit; register a new account with a 3-character password. | Form validation blocks submit (required, min 6 chars). | | |
| TC-01-05 | Register a new student | Register a brand-new account with role Student. | Account created, user auto-logged in and lands on the student dashboard. | | |
| TC-01-06 | Register a new instructor | Register a new account with role Instructor. | User lands on the instructor dashboard. | | |
| TC-01-07 | Route protection (unauthenticated) | In an incognito window, visit `/student`, `/instructor`, `/admin`. | All redirect to the login page. | | |
| TC-01-08 | Role-based route guarding | Log in as student and try to visit `/instructor` and `/admin` by URL. | Redirected away / access denied; student cannot reach instructor or admin pages. | | |
| TC-01-09 | Log out | Click **Log out** from any dashboard. | Session cleared; user returns to login; back button does not restore the app. | | |
| TC-01-10 | Session persists on refresh | Log in as student, refresh the page. | Still logged in; dashboard loads without re-entering credentials. | | |

## Dev 2 — Student: Exam Discovery & Consent

| Test Case ID | Test Case Title | Procedure | Expected Result | Actual Result | Remarks |
| --- | --- | --- | --- | --- | --- |
| TC-02-01 | Dashboard lists published exams | Log in as student. | Exactly the 4 published exams appear with title, description and "2 minutes" time limit. | | |
| TC-02-02 | Start Exam navigates to consent | Click **Start Exam** on "Demo Exam". | Consent page opens with the exam title. | | |
| TC-02-03 | Consent page content | Read the consent page. | Lists tab-switch, full-screen, paste-blocking, optional webcam (snapshots + face AI) and optional microphone (voice) monitoring. | | |
| TC-02-04 | Begin without any consent boxes | Do NOT tick webcam/audio, click "I understand and agree to begin". | Exam starts immediately; works with no camera/mic prompts. | | |
| TC-02-05 | Begin with webcam consent | Tick the webcam box and begin; grant camera in the browser prompt. | Exam starts; browser permission prompt appears for the camera. | | |
| TC-02-06 | Begin with audio consent | Tick microphone, begin, grant microphone. | Exam starts; mic permission granted; no camera prompt. | | |
| TC-02-07 | Denying camera / mic still works | Begin with both boxes ticked but deny both permissions. | Exam still starts; page shows "camera/mic not granted — continuing without" notices. | | |
| TC-02-08 | Fullscreen request | Begin an exam. | Browser attempts to enter full-screen (may require a one-time user gesture/approval in Firefox/Safari). | | |
| TC-02-09 | Group-assigned exam visibility | Log in as `student@demo.com` (Morning Section) and, separately, as a student outside that group. | An exam assigned to Morning Section shows only for its members on the student dashboard. | | |
| TC-02-10 | Accommodation reflected on consent | As instructor, set `+1 min` extra time for `eve@demo.com` on an exam (TC-05-13), then start that exam as eve. | Consent page shows the student's adjusted time limit (e.g. 3 minutes) instead of the default 2. | | |

## Dev 3 — Student: Exam Taking (Timer, Auto-save, Offline)

| Test Case ID | Test Case Title | Procedure | Expected Result | Actual Result | Remarks |
| --- | --- | --- | --- | --- | --- |
| TC-03-01 | Questions render correctly | Start the Demo Exam. | 1 MCQ + 1 essay + 1 practical question shown in order with points badges. | | |
| TC-03-02 | MCQ selection (multiple-select) | Tick two options on the MCQ; tick and untick one. | Selection toggles; answer reflects the final selection. | | |
| TC-03-03 | Text answers & paste blocking | Type in the essay/practical fields; try to paste text and right-click. | Typing works; paste and right-click menu are blocked. | | |
| TC-03-04 | Countdown timer runs | Start Math Fundamentals (2-min limit) and watch the header timer. | Timer counts down each second; turns red under 60s. | | |
| TC-03-05 | Timer hits zero = auto-submit | Leave the exam open until the timer reaches 0. | Exam auto-submits; user is taken to results/status page. | | |
| TC-03-06 | Auto-save every 15 seconds | Type an answer, wait ~15s, then refresh the page mid-exam. | Answer is still there after refresh (auto-save worked). | | |
| TC-03-07 | Offline — answer still saved | In DevTools set Network to **Offline**, keep typing answers, refresh. | Answers typed while offline remain after refresh; an amber "You're offline — answers are saved on this device" banner shows. | | |
| TC-03-08 | Offline — auto-sync on reconnect | While offline, type an answer, then switch Network back to **Online**. | Banner disappears within ~8s; interrupted answers are silently pushed to the server. | | |
| TC-03-09 | Offline submit is blocked safely | While offline press Submit Exam. | No data loss; red notice appears: "You're offline… Reconnect and press Submit again." | | |
| TC-03-10 | Submit with confirmation | On Online, press Submit Exam. | Confirmation dialog; on OK, exam submits and results page opens. | | |
| TC-03-11 | Cannot start from a stale attempt | After submitting, click Start Exam for the same exam again. | A new attempt starts fresh (previous one is not overwritten). | | |
| TC-03-12 | Instructor live message appears | While taking an exam, have the instructor send a broadcast message from the Live Dashboard (TC-06-16). | A dismissible banner appears at the top of the exam without interrupting or blocking answers. | | |
| TC-03-13 | Time extension updates the countdown | Have the instructor extend this attempt's time while it is running (TC-06-17). | The header countdown immediately gains the added minutes and continues counting down. | | |
| TC-03-14 | Reopened attempt resumes automatically | After an auto-submit locks the screen, have the instructor un-flag and reopen it (TC-06-13). | The lock screen clears; the exam resumes from where the student left off with the new deadline. | | |

## Dev 4 — Student: AI Proctoring & Integrity Monitoring

| Test Case ID | Test Case Title | Procedure | Expected Result | Actual Result | Remarks |
| --- | --- | --- | --- | --- | --- |
| TC-04-01 | AI monitoring indicator | Start an exam with webcam consent (camera granted). | Header shows "Starting AI monitoring…" then "AI monitoring active". | | |
| TC-04-02 | Tab-switch recorded | While in the exam, switch to another browser tab for 3 seconds and return. | Header note states tab switches are recorded; no immediate lock-out for one switch. | | |
| TC-04-03 | Leaving full-screen recorded | Exit full-screen (Esc) and re-enter within ~10s. | Exam continues; the exit is logged server-side (instructor can see it in Attempt Review). | | |
| TC-04-04 | Face missing — flag only (short) | Look away so the face detector loses you for < 15s. | One `face_missing` event logged; exam continues (under the auto-submit threshold). | | |
| TC-04-05 | Face missing — auto-submit (>90s cumulative) | Consistently avoid the camera so accumulated face-missing exceeds 90 seconds. | Exam auto-submits; user sees the "Exam submitted automatically — No face detected for more than 90 seconds in total" screen. | | |
| TC-04-06 | Multiple faces auto-submit (>30s) | Have a second person appear beside you for >30s. | Auto-submit triggers with the multiple-faces rule message. | | |
| TC-04-07 | Phone / media device flagged | Hold a phone in frame briefly (not a face to another person). | `phone_detected` event recorded; exam does NOT auto-submit (flag-only). | | |
| TC-04-08 | Voice / loud noise flagged | Talk loudly near the microphone for ~5s. | `voice_detected` recorded; exam continues (flag-only). | | |
| TC-04-09 | Snapshots uploaded | Check the server-side attempt record after an exam (with webcam). | Snapshots appear in the attempt review filmstrip at ~60s intervals. | | |
| TC-04-10 | Camera unavailable — graceful | Deny camera before starting; start anyway. | AI chip shows "AI monitoring unavailable"; exam proceeds with only tab/fullscreen logging. | | |

## Dev 5 — Instructor: Exam Builder & Publishing

| Test Case ID | Test Case Title | Procedure | Expected Result | Actual Result | Remarks |
| --- | --- | --- | --- | --- | --- |
| TC-05-01 | Create exam — validation | Log in as instructor, click **+ New Exam**, submit with no title or no questions. | Blocked with a clear error ("title and at least one question required"). | | |
| TC-05-02 | Add an MCQ question | Add MCQ, enter prompt, options comma-separated, tick the correct option, set points. | Question added with blue "mcq" badge; correct answers tracked. | | |
| TC-05-03 | Add essay + practical questions | Add both other question types. | Essay (pink) and practical (orange) badges shown; prompts editable. | | |
| TC-05-04 | Create a 2-minute exam | Set time limit to 2, create the exam. | Exam appears in the list with "Publish" button; time limit displayed. | | |
| TC-05-05 | Publish / unpublish toggles | Click **Publish**, then **Unpublish**. | Status chip flips published ↔ draft; student dashboard reflects the change (only published visible). | | |
| TC-05-06 | Release / hide grades | After grading (see Dev 6), click **Release grades** then **Hide grades**. | Chip flips "grades released" ↔ "grades hidden"; students see/hide results accordingly. | | |
| TC-05-07 | Exam builder mobile | Open the builder on a phone-width window. | Form grid stacks to 1 column; all inputs usable. | | |
| TC-05-08 | Save a question to the bank | In the builder, open **Question Bank → Add**, create an MCQ, save. | Question appears in the question bank list with its type badge. | | |
| TC-05-09 | Search + import from the bank | Search the bank by keyword, then **Import** a question into the builder, and again into a new exam. | Imported question appears with prompt/options/points; it can be used in multiple exams. | | |
| TC-05-10 | Duplicate an exam | Click **Duplicate** on Math Fundamentals. | A new draft "… (copy)" appears with the same questions, settings and time limit; original unchanged. | | |
| TC-05-11 | Assign an exam to a group | Assign a new exam to the Morning Section group only. | Only members of that group see the exam; publish state still gates visibility. | | |
| TC-05-12 | Webcam/audio toggles | Create an exam with webcam **off** and audio **on**; start it as a student. | Consent page shows microphone monitoring but no webcam box; no camera permission prompt appears. | | |
| TC-05-13 | Per-student accommodation | On an exam open **Accommodations**, add `+1 min` extra time for `eve@demo.com`. | Saves without affecting other settings; student eve sees the adjusted limit on consent (TC-02-10). | | |

## Dev 6 — Instructor: Gradebook, Grading & Attempt Review

| Test Case ID | Test Case Title | Procedure | Expected Result | Actual Result | Remarks |
| --- | --- | --- | --- | --- | --- |
| TC-06-01 | Gradebook lists attempts | Have the student sit "Math Fundamentals", then open Gradebook from the exam card. | Attempt rows show student name/email, status badge, score (or —), submitted time, Review link. | | |
| TC-06-02 | Attempt detail — answers overview | Open **Review →** for the attempt. | Header shows student name, exam, status, submitted time, total badge; answer list matches question types. | | |
| TC-06-03 | MCQ auto-grading shown | Inspect the MCQ question in review. | Correct options marked ✓, incorrect choice marked ✗, auto-score shown (e.g. 5/5). | | |
| TC-06-04 | Manual grade an essay | Enter a score (max points) + feedback, click **Save**. | "Saved" confirmation appears; total points update on the page. | | |
| TC-06-05 | Integrity timeline renders | Open the attempt review for an auto-submitted attempt, or one with events. | Color-coded timeline: red (no face/multi-face/auto-submit), amber (phone/voice/gaze/tab/fullscreen), gray (paste). Summary chips show counts. | | |
| TC-06-06 | Webcam snapshot filmstrip | Open review of an attempt with webcam enabled. | Snapshot thumbnails render from the server with timestamps; strip scrolls horizontally on mobile. | | |
| TC-06-07 | Grade release reflects for student | Release grades, then log in as student and open the attempt result. | Results page shows total score and per-question scores after release. | | |
| TC-06-08 | Grades hidden until release | Before releasing, open the result as the student. | "Grades not released yet" screen is shown instead of scores. | | |
| TC-06-09 | Gradebook row checkboxes | Open a gradebook and tick several rows + the header select-all. | Selected count updates; flagged rows keep their chips when selected. | | |
| TC-06-10 | Bulk flag for review | Tick rows, click **Flag for review**. | Rows gain the amber "flagged" chip; the attempts show as unresolved in the Violations tracker. | | |
| TC-06-11 | Bulk release grades | Tick rows, click **Release grades** and confirm. | Selected students see their scores immediately; gradebook header no longer shows "grades hidden". | | |
| TC-06-12 | Gradebook CSV export | Click **Export CSV**. | A CSV file downloads with one row per attempt incl. email, score, status and flag info. | | |
| TC-06-13 | Un-flag and reopen an attempt | On an auto-submitted attempt click **Un-flag and reopen**, enter a reason. | Attempt flips back to in-progress; the reason appears in the event timeline; student can resume (TC-03-14). | | |
| TC-06-14 | Private instructor note | On an attempt add a note under **Instructor notes (private)**. | Note shows with instructor name + timestamp; logging in as the student shows no notes anywhere. | | |
| TC-06-15 | Live dashboard rows | Keep a student mid-exam, open the **Live Dashboard**. | Attempt appears with name, status, score and violation counts; rows update via socket without a page refresh. | | |
| TC-06-16 | Live dashboard message | From Live Dashboard send a broadcast message (and one to a single student). | Student sees the banner in real time (TC-03-12); message is stored in the message list. | | |
| TC-06-17 | Live dashboard extend time | Click extend (+1 min) on a running attempt. | Confirm dialog; attempt's deadline extends; student countdown updates live (TC-03-13). | | |
| TC-06-18 | Violations tracker filtering | Open Violations; filter by exam, type, date range; toggle flagged-only; change sort. | List narrows correctly; summary chips (total / by type) match the filtered set; **Mark reviewed** clears an item. | | |
| TC-06-19 | Analytics page | Open Analytics for an exam with attempts. | Overall cards (average, participation) + per-question table (avg score, attempts, spread) render from real data. | | |

## Dev 7 — Admin System, Responsiveness & Production Health

| Test Case ID | Test Case Title | Procedure | Expected Result | Actual Result | Remarks |
| --- | --- | --- | --- | --- | --- |
| TC-07-01 | Admin-only API is protected | As student, visit the Admin page or call `GET /api/admin/users` (via console) without an admin token. | 403/redirect; admin API is not reachable by non-admin roles. | | |
| TC-07-02 | Admin dashboard list | Log in with `admin@demo.com` / `password123` and open the admin page. | Institutions and users tables render with role chips (cyan/blue/emerald). | | |
| TC-07-03 | Server health endpoint | Visit https://exam-integrity-server.onrender.com/ | Returns OK/JSON health payload (HTTP 200). | | |
| TC-07-04 | Root 404 handled | Visit a nonexistent API path, e.g. `/api/nope` and unknown route on the client. | Clean JSON error for API; client shows its own not-found/fallback (no raw stack trace). | | |
| TC-07-05 | Mobile login page | Load the login page on a 375px-wide viewport (or phone). | Layout fits; no horizontal scroll; card fits the screen. | | |
| TC-07-06 | Mobile gradebook table | Open a gradebook on a phone-width viewport. | Table scrolls horizontally within the card; no page-level horizontal scroll. | | |
| TC-07-07 | Exam flow on mobile | Complete a full 2-minute exam on a phone. | Header/controls compact; pinned timer visible; submit bar full-width with safe-area padding. | | |
| TC-07-08 | Glass UI consistency | Sweep every page on desktop + mobile. | No white-on-white cards; dark glass cards with the sky/cyan accent and glow hover; no purple accents remain. | | |
| TC-07-09 | Performance check | Start an exam and watch the Network tab on a slow connection (e.g. throttled to 3G). | App remains responsive; CDN model files load once; no blocking layout jank on answer typing. | | |
| TC-07-10 | Concurrent students | Open two incognito student sessions and take two different exams simultaneously. | Both run independently with correct timers and no cross-talk of answers. | | |

## Test Summary
| Developer | Module | Cases | Passed | Failed | Blocked | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Dev 1 | Authentication & Access Control | 10 | | | | |
| Dev 2 | Student — Discovery & Consent (groups/accommodations) | 10 | | | | |
| Dev 3 | Student — Taking / Auto-save / Offline / Live Events | 14 | | | | |
| Dev 4 | Student — AI Proctoring & Integrity | 10 | | | | |
| Dev 5 | Instructor — Builder, Question Bank, Duplicate, Groups | 13 | | | | |
| Dev 6 | Instructor — Grading, Live Monitoring, Bulk, Violations | 19 | | | | |
| Dev 7 | Admin / Responsiveness / Health | 10 | | | | |
| **Total** | | **86** | | | | |

## Sign-off
| Developer | Signature | Date |
| --- | --- | --- |
| Dev 1 | | |
| Dev 2 | | |
| Dev 3 | | |
| Dev 4 | | |
| Dev 5 | | |
| Dev 6 | | |
| Dev 7 | | |