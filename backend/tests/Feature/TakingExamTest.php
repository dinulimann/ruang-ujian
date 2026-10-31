<?php

use App\Models\Attempt;
use App\Models\ExamQuestion;
use Carbon\CarbonImmutable;

it('never sends the answer key to the student', function () {
    $s = school(1, 4, 1);
    $e = exam($s);
    $id = startExam($e, $s->students[0]);
    $res = as_($s->students[0])->getJson("/api/student/attempts/$id")->assertOk();
    expect($res->json('questions'))->toHaveCount(5);
    expect($res->getContent())->not->toContain('is_correct')->not->toContain('correct');
    expect($res->collect('questions')->firstWhere('type', 'mcq')['options'][0])->toHaveKeys(['id', 'body']);
});

it('needs the right token, the right class and an open exam', function () {
    $s = school(1);
    $e = exam($s);
    as_($s->students[0])->postJson("/api/student/exams/{$e->id}/start", ['token' => 'WRONG1'])->assertStatus(422)->assertJson(['code' => 'wrong_token']);
    as_($s->outsider)->postJson("/api/student/exams/{$e->id}/start", ['token' => 'ABC234'])->assertNotFound();
    $later = exam($s, ['opens_at' => now()->addHour(), 'closes_at' => now()->addHours(3)]);
    as_($s->students[0])->postJson("/api/student/exams/{$later->id}/start", ['token' => 'ABC234'])->assertStatus(409)->assertJson(['code' => 'exam_not_open']);
});

it('shuffles questions and options per student, and starting twice resumes the same attempt', function () {
    $s = school(2, 12);
    $e = exam($s);
    $a = startExam($e, $s->students[0]);
    $b = startExam($e, $s->students[1]);
    [$x, $y] = [Attempt::find($a), Attempt::find($b)];
    expect($x->question_order)->not->toBe($y->question_order);
    expect(collect($x->question_order)->sort()->values()->all())->toBe(collect($y->question_order)->sort()->values()->all());
    foreach ($x->option_order as $qid => $ids) {
        expect(collect($ids)->sort()->values()->all())->toBe(collect(ExamQuestion::find($qid)->options)->pluck('id')->sort()->values()->all());
    }
    $this->travel(5)->minutes();
    expect(startExam($e, $s->students[0]))->toBe($a);
    expect(Attempt::find($a)->started_at->equalTo($x->started_at))->toBeTrue();
});

it('caps the deadline at the closing time for a late start', function () {
    $s = school(1);
    $e = exam($s, ['closes_at' => now()->addMinutes(10)]);
    $a = Attempt::find(startExam($e, $s->students[0]));
    expect($a->deadline_at->equalTo($e->closes_at))->toBeTrue();
});

it('keeps the newest answer when saves arrive out of order', function () {
    $s = school(1);
    $e = exam($s);
    $id = startExam($e, $s->students[0]);
    $q = $e->questions()->where('type', 'mcq')->first();
    [$first, $second] = array_column($q->options, 'id');
    $url = "/api/student/attempts/$id/answers/{$q->id}";
    as_($s->students[0])->putJson($url, ['option_id' => $second, 'seq' => 3])->assertJson(['saved' => true, 'seq' => 3]);
    as_($s->students[0])->putJson($url, ['option_id' => $first, 'seq' => 2])->assertJson(['saved' => false, 'seq' => 3]); // a slow, older request
    as_($s->students[0])->putJson($url, ['option_id' => $second, 'flagged' => true, 'seq' => 3])->assertJson(['saved' => false]);
    $answer = as_($s->students[0])->getJson("/api/student/attempts/$id")->collect('questions')->firstWhere('id', $q->id)['answer'];
    expect($answer)->toMatchArray(['option_id' => $second, 'seq' => 3, 'flagged' => false]);
});

it('refuses options and questions from elsewhere', function () {
    $s = school(1);
    $e = exam($s);
    $other = exam($s);
    $id = startExam($e, $s->students[0]);
    [$q1, $q2] = $e->questions()->get()->all();
    as_($s->students[0])->putJson("/api/student/attempts/$id/answers/{$q1->id}", ['option_id' => $q2->options[0]['id'], 'seq' => 1])->assertStatus(422);
    $foreign = $other->questions()->first();
    as_($s->students[0])->putJson("/api/student/attempts/$id/answers/{$foreign->id}", ['option_id' => $foreign->options[0]['id'], 'seq' => 1])->assertNotFound();
});

