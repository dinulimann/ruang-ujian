<?php

use App\Models\ClassGroup;
use App\Models\Exam;
use App\Models\Question;
use App\Models\Subject;
use App\Models\User;
use App\Services\ExamPublisher;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

pest()->extend(Tests\TestCase::class)->use(RefreshDatabase::class)->in('Feature');

/** A teacher, a class of students (plus one in another class), and a question bank. */
function school(int $students = 3, int $mcq = 4, int $essays = 0): object
{
    $class = ClassGroup::create(['name' => 'XII IPA 1']);
    $other = ClassGroup::create(['name' => 'XII IPS 1']);
    $subject = Subject::create(['name' => 'Biologi']);
    $teacher = User::create(['name' => 'Bu Ratna', 'email' => 'ratna@test.example', 'number' => 'T1', 'role' => 'teacher', 'password' => 'secret123']);
    $kids = [];
    for ($i = 1; $i <= $students; $i++) {
        $kids[] = User::create(['name' => "Siswa $i", 'email' => "s$i@test.example", 'number' => "100$i", 'role' => 'student', 'class_group_id' => $class->id, 'password' => 'secret123']);
    }
    $outsider = User::create(['name' => 'Lain', 'email' => 'x@test.example', 'number' => '9999', 'role' => 'student', 'class_group_id' => $other->id, 'password' => 'secret123']);
    $questions = [];
    for ($i = 1; $i <= $mcq; $i++) {
        $q = Question::create(['subject_id' => $subject->id, 'teacher_id' => $teacher->id, 'type' => 'mcq', 'body' => "Pertanyaan pilihan ganda $i", 'points' => 2]);
        foreach (['A', 'B', 'C', 'D'] as $k => $l) {
            $q->options()->create(['position' => $k, 'body' => "Pilihan $l untuk soal $i", 'is_correct' => $k === 1]);
        }
        $questions[] = $q;
    }
    for ($i = 1; $i <= $essays; $i++) {
        $questions[] = Question::create(['subject_id' => $subject->id, 'teacher_id' => $teacher->id, 'type' => 'essay', 'body' => "Jelaskan konsep $i", 'points' => 5]);
    }

    return (object) (compact('class', 'other', 'subject', 'teacher', 'outsider', 'questions') + ['students' => $kids]);
}

function exam(object $s, array $over = []): Exam
{
    $now = CarbonImmutable::now();
    $e = (new ExamPublisher())->save(null, $over + [
        'title' => 'Ulangan', 'subject_id' => $s->subject->id, 'class_group_ids' => [$s->class->id],
        'opens_at' => $now->subMinutes(10), 'closes_at' => $now->addHours(2), 'duration_minutes' => 30,
        'question_ids' => array_map(fn ($q) => $q->id, $s->questions),
    ], $s->teacher);
    $e->update(['token' => 'ABC234']);

    return $e->fresh();
}

/** Acts as the user from the SPA's origin, so cookies and sessions work as they do in the browser. */
function as_(User $u, string $device = 'device-1')
{
    // Guards cache their user; forget them so switching between teacher and student works within one test.
    app('auth')->forgetGuards();

    return test()->actingAs($u, 'sanctum')->withHeader('Origin', 'http://localhost')->withHeader('Accept', 'application/json')->withCredentials()->withCookie('exam_device', $device);
}

function startExam(Exam $e, User $u, string $device = 'device-1'): int
{
    return as_($u, $device)->postJson("/api/student/exams/{$e->id}/start", ['token' => 'abc234'])->assertOk()->json('attempt_id');
}
