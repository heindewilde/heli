// The interaction type vocabulary, with no dependencies.
//
// Split out of `interactions.ts` because that module imports lucide icons for
// TYPE_META, and server code (saveInteraction.ts) only ever needs the list and
// the guard. Importing the icon module server-side pulled the whole UI icon
// package into the server graph.

export const INTERACTION_TYPES = [
  'call',
  'email',
  'meeting',
  'dm',
  'event',
  'note',
  'other'
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

export function isInteractionType(v: unknown): v is InteractionType {
  return typeof v === 'string' && (INTERACTION_TYPES as readonly string[]).includes(v);
}
