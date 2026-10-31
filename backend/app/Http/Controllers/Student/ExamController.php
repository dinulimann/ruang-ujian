<?php

namespace App\Http\Controllers\Student;

use App\Http\Controllers\Controller;
use App\Models\Answer;
use App\Models\Attempt;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Services\AttemptService;
use Illuminate\Http\Request;

class ExamController extends Controller
{
    public function __construct(private AttemptService $attempts)
    {
    }

    private function cookie(string $value)
    {
        return cookie(AttemptService::DEVICE_COOKIE, $value, 12 * 60, '/', null, request()->isSecure(), true, false, 'lax');
    }

    public function index(Request $r)
    {
        $u = $r->user();
        $exams = Exam::with('subject')->withCount('questions')->whereNotNull('published_at')
            ->whereHas('classGroups', fn ($q) => $q->whereKey($u->class_group_id))->orderBy('opens_at')->get();
        $mine = Attempt::where('student_id', $u->id)->whereIn('exam_id', $exams->pluck('id'))->get()->keyBy('exam_id');

        return ['server_now' => now(), 'exams' => $exams->map(fn ($e) => [
            'id' => $e->id, 'title' => $e->title, 'subject' => $e->subject->name, 'opens_at' => $e->opens_at, 'closes_at' => $e->closes_at,
            'duration_minutes' => $e->duration_minutes, 'questions' => $e->questions_count,
            'attempt' => ($a = $mine->get($e->id)) ? ['id' => $a->id, 'status' => $a->status, 'score' => $e->show_results && $a->status === 'graded' ? $a->score : null, 'max_score' => $a->max_score] : null,
        ])];
    }

    public function start(Request $r, int $examId)
    {
        $in = $r->validate(['token' => 'required|string|max:12']);
        $exam = Exam::findOrFail($examId);
        [$attempt, $device] = $this->attempts->start($exam, $r->user(), $in['token'], $r->cookie(AttemptService::DEVICE_COOKIE));

        return response()->json(['attempt_id' => $attempt->id, 'status' => $attempt->status])->withCookie($this->cookie($device));
    }

    private function mine(Request $r, int $id): Attempt
    {
        return Attempt::with('exam.subject')->where('student_id', $r->user()->id)->findOrFail($id);
    }

    public function show(Request $r, int $id)
    {
        $a = $this->attempts->refresh($this->mine($r, $id));
        $issued = $this->attempts->ensureDevice($a, $r->cookie(AttemptService::DEVICE_COOKIE));
        $base = ['id' => $a->id, 'status' => $a->status, 'exam' => ['id' => $a->exam->id, 'title' => $a->exam->title, 'subject' => $a->exam->subject->name],
            'server_now' => now(), 'deadline_at' => $a->deadline_at, 'grace_seconds' => AttemptService::GRACE_SECONDS];
        if ($a->status !== 'in_progress') {
            return $base;
        }
        $res = response()->json($base + ['questions' => $this->attempts->paper($a)]);

        return $issued ? $res->withCookie($this->cookie($issued)) : $res;
    }

    public function save(Request $r, int $id, int $questionId)
    {
        $in = $r->validate(['option_id' => 'nullable|integer', 'essay' => 'nullable|string|max:10000', 'flagged' => 'boolean', 'seq' => 'required|integer|min:1']);
        $a = $this->mine($r, $id);
        $this->attempts->ensureDevice($a, $r->cookie(AttemptService::DEVICE_COOKIE));

        return $this->attempts->save($a, ExamQuestion::findOrFail($questionId), $in) + ['server_now' => now()];
    }

    /** The browser reports when the student leaves the exam tab or fullscreen. */
    public function event(Request $r, int $id)
    {
        $in = $r->validate(['type' => 'required|in:tab_hidden,fullscreen_exit,offline,online']);
        $a = $this->mine($r, $id);
        if ($a->status === 'in_progress') {
            $this->attempts->event($a, $in['type']);
            if ($in['type'] === 'tab_hidden') {
                $a->increment('tab_switches');
            }
        }

        return response()->noContent();
    }

    public function submit(Request $r, int $id)
    {
        $a = $this->mine($r, $id);
        $this->attempts->ensureDevice($a, $r->cookie(AttemptService::DEVICE_COOKIE));

        return $this->attempts->submit($a)->only('id', 'status', 'submitted_at', 'auto_submitted');
    }

    /**
     * The score once marking is finished (if the teacher shows results). The right answers are shown only
     * after the exam closes, so a student who finished early cannot pass them to classmates still working.
     */
    public function result(Request $r, int $id)
    {
        $a = $this->mine($r, $id);
        $e = $a->exam;
        if ($a->status === 'in_progress') {
            return response()->json(['message' => 'Submit the exam first.', 'code' => 'not_submitted'], 409);
        }
        $out = ['id' => $a->id, 'exam' => ['title' => $e->title, 'subject' => $e->subject->name, 'closes_at' => $e->closes_at],
            'status' => $a->status, 'submitted_at' => $a->submitted_at, 'auto_submitted' => $a->auto_submitted, 'show_results' => $e->show_results];
        if (! $e->show_results || $a->status !== 'graded') {
            return $out;
        }
        $out += ['score' => $a->score, 'max_score' => $a->max_score];
        if (now() < $e->closes_at) {
            return $out + ['review' => null, 'review_from' => $e->closes_at];
        }
        $answers = Answer::where('attempt_id', $a->id)->get()->keyBy('exam_question_id');
        $qs = ExamQuestion::where('exam_id', $e->id)->get()->keyBy('id');

        return $out + ['review' => collect($a->question_order)->values()->map(function ($qid, $i) use ($qs, $answers) {
            $q = $qs[$qid];
            $ans = $answers->get($qid);

            return ['number' => $i + 1, 'type' => $q->type, 'body' => $q->body, 'points' => $q->points, 'awarded' => $ans?->points_awarded,
                'feedback' => $ans?->feedback, 'essay' => $ans?->essay, 'chosen' => $ans?->option_id, 'correct' => $q->correctOptionId(),
                'options' => array_map(fn ($o) => ['id' => $o['id'], 'body' => $o['body']], $q->options)];
        })];
    }
}
