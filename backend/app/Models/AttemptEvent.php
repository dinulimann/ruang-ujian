<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttemptEvent extends Model
{
    public $timestamps = false;

    protected $fillable = ['attempt_id', 'type', 'meta', 'at'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'at' => 'immutable_datetime'];
    }
}
