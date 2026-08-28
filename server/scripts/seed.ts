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

    await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      ['System Admin', 'admin@demo.com', hash, 'admin']
    );

    const createExam = async (title: string, description: string, timeLimitMinutes: number): Promise<number> => {
      const examRes = await pool.query(
        'INSERT INTO exams (institution_id, instructor_id, title, description, time_limit_minutes, published) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [institutionId, instructorId, title, description, timeLimitMinutes, true]
      );
      return examRes.rows[0].id;
    };

    const addMcq = async (examId: number, prompt: string, points: number, order: number, options: string[], correct: number[]) => {
      await pool.query(
        'INSERT INTO questions (exam_id, type, prompt, points, order_index, options, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [examId, 'mcq', prompt, points, order, JSON.stringify(options), JSON.stringify(correct)]
      );
    };

    const addWs = async (examId: number, type: 'essay' | 'practical', prompt: string, points: number, order: number) => {
      await pool.query(
        'INSERT INTO questions (exam_id, type, prompt, points, order_index) VALUES ($1, $2, $3, $4, $5)',
        [examId, type, prompt, points, order]
      );
    };

    // 1. Demo Exam (2 minutes)
    const demoExam = await createExam('Demo Exam', 'A quick tour of every question type', 2);
    await addMcq(demoExam, 'What is 2 + 2?', 5, 1, ['3', '4', '5', '22'], [1]);
    await addWs(demoExam, 'essay', 'Describe the water cycle in your own words.', 10, 2);
    await addWs(demoExam, 'practical', 'Write a function that reverses a string. Paste your code below.', 10, 3);

    // 2. Math Fundamentals (2 minutes)
    const mathExam = await createExam('Math Fundamentals', 'Short arithmetic and algebra quiz', 2);
    await addMcq(mathExam, 'What is 12 × 8?', 5, 1, ['86', '92', '96', '104'], [2]);
    await addMcq(mathExam, 'Solve for x: 2x + 6 = 14', 5, 2, ['2', '3', '4', '5'], [2]);
    await addMcq(mathExam, 'What is 7²?', 5, 3, ['14', '42', '49', '77'], [2]);
    await addWs(mathExam, 'essay', 'Explain the order of operations (PEMDAS) in your own words.', 10, 4);

    // 3. Computer Science Essentials (2 minutes)
    const csExam = await createExam('Computer Science Essentials', 'Foundational programming concepts', 2);
    await addMcq(csExam, 'Which data structure follows First-In-First-Out (FIFO)?', 5, 1, ['Stack', 'Queue', 'Tree', 'Hash Map'], [1]);
    await addMcq(csExam, 'What is the time complexity of binary search on a sorted array?', 5, 2, ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'], [2]);
    await addWs(csExam, 'practical', 'Write a function that prints numbers 1 to 100, but prints "Fizz" for multiples of 3 and "Buzz" for multiples of 5.', 10, 3);
    await addWs(csExam, 'essay', 'Explain recursion using one real-world example.', 10, 4);

    // 4. English Composition (2 minutes)
    const englishExam = await createExam('English Composition', 'Grammar and short writing exercise', 2);
    await addMcq(englishExam, 'Choose the correct sentence.', 5, 1, [
      'He go to school.',
      'He goes to school.',
      'He going to school.',
      'He gone to school.'
    ], [1]);
    await addMcq(englishExam, 'Which word is a synonym for "rapid"?', 5, 2, ['Slow', 'Quick', 'Dull', 'Heavy'], [1]);
    await addWs(englishExam, 'essay', 'Write a paragraph (at least 3 sentences) describing what makes a good teacher.', 10, 3);
    await addWs(englishExam, 'practical', 'Write a short formal email (5–8 lines) asking a professor to extend an assignment deadline.', 10, 4);

    console.log('Seeding complete!');
    console.log('Exams: Demo Exam, Math Fundamentals, Computer Science Essentials, English Composition (all 2 minutes)');
    console.log('Instructor: instructor@demo.com / password123');
    console.log('Student: student@demo.com / password123');
    console.log('Admin: admin@demo.com / password123');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

seed();