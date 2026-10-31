<?php

namespace App\Services;

use App\Models\Exam;
use App\Models\Question;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ExamPublisher
{
    /** Exam tokens avoid letters and digits that are easy to mix up when read aloud (O/0, I/1). */
    public static function token(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $t = '';
        for ($i = 0; $i < 6; $i++) {
            $t .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return $t;
    }

    /** Creates or replaces an exam, copying the chosen questions into it. Not allowed once anyone has started it. */
    public function save(?Exam $exam, array $in, User $teacher): Exam
    {
        if ($exam && $exam->attempts()->exists()) {
            Fail::with(409, 'exam_started', 'Students have already started this exam, so its questions and timing are locked.');
        }
        $questions = Question::with('options')->where('teacher_id', $teacher->id)->whereIn('id', $in['question_ids'])->get()->keyBy('id');
        $missing = array_diff($in['question_ids'], $questions->keys()->all());
        if ($missing) {
            Fail::with(422, 'invalid', 'Some questions are not in your bank.', ['question_ids' => array_values($missing)]);
        }
        foreach ($questions as $q) {
            if ($q->type === 'mcq' && $q->options->where('is_correct', true)->count() !== 1) {
                Fail::with(422, 'invalid', "Question #{$q->id} needs exactly one correct option.");
            }
        }

        return DB::transaction(function () use ($exam, $in, $teacher, $questions) {
            $data = [
                'subject_id' => $in['subject_id'], 'title' => $in['title'], 'opens_at' => $in['opens_at'], 'closes_at' => $in['closes_at'],
                'duration_minutes' => $in['duration_minutes'], 'shuffle_questions' => $in['shuffle_questions'] ?? true,
                'shuffle_options' => $in['shuffle_options'] ?? true, 'show_results' => $in['show_results'] ?? true,
            ];
            if ($exam) {
                $exam->update($data);
                $exam->questions()->delete();
            } else {
                $exam = Exam::create($data + ['teacher_id' => $teacher->id, 'token' => self::token(), 'published_at' => now()]);
            }
            $exam->classGroups()->sync($in['class_group_ids']);
            foreach (array_values($in['question_ids']) as $i => $id) {
                $q = $questions[$id];
                $exam->questions()->create([
                    'question_id' => $q->id, 'position' => $i + 1, 'type' => $q->type, 'body' => $q->body, 'image_path' => $q->image_path,
                    'points' => $q->points,
                    'options' => $q->options->map(fn ($o) => ['id' => $o->id, 'body' => $o->body, 'is_correct' => $o->is_correct])->values()->all(),
                ]);
            }

            return $exam->fresh();
        });
    }
}
