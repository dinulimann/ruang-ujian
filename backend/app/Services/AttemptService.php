<?php

namespace App\Services;

use App\Models\Answer;
use App\Models\Attempt;
use App\Models\AttemptEvent;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Everything that happens while a student sits an exam. The server owns the clock: the deadline is
 * fixed when the attempt starts and answers are refused once it has passed (after a short grace
 * period for saves already in flight).
 */
class AttemptService
{
    /** Saves sent just before the deadline may arrive a little after it. */
    public const GRACE_SECONDS = 10;

    public const DEVICE_COOKIE = 'exam_device';

    private function now(): CarbonImmutable
    {
        return CarbonImmutable::now();
    }

    public static function deviceHash(string $cookie): string
    {
        return hash('sha256', $cookie);
    }

    public function canTake(Exam $exam, User $student): bool
    {
        return $exam->published_at !== null && $student->class_group_id !== null
            && $exam->classGroups()->whereKey($student->class_group_id)->exists();
    }

    /**
     * Starts the exam, or resumes it on the same device. Returns the attempt and the device cookie value.
     */
    public function start(Exam $exam, User $student, string $token, ?string $deviceCookie): array
    {
        if (! $this->canTake($exam, $student)) {
            Fail::with(404, 'not_found', 'Exam not found.');
        }
        if (! hash_equals(strtoupper($exam->token), strtoupper(trim($token)))) {
            Fail::with(422, 'wrong_token', 'That token is not right. Ask the proctor for the exam token.');
        }
        $device = $deviceCookie ?: Str::random(40);
        $existing = Attempt::where('exam_id', $exam->id)->where('student_id', $student->id)->first();
        if ($existing) {
            $this->ensureDevice($existing, $device);

            return [$this->refresh($existing), $device];
        }
        $now = $this->now();
        if (! $exam->isOpen($now)) {
            Fail::with(409, 'exam_not_open', $now < $exam->opens_at ? 'This exam has not opened yet.' : 'This exam has closed.');
        }
        $questions = $exam->questions()->get();
        $order = $questions->pluck('id')->all();
        if ($exam->shuffle_questions) {
            shuffle($order);
        }
        $optionOrder = [];
        foreach ($questions as $q) {
            if ($q->type === 'mcq') {
                $ids = array_column($q->options, 'id');
                if ($exam->shuffle_options) {
                    shuffle($ids);
                }
                $optionOrder[$q->id] = $ids;
            }
        }
        $deadline = $now->addMinutes($exam->duration_minutes);
        if ($deadline > $exam->closes_at) {
            $deadline = $exam->closes_at; // starting late does not buy time past the closing time
        }
        try {
            $attempt = DB::transaction(function () use ($exam, $student, $now, $deadline, $device, $order, $optionOrder, $questions) {
                $a = Attempt::create([
                    'exam_id' => $exam->id, 'student_id' => $student->id, 'status' => 'in_progress',
                    'started_at' => $now, 'deadline_at' => $deadline, 'device_hash' => self::deviceHash($device),
                    'question_order' => $order, 'option_order' => (object) $optionOrder, 'max_score' => $questions->sum('points'),
                ]);
                $this->event($a, 'started');

                return $a;
            });
        } catch (UniqueConstraintViolationException) {
            // Two start requests raced (double tap, two tabs): the other one created the attempt.
            $attempt = Attempt::where('exam_id', $exam->id)->where('student_id', $student->id)->firstOrFail();
            $this->ensureDevice($attempt, $device);
        }

        return [$attempt, $device];
    }

    /**
     * One attempt, one device. A teacher can release the lock if the student has to change computers; the next
     * device to open the exam then takes it over. Returns a new device cookie when this device needs one.
     */
    public function ensureDevice(Attempt $attempt, ?string $deviceCookie): ?string
    {
        if ($attempt->status !== 'in_progress') {
            return null;
        }
        if ($attempt->device_hash === '') {
            $issued = $deviceCookie ? null : Str::random(40);
            $attempt->update(['device_hash' => self::deviceHash($deviceCookie ?: $issued)]);
            $this->event($attempt, 'device_rebound');

            return $issued;
        }
        if (! $deviceCookie || ! hash_equals($attempt->device_hash, self::deviceHash($deviceCookie))) {
            $this->event($attempt, 'device_rejected');
            Fail::with(409, 'device_mismatch', 'This exam is already open on another device. Ask your teacher to reset it.');
        }

        return null;
    }

