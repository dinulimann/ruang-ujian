<?php

namespace Database\Seeders;

use App\Models\Answer;
use App\Models\Attempt;
use App\Models\ClassGroup;
use App\Models\Exam;
use App\Models\Question;
use App\Models\Subject;
use App\Models\User;
use App\Services\AttemptService;
use App\Services\ExamPublisher;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;

/**
 * A fictional school with one teacher, 30 students in two classes, a biology question bank and three exams:
 * one finished (with results to analyse), one open now and one next week. Past attempts are made through
 * AttemptService with a moved clock, so they follow the same rules as real ones.
 */
class DemoSeeder extends Seeder
{
    private const NAMES = ['Adinda Putri', 'Bagas Pratama', 'Citra Lestari', 'Dimas Saputra', 'Eka Wulandari', 'Fajar Nugroho', 'Gita Anggraini',
        'Hafiz Ramadhan', 'Intan Permata', 'Joko Susilo', 'Kirana Dewi', 'Lukman Hakim', 'Maya Sari', 'Naufal Rizky', 'Oktavia Rahma',
        'Putra Wijaya', 'Qori Amelia', 'Rizal Fauzi', 'Salsabila Nur', 'Teguh Santoso', 'Ulfa Hidayah', 'Vino Aditya', 'Wulan Septiani',
        'Yusuf Maulana', 'Zahra Aulia', 'Arif Kurniawan', 'Bella Safitri', 'Candra Kusuma', 'Dewi Puspita', 'Erlangga Putra'];

    public function run(): void
    {
        mt_srand(2026);
        $ipa1 = ClassGroup::create(['name' => 'XII IPA 1']);
        $ipa2 = ClassGroup::create(['name' => 'XII IPA 2']);
        $bio = Subject::create(['name' => 'Biologi']);
        $mtk = Subject::create(['name' => 'Matematika']);
        Subject::create(['name' => 'Bahasa Indonesia']);

        $teacher = User::create(['name' => 'Ratna Kartika, S.Pd.', 'email' => 'ratna@sma-contoh.sch.id', 'number' => '198705122010012003',
            'role' => 'teacher', 'password' => 'guru1234']);
        $students = [];
        foreach (self::NAMES as $i => $name) {
            $students[] = User::create(['name' => $name, 'email' => 'siswa' . ($i + 1) . '@sma-contoh.sch.id', 'number' => (string) (24001 + $i),
                'role' => 'student', 'class_group_id' => $i < 15 ? $ipa1->id : $ipa2->id, 'password' => 'siswa1234']);
        }

        $bank = $this->biologyBank($bio, $teacher);
        $math = $this->mathBank($mtk, $teacher);
        $publisher = new ExamPublisher();
        $attempts = app(AttemptService::class);
        $now = CarbonImmutable::now();

        // 1. Finished last week: everyone took it; essays marked.
        $past = $publisher->save(null, ['title' => 'Ulangan Harian: Struktur dan Fungsi Sel', 'subject_id' => $bio->id,
            'class_group_ids' => [$ipa1->id, $ipa2->id], 'opens_at' => $now->subDays(7)->setTime(1, 0), 'closes_at' => $now->subDays(7)->setTime(5, 0),
            'duration_minutes' => 60, 'question_ids' => array_column($bank, 'id')], $teacher);
        $this->simulate($past, $students, $bank, $attempts, $teacher, gradeEssays: true);

        // 2. Open now, for two hours: a few students are working, nobody has finished.
        $open = $publisher->save(null, ['title' => 'Penilaian Tengah Semester Biologi', 'subject_id' => $bio->id,
            'class_group_ids' => [$ipa1->id, $ipa2->id], 'opens_at' => $now->subMinutes(20), 'closes_at' => $now->addHours(2),
            'duration_minutes' => 90, 'question_ids' => array_column($bank, 'id')], $teacher);
        $open->update(['token' => 'BIO24X']);
        foreach (array_slice($students, 1, 5) as $i => $s) {
            CarbonImmutable::setTestNow($now->subMinutes(15 - $i * 2));
            [$a] = $attempts->start($open, $s, 'BIO24X', 'demo-device-' . $s->id);
            $qs = $open->questions()->get()->keyBy('id');
            foreach (array_slice($a->question_order, 0, 4 + $i * 2) as $j => $qid) {
                $q = $qs[$qid];
                $attempts->save($a, $q, $q->type === 'mcq' ? ['option_id' => $a->option_order[$qid][mt_rand(0, 3)], 'seq' => $j + 1] : ['essay' => 'Sel tumbuhan memiliki dinding sel dan kloroplas…', 'seq' => $j + 1]);
            }
            if ($i === 2) $attempts->event($a, 'tab_hidden') || $a->increment('tab_switches');
        }
        CarbonImmutable::setTestNow();

        // 3. Next week.
        $publisher->save(null, ['title' => 'Kuis Matematika: Turunan Fungsi', 'subject_id' => $mtk->id, 'class_group_ids' => [$ipa1->id],
            'opens_at' => $now->addDays(6)->setTime(1, 0), 'closes_at' => $now->addDays(6)->setTime(3, 0), 'duration_minutes' => 45,
            'question_ids' => array_column($math, 'id')], $teacher);
    }

