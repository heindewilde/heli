<script lang="ts">
  import { Globe, Linkedin, Twitter } from 'lucide-svelte';

  type Props = {
    url?: string | null;
    linkedinUrl?: string | null;
    xUrl?: string | null;
    /** A person's `url` is typically their LinkedIn profile; a company's is
        their website. Tells us which slot the primary `url` should fall into
        when the matching explicit column is empty. */
    primaryFallback?: 'website' | 'linkedin';
  };

  let { url, linkedinUrl, xUrl, primaryFallback = 'website' }: Props = $props();

  type Kind = 'website' | 'linkedin' | 'x' | null;
  function kindOf(u: string | null | undefined): Kind {
    if (!u) return null;
    let host: string;
    try {
      host = new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
    if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) return 'x';
    return 'website';
  }

  const slots = $derived.by(() => {
    const out = { website: null as string | null, linkedin: null as string | null, x: null as string | null };
    if (linkedinUrl) out.linkedin = linkedinUrl;
    if (xUrl) out.x = xUrl;
    const primaryKind = kindOf(url);
    if (primaryKind === 'linkedin' && !out.linkedin) out.linkedin = url!;
    else if (primaryKind === 'x' && !out.x) out.x = url!;
    else if (primaryKind === 'website') out.website = url!;
    // If the primary URL didn't classify (or matched a slot we already had),
    // fall back to whatever the entity is "supposed" to have.
    if (!out.website && primaryFallback === 'website' && url && primaryKind !== 'linkedin' && primaryKind !== 'x') {
      out.website = url;
    }
    return out;
  });

  const items = $derived(
    [
      { kind: 'website' as const, url: slots.website, icon: Globe, label: 'Website' },
      { kind: 'linkedin' as const, url: slots.linkedin, icon: Linkedin, label: 'LinkedIn' },
      { kind: 'x' as const, url: slots.x, icon: Twitter, label: 'X' }
    ].filter((i) => i.url)
  );
</script>

{#if items.length > 0}
  <div class="flex items-center gap-1">
    {#each items as item (item.kind)}
      <a
        href={item.url}
        target="_blank"
        rel="nofollow noopener noreferrer"
        title={item.label}
        aria-label={item.label}
        class="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
      >
        <item.icon size={13} strokeWidth={2} />
      </a>
    {/each}
  </div>
{/if}
