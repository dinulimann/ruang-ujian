<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\Answer;
use App\Models\Attempt;
use App\Models\Exam;
use App\Models\User;
use App\Services\AttemptService;
use App\Services\ExamPublisher;
use App\Services\ItemAnalysis;
use Illuminate\Http\Request;

class ExamController extends Controller
{
    private function mine(Request $r, int $id): Exam
    {
        return Exam::with('classGroups', 'subject')->where('teacher_id', $r->user()->id)->findOrFail($id);
    }

    private static function out(Exam $e): array
    {
        return ['id' => $e->id, 'title' => $e->title, 'subject_id' => $e->subject_id, 'subject' => $e->subject?->name,
            'opens_at' => $e->opens_at, 'closes_at' => $e->closes_at, 'duration_minutes' => $e->duration_minutes, 'token' => $e->token,
            'shuffle_questions' => $e->shuffle_questions, 'shuffle_options' => $e->shuffle_options, 'show_results' => $e->show_results,
            'class_groups' => $e->classGroups->map->only('id', 'name')->values()];
    }

    public function index(Request $r)
    {
        return Exam::with('classGroups', 'subject')->withCount(['questions', 'attempts', 'attempts as submitted_count' => fn ($q) => $q->where('status', '!=', 'in_progress')])
            ->where('teacher_id', $r->user()->id)->orderByDesc('opens_at')->get()
            ->map(fn ($e) => self::out($e) + ['questions' => $e->questions_count, 'started' => $e->attempts_count, 'submitted' => $e->submitted_count,
                'to_grade' => Answer::whereHas('attempt', fn ($q) => $q->where('exam_id', $e->id))->whereNull('points_awarded')
                    ->whereHas('attempt', fn ($q) => $q->where('status', 'submitted'))->count()]);
    }

    private function validated(Request $r): array
    {
        return $r->validate([
            'title' => 'required|string|max:150', 'subject_id' => 'required|exists:subjects,id',
            'class_group_ids' => 'required|array|min:1', 'class_group_ids.*' => 'exists:class_groups,id',
            'opens_at' => 'required|date', 'closes_at' => 'required|date|after:opens_at',
            'duration_minutes' => 'required|integer|between:1,600',
            'question_ids' => 'required|array|min:1|max:200', 'question_ids.*' => 'integer|distinct',
            'shuffle_questions' => 'boolean', 'shuffle_options' => 'boolean', 'show_results' => 'boolean',
        ]);
    }

    public function store(Request $r, ExamPublisher $p)
    {
        return response()->json(self::out($p->save(null, $this->validated($r), $r->user())->load('classGroups', 'subject')), 201);
    }

    public function show(Request $r, int $id)
    {
        $e = $this->mine($r, $id)->load('questions');

        return self::out($e) + ['questions' => $e->questions->map(fn ($q) => $q->only('id', 'question_id', 'position', 'type', 'body', 'points', 'options'))];
    }

    public function update(Request $r, int $id, ExamPublisher $p)
    {
        return self::out($p->save($this->mine($r, $id), $this->validated($r), $r->user())->load('classGroups', 'subject'));
    }

    public function token(Request $r, int $id)
    {
        $e = $this->mine($r, $id);
        $e->update(['token' => ExamPublisher::token()]);

        return ['token' => $e->token];
    }

    /** Live view for the proctor: every student in the exam's classes and how far they are. */
    public function monitor(Request $r, int $id)
    {
        $e = $this->mine($r, $id);
        $total = $e->questions()->count();
        $students = User::where('role', 'student')->whereIn('class_group_id', $e->classGroups->pluck('id'))->with('classGroup')->orderBy('name')->get();
        $attempts = Attempt::where('exam_id', $e->id)->withCount(['answers as answered' => fn ($q) => $q->where(fn ($w) => $w->whereNotNull('option_id')->orWhereRaw("coalesce(essay, '') <> ''"))])
            ->withMax('answers as last_saved', 'saved_at')->get()->keyBy('student_id');

        return ['exam' => self::out($e), 'questions' => $total, 'server_now' => now(), 'students' => $students->map(function ($s) use ($attempts) {
            $a = $attempts->get($s->id);

            return ['student' => ['id' => $s->id, 'name' => $s->name, 'number' => $s->number, 'class' => $s->classGroup?->name],
                'attempt' => $a ? ['id' => $a->id, 'status' => $a->status, 'answered' => $a->answered, 'started_at' => $a->started_at,
                    'deadline_at' => $a->deadline_at, 'extra_minutes' => $a->extra_minutes, 'tab_switches' => $a->tab_switches,
                    'device_locked' => $a->device_hash !== '', 'last_saved' => $a->last_saved, 'score' => $a->score, 'auto_submitted' => $a->auto_submitted] : null];
        })];
    }

