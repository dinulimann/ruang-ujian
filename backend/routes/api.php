<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\MetaController;
use App\Http\Controllers\Student\ExamController as StudentExams;
use App\Http\Controllers\Teacher\ExamController as TeacherExams;
use App\Http\Controllers\Teacher\QuestionController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'show']);

    Route::middleware('role:student')->prefix('student')->group(function () {
        Route::get('/exams', [StudentExams::class, 'index']);
        Route::post('/exams/{exam}/start', [StudentExams::class, 'start'])->middleware('throttle:20,1');
        Route::get('/attempts/{attempt}', [StudentExams::class, 'show']);
        Route::put('/attempts/{attempt}/answers/{question}', [StudentExams::class, 'save'])->middleware('throttle:240,1');
        Route::post('/attempts/{attempt}/events', [StudentExams::class, 'event'])->middleware('throttle:60,1');
        Route::post('/attempts/{attempt}/submit', [StudentExams::class, 'submit']);
        Route::get('/attempts/{attempt}/result', [StudentExams::class, 'result']);
    });

    Route::middleware('role:teacher')->prefix('teacher')->group(function () {
        Route::get('/meta', MetaController::class);
        Route::get('/questions/template', [QuestionController::class, 'template']);
        Route::post('/questions/import', [QuestionController::class, 'import']);
        Route::apiResource('questions', QuestionController::class)->except('show');
        Route::post('/questions/{question}', [QuestionController::class, 'update']); // multipart forms cannot PUT
        Route::apiResource('exams', TeacherExams::class)->except('destroy');
        Route::post('/exams/{exam}/token', [TeacherExams::class, 'token']);
        Route::get('/exams/{exam}/monitor', [TeacherExams::class, 'monitor']);
        Route::get('/exams/{exam}/essays', [TeacherExams::class, 'essays']);
        Route::get('/exams/{exam}/results', [TeacherExams::class, 'results']);
        Route::get('/exams/{exam}/results.csv', [TeacherExams::class, 'export']);
        Route::post('/attempts/{attempt}/extend', [TeacherExams::class, 'extend']);
        Route::post('/attempts/{attempt}/reset-device', [TeacherExams::class, 'resetDevice']);
        Route::post('/answers/{answer}/grade', [TeacherExams::class, 'grade']);
    });
});