it('stops answers when time is up, after a short grace period, and submits the attempt', function () {
    $s = school(1);
    $e = exam($s, ['duration_minutes' => 30]);
    $id = startExam($e, $s->students[0]);
    $q = $e->questions()->first();
    $right = $q->correctOptionId();
    $this->travel(30)->minutes();
    $this->travel(5)->seconds(); // in flight when the clock ran out: still accepted
    as_($s->students[0])->putJson("/api/student/attempts/$id/answers/{$q->id}", ['option_id' => $right, 'seq' => 1])->assertOk();
    $this->travel(10)->seconds();
    as_($s->students[0])->putJson("/api/student/attempts/$id/answers/{$q->id}", ['option_id' => $right, 'seq' => 2])->assertStatus(409)->assertJson(['code' => 'time_up']);
    $a = Attempt::find($id);
    expect($a->status)->toBe('graded')->and($a->auto_submitted)->toBeTrue()->and($a->score)->toBe(2.0);
});

it('binds the attempt to one device until the teacher releases it', function () {
    $s = school(1);
    $e = exam($s);
    $id = startExam($e, $s->students[0], 'laptop');
    $q = $e->questions()->first();
    as_($s->students[0], 'phone')->getJson("/api/student/attempts/$id")->assertStatus(409)->assertJson(['code' => 'device_mismatch']);
    as_($s->teacher)->postJson("/api/teacher/attempts/$id/reset-device")->assertOk();
    as_($s->students[0], 'phone')->getJson("/api/student/attempts/$id")->assertOk();
    as_($s->students[0], 'laptop')->putJson("/api/student/attempts/$id/answers/{$q->id}", ['option_id' => null, 'seq' => 1])->assertStatus(409);
    expect(Attempt::find($id)->events()->pluck('type')->all())->toContain('device_rejected', 'device_reset', 'device_rebound');
});

it('hands a released exam to a new browser that has no device cookie yet', function () {
    $s = school(1);
    $e = exam($s);
    $id = startExam($e, $s->students[0], 'laptop');
    as_($s->teacher)->postJson("/api/teacher/attempts/$id/reset-device");
    $res = as_($s->students[0], '')->getJson("/api/student/attempts/$id")->assertOk();
    expect($res->getCookie('exam_device'))->not->toBeNull();
    as_($s->students[0], 'laptop')->getJson("/api/student/attempts/$id")->assertStatus(409);
});

it('lets the teacher give one student more time', function () {
    $s = school(1);
    $e = exam($s, ['duration_minutes' => 20]);
    $id = startExam($e, $s->students[0]);
    as_($s->teacher)->postJson("/api/teacher/attempts/$id/extend", ['minutes' => 10])->assertOk()->assertJson(['extra_minutes' => 10]);
    $this->travel(25)->minutes();
    $q = $e->questions()->first();
    as_($s->students[0])->putJson("/api/student/attempts/$id/answers/{$q->id}", ['option_id' => null, 'seq' => 1])->assertOk();
});

it('counts leaving the exam tab', function () {
    $s = school(1);
    $id = startExam(exam($s), $s->students[0]);
    as_($s->students[0])->postJson("/api/student/attempts/$id/events", ['type' => 'tab_hidden'])->assertNoContent();
    as_($s->students[0])->postJson("/api/student/attempts/$id/events", ['type' => 'tab_hidden'])->assertNoContent();
    expect(Attempt::find($id)->tab_switches)->toBe(2);
});

it('submits attempts left open when the student walked away', function () {
    $s = school(2);
    $e = exam($s, ['duration_minutes' => 15]);
    startExam($e, $s->students[0]);
    startExam($e, $s->students[1]);
    $this->travel(16)->minutes();
    $this->artisan('exams:close-expired')->expectsOutput('Submitted 2 attempt(s) whose time ran out.')->assertSuccessful();
    expect(Attempt::where('status', 'in_progress')->count())->toBe(0);
});
