<?php

namespace App\Http\Controllers;

use App\Models\ClassGroup;
use App\Models\Subject;

class MetaController extends Controller
{
    public function __invoke()
    {
        return ['subjects' => Subject::orderBy('name')->get(['id', 'name']), 'class_groups' => ClassGroup::withCount('students')->orderBy('name')->get(['id', 'name'])];
    }
}
