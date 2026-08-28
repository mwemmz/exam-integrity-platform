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

    const studentId: number = (await pool.query(
      'INSERT INTO users (institution_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [institutionId, 'Student Smith', 'student@demo.com', hash, 'student']
    )).rows[0].id;

    await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      ['System Admin', 'admin@demo.com', hash, 'admin']
    );

    const extraStudents = [
      'Alice Johnson',
      'Bob Mwale',
      'Carla Nkhata',
      'David Banda',
      'Eve Phiri'
    ];
    const extraStudentIds: number[] = [];
    for (const name of extraStudents) {
      const r = await pool.query(
        'INSERT INTO users (institution_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [institutionId, name, `${name.toLowerCase().replace(' ', '.')}@demo.com`, hash, 'student']
      );
      extraStudentIds.push(r.rows[0].id);
    }
    const alice = extraStudentIds[0];
    const bob = extraStudentIds[1];
    const carla = extraStudentIds[2];
    const david = extraStudentIds[3];
    const eve = extraStudentIds[4];

    const createExam = async (
      title: string,
      description: string,
      timeLimitMinutes: number,
      gradesReleased: boolean
    ): Promise<number> => {
      const examRes = await pool.query(
        'INSERT INTO exams (institution_id, instructor_id, title, description, time_limit_minutes, published, grades_released) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [institutionId, instructorId, title, description, timeLimitMinutes, true, gradesReleased]
      );
      return examRes.rows[0].id;
    };

    const addMcq = async (examId: number, prompt: string, points: number, order: number, options: string[], correct: number[]) => {
      const r = await pool.query(
        'INSERT INTO questions (exam_id, type, prompt, points, order_index, options, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [examId, 'mcq', prompt, points, order, JSON.stringify(options), JSON.stringify(correct)]
      );
      return r.rows[0].id as number;
    };

    const addWs = async (examId: number, type: 'essay' | 'practical', prompt: string, points: number, order: number) => {
      const r = await pool.query(
        'INSERT INTO questions (exam_id, type, prompt, points, order_index) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [examId, type, prompt, points, order]
      );
      return r.rows[0].id as number;
    };

    // 1. Demo Exam (2 minutes) — grades hidden
    const demoExam = await createExam('Demo Exam', 'A quick tour of every question type', 2, false);
    const demoMcq = await addMcq(demoExam, 'What is 2 + 2?', 5, 1, ['3', '4', '5', '22'], [1]);
    const demoEssay = await addWs(demoExam, 'essay', 'Describe the water cycle in your own words.', 10, 2);
    const demoPractical = await addWs(demoExam, 'practical', 'Write a function that reverses a string. Paste your code below.', 10, 3);

    // 2. Math Fundamentals (2 minutes) — grades released
    const mathExam = await createExam('Math Fundamentals', 'Short arithmetic and algebra quiz', 2, true);
    const mathMcq1 = await addMcq(mathExam, 'What is 12 × 8?', 5, 1, ['86', '92', '96', '104'], [2]);
    const mathMcq2 = await addMcq(mathExam, 'Solve for x: 2x + 6 = 14', 5, 2, ['2', '3', '4', '5'], [2]);
    const mathMcq3 = await addMcq(mathExam, 'What is 7²?', 5, 3, ['14', '42', '49', '77'], [2]);
    const mathEssay = await addWs(mathExam, 'essay', 'Explain the order of operations (PEMDAS) in your own words.', 10, 4);

    // 3. Computer Science Essentials (2 minutes) — grades hidden
    const csExam = await createExam('Computer Science Essentials', 'Foundational programming concepts', 2, false);
    const csMcq1 = await addMcq(csExam, 'Which data structure follows First-In-First-Out (FIFO)?', 5, 1, ['Stack', 'Queue', 'Tree', 'Hash Map'], [1]);
    const csMcq2 = await addMcq(csExam, 'What is the time complexity of binary search on a sorted array?', 5, 2, ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'], [2]);
    const csPractical = await addWs(csExam, 'practical', 'Write a function that prints numbers 1 to 100, but prints "Fizz" for multiples of 3 and "Buzz" for multiples of 5.', 10, 3);
    const csEssay = await addWs(csExam, 'essay', 'Explain recursion using one real-world example.', 10, 4);

    // 4. English Composition (2 minutes) — grades released
    const englishExam = await createExam('English Composition', 'Grammar and short writing exercise', 2, true);
    const engMcq1 = await addMcq(englishExam, 'Choose the correct sentence.', 5, 1, [
      'He go to school.',
      'He goes to school.',
      'He going to school.',
      'He gone to school.'
    ], [1]);
    const engMcq2 = await addMcq(englishExam, 'Which word is a synonym for "rapid"?', 5, 2, ['Slow', 'Quick', 'Dull', 'Heavy'], [1]);
    const engEssay = await addWs(englishExam, 'essay', 'Write a paragraph (at least 3 sentences) describing what makes a good teacher.', 10, 3);
    const engPractical = await addWs(englishExam, 'practical', 'Write a short formal email (5–8 lines) asking a professor to extend an assignment deadline.', 10, 4);

    // ---- Attempts ----

    // Student Smith -> Math Fundamentals: submitted + graded (MCQ auto + essay manual)
    const smithAttempt = (await pool.query(
      'INSERT INTO exam_attempts (exam_id, student_id, started_at, submitted_at, status, total_score) VALUES ($1, $2, NOW() - interval \'1 day\', NOW() - interval \'1 day\' + interval \'2 minutes\', \'submitted\', 18) RETURNING id',
      [mathExam, studentId]
    )).rows[0].id as number;
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text, auto_score) VALUES ($1, $2, $3, $4)', [smithAttempt, mathMcq1, JSON.stringify([2]), 5]);
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text, auto_score) VALUES ($1, $2, $3, $4)', [smithAttempt, mathMcq2, JSON.stringify([1]), 0]);
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text, auto_score) VALUES ($1, $2, $3, $4)', [smithAttempt, mathMcq3, JSON.stringify([2]), 5]);
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text, manual_score, feedback) VALUES ($1, $2, $3, $4, $5)',
      [smithAttempt, mathEssay, 'PEMDAS means Parentheses, Exponents, Multiplication and Division, Addition and Subtraction — in that order. You always handle inside parentheses first, then exponents, then multiply/divide left to right, then add/subtract left to right.', 8, 'Good, accurate. Show one worked example next time for full marks.']);

    // Alice Johnson -> Demo Exam: submitted, hidden grades, events + snapshots
    const aliceAttempt = (await pool.query(
      'INSERT INTO exam_attempts (exam_id, student_id, started_at, submitted_at, status, total_score) VALUES ($1, $2, NOW() - interval \'3 hours\', NOW() - interval \'3 hours\' + interval \'2 minutes\', \'submitted\', 5) RETURNING id',
      [demoExam, alice]
    )).rows[0].id as number;
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text, auto_score) VALUES ($1, $2, $3, $4)', [aliceAttempt, demoMcq, JSON.stringify([1]), 5]);
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text) VALUES ($1, $2, $3)',
      [aliceAttempt, demoEssay, 'The sun heats water in lakes and the ocean. Water evaporates and rises, then cools and condenses into clouds. When clouds get heavy, water falls back to the ground as rain and it all starts again.']);
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text) VALUES ($1, $2, $3)',
      [aliceAttempt, demoPractical, 'function reverseString(str) {\n  return str.split("").reverse().join("");\n}']);
    await pool.query('INSERT INTO integrity_events (attempt_id, event_type, timestamp, metadata) VALUES ($1, $2, NOW() - interval \'3 hours\' + interval \'30 seconds\', $3)', [aliceAttempt, 'tab_switch', '{}']);
    await pool.query('INSERT INTO integrity_events (attempt_id, event_type, timestamp, metadata) VALUES ($1, $2, NOW() - interval \'3 hours\' + interval \'31 seconds\', $3)', [aliceAttempt, 'fullscreen_exit', JSON.stringify({ seconds: 3 })]);
    await pool.query('INSERT INTO integrity_events (attempt_id, event_type, timestamp, metadata) VALUES ($1, $2, NOW() - interval \'3 hours\' + interval \'4 minutes\', $3)', [aliceAttempt, 'paste_blocked', JSON.stringify({ questionId: demoEssay })]);
    await pool.query('INSERT INTO integrity_events (attempt_id, event_type, timestamp, metadata) VALUES ($1, $2, NOW() - interval \'3 hours\' + interval \'1 minute\', $3)', [aliceAttempt, 'tab_switch', '{}']);
    await pool.query('INSERT INTO webcam_snapshots (attempt_id, image_url, captured_at) VALUES ($1, $2, NOW() - interval \'3 hours\' + interval \'1 minute\')', [aliceAttempt, '/static/placeholder-snapshot.svg']);
    await pool.query('INSERT INTO webcam_snapshots (attempt_id, image_url, captured_at) VALUES ($1, $2, NOW() - interval \'3 hours\' + interval \'2 minutes\')', [aliceAttempt, '/static/placeholder-snapshot.svg']);

    const secsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000);

    // Bob Mwale -> CS Essentials: AUTO-SUBMITTED via face_missing (>90s)
    const bobAttempt = (await pool.query(
      'INSERT INTO exam_attempts (exam_id, student_id, started_at, submitted_at, status, total_score) VALUES ($1, $2, NOW() - interval \'1 day\', NOW() - interval \'1 day\' + interval \'3 minutes\', \'auto_submitted\', 5) RETURNING id',
      [csExam, bob]
    )).rows[0].id as number;
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text, auto_score) VALUES ($1, $2, $3, $4)', [bobAttempt, csMcq1, JSON.stringify([1]), 5]);
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text) VALUES ($1, $2, $3)',
      [bobAttempt, csPractical, 'function fizzbuzz() {\n  for (let i = 1; i <= 100; i++) {\n    if (i % 15 === 0) console.log("FizzBuzz");\n    else if (i % 3 === 0) console.log("Fizz");\n    else if (i % 5 === 0) console.log("Buzz");\n    else console.log(i);\n  }\n}']);
    const bobEvents: Array<[string, Date, string]> = [
      ['face_missing', secsAgo(170), JSON.stringify({ seconds: 20 })],
      ['gaze_away', secsAgo(150), JSON.stringify({ seconds: 4 })],
      ['face_missing', secsAgo(120), JSON.stringify({ seconds: 25 })],
      ['voice_detected', secsAgo(100), JSON.stringify({ seconds: 6 })],
      ['phone_detected', secsAgo(90), JSON.stringify({})],
      ['face_missing', secsAgo(60), JSON.stringify({ seconds: 30 })],
      ['face_missing', secsAgo(30), JSON.stringify({ seconds: 20 })],
      ['auto_submit_triggered', secsAgo(20), JSON.stringify({ rule: 'No face detected for more than 90 seconds in total' })]
    ];
    for (const [type, ts, meta] of bobEvents) {
      await pool.query('INSERT INTO integrity_events (attempt_id, event_type, timestamp, metadata) VALUES ($1, $2, $3, $4)', [bobAttempt, type, ts, meta]);
    }

    // Carla Nkhata -> CS Essentials: AUTO-SUBMITTED via multi_face (>30s)
    const carlaAttempt = (await pool.query(
      'INSERT INTO exam_attempts (exam_id, student_id, started_at, submitted_at, status, total_score) VALUES ($1, $2, NOW() - interval \'2 days\', NOW() - interval \'2 days\' + interval \'4 minutes\', \'auto_submitted\', 0) RETURNING id',
      [csExam, carla]
    )).rows[0].id as number;
    const carlaEvents: Array<[string, Date, string]> = [
      ['tab_switch', secsAgo(175), '{}'],
      ['multi_face', secsAgo(160), JSON.stringify({ seconds: 10 })],
      ['multi_face', secsAgo(130), JSON.stringify({ seconds: 10 })],
      ['multi_face', secsAgo(95), JSON.stringify({ seconds: 12 })],
      ['auto_submit_triggered', secsAgo(90), JSON.stringify({ rule: 'More than one person detected in view for more than 30 seconds in total' })]
    ];
    for (const [type, ts, meta] of carlaEvents) {
      await pool.query('INSERT INTO integrity_events (attempt_id, event_type, timestamp, metadata) VALUES ($1, $2, $3, $4)', [carlaAttempt, type, ts, meta]);
    }

    // David Banda -> English: submitted + graded (feedback), grades released
    const davidAttempt = (await pool.query(
      'INSERT INTO exam_attempts (exam_id, student_id, started_at, submitted_at, status, total_score) VALUES ($1, $2, NOW() - interval \'5 hours\', NOW() - interval \'5 hours\' + interval \'2 minutes\', \'submitted\', 11) RETURNING id',
      [englishExam, david]
    )).rows[0].id as number;
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text, auto_score) VALUES ($1, $2, $3, $4)', [davidAttempt, engMcq2, JSON.stringify([1]), 5]);
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text, manual_score, feedback) VALUES ($1, $2, $3, $4, $5)',
      [davidAttempt, engEssay, 'A good teacher is patient and explains things clearly. They listen to students and adapt when someone is struggling. Most importantly they make learning interesting and encourage questions.', 6, 'Good structure. Expand with one concrete example to reach full marks.']);
    await pool.query('INSERT INTO answers (attempt_id, question_id, response_text) VALUES ($1, $2, $3)',
      [davidAttempt, engPractical, '3']);
    await pool.query('INSERT INTO integrity_events (attempt_id, event_type, timestamp, metadata) VALUES ($1, $2, NOW() - interval \'5 hours\' + interval \'10 seconds\', $3)', [davidAttempt, 'tab_switch', '{}']);

    // Eve Phiri -> Math: IN PROGRESS (unfinished)
    await pool.query(
      'INSERT INTO exam_attempts (exam_id, student_id, started_at, status) VALUES ($1, $2, NOW() - interval \'30 seconds\', \'in_progress\') RETURNING id',
      [mathExam, eve]
    );

    console.log('Seeding complete!');
    console.log('Exams: Demo Exam, Math Fundamentals, Computer Science Essentials, English Composition (all 2 minutes)');
    console.log('Students: student@demo.com, alice@demo.com, bob@demo.com, carla@demo.com, david@demo.com, eve@demo.com');
    console.log('Instructor: instructor@demo.com / password123');
    console.log('Student: student@demo.com / password123');
    console.log('Admin: admin@demo.com / password123');
    console.log('Attempts: Smith (Math, graded), Alice (Demo, submitted), Bob (CS, auto-submitted), Carla (CS, auto-submitted), David (English, graded), Eve (Math, in progress)');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

seed();