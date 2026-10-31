<?php

use Illuminate\Support\Facades\Route;

// The React app (built into public/app) uses hash routes, so the server only serves its shell.
Route::get('/', fn () => file_exists(public_path('app/index.html'))
    ? response()->file(public_path('app/index.html'), ['Cache-Control' => 'no-cache'])
    : response('Build the frontend first: cd frontend && npm run build', 503));
