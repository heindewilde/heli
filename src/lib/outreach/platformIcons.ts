import { Mail, Linkedin, Twitter, MessageCircle, Phone, MessageSquare } from 'lucide-svelte';
import type { OutreachPlatform } from './platforms';

/**
 * Icons kept apart from `platforms.ts` so the server can import the platform
 * table without dragging the lucide package into its module graph — the same
 * split as `interactionTypes.ts` / `interactions.ts`.
 */
export const PLATFORM_ICONS: Record<OutreachPlatform, typeof Mail> = {
  email: Mail,
  linkedin_dm: Linkedin,
  linkedin_note: Linkedin,
  linkedin_inmail: Linkedin,
  x_dm: Twitter,
  whatsapp: MessageCircle,
  call: Phone,
  other: MessageSquare
};