    private function attemptOf(Request $r, int $attemptId): Attempt
    {
        return Attempt::whereHas('exam', fn ($q) => $q->where('teacher_id', $r->user()->id))->findOrFail($attemptId);
    }

    public function extend(Request $r, int $attemptId, AttemptService $s)
    {
        $in = $r->validate(['minutes' => 'required|integer|between:1,60']);

        return $s->extend($this->attemptOf($r, $attemptId), $in['minutes'], $r->user())->only('id', 'deadline_at', 'extra_minutes');
    }

    public function resetDevice(Request $r, int $attemptId, AttemptService $s)
    {
        return $s->resetDevice($this->attemptOf($r, $attemptId), $r->user())->only('id', 'status');
    }

    /** Essay answers waiting for a mark (or all, with ?all=1), grouped by question. */
    public function essays(Request $r, int $id)
    {
        $e = $this->mine($r, $id);
        $rows = Answer::with('attempt.student')->whereHas('attempt', fn ($q) => $q->where('exam_id', $e->id)->where('status', '!=', 'in_progress'))
            ->whereHas('examQuestion', fn ($q) => $q->where('type', 'essay'))
            ->when(! $r->boolean('all'), fn ($q) => $q->whereNull('points_awarded'))->orderBy('id')->get()->groupBy('exam_question_id');

        return $e->questions()->where('type', 'essay')->get()->map(fn ($q) => [
            'question' => $q->only('id', 'position', 'body', 'points'),
            'answers' => $rows->get($q->id, collect())->map(fn ($a) => ['id' => $a->id, 'student' => $a->attempt->student->name,
                'essay' => $a->essay, 'points_awarded' => $a->points_awarded, 'feedback' => $a->feedback])->values(),
        ]);
    }

    public function grade(Request $r, int $answerId, AttemptService $s)
    {
        $in = $r->validate(['points' => 'required|numeric', 'feedback' => 'nullable|string|max:1000']);
        $answer = Answer::whereHas('attempt.exam', fn ($q) => $q->where('teacher_id', $r->user()->id))->findOrFail($answerId);

        return $s->grade($answer, $r->user(), (float) $in['points'], $in['feedback'] ?? null)->only('id', 'points_awarded', 'feedback');
    }

    public function results(Request $r, int $id, ItemAnalysis $analysis)
    {
        $e = $this->mine($r, $id)->load('questions');
        $attempts = Attempt::with('student.classGroup')->where('exam_id', $e->id)->orderByDesc('score')->get();

        return ['exam' => self::out($e), 'analysis' => $analysis->forExam($e), 'attempts' => $attempts->map(fn ($a) => [
            'id' => $a->id, 'student' => $a->student->name, 'number' => $a->student->number, 'class' => $a->student->classGroup?->name,
            'status' => $a->status, 'score' => $a->score, 'max_score' => $a->max_score, 'submitted_at' => $a->submitted_at,
            'auto_submitted' => $a->auto_submitted, 'tab_switches' => $a->tab_switches])];
    }

    public function export(Request $r, int $id)
    {
        $e = $this->mine($r, $id);
        $rows = Attempt::with('student.classGroup')->where('exam_id', $e->id)->orderBy('id')->get();
        $esc = fn ($v) => preg_match('/[",\n]/', (string) $v) ? '"' . str_replace('"', '""', (string) $v) . '"' : (string) $v;
        // A leading =, +, - or @ would make spreadsheet apps treat a name as a formula.
        $safe = fn ($v) => preg_match('/^[=+\-@]/', (string) $v) ? "'" . $v : $v;
        $lines = ['number,name,class,status,score,max_score,submitted_at,auto_submitted,tab_switches'];
        foreach ($rows as $a) {
            $lines[] = implode(',', array_map($esc, [$a->student->number, $safe($a->student->name), $a->student->classGroup?->name, $a->status,
                $a->score, $a->max_score, $a->submitted_at?->toIso8601String(), $a->auto_submitted ? 'yes' : 'no', $a->tab_switches]));
        }

        return response(implode("\n", $lines) . "\n", 200, ['Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="results-exam-' . $e->id . '.csv"']);
    }
}
