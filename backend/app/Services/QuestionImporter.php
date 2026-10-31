<?php

namespace App\Services;

use App\Models\Question;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Imports questions from a CSV or Excel sheet with the columns
 *   type | question | a | b | c | d | e | answer | points
 * Every row is checked first. If any row is wrong nothing is imported, and every problem is reported with its row number.
 */
class QuestionImporter
{
    public const HEADERS = ['type', 'question', 'a', 'b', 'c', 'd', 'e', 'answer', 'points'];
    public const MAX_ROWS = 500;

    /** @return array{rows: list<array>, errors: list<array{row:int, message:string}>} */
    public function read(string $path, string $extension): array
    {
        $reader = $extension === 'xlsx' ? new XlsxReader() : new CsvReader();
        $reader->open($path);
        $rows = [];
        $errors = [];
        $header = null;
        $line = 0;
        foreach ($reader->getSheetIterator() as $sheet) {
            foreach ($sheet->getRowIterator() as $row) {
                $line++;
                $cells = array_map(fn ($v) => trim((string) ($v instanceof \DateTimeInterface ? $v->format('Y-m-d') : $v)), $row->toArray());
                if ($header === null) {
                    $header = array_map('strtolower', $cells);
                    $missing = array_diff(self::HEADERS, $header);
                    if ($missing) {
                        $errors[] = ['row' => 1, 'message' => 'Missing columns: ' . implode(', ', $missing) . '. Download the template.'];
                        break 2;
                    }
                    continue;
                }
                if (implode('', $cells) === '') {
                    continue;
                }
                if (count($rows) >= self::MAX_ROWS) {
                    $errors[] = ['row' => $line, 'message' => 'At most ' . self::MAX_ROWS . ' questions per file.'];
                    break 2;
                }
                $r = [];
                foreach (self::HEADERS as $h) {
                    $r[$h] = $cells[array_search($h, $header, true)] ?? '';
                }
                $problem = $this->check($r);
                if ($problem) {
                    $errors[] = ['row' => $line, 'message' => $problem];
                } else {
                    $rows[] = $r;
                }
            }
            break; // first sheet only
        }
        $reader->close();
        if (! $header && ! $errors) {
            $errors[] = ['row' => 1, 'message' => 'The file is empty.'];
        }

        return ['rows' => $rows, 'errors' => $errors];
    }

    private function check(array $r): ?string
    {
        $type = strtolower($r['type']);
        if (! in_array($type, ['mcq', 'essay'], true)) {
            return 'type must be mcq or essay.';
        }
        if (mb_strlen($r['question']) < 5) {
            return 'The question is empty or too short.';
        }
        if (! ctype_digit($r['points'] ?: '1') || (int) ($r['points'] ?: 1) < 1 || (int) ($r['points'] ?: 1) > 100) {
            return 'points must be a whole number from 1 to 100.';
        }
        if ($type === 'mcq') {
            $filled = array_filter(['a', 'b', 'c', 'd', 'e'], fn ($k) => $r[$k] !== '');
            if (count($filled) < 2) {
                return 'A multiple-choice question needs at least two options.';
            }
            $ans = strtolower($r['answer']);
            if (! in_array($ans, ['a', 'b', 'c', 'd', 'e'], true) || $r[$ans] === '') {
                return 'answer must be the letter of a filled-in option (A–E).';
            }
        }

        return null;
    }

    public function import(array $rows, int $subjectId, User $teacher): int
    {
        return DB::transaction(function () use ($rows, $subjectId, $teacher) {
            foreach ($rows as $r) {
                $q = Question::create(['subject_id' => $subjectId, 'teacher_id' => $teacher->id, 'type' => strtolower($r['type']),
                    'body' => $r['question'], 'points' => (int) ($r['points'] ?: 1)]);
                if ($q->type === 'mcq') {
                    $pos = 0;
                    foreach (['a', 'b', 'c', 'd', 'e'] as $k) {
                        if ($r[$k] !== '') {
                            $q->options()->create(['position' => $pos++, 'body' => $r[$k], 'is_correct' => strtolower($r['answer']) === $k]);
                        }
                    }
                }
            }

            return count($rows);
        });
    }
}
