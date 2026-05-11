<script lang="ts">
  import { Linkedin, Twitter, Github, Globe, Mail } from 'lucide-svelte';

  type Props = {
    url?: string | null;
    domain?: string | null;
    email?: string | null;
  };

  let { url, domain, email }: Props = $props();

  type Kind = 'linkedin' | 'x' | 'github' | 'website';
  type Item = { kind: Kind | 'email'; href: string; label: string };

  function kindOfDomain(d: string | null | undefined): Kind | null {
    if (!d) return null;
    const h = d.toLowerCase();
    if (h === 'linkedin.com' || h.endsWith('.linkedin.com')) return 'linkedin';
    if (h === 'x.com' || h === 'twitter.com' || h.endsWith('.x.com') || h.endsWith('.twitter.com')) return 'x';
    if (h === 'github.com' || h.endsWith('.github.com')) return 'github';
    return 'website';
  }

  const items = $derived.by<Item[]>(() => {
    const out: Item[] = [];
    const k = kindOfDomain(domain);
    if (k && url) {
      const label = k === 'linkedin' ? 'LinkedIn' : k === 'x' ? 'X / Twitter' : k === 'github' ? 'GitHub' : (domain ?? 'Website');
      out.push({ kind: k, href: url, label });
    }
    if (email) {
      out.push({ kind: 'email', href: `mailto:${email}`, label: email });
    }
    return out;
  });
</script>

{#if items.length === 0}
  <span class="text-[var(--color-subtle)]">·</span>
{:else}
  <div class="flex items-center gap-1">
    {#each items as item (item.kind)}
      <a
        href={item.href}
        target={item.kind === 'email' ? undefined : '_blank'}
        rel={item.kind === 'email' ? undefined : 'nofollow noopener noreferrer'}
        title={item.label}
        aria-label={item.label}
        onclick={(e) => e.stopPropagation()}
        class="inline-flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
      >
        {#if item.kind === 'linkedin'}
          <Linkedin size={12} strokeWidth={2} />
        {:else if item.kind === 'x'}
          <Twitter size={12} strokeWidth={2} />
        {:else if item.kind === 'github'}
          <Github size={12} strokeWidth={2} />
        {:else if item.kind === 'email'}
          <Mail size={12} strokeWidth={2} />
        {:else}
          <Globe size={12} strokeWidth={2} />
        {/if}
      </a>
    {/each}
  </div>
{/if}
