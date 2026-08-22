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
