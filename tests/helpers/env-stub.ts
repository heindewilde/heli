/**
 * Stand-in for SvelteKit's `$env/dynamic/private`, which is a virtual module
 * the plain node test runner cannot resolve.
 *
 * Faithful rather than empty: SvelteKit's dynamic private env *is* the process
 * environment at runtime, so anything reading a flag through it behaves in the
 * suite exactly as it does in production.
 */
export const env = process.env as Record<string, string | undefined>;