    /** Submits the attempt if its time is up. Called whenever an attempt is read. */
    public function refresh(Attempt $attempt): Attempt
    {
        if ($attempt->status === 'in_progress' && $this->now() > $attempt->deadline_at->addSeconds(self::GRACE_SECONDS)) {
            $this->finish($attempt, auto: true);
        }

        return $attempt->fresh();
    }

    /**
     * Saves one answer. Each save carries a number that increases in the browser; the upsert only
     * overwrites a stored answer with a higher number, so a slow, older request can never undo a newer one.
     */
    public function save(Attempt $attempt, ExamQuestion $q, array $in): array
    {
        if ($q->exam_id !== $attempt->exam_id) {
            Fail::with(404, 'not_found', 'Question not found.');
        }
        $attempt = $this->refresh($attempt);
        if ($attempt->status !== 'in_progress') {
            Fail::with(409, 'time_up', 'Time is up. Your answers were submitted.');
        }
        $option = null;
        $essay = null;
        if ($q->type === 'mcq') {
            $option = $in['option_id'] ?? null;
            if ($option !== null && ! in_array((int) $option, array_column($q->options, 'id'), true)) {
                Fail::with(422, 'invalid', 'That option does not belong to this question.');
            }
        } else {
            $essay = $in['essay'] ?? null;
        }
        $row = DB::selectOne('
            insert into answers (attempt_id, exam_question_id, option_id, essay, flagged, client_seq, saved_at)
            values (?, ?, ?, ?, ?, ?, ?)
            on conflict (attempt_id, exam_question_id) do update
              set option_id = excluded.option_id, essay = excluded.essay, flagged = excluded.flagged,
                  client_seq = excluded.client_seq, saved_at = excluded.saved_at
              where answers.client_seq < excluded.client_seq
            returning client_seq', [$attempt->id, $q->id, $option, $essay, (bool) ($in['flagged'] ?? false), (int) $in['seq'], $this->now()]);

        // No row back means the stored answer already has a newer save.
        return ['saved' => $row !== null, 'seq' => $row?->client_seq ?? Answer::where('attempt_id', $attempt->id)->where('exam_question_id', $q->id)->value('client_seq')];
    }

    public function submit(Attempt $attempt): Attempt
    {
        $attempt = $this->refresh($attempt);
        if ($attempt->status !== 'in_progress') {
            return $attempt; // already submitted, possibly by the timer: submitting twice is harmless
        }
        $this->finish($attempt, auto: false);

        return $attempt->fresh();
    }

    /** Locks the attempt, marks it submitted and scores the multiple-choice questions. */
    public function finish(Attempt $attempt, bool $auto): void
    {
        DB::transaction(function () use ($attempt, $auto) {
            $a = Attempt::whereKey($attempt->id)->lockForUpdate()->first();
            if ($a->status !== 'in_progress') {
                return;
            }
            $questions = ExamQuestion::where('exam_id', $a->exam_id)->get();
            $answers = Answer::where('attempt_id', $a->id)->get()->keyBy('exam_question_id');
            $hasEssay = false;
            foreach ($questions as $q) {
                $ans = $answers->get($q->id);
                if ($q->type === 'mcq') {
                    $points = $ans && $ans->option_id !== null && (int) $ans->option_id === $q->correctOptionId() ? $q->points : 0;
                    Answer::updateOrCreate(['attempt_id' => $a->id, 'exam_question_id' => $q->id],
                        ['points_awarded' => $points, 'saved_at' => $ans?->saved_at ?? $this->now()]);
                } elseif (! $ans || trim((string) $ans->essay) === '') {
                    // A blank essay needs no marking.
                    Answer::updateOrCreate(['attempt_id' => $a->id, 'exam_question_id' => $q->id],
                        ['points_awarded' => 0, 'saved_at' => $ans?->saved_at ?? $this->now()]);
                } else {
                    $hasEssay = true;
                }
            }
            $score = (float) Answer::where('attempt_id', $a->id)->sum('points_awarded');
            $a->update(['status' => $hasEssay ? 'submitted' : 'graded', 'submitted_at' => $this->now(), 'auto_submitted' => $auto, 'score' => $score]);
            $this->event($a, $auto ? 'auto_submitted' : 'submitted');
        });
    }

    /** Submits every attempt whose time ran out. Run every minute by the scheduler. */
    public function closeExpired(): int
    {
        $ids = Attempt::where('status', 'in_progress')->where('deadline_at', '<', $this->now()->subSeconds(self::GRACE_SECONDS))->pluck('id');
        foreach ($ids as $id) {
            $this->finish(Attempt::find($id), auto: true);
        }

        return $ids->count();
    }

    public function grade(Answer $answer, User $teacher, float $points, ?string $feedback): Answer
    {
        $q = $answer->examQuestion;
        if ($q->type !== 'essay') {
            Fail::with(422, 'invalid', 'Only essay answers are marked by hand.');
        }
        if ($points < 0 || $points > $q->points || fmod($points * 2, 1) !== 0.0) {
            Fail::with(422, 'invalid', "Points must be between 0 and {$q->points}, in steps of 0.5.", ['points' => 'out of range']);
        }
        DB::transaction(function () use ($answer, $teacher, $points, $feedback) {
            $a = Attempt::whereKey($answer->attempt_id)->lockForUpdate()->first();
            if ($a->status === 'in_progress') {
                Fail::with(409, 'not_submitted', 'The student is still working on this exam.');
            }
            $answer->update(['points_awarded' => $points, 'graded_by' => $teacher->id, 'feedback' => $feedback]);
            $pending = Answer::where('attempt_id', $a->id)->whereNull('points_awarded')->exists();
            $a->update(['score' => (float) Answer::where('attempt_id', $a->id)->sum('points_awarded'), 'status' => $pending ? 'submitted' : 'graded']);
        });

        return $answer->fresh();
    }

    public function extend(Attempt $attempt, int $minutes, User $teacher): Attempt
    {
        if ($attempt->status !== 'in_progress') {
            Fail::with(409, 'not_in_progress', 'Only an exam still in progress can be extended.');
        }
        $attempt->update(['deadline_at' => $attempt->deadline_at->addMinutes($minutes), 'extra_minutes' => $attempt->extra_minutes + $minutes]);
        $this->event($attempt, 'extended', ['minutes' => $minutes, 'by' => $teacher->name]);

        return $attempt->fresh();
    }

    public function resetDevice(Attempt $attempt, User $teacher): Attempt
    {
        $attempt->update(['device_hash' => '']);
        $this->event($attempt, 'device_reset', ['by' => $teacher->name]);

        return $attempt->fresh();
    }

    public function event(Attempt $attempt, string $type, array $meta = []): void
    {
        AttemptEvent::create(['attempt_id' => $attempt->id, 'type' => $type, 'meta' => $meta, 'at' => $this->now()]);
    }

    /** The exam as the student sees it: their question and option order, their answers, and no answer key. */
    public function paper(Attempt $attempt): array
    {
        $questions = ExamQuestion::where('exam_id', $attempt->exam_id)->get()->keyBy('id');
        $answers = Answer::where('attempt_id', $attempt->id)->get()->keyBy('exam_question_id');
        $out = [];
        foreach ($attempt->question_order as $i => $qid) {
            $q = $questions[$qid];
            $opts = collect($q->options)->keyBy('id');
            $a = $answers->get($qid);
            $out[] = [
                'id' => $q->id, 'number' => $i + 1, 'type' => $q->type, 'body' => $q->body, 'points' => $q->points,
                'image_url' => $q->image_path ? '/storage/' . $q->image_path : null,
                'options' => $q->type === 'mcq'
                    ? array_map(fn ($id) => ['id' => $id, 'body' => $opts[$id]['body']], $attempt->option_order[$qid] ?? [])
                    : [],
                'answer' => ['option_id' => $a?->option_id, 'essay' => $a?->essay, 'flagged' => (bool) $a?->flagged, 'seq' => $a?->client_seq ?? 0],
            ];
        }

        return $out;
    }
}
