const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('node:path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

/**
 * Metro has to be told two things that esbuild never needed for `extension/`.
 *
 * The app shares real modules with the web app — `cleanUrl`, `duration`,
 * `weeks`, the outreach renderer — imported by relative path and never copied,
 * exactly as `extension/src/content.ts` does. esbuild bundles anything it is
 * pointed at; Metro refuses to resolve a file outside `projectRoot` unless it
 * sits under a watch folder, and it resolves *packages* by walking parent
 * directories unless told not to.
 *
 * Both defaults are wrong here, and the second one is dangerous.
 */
const config = getDefaultConfig(projectRoot);

/**
 * 1. Let Metro see the shared modules.
 *
 * Deliberately `src/lib`, not `repoRoot`. Watching the whole repo pulls the
 * app's own `node_modules` — svelte, vite, drizzle, tailwind — plus `build/`,
 * `.svelte-kit/` and `data/*.db` into Metro's file map: a slow start, and a
 * resolver that can see packages this bundle must never contain.
 */
config.watchFolders = [path.join(repoRoot, 'src', 'lib')];

/**
 * 2. Make the repo root's `node_modules` unreachable.
 *
 * Without this, a package missing from `mobile/node_modules` resolves out of the
 * app's own closure instead — svelte, vite, drizzle, tailwind are all up there.
 * It works on the machine that happens to have them and produces a broken
 * bundle everywhere else, which is the failure `scripts/check-externals.ts`
 * exists to prevent on the server.
 *
 * The obvious lever, `disableHierarchicalLookup: true`, is the wrong one and
 * was tried first: it also stops Metro descending into *nested*
 * `node_modules`, and Expo's own tree relies on them —
 * `node_modules/expo/node_modules/expo-asset` is not hoisted, so the bundle
 * failed on the very first import inside `expo`. Blocking one absolute path
 * keeps nested resolution working while closing the only hole that matters.
 *
 * The consequence is load-bearing and is written down in MOBILE.md: **every
 * shared `src/lib/` module must stay dependency-free**, because there is no
 * fallback resolution to save one that grows an import.
 */
const escaped = path.join(repoRoot, 'node_modules').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = new RegExp(`^${escaped}${path.sep === '\\' ? '\\\\' : '/'}.*$`);
config.resolver.nodeModulesPaths = [path.join(projectRoot, 'node_modules')];

module.exports = withNativeWind(config, { input: './global.css' });
