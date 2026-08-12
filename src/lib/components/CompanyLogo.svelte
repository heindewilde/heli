<script lang="ts">
  import { Building2 } from 'lucide-svelte';
  import { logoDevUrl, type LogoFormat } from '$lib/logo';
  import { initialsOf } from '$lib/initials';

  type Rounded = 'sm' | 'md' | 'full';

  type Props = {
    domain?: string | null;
    fallbackUrl?: string | null;
    name?: string | null;
    size?: number;
    rounded?: Rounded;
    format?: LogoFormat;
    class?: string;
  };

  let {
    domain,
    fallbackUrl = null,
    name = '',
    size = 36,
    rounded = 'sm',
    format = 'webp',
    class: className = ''
  }: Props = $props();

  const initials = $derived(initialsOf(name));

  const light = $derived(logoDevUrl(domain, { size: 128, theme: 'light', format }));
  const dark = $derived(logoDevUrl(domain, { size: 128, theme: 'dark', format }));
  const primary = $derived(light ?? fallbackUrl);

  let errored = $state(false);
  $effect(() => {
    void primary;
    errored = false;
  });

  const radius = $derived(
    rounded === 'full'
      ? 'rounded-full'
      : rounded === 'md'
        ? 'rounded-[var(--radius-md)]'
        : 'rounded-[var(--radius-sm)]'
  );
</script>

<span
  class="flex shrink-0 items-center justify-center overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-muted)] {radius} {className}"
  style="width: {size}px; height: {size}px;"
>
  {#if primary && !errored}
    {#if light && dark}
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset={dark} />
        <img
          src={light}
          alt=""
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          class="h-full w-full object-cover"
          onerror={() => (errored = true)}
        />
      </picture>
    {:else}
      <img
        src={primary}
        alt=""
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        class="h-full w-full object-cover"
        onerror={() => (errored = true)}
      />
    {/if}
  {:else if initials}
    {initials}
  {:else}
    <Building2 size={Math.max(12, Math.round(size / 2.5))} strokeWidth={2} />
  {/if}
</span>
