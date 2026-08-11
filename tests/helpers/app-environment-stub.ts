/**
 * Stand-in for SvelteKit's `$app/environment`, another virtual module the plain
 * node test runner cannot resolve.
 *
 * Faithful rather than empty, for the same reason as `env-stub.ts`. `dev` is the
 * one export server code here reads, and it reads it for exactly one purpose:
 * `secure: !dev` on a cookie. Reporting `dev: true` under test matches how the
 * suite actually runs — over plain http, where a `Secure` cookie would be
 * dropped — so a handler that sets a cookie can be tested at all.
 */
export const dev = true;
export const browser = false;
export const building = false;
export const version = 'test';
