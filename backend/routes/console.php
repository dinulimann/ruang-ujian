<?php

use App\Services\AttemptService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('exams:close-expired', function (AttemptService $attempts) {
    $n = $attempts->closeExpired();
    $this->info("Submitted {$n} attempt(s) whose time ran out.");
})->purpose('Submit attempts whose time is up, even if the student closed the browser');

Schedule::command('exams:close-expired')->everyMinute()->withoutOverlapping();
