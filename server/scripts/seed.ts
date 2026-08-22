import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/exam_integrity'
});

async function seed() {
  try {
    // Clear existing
    await pool.query('TRUNCATE users, institutions, exams, questions CASCADE');

    // Create institution
    const inst = await pool.query('INSERT INTO institutions (name) VALUES ($1) RETURNING id', ['Demo College']);
    const institutionId = inst.rows[0].id;

    // Create users
    const hash = await bcrypt.hash('password123', 10);
    const instRes = await pool.query(
      'INSERT INTO users (institution_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [institutionId, 'Instructor Doe', 'instructor@demo.com', hash, 'instructor']
    );
    const instructorId = instRes.rows[0].id;

    await pool.query(
      'INSERT INTO users (institution_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [institutionId, 'Student Smith', 'student@demo.com', hash, 'student']
    );

    // Create exam
    const examRes = await pool.query(
      'INSERT INTO exams (institution_id, instructor_id, title, description, time_limit_minutes, published) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [institutionId, instructorId, 'Demo Exam', 'A test exam', 60, true]
    );
    const examId = examRes.rows[0].id;

    // Questions
    await pool.query(
      'INSERT INTO questions (exam_id, type, prompt, points, order_index, options, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [examId, 'mcq', 'What is 2 + 2?', 5, 1,
       JSON.stringify(['3', '4', '5', '22']),
       JSON.stringify([1])]
    );
    await pool.query(
      'INSERT INTO questions (exam_id, type, prompt, points, order_index) VALUES ($1, $2, $3, $4, $5)',
      [examId, 'essay', 'Describe the water cycle in your own words.', 10, 2]
    );
    await pool.query(
      'INSERT INTO questions (exam_id, type, prompt, points, order_index) VALUES ($1, $2, $3, $4, $5)',
      [examId, 'practical', 'Write a function that reverses a string. Paste your code below.', 10, 3]
    );

    console.log('Seeding complete!');
    console.log('Instructor: instructor@demo.com / password123');
    console.log('Student: student@demo.com / password123');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

seed();
