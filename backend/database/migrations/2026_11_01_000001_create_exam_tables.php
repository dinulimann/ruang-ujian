<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("alter table users add constraint users_role_check check (role in ('teacher', 'student'))");

        Schema::create('class_groups', function (Blueprint $t) {
            $t->id();
            $t->string('name')->unique();
            $t->timestamps();
        });
        Schema::table('users', function (Blueprint $t) {
            $t->foreignId('class_group_id')->nullable()->after('role')->constrained();
        });

        Schema::create('subjects', function (Blueprint $t) {
            $t->id();
            $t->string('name')->unique();
            $t->timestamps();
        });

        Schema::create('questions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('subject_id')->constrained();
            $t->foreignId('teacher_id')->constrained('users');
            $t->string('type'); // mcq, essay
            $t->text('body');
            $t->string('image_path')->nullable();
            $t->unsignedSmallInteger('points')->default(1);
            $t->timestamps();
            $t->softDeletes();
            $t->index(['subject_id', 'teacher_id']);
        });
        DB::statement("alter table questions add constraint questions_type_check check (type in ('mcq', 'essay'))");
        DB::statement('alter table questions add constraint questions_points_check check (points between 1 and 100)');

        Schema::create('question_options', function (Blueprint $t) {
            $t->id();
            $t->foreignId('question_id')->constrained()->cascadeOnDelete();
            $t->unsignedTinyInteger('position');
            $t->text('body');
            $t->boolean('is_correct')->default(false);
            $t->unique(['question_id', 'position']);
        });

        Schema::create('exams', function (Blueprint $t) {
            $t->id();
            $t->foreignId('subject_id')->constrained();
            $t->foreignId('teacher_id')->constrained('users');
            $t->string('title');
            $t->timestampTz('opens_at');
            $t->timestampTz('closes_at');
            $t->unsignedSmallInteger('duration_minutes');
            $t->string('token', 6)->comment('Read out by the proctor; students need it to start');
            $t->boolean('shuffle_questions')->default(true);
            $t->boolean('shuffle_options')->default(true);
            $t->boolean('show_results')->default(true);
            $t->timestampTz('published_at')->nullable();
            $t->timestamps();
        });
        DB::statement('alter table exams add constraint exams_window_check check (closes_at > opens_at)');
        DB::statement('alter table exams add constraint exams_duration_check check (duration_minutes between 1 and 600)');

        Schema::create('class_group_exam', function (Blueprint $t) {
            $t->foreignId('exam_id')->constrained()->cascadeOnDelete();
            $t->foreignId('class_group_id')->constrained();
            $t->primary(['exam_id', 'class_group_id']);
        });

        // A snapshot of each question as it was when the exam was published, so editing the bank later
        // cannot change an exam that students already took.
        Schema::create('exam_questions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('exam_id')->constrained()->cascadeOnDelete();
            $t->foreignId('question_id')->constrained();
            $t->unsignedSmallInteger('position');
            $t->string('type');
            $t->text('body');
            $t->string('image_path')->nullable();
            $t->unsignedSmallInteger('points');
            $t->jsonb('options')->default('[]')->comment('[{id, body, is_correct}] — never sent to students as is');
            $t->unique(['exam_id', 'position']);
            $t->unique(['exam_id', 'question_id']);
        });

        Schema::create('attempts', function (Blueprint $t) {
            $t->id();
            $t->foreignId('exam_id')->constrained();
            $t->foreignId('student_id')->constrained('users');
            $t->string('status'); // in_progress, submitted, graded
            $t->timestampTz('started_at');
            $t->timestampTz('deadline_at');
            $t->unsignedSmallInteger('extra_minutes')->default(0);
            $t->timestampTz('submitted_at')->nullable();
            $t->boolean('auto_submitted')->default(false);
            $t->string('device_hash', 64)->comment('SHA-256 of the device cookie the attempt is bound to');
            $t->jsonb('question_order');
            $t->jsonb('option_order');
            $t->decimal('score', 7, 2)->nullable();
            $t->unsignedSmallInteger('max_score');
            $t->unsignedSmallInteger('tab_switches')->default(0);
            $t->timestamps();
            $t->unique(['exam_id', 'student_id']);
        });
        DB::statement("alter table attempts add constraint attempts_status_check check (status in ('in_progress', 'submitted', 'graded'))");

        Schema::create('answers', function (Blueprint $t) {
            $t->id();
            $t->foreignId('attempt_id')->constrained()->cascadeOnDelete();
            $t->foreignId('exam_question_id')->constrained();
            $t->unsignedBigInteger('option_id')->nullable();
            $t->text('essay')->nullable();
            $t->boolean('flagged')->default(false)->comment('"ragu-ragu": the student wants to come back to it');
            $t->unsignedInteger('client_seq')->default(0)->comment('Highest save number from the browser; older saves are ignored');
            $t->decimal('points_awarded', 6, 2)->nullable();
            $t->foreignId('graded_by')->nullable()->constrained('users');
            $t->text('feedback')->nullable();
            $t->timestampTz('saved_at');
            $t->unique(['attempt_id', 'exam_question_id']);
        });

        Schema::create('attempt_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('attempt_id')->constrained()->cascadeOnDelete();
            $t->string('type');
            $t->jsonb('meta')->default('{}');
            $t->timestampTz('at');
            $t->index(['attempt_id', 'at']);
        });
    }

    public function down(): void
    {
        foreach (['attempt_events', 'answers', 'attempts', 'exam_questions', 'class_group_exam', 'exams', 'question_options', 'questions', 'subjects'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::table('users', fn (Blueprint $t) => $t->dropConstrainedForeignId('class_group_id'));
        Schema::dropIfExists('class_groups');
    }
};
