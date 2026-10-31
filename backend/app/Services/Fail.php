<?php

namespace App\Services;

use Illuminate\Http\Exceptions\HttpResponseException;

/** Stops the request with a JSON error the client can act on: {message, code, details}. */
final class Fail
{
    public static function with(int $status, string $code, string $message, array $details = []): never
    {
        throw new HttpResponseException(response()->json(
            array_filter(['message' => $message, 'code' => $code, 'details' => $details ?: null], fn ($v) => $v !== null),
            $status,
        ));
    }
}
