<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;

class AuthController extends Controller
{
    public static function me(User $u): array
    {
        return ['id' => $u->id, 'name' => $u->name, 'number' => $u->number, 'role' => $u->role, 'class' => $u->classGroup?->name];
    }

    /** Students sign in with their NIS, teachers with NIP or email. Five wrong tries lock the login for a minute. */
    public function login(Request $r)
    {
        $in = $r->validate(['login' => 'required|string|max:120', 'password' => 'required|string|max:200']);
        $key = 'login:' . strtolower($in['login']) . '|' . $r->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json(['message' => 'Too many attempts. Try again in ' . RateLimiter::availableIn($key) . ' seconds.', 'code' => 'throttled'], 429);
        }
        $field = str_contains($in['login'], '@') ? 'email' : 'number';
        if (! Auth::guard('web')->attempt([$field => strtolower(trim($in['login'])), 'password' => $in['password']])) {
            RateLimiter::hit($key, 60);

            return response()->json(['message' => 'Wrong number or password.', 'code' => 'bad_credentials'], 401);
        }
        RateLimiter::clear($key);
        $r->session()->regenerate();

        return self::me($r->user()->load('classGroup'));
    }

    public function logout(Request $r)
    {
        Auth::guard('web')->logout();
        $r->session()->invalidate();
        $r->session()->regenerateToken();

        return response()->noContent();
    }

    public function show(Request $r)
    {
        return self::me($r->user()->load('classGroup'));
    }
}
