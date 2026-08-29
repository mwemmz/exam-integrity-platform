-- Schema for Exam Integrity Platform

CREATE TABLE institutions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER REFERENCES institutions(id),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL -- student, instructor, admin
);

CREATE TABLE exams (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER REFERENCES institutions(id),
    instructor_id INTEGER REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    time_limit_minutes INTEGER,
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    randomize_order BOOLEAN DEFAULT FALSE,
    published BOOLEAN DEFAULT FALSE
);

CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER REFERENCES exams(id),
    type VARCHAR(50) NOT NULL, -- mcq, essay, practical
    prompt TEXT NOT NULL,
    points INTEGER NOT NULL,
    order_index INTEGER NOT NULL,
    options JSONB, -- for mcq
    correct_answer JSONB -- for mcq
);

CREATE TABLE exam_attempts (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER REFERENCES exams(id),
    student_id INTEGER REFERENCES users(id),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, submitted, auto_submitted
    total_score DECIMAL(5, 2)
);

CREATE TABLE answers (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES exam_attempts(id),
    question_id INTEGER REFERENCES questions(id),
    response_text TEXT,
    file_url VARCHAR(255),
    auto_score DECIMAL(5, 2),
    manual_score DECIMAL(5, 2),
    feedback TEXT
);

CREATE TABLE integrity_events (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES exam_attempts(id),
    event_type VARCHAR(50) NOT NULL, -- tab_switch, fullscreen_exit, paste_blocked, auto_submit_triggered
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE TABLE webcam_snapshots (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES exam_attempts(id),
    image_url VARCHAR(255) NOT NULL,
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE exams ADD COLUMN IF NOT EXISTS grades_released BOOLEAN DEFAULT FALSE;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS webcam_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS audio_enabled BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS question_bank (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER REFERENCES institutions(id),
    instructor_id INTEGER REFERENCES users(id),
    type VARCHAR(50) NOT NULL, -- mcq, essay, practical
    prompt TEXT NOT NULL,
    points INTEGER NOT NULL,
    options JSONB,
    correct_answer JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS exam_assignments (
    exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES student_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (exam_id, group_id)
);

CREATE TABLE IF NOT EXISTS exam_accommodations (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    extra_time_minutes INTEGER DEFAULT 0,
    custom_start_at TIMESTAMP,
    custom_end_at TIMESTAMP,
    UNIQUE (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS exam_messages (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
    instructor_id INTEGER REFERENCES users(id),
    student_id INTEGER REFERENCES users(id),
    message TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attempt_notes (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER REFERENCES exam_attempts(id) ON DELETE CASCADE,
    instructor_id INTEGER REFERENCES users(id),
    note_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS end_time TIMESTAMP;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN DEFAULT FALSE;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id);