    /** Students answer according to an ability score, so stronger students get more right, as in a real class. */
    private function simulate(Exam $exam, array $students, array $bank, AttemptService $svc, User $teacher, bool $gradeEssays): void
    {
        $qs = $exam->questions()->get()->keyBy('question_id');
        foreach ($students as $k => $s) {
            $ability = -1.1 + 3.2 * mt_rand() / mt_getrandmax();
            $start = $exam->opens_at->addMinutes(5 + $k % 20);
            CarbonImmutable::setTestNow($start);
            [$a] = $svc->start($exam, $s, $exam->token, 'seed-' . $s->id);
            $seq = 0;
            foreach ($bank as $b) {
                $q = $qs[$b['id']];
                CarbonImmutable::setTestNow($start->addMinutes(++$seq * 2));
                if ($q->type === 'essay') {
                    $svc->save($a, $q, ['essay' => $ability > -0.8 ? $b['sample'][min(2, (int) floor($ability + 1))] : '', 'seq' => $seq]);
                    continue;
                }
                $correct = $q->correctOptionId();
                $wrong = array_values(array_diff(array_column($q->options, 'id'), [$correct]));
                if (($b['trap'] ?? false) && $ability > 0.5) {
                    $pick = $wrong[0]; // the ambiguous question: strong students pick a defensible "wrong" answer
                } else {
                    $p = ($b['trap'] ?? false) ? 0.5 : 1 / (1 + exp(-1.7 * ($ability - $b['difficulty'])));
                    $pick = mt_rand() / mt_getrandmax() < $p ? $correct : $wrong[mt_rand(0, count($wrong) - 1)];
                }
                if (mt_rand(1, 40) === 1) $pick = null; // the odd blank answer
                $svc->save($a, $q, ['option_id' => $pick, 'seq' => $seq]);
            }
            if ($k % 7 === 3) {
                $svc->event($a, 'tab_hidden');
                $a->increment('tab_switches');
            }
            CarbonImmutable::setTestNow($start->addMinutes(45));
            $svc->submit($a);
            if ($gradeEssays) {
                foreach (Answer::where('attempt_id', $a->id)->whereNull('points_awarded')->get() as $ans) {
                    $max = $ans->examQuestion->points;
                    $svc->grade($ans, $teacher, max(0, min($max, round(($ability + 1.1) / 3.2 * $max * 2) / 2)), null);
                }
            }
        }
        // Three essays left for the teacher to mark in the demo.
        $withEssay = Answer::whereHas('attempt', fn ($q) => $q->where('exam_id', $exam->id))->whereHas('examQuestion', fn ($q) => $q->where('type', 'essay'))
            ->whereRaw("coalesce(essay, '') <> ''")->orderByDesc('attempt_id')->get()->unique('attempt_id')->take(3);
        foreach ($withEssay as $ans) {
            $ans->update(['points_awarded' => null, 'graded_by' => null]);
            Attempt::whereKey($ans->attempt_id)->update(['status' => 'submitted', 'score' => (float) Answer::where('attempt_id', $ans->attempt_id)->sum('points_awarded')]);
        }
        CarbonImmutable::setTestNow();
    }

