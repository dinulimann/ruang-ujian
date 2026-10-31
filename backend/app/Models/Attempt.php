<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Attempt extends Model
{
    protected $fillable = ['exam_id', 'student_id', 'status', 'started_at', 'deadline_at', 'extra_minutes', 'submitted_at',
        'auto_submitted', 'device_hash', 'question_order', 'option_order', 'score', 'max_score', 'tab_switches'];

    protected $hidden = ['device_hash'];

    protected function casts(): array
    {
        return ['started_at' => 'immutable_datetime', 'deadline_at' => 'immutable_datetime', 'submitted_at' => 'immutable_datetime',
            'auto_submitted' => 'boolean', 'question_order' => 'array', 'option_order' => 'array', 'score' => 'float'];
    }

    public function exam(): BelongsTo
    {
        return $this->belongsTo(Exam::class);
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function answers(): HasMany
    {
        return $this->hasMany(Answer::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(AttemptEvent::class);
    }
}
