<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Exam extends Model
{
    protected $fillable = ['subject_id', 'teacher_id', 'title', 'opens_at', 'closes_at', 'duration_minutes', 'token',
        'shuffle_questions', 'shuffle_options', 'show_results', 'published_at'];

    protected $hidden = ['token'];

    protected function casts(): array
    {
        return ['opens_at' => 'immutable_datetime', 'closes_at' => 'immutable_datetime', 'published_at' => 'immutable_datetime',
            'shuffle_questions' => 'boolean', 'shuffle_options' => 'boolean', 'show_results' => 'boolean'];
    }

    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    public function classGroups(): BelongsToMany
    {
        return $this->belongsToMany(ClassGroup::class);
    }

    public function questions(): HasMany
    {
        return $this->hasMany(ExamQuestion::class)->orderBy('position');
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(Attempt::class);
    }

    public function isOpen(\DateTimeInterface $now): bool
    {
        return $now >= $this->opens_at && $now < $this->closes_at;
    }
}
