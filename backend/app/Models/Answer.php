<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Answer extends Model
{
    public $timestamps = false;

    protected $fillable = ['attempt_id', 'exam_question_id', 'option_id', 'essay', 'flagged', 'client_seq', 'points_awarded',
        'graded_by', 'feedback', 'saved_at'];

    protected function casts(): array
    {
        return ['flagged' => 'boolean', 'points_awarded' => 'float', 'saved_at' => 'immutable_datetime'];
    }

    public function attempt(): BelongsTo
    {
        return $this->belongsTo(Attempt::class);
    }

    public function examQuestion(): BelongsTo
    {
        return $this->belongsTo(ExamQuestion::class);
    }
}
