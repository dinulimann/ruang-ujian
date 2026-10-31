<?php

use App\Models\User;
use Illuminate\Support\Facades\RateLimiter;

it('signs students in with their number and throttles guessing', function () {
    $s = school(1);
    RateLimiter::clear('login:1001|127.0.0.1');
    $this->postJson('/api/login', ['login' => '1001', 'password' => 'secret123'], ['Origin' => 'http://localhost'])->assertOk()->assertJson(['role' => 'student', 'class' => 'XII IPA 1']);
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/login', ['login' => 'ratna@test.example', 'password' => 'nope'], ['Origin' => 'http://localhost'])->assertStatus(401);
    }
    $this->postJson('/api/login', ['login' => 'ratna@test.example', 'password' => 'secret123'], ['Origin' => 'http://localhost'])->assertStatus(429);
});

it('keeps students out of the teacher area and teachers out of each other\'s work', function () {
    $s = school(1);
    $e = exam($s);
    as_($s->students[0])->getJson('/api/teacher/exams')->assertForbidden();
    as_($s->teacher)->getJson('/api/student/exams')->assertForbidden();
    $other = User::create(['name' => 'Pak Budi', 'email' => 'budi@test.example', 'number' => 'T2', 'role' => 'teacher', 'password' => 'secret123']);
    as_($other)->getJson("/api/teacher/exams/{$e->id}/monitor")->assertNotFound();
    as_($other)->deleteJson("/api/teacher/questions/{$s->questions[0]->id}")->assertNotFound();
    app('auth')->forgetGuards();
    $this->getJson('/api/me')->assertUnauthorized();
});

it('shows each student only the exams for their class', function () {
    $s = school(1);
    exam($s);
    expect(as_($s->students[0])->getJson('/api/student/exams')->json('exams'))->toHaveCount(1);
    expect(as_($s->outsider)->getJson('/api/student/exams')->json('exams'))->toHaveCount(0);
});
