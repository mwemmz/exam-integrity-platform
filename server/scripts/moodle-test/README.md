# Local Moodle test of the LTI 1.1 connection

Proves the real flow against a real Moodle: launch from Moodle, take the exam, grade returns to the Moodle gradebook.
Verified with Moodle 4.5.15 (LTS) on PHP 8.3 and Postgres 16, all on one machine.

1. Moodle: `git clone --depth 1 -b MOODLE_405_STABLE https://github.com/moodle/moodle.git`, create a Postgres db `moodle`,
   then `php -d max_input_vars=6000 admin/cli/install.php --wwwroot=http://localhost:8080 ...` and serve it with
   `php -d max_input_vars=6000 -S 127.0.0.1:8080 -t <moodle dir>`.
2. ExamTech: apply `database/schema.sql` + `migrations.sql`, run the seed, then start the server with
   `LTI_CONSUMER_KEY=examtech LTI_SHARED_SECRET=testsecret123 PUBLIC_API_URL=http://localhost:3000 CLIENT_URL=http://localhost:5173`
   and serve the client built with `VITE_API_BASE_URL=http://localhost:3000`.
3. `php setup_moodle.php` (edit the Moodle path inside) creates a course, the student `smith` (student@demo.com),
   the ExamTech external tool and an activity that launches exam 1.
4. `node student_takes_exam.js` launches as that student and submits. Then grade the essay and practical as the instructor
   and release grades; the score appears in the Moodle gradebook (mdl_grade_grades).

Grades are sent to Moodle only once the instructor has released them for the exam.
