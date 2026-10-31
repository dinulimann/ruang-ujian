<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExamQuestion extends Model
{
    public $timestamps = false;

    protected $fillable = ['exam_id', 'question_id', 'position', 'type', 'body', 'image_path', 'points', 'options'];

    protected function casts(): array
    {
        return ['options' => 'array'];
    }

    public function correctOptionId(): ?int
    {
        foreach ($this->options as $o) {
            if ($o['is_correct']) {
                return $o['id'];
            }
        }

        return null;
    }
}
