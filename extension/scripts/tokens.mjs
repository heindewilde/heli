/**
 * The token parser moved to `scripts/tokens.mjs` at the repo root when the
 * mobile app became a second consumer — reaching into a sibling build
 * artifact to borrow a parser is worse than having it in one neutral place.
 *
 * Re-exported from here so `build.mjs` and anything else that imports
 * `./tokens.mjs` keeps its path.
 */
export { extractTokens, parseTokens } from '../../scripts/tokens.mjs';
