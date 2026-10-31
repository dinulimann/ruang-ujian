<?php

use App\Models\Question;
use Illuminate\Http\UploadedFile;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer;

function csvFile(string $content): UploadedFile
{
    $path = tempnam(sys_get_temp_dir(), 'q') . '.csv';
    file_put_contents($path, $content);

    return new UploadedFile($path, 'soal.csv', 'text/csv', null, true);
}

it('imports a CSV, with a dry run first', function () {
    $s = school(0, 0);
    $file = csvFile("type,question,a,b,c,d,e,answer,points\nmcq,Ibu kota Indonesia adalah,Bandung,Jakarta,Medan,,,B,2\nessay,Jelaskan fotosintesis,,,,,,,5\n");
    as_($s->teacher)->post('/api/teacher/questions/import', ['file' => $file, 'subject_id' => $s->subject->id, 'dry_run' => true])->assertOk()->assertJson(['valid' => 2]);
    expect(Question::count())->toBe(0);
    as_($s->teacher)->post('/api/teacher/questions/import', ['file' => csvFile(file_get_contents($file->getRealPath())), 'subject_id' => $s->subject->id])->assertCreated()->assertJson(['imported' => 2]);
    $q = Question::with('options')->where('type', 'mcq')->first();
    expect($q->options->pluck('body')->all())->toBe(['Bandung', 'Jakarta', 'Medan']);
    expect($q->options->where('is_correct', true)->first()->body)->toBe('Jakarta');
});

it('imports nothing when any row is wrong, and says which rows', function () {
    $s = school(0, 0);
    $file = csvFile("type,question,a,b,c,d,e,answer,points\nmcq,Soal yang benar,Satu,Dua,,,,A,1\nmcq,Soal tanpa kunci,Satu,Dua,,,,F,1\nessay,Soal esai yang benar,,,,,,,3\ntrue_false,Tipe tidak dikenal,,,,,,,1\n");
    $res = as_($s->teacher)->post('/api/teacher/questions/import', ['file' => $file, 'subject_id' => $s->subject->id])->assertStatus(422);
    expect(collect($res->json('details'))->pluck('row')->all())->toBe([3, 5]);
    expect(Question::count())->toBe(0);
});

it('imports an Excel sheet', function () {
    $s = school(0, 0);
    $path = tempnam(sys_get_temp_dir(), 'q') . '.xlsx';
    $w = new Writer();
    $w->openToFile($path);
    $w->addRow(Row::fromValues(['type', 'question', 'a', 'b', 'c', 'd', 'e', 'answer', 'points']));
    $w->addRow(Row::fromValues(['mcq', '2 + 2 = …', '3', '4', '5', '', '', 'B', 1]));
    $w->close();
    as_($s->teacher)->post('/api/teacher/questions/import', ['file' => new UploadedFile($path, 'soal.xlsx', null, null, true), 'subject_id' => $s->subject->id])
        ->assertCreated()->assertJson(['imported' => 1]);
});

it('keeps an exam unchanged when the bank question is edited, and locks a started exam', function () {
    $s = school(1, 2);
    $e = exam($s);
    $q = $s->questions[0];
    as_($s->teacher)->postJson("/api/teacher/questions/{$q->id}", ['subject_id' => $s->subject->id, 'type' => 'mcq', 'body' => 'Teks yang diubah', 'points' => 2,
        'options' => [['body' => 'x', 'is_correct' => true], ['body' => 'y']]])->assertOk();
    expect($e->questions()->where('question_id', $q->id)->value('body'))->toBe('Pertanyaan pilihan ganda 1');
    startExam($e, $s->students[0]);
    as_($s->teacher)->putJson("/api/teacher/exams/{$e->id}", ['title' => 'Baru', 'subject_id' => $s->subject->id, 'class_group_ids' => [$s->class->id],
        'opens_at' => now(), 'closes_at' => now()->addHour(), 'duration_minutes' => 10, 'question_ids' => [$q->id]])->assertStatus(409)->assertJson(['code' => 'exam_started']);
});

it('requires exactly one correct option and validates the image', function () {
    $s = school(0, 0);
    $base = ['subject_id' => $s->subject->id, 'type' => 'mcq', 'body' => 'Pertanyaan baru', 'points' => 1];
    as_($s->teacher)->postJson('/api/teacher/questions', $base + ['options' => [['body' => 'a', 'is_correct' => true], ['body' => 'b', 'is_correct' => true]]])->assertStatus(422);
    as_($s->teacher)->post('/api/teacher/questions', $base + ['options' => [['body' => 'a', 'is_correct' => '1'], ['body' => 'b', 'is_correct' => '0']],
        'image' => UploadedFile::fake()->create('virus.php', 10, 'application/x-php')])->assertStatus(422);
    as_($s->teacher)->post('/api/teacher/questions', $base + ['options' => [['body' => 'a', 'is_correct' => '1'], ['body' => 'b', 'is_correct' => '0']],
        'image' => UploadedFile::fake()->image('sel.png', 400, 300)])->assertCreated()->assertJsonPath('image_url', fn ($u) => str_starts_with($u, '/storage/questions/'));
});
