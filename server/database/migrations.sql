-- Migration: expanded instructor tools + violation tracker
-- Idempotent: safe to run repeatedly against a live DB.

-- 1. Question bank (institution-scoped)
CREATE TABLE IF NOT EXISTS question_bank (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER REFERENCES institutions(id),
    instructor_id INTEGER REFERENCES users(id),
    type VARCHAR(50) NOT NULL, -- mcq, essay, practical
    prompt TEXT NOT NULL,
    points INTEGER NOT NULL,
    options JSONB,       -- for mcq
    correct_answer JSONB, -- for mcq
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Student groups + members
CREATE TABLE IF NOT EXISTS student_groups (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER REFERENCES institutions(id),
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS student_group_members (
    group_id INTEGER REFERENCES student_groups(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, student_id)
);

-- 3. Exam assignments (exam visible to these groups; empty = whole institution)
CREATE TABLE IF NOT EXISTS exam_assignments (
    exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES student_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (exam_id, group_id)
);

-- 4. Per-student accommodations
CREATE TABLE IF NOT EXISTS exam_accommodations (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    extra_time_minutes INTEGER DEFAULT 0,
    custom_start_at TIMESTAMP,
    custom_end_at TIMESTAMP,
    UNIQUE (exam_id, student_id)
);

-- 5. Mid-exam messages
CREATE TABLE IF NOT EXISTS exam_messages (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
    instructor_id INTEGER REFERENCES users(id),
    student_id INTEGER REFERENCES users(id), -- NULL = broadcast to everyone
    message TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Internal instructor notes on attempts
CREATE TABLE IF NOT EXISTS attempt_notes (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES exam_attempts(id) ON DELETE CASCADE,
    instructor_id INTEGER REFERENCES users(id),
    note_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. exam_attempts additions
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN DEFAULT FALSE;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id);

-- 8. exams additions (create + duplicate routes reference these)
ALTER TABLE exams ADD COLUMN IF NOT EXISTS webcam_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS audio_enabled BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_integrity_attempt ON integrity_events (attempt_id);
CREATE INDEX IF NOT EXISTS idx_integrity_type ON integrity_events (event_type);
CREATE INDEX IF NOT EXISTS idx_integrity_timestamp ON integrity_events ("timestamp");
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON exam_attempts (exam_id);