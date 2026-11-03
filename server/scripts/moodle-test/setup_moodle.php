<?php
// One-off: create a course, a student, an ExamTech LTI 1.1 tool and an activity in the local test Moodle.
define('CLI_SCRIPT', true);
require('/tmp/mdl/moodle/config.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->dirroot . '/mod/lti/locallib.php');
require_once($CFG->libdir . '/enrollib.php');

\core\session\manager::set_user(get_admin());

$course = create_course((object)[
    'fullname' => 'ExamTech pilot course', 'shortname' => 'ET101', 'category' => 1,
    'format' => 'topics', 'numsections' => 1, 'summary' => '', 'summaryformat' => FORMAT_HTML,
]);

$u = (object)[
    'username' => 'smith', 'password' => hash_internal_user_password('Student#12345!'), 'confirmed' => 1,
    'mnethostid' => $CFG->mnet_localhost_id, 'auth' => 'manual', 'email' => 'student@demo.com',
    'firstname' => 'Smith', 'lastname' => 'Student',
];
$uid = user_create_user($u, false, false);
$role = $DB->get_record('role', ['shortname' => 'student'], '*', MUST_EXIST);
enrol_try_internal_enrol($course->id, $uid, $role->id);

$type = new stdClass();
$type->state = LTI_TOOL_STATE_CONFIGURED;
$type->name = 'ExamTech';
$type->baseurl = 'http://localhost:3000/api/lti/launch';
$type->course = get_site()->id;
$config = new stdClass();
$config->lti_toolurl = $type->baseurl;
$config->lti_typename = 'ExamTech';
$config->lti_ltiversion = LTI_VERSION_1;
$config->lti_resourcekey = 'examtech';
$config->lti_password = 'testsecret123';
$config->lti_coursevisible = LTI_COURSEVISIBLE_ACTIVITYCHOOSER;
$config->lti_sendname = LTI_SETTING_ALWAYS;
$config->lti_sendemailaddr = LTI_SETTING_ALWAYS;
$config->lti_acceptgrades = LTI_SETTING_ALWAYS;
$config->lti_launchcontainer = LTI_LAUNCH_CONTAINER_DEFAULT;
$typeid = lti_add_type($type, $config);

$module = $DB->get_record('modules', ['name' => 'lti'], '*', MUST_EXIST);
$mi = (object)[
    'modulename' => 'lti', 'module' => $module->id, 'course' => $course->id, 'section' => 1, 'visible' => 1,
    'visibleoldmodule' => 1, 'name' => 'Demo Exam (ExamTech)', 'intro' => '', 'introformat' => FORMAT_HTML,
    'typeid' => $typeid, 'toolurl' => '', 'securetoolurl' => '', 'launchcontainer' => LTI_LAUNCH_CONTAINER_DEFAULT,
    'instructorchoicesendname' => 1, 'instructorchoicesendemailaddr' => 1, 'instructorchoiceacceptgrades' => 1,
    'instructorcustomparameters' => 'exam_id=1', 'grade' => 100, 'showdescriptionlaunch' => 0,
    'cmidnumber' => '', 'groupmode' => 0, 'completion' => 0, 'showtitlelaunch' => 1,
];
$cm = add_moduleinfo($mi, $course);
echo "course={$course->id} user={$uid} type={$typeid} cm={$cm->coursemodule}\n";
