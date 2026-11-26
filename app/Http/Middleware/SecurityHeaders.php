<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    /**
     * Set on every response. Kept in one place so the policy stays consistent
     * between the app and guest layouts and future pages don't need to opt in.
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Livewire also reads Vite's nonce when preserving the policy across wire:navigate.
        $nonce = base64_encode(random_bytes(16));
        app()->instance('csp-nonce', $nonce);
        Vite::useCspNonce($nonce);

        /** @var Response $response */
        $response = $next($request);

        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

        // `npm run dev`/`composer run dev` serves assets from Vite's own dev
        // server (a different origin, on a port that isn't fixed) rather than
        // the built, same-origin bundle `npm run build` produces — the two
        // are irreconcilable under one static policy, so the strict, nonce-
        // based CSP below only applies outside local development.
        if (! app()->environment('local')) {
            $response->headers->set('Content-Security-Policy', $this->contentSecurityPolicy($nonce));
        }

        if ($request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }

    /**
     * Vite assets and the Livewire CSP bundle are served locally. The Bunny
     * font is external, and flag-icons uses data URIs in its CSS.
     */
    private function contentSecurityPolicy(string $nonce): string
    {
        return implode('; ', [
            "default-src 'self'",
            "script-src 'self' 'nonce-{$nonce}'",
            "style-src 'self' 'unsafe-inline' https://fonts.bunny.net",
            "font-src 'self' https://fonts.bunny.net",
            "img-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
        ]);
    }
}
