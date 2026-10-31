<?php

namespace App\Http\Controllers\Teacher;

use App\Http\Controllers\Controller;
use App\Models\Question;
use App\Services\QuestionImporter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class QuestionController extends Controller
{
    private function mine(Request $r, int $id): Question
    {
        return Question::with('options', 'subject')->where('teacher_id', $r->user()->id)->findOrFail($id);
    }

    private static function out(Question $q): array
    {
        return ['id' => $q->id, 'subject_id' => $q->subject_id, 'subject' => $q->subject?->name, 'type' => $q->type, 'body' => $q->body,
            'image_url' => $q->image_path ? '/storage/' . $q->image_path : null, 'points' => $q->points, 'created_at' => $q->created_at,
            'options' => $q->options->map(fn ($o) => ['id' => $o->id, 'body' => $o->body, 'is_correct' => $o->is_correct])->values()];
    }

    public function index(Request $r)
    {
        $q = Question::with('options', 'subject')->where('teacher_id', $r->user()->id)
            ->when($r->integer('subject_id'), fn ($b, $s) => $b->where('subject_id', $s))
            ->when($r->input('type'), fn ($b, $t) => $b->where('type', $t))
            ->when($r->input('q'), fn ($b, $s) => $b->where('body', 'ilike', '%' . addcslashes($s, '%_\\') . '%'))
            ->orderByDesc('id')->paginate(min(100, max(5, $r->integer('per_page', 20))));

        return ['data' => collect($q->items())->map(fn ($x) => self::out($x)), 'total' => $q->total(), 'page' => $q->currentPage(), 'last_page' => $q->lastPage()];
    }

    private function validated(Request $r): array
    {
        $in = $r->validate([
            'subject_id' => 'required|exists:subjects,id',
            'type' => 'required|in:mcq,essay',
            'body' => 'required|string|min:5|max:5000',
            'points' => 'required|integer|between:1,100',
            'options' => 'required_if:type,mcq|array|min:2|max:5',
            'options.*.body' => 'required|string|max:1000',
            'options.*.is_correct' => 'boolean',
            'image' => 'nullable|image|mimes:jpeg,png,webp|max:2048|dimensions:max_width=4000,max_height=4000',
            'remove_image' => 'boolean',
        ]);
        if ($in['type'] === 'mcq' && collect($in['options'])->where('is_correct', true)->count() !== 1) {
            abort(response()->json(['message' => 'Mark exactly one option as correct.', 'errors' => ['options' => ['Mark exactly one option as correct.']]], 422));
        }

        return $in;
    }

    private function persist(Question $q, array $in, Request $r): Question
    {
        return DB::transaction(function () use ($q, $in, $r) {
            if ($r->hasFile('image')) {
                $old = $q->image_path;
                $q->image_path = $r->file('image')->store('questions', 'public');
                if ($old) Storage::disk('public')->delete($old);
            } elseif (($in['remove_image'] ?? false) && $q->image_path) {
                Storage::disk('public')->delete($q->image_path);
                $q->image_path = null;
            }
            $q->fill(['subject_id' => $in['subject_id'], 'type' => $in['type'], 'body' => $in['body'], 'points' => $in['points']])->save();
            $q->options()->delete();
            if ($in['type'] === 'mcq') {
                foreach (array_values($in['options']) as $i => $o) {
                    $q->options()->create(['position' => $i, 'body' => $o['body'], 'is_correct' => (bool) ($o['is_correct'] ?? false)]);
                }
            }

            return $q->fresh(['options', 'subject']);
        });
    }

    public function store(Request $r)
    {
        $q = new Question(['teacher_id' => $r->user()->id]);

        return response()->json(self::out($this->persist($q, $this->validated($r), $r)), 201);
    }

    /** Changing a question does not touch exams that already use it: they keep their own copy. */
    public function update(Request $r, int $id)
    {
        return self::out($this->persist($this->mine($r, $id), $this->validated($r), $r));
    }

    public function destroy(Request $r, int $id)
    {
        $this->mine($r, $id)->delete();

        return response()->noContent();
    }

    public function template()
    {
        $csv = implode(',', QuestionImporter::HEADERS) . "\n"
            . "mcq,\"Ibu kota Indonesia adalah …\",Bandung,Jakarta,Surabaya,Medan,,B,1\n"
            . "essay,\"Jelaskan proses fotosintesis secara singkat.\",,,,,,,5\n";

        return response($csv, 200, ['Content-Type' => 'text/csv; charset=utf-8', 'Content-Disposition' => 'attachment; filename="question-template.csv"']);
    }

    /** With dry_run the file is only checked; the client shows the preview before importing for real. */
    public function import(Request $r, QuestionImporter $importer)
    {
        $in = $r->validate(['file' => 'required|file|max:5120|mimes:csv,txt,xlsx', 'subject_id' => 'required|exists:subjects,id', 'dry_run' => 'boolean']);
        $ext = strtolower($r->file('file')->getClientOriginalExtension()) === 'xlsx' ? 'xlsx' : 'csv';
        ['rows' => $rows, 'errors' => $errors] = $importer->read($r->file('file')->getRealPath(), $ext);
        if ($errors) {
            return response()->json(['message' => count($errors) . ' row(s) need fixing. Nothing was imported.', 'code' => 'import_errors', 'details' => $errors, 'valid' => count($rows)], 422);
        }
        if ($in['dry_run'] ?? false) {
            return ['valid' => count($rows), 'preview' => array_slice($rows, 0, 5)];
        }

        return response()->json(['imported' => $importer->import($rows, (int) $in['subject_id'], $r->user())], 201);
    }
}
