<?php

namespace App\Services;

use App\Models\Answer;
use App\Models\Attempt;
use App\Models\Exam;

/**
 * Classical item analysis on submitted attempts:
 *  - difficulty p: share of students who got the question right (or average share of points for essays);
 *  - discrimination D: p in the top 27% of total scores minus p in the bottom 27%;
 *  - for multiple choice, how many picked each option, to spot distractors nobody chooses.
 */
class ItemAnalysis
{
    public const GROUP_SHARE = 0.27;

    public function forExam(Exam $exam): array
    {
        $attempts = Attempt::where('exam_id', $exam->id)->where('status', '!=', 'in_progress')->orderByDesc('score')->orderBy('id')->get(['id', 'score', 'max_score']);
        $n = $attempts->count();
        $scores = $attempts->pluck('score')->map(fn ($s) => (float) $s)->all();
        $k = $n ? max(1, (int) ceil($n * self::GROUP_SHARE)) : 0;
        $upper = $attempts->take($k)->pluck('id')->all();
        $lower = $attempts->reverse()->take($k)->pluck('id')->all();
        $answers = Answer::whereIn('attempt_id', $attempts->pluck('id'))->get()->groupBy('exam_question_id');

        $items = [];
        foreach ($exam->questions as $q) {
            $rows = $answers->get($q->id, collect());
            $ratio = fn ($a) => $a->points_awarded === null ? null : $a->points_awarded / $q->points;
            $p = $this->mean($rows->map($ratio)->filter(fn ($v) => $v !== null)->all());
            $pu = $this->mean($rows->whereIn('attempt_id', $upper)->map($ratio)->filter(fn ($v) => $v !== null)->all());
            $pl = $this->mean($rows->whereIn('attempt_id', $lower)->map($ratio)->filter(fn ($v) => $v !== null)->all());
            $d = $pu !== null && $pl !== null ? round($pu - $pl, 3) : null;
            $item = [
                'id' => $q->id, 'position' => $q->position, 'type' => $q->type, 'body' => $q->body, 'points' => $q->points,
                'difficulty' => $p === null ? null : round($p, 3), 'discrimination' => $d,
                'ungraded' => $rows->whereNull('points_awarded')->count(), 'flags' => [],
            ];
            if ($q->type === 'mcq') {
                $item['options'] = array_map(fn ($o) => [
                    'id' => $o['id'], 'body' => $o['body'], 'is_correct' => $o['is_correct'],
                    'chosen' => $rows->where('option_id', $o['id'])->count(),
                ], $q->options);
                $item['blank'] = $n - $rows->whereNotNull('option_id')->count();
                foreach ($item['options'] as $o) {
                    if (! $o['is_correct'] && $o['chosen'] === 0 && $n >= 10) {
                        $item['flags'][] = 'unused_distractor';
                        break;
                    }
                }
            }
            if ($p !== null && $n >= 5) {
                if ($p < 0.3) $item['flags'][] = 'hard';
                if ($p > 0.9) $item['flags'][] = 'easy';
            }
            if ($d !== null && $n >= 10) {
                if ($d < 0) $item['flags'][] = 'negative_discrimination';
                elseif ($d < 0.2) $item['flags'][] = 'low_discrimination';
            }
            $items[] = $item;
        }
        sort($scores);

        return [
            'attempts' => $n,
            'summary' => $n ? [
                'mean' => round(array_sum($scores) / $n, 2), 'median' => $this->median($scores),
                'min' => $scores[0], 'max' => $scores[$n - 1], 'max_score' => $attempts->first()->max_score,
            ] : null,
            'items' => $items,
        ];
    }

    private function mean(array $xs): ?float
    {
        return $xs ? array_sum($xs) / count($xs) : null;
    }

    private function median(array $sorted): float
    {
        $n = count($sorted);

        return $n % 2 ? $sorted[intdiv($n, 2)] : ($sorted[$n / 2 - 1] + $sorted[$n / 2]) / 2;
    }
}