    private function mcq(Subject $s, User $t, string $body, array $options, int $correct, int $points = 2, ?string $image = null): Question
    {
        $q = Question::create(['subject_id' => $s->id, 'teacher_id' => $t->id, 'type' => 'mcq', 'body' => $body, 'points' => $points, 'image_path' => $image]);
        foreach ($options as $i => $o) {
            $q->options()->create(['position' => $i, 'body' => $o, 'is_correct' => $i === $correct]);
        }

        return $q;
    }

    private function biologyBank(Subject $s, User $t): array
    {
        Storage::disk('public')->put('questions/plant-cell.png', file_get_contents(__DIR__ . '/images/plant-cell.png'));
        $rows = [
            // [question, options, correct index, difficulty]
            ['Organel yang berfungsi sebagai tempat respirasi sel untuk menghasilkan energi (ATP) adalah …', ['Ribosom', 'Mitokondria', 'Lisosom', 'Badan Golgi', 'Vakuola'], 1, -1.2],
            ['Organel berikut yang hanya dimiliki oleh sel tumbuhan adalah …', ['Mitokondria', 'Ribosom', 'Kloroplas', 'Retikulum endoplasma', 'Membran sel'], 2, -1.0],
            ['Bagian sel yang mengatur keluar masuknya zat dari dan ke dalam sel adalah …', ['Membran sel', 'Dinding sel', 'Sitoplasma', 'Nukleolus', 'Vakuola'], 0, -0.6],
            ['Pusat pengendali seluruh kegiatan sel adalah …', ['Mitokondria', 'Inti sel (nukleus)', 'Sentriol', 'Ribosom', 'Lisosom'], 1, -1.4],
            ['Sintesis protein di dalam sel berlangsung di …', ['Lisosom', 'Badan Golgi', 'Ribosom', 'Vakuola', 'Peroksisom'], 2, -0.2],
            ['Organel yang memodifikasi, menyortir, dan mengemas protein sebelum dikirim ke luar sel adalah …', ['Badan Golgi', 'Retikulum endoplasma halus', 'Mitokondria', 'Lisosom', 'Sentrosom'], 0, 0.3],
            ['Dinding sel tumbuhan tersusun terutama oleh …', ['Kitin', 'Peptidoglikan', 'Selulosa', 'Glikogen', 'Fosfolipid'], 2, 0.1],
            ['Ciri utama sel prokariotik dibandingkan sel eukariotik adalah tidak memiliki …', ['Ribosom', 'Membran sel', 'Membran inti', 'Sitoplasma', 'DNA'], 2, 0.4],
            ['Organel yang berperan dalam pencernaan intrasel karena mengandung enzim hidrolitik adalah …', ['Lisosom', 'Ribosom', 'Kloroplas', 'Badan Golgi', 'Nukleolus'], 0, 0.0],
            ['Perpindahan zat dari konsentrasi tinggi ke konsentrasi rendah tanpa memerlukan energi disebut …', ['Transpor aktif', 'Difusi', 'Endositosis', 'Eksositosis', 'Pompa natrium-kalium'], 1, -0.4],
            ['Osmosis adalah perpindahan …', ['Zat terlarut dari larutan pekat ke encer', 'Air melalui membran semipermeabel dari larutan encer ke pekat', 'Ion dengan bantuan energi ATP', 'Molekul besar melalui vesikel', 'Gas melalui dinding sel'], 1, 0.6],
            ['Sel darah merah yang dimasukkan ke dalam larutan hipotonik akan …', ['Mengerut (krenasi)', 'Tidak berubah', 'Menggembung lalu pecah (hemolisis)', 'Mengalami plasmolisis', 'Membelah diri'], 2, 1.0],
            ['Retikulum endoplasma kasar disebut "kasar" karena permukaannya ditempeli …', ['Lisosom', 'Ribosom', 'Mitokondria', 'Sentriol', 'Vesikel'], 1, 0.2],
            ['Ilmuwan yang pertama kali menggunakan istilah "sel" setelah mengamati sayatan gabus adalah …', ['Robert Hooke', 'Anton van Leeuwenhoek', 'Matthias Schleiden', 'Theodor Schwann', 'Rudolf Virchow'], 0, -0.1],
            ['Sel hewan tidak memiliki dinding sel. Akibatnya, bentuk sel hewan umumnya …', ['Tetap dan kaku', 'Tidak tetap atau bervariasi', 'Selalu bulat sempurna', 'Selalu persegi', 'Berbentuk spiral'], 1, 0.8],
            ['Vakuola yang besar dan berisi cairan sel umumnya ditemukan pada …', ['Sel hewan', 'Sel bakteri', 'Sel tumbuhan dewasa', 'Sel darah merah', 'Sel saraf'], 2, -0.3],
        ];
        $out = [];
        foreach ($rows as [$body, $opts, $c, $diff]) {
            $out[] = ['id' => $this->mcq($s, $t, $body, $opts, $c)->id, 'difficulty' => $diff];
        }
        $out[] = ['id' => $this->mcq($s, $t, 'Perhatikan gambar di atas. Gambar tersebut menunjukkan struktur sel …', ['Hewan', 'Tumbuhan', 'Bakteri', 'Jamur', 'Darah merah'], 1, 2, 'questions/plant-cell.png')->id, 'difficulty' => -0.8];
        // An ambiguous question on purpose: item analysis should flag it.
        $out[] = ['id' => $this->mcq($s, $t, 'Organel yang paling penting di dalam sel adalah …', ['Inti sel', 'Ribosom', 'Membran sel', 'Mitokondria', 'Vakuola'], 1)->id, 'difficulty' => 0.0, 'trap' => true];
        $essays = [
            ['Sebutkan dan jelaskan tiga perbedaan antara sel hewan dan sel tumbuhan.', [
                'Sel tumbuhan punya dinding sel, sel hewan tidak.',
                'Sel tumbuhan punya dinding sel dan kloroplas, sel hewan tidak. Vakuola sel tumbuhan besar.',
                'Sel tumbuhan memiliki dinding sel dari selulosa, kloroplas untuk fotosintesis, dan vakuola besar. Sel hewan tidak berdinding sel, tidak berkloroplas, vakuolanya kecil atau tidak ada, dan memiliki sentriol.']],
            ['Jelaskan proses osmosis dan berikan satu contoh dalam kehidupan sehari-hari.', [
                'Osmosis itu perpindahan air.',
                'Osmosis adalah perpindahan air lewat membran dari larutan encer ke pekat, contohnya sayur layu jadi segar direndam air.',
                'Osmosis adalah perpindahan air melalui membran semipermeabel dari larutan hipotonis ke hipertonis. Contohnya mentimun yang direndam air garam menjadi lembek karena airnya keluar dari sel.']],
        ];
        foreach ($essays as [$body, $sample]) {
            $out[] = ['id' => Question::create(['subject_id' => $s->id, 'teacher_id' => $t->id, 'type' => 'essay', 'body' => $body, 'points' => 5])->id, 'sample' => $sample];
        }

        return $out;
    }

    private function mathBank(Subject $s, User $t): array
    {
        return array_map(fn ($r) => ['id' => $this->mcq($s, $t, $r[0], $r[1], $r[2])->id], [
            ['Turunan pertama dari f(x) = 3x² adalah …', ['3x', '6x', '6x²', 'x³', '9x'], 1],
            ['Jika f(x) = x³ − 2x, maka f′(2) = …', ['8', '10', '12', '4', '6'], 1],
            ['Turunan dari f(x) = 5 adalah …', ['5', '1', '0', '5x', 'x'], 2],
            ['Gradien garis singgung kurva y = x² di titik (3, 9) adalah …', ['3', '6', '9', '18', '2'], 1],
            ['Fungsi f(x) = x² − 4x naik pada interval …', ['x < 2', 'x > 2', 'x < −2', 'x > 4', '0 < x < 4'], 1],
        ]);
    }
}
