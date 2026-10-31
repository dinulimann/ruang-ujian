<?php

use App\Models\Attempt;

function answerAll(object $s, $e, int $id, $student, int $right): void
{
    $qs = $e->questions()->get();
    foreach ($qs as $i => $q) {
        $body = $q->type === 'mcq' ? ['option_id' => $i < $right ? $q->correctOptionId() : $q->options[0]['id']] : ['essay' => 'Jawaban esai yang panjang'];
        as_($student)->putJson("/api/student/attempts/$id/answers/{$q->id}", $body + ['seq' => 1])->assertOk();
    }
}

it('marks multiple choice at once and waits for essays', function () {
    $s = school(1, 4, 1);
    $e = exam($s);
    $id = startExam($e, $s->students[0]);
    answerAll($s, $e, $id, $s->students[0], 3);
    as_($s->students[0])->postJson("/api/student/attempts/$id/submit")->assertJson(['status' => 'submitted']);
    as_($s->students[0])->postJson("/api/student/attempts/$id/submit")->assertJson(['status' => 'submitted']); // twice is harmless
    expect(Attempt::find($id)->score)->toBe(6.0);
    as_($s->students[0])->getJson("/api/student/attempts/$id/result")->assertJsonMissingPath('score');

    $essays = as_($s->teacher)->getJson("/api/teacher/exams/{$e->id}/essays")->assertOk()->json('0.answers');
    expect($essays)->toHaveCount(1);
    $url = "/api/teacher/answers/{$essays[0]['id']}/grade";
    as_($s->teacher)->postJson($url, ['points' => 6])->assertStatus(422);
    as_($s->teacher)->postJson($url, ['points' => 2.3])->assertStatus(422);
    as_($s->teacher)->postJson($url, ['points' => 3.5, 'feedback' => 'Kurang contoh'])->assertOk();
    expect(Attempt::find($id))->status->toBe('graded')->score->toBe(9.5);
});

it('scores a blank essay as zero without asking the teacher', function () {
    $s = school(1, 1, 1);
    $e = exam($s);
    $id = startExam($e, $s->students[0]);
    as_($s->students[0])->postJson("/api/student/attempts/$id/submit")->assertJson(['status' => 'graded']);
});

it('will not mark an attempt that is still in progress', function () {
    $s = school(1, 0, 1);
    $e = exam($s);
    $id = startExam($e, $s->students[0]);
    $q = $e->questions()->first();
    as_($s->students[0])->putJson("/api/student/attempts/$id/answers/{$q->id}", ['essay' => 'jawaban', 'seq' => 1]);
    $answer = \App\Models\Answer::where('attempt_id', $id)->first();
    as_($s->teacher)->postJson("/api/teacher/answers/{$answer->id}/grade", ['points' => 1])->assertStatus(409);
});

it('reveals the right answers only after the exam closes', function () {
    $s = school(1, 2);
    $e = exam($s, ['closes_at' => now()->addHour()]);
    $id = startExam($e, $s->students[0]);
    answerAll($s, $e, $id, $s->students[0], 1);
    as_($s->students[0])->postJson("/api/student/attempts/$id/submit");
    as_($s->students[0])->getJson("/api/student/attempts/$id/result")->assertJson(['score' => 2, 'max_score' => 4, 'review' => null]);
    $this->travel(61)->minutes();
    $review = as_($s->students[0])->getJson("/api/student/attempts/$id/result")->json('review');
    expect($review)->toHaveCount(2)->and($review[0])->toHaveKeys(['chosen', 'correct', 'awarded']);
    $e->update(['show_results' => false]);
    as_($s->students[0])->getJson("/api/student/attempts/$id/result")->assertJsonMissingPath('score');
});

it('works out difficulty and discrimination on a known class', function () {
    // Four students, two questions. Totals: 4, 2, 2, 0. Top and bottom groups have two students each.
    $s = school(4, 2);
    $e = exam($s);
    [$q1, $q2] = $e->questions()->get()->all();
    $pattern = [[true, true], [true, false], [false, true], [false, false]];
    foreach ($s->students as $k => $st) {
        $id = startExam($e, $st, "d$k");
        foreach ([$q1, $q2] as $j => $q) {
            as_($st, "d$k")->putJson("/api/student/attempts/$id/answers/{$q->id}", ['option_id' => $pattern[$k][$j] ? $q->correctOptionId() : $q->options[2]['id'], 'seq' => 1]);
        }
        as_($st, "d$k")->postJson("/api/student/attempts/$id/submit");
    }
    $r = as_($s->teacher)->getJson("/api/teacher/exams/{$e->id}/results")->assertOk();
    expect($r->json('analysis.summary'))->toMatchArray(['mean' => 2, 'median' => 2, 'min' => 0, 'max' => 4]);
    // Q1 is right for students 1 and 2: everyone on top, nobody at the bottom.
    expect($r->json('analysis.items.0'))->toMatchArray(['difficulty' => 0.5, 'discrimination' => 1]);
    // Q2 is right for students 1 and 3: one in each group, so it separates nobody.
    expect($r->json('analysis.items.1'))->toMatchArray(['difficulty' => 0.5, 'discrimination' => 0]);
    expect(collect($r->json('analysis.items.0.options'))->pluck('chosen')->all())->toBe([0, 2, 2, 0]);
});

it('exports results to CSV without spreadsheet formulas', function () {
    $s = school(1);
    $s->students[0]->update(['name' => '=HYPERLINK("http://evil")']);
    $e = exam($s);
    $id = startExam($e, $s->students[0]);
    as_($s->students[0])->postJson("/api/student/attempts/$id/submit");
    $csv = as_($s->teacher)->get("/api/teacher/exams/{$e->id}/results.csv")->assertOk()->getContent();
    expect($csv)->toContain("\"'=HYPERLINK(\"\"http://evil\"\")\"");
});
