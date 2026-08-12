/**
 * The icon vocabulary, with no dependencies.
 *
 * `collectionIcons.ts` statically imports sixty lucide components to build the
 * picker's map. The *names* are the shared part: they are what is stored in
 * `collections.icon` and `projects.icon`, and what a non-Svelte consumer needs
 * in order to render the same picker with its own icon package — the mobile app
 * maps these onto `lucide-react-native`.
 *
 * This list is the source of truth. `COLLECTION_ICON_MAP` is typed
 * `Record<CollectionIconName, …>`, so a name added here without a matching
 * component — or a component whose export name drifts — is a compile error
 * rather than a blank square in the picker.
 */

export const COLLECTION_ICON_NAMES = [
  'Users', 'User', 'UserCheck', 'UserPlus', 'Heart', 'HeartHandshake',
  'Globe', 'Home', 'MapPin', 'Building2',
  'Briefcase', 'Rocket', 'Target', 'Trophy', 'Award', 'Crown', 'Gem', 'Zap',
  'DollarSign', 'TrendingUp', 'BarChart3', 'Wallet',
  'Lightbulb', 'Brain', 'BookOpen', 'Sparkles', 'Microscope',
  'Mail', 'Phone', 'MessageSquare', 'Bell', 'Send',
  'Activity', 'Flame', 'Clock', 'Calendar', 'CheckCircle2',
  'Tag', 'Bookmark', 'Pin', 'Star', 'ListTodo', 'Archive', 'Package',
  'Gift', 'Coffee', 'Music', 'Camera', 'Mic', 'Flag', 'Layers', 'Link',
  'Key', 'Shield', 'Hash', 'Network', 'Handshake', 'Megaphone',
  'Plane', 'Stethoscope', 'GraduationCap', 'TreePine'
] as const;

export type CollectionIconName = (typeof COLLECTION_ICON_NAMES)[number];

export function isCollectionIconName(v: unknown): v is CollectionIconName {
  return typeof v === 'string' && (COLLECTION_ICON_NAMES as readonly string[]).includes(v);
}
