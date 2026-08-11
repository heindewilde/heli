<script lang="ts">
  /**
   * Person avatars were hand-rolled inline at every call site — the list rows,
   * the pipeline cards, the dashboard lists, the interaction feed — each with
   * its own size, its own initials logic and its own grey fallback circle.
   * (`CompanyLogo` already covers companies and stays as it is; this is the
   * people half.)
   *
   * The fallback is tinted by a hash of the name rather than being grey, and
   * that is the one deliberately expressive decision in this component. In the
   * reference, colour reaches the UI almost entirely through small identity
   * chips — the avatar circles — and never through large fills. A wall of
   * identical grey initials is a big part of why the list reads as a
   * spreadsheet; a stable per-person hue makes rows recognisable before you
   * read them.
   *
   * Stable is the operative word: the hue is derived from the name, so it does
   * not shuffle between renders, sessions or machines, and it does not need a
   * column in the database.
   *
   * Lightness is themed in the scoped block below rather than baked into the
   * inline style — the same hue needs a pale wash on white and a deep one on
   * near-black, and computing that at the call site is how the two drift.
   */
  type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

  type Props = {
    name?: string | null;
    src?: string | null;
    size?: Size;
    /** Squared-off rather than round. Companies and projects read better so. */
    rounded?: boolean;
    class?: string;
  };

  let { name, src, size = 'md', rounded = false, class: className = '' }: Props = $props();

  const SIZES: Record<Size, string> = {
    xs: 'size-5 text-[9px]',
    sm: 'size-6 text-2xs',
    md: 'size-9 text-xs',
    lg: 'size-11 text-sm',
    xl: 'size-14 text-lg'
  };

  /** First letters of the first two words — "Karen Sparck Jones" → "KS". */
  const initials = $derived(
    (name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => [...w][0]?.toUpperCase() ?? '')
      .join('')
  );

  /**
   * FNV-1a over the name. Any stable hash would do; this one is four lines and
   * spreads short strings well enough that two people in the same list rarely
   * collide. 360 buckets, so the hue is the hash straight through.
   */
  const hue = $derived.by(() => {
    const s = (name ?? '').trim().toLowerCase();
    if (!s) return null;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return Math.abs(h) % 360;
  });
</script>

{#if src}
  <img
    {src}
    alt={name ?? ''}
    loading="lazy"
    decoding="async"
    class="shrink-0 object-cover ring-1 ring-[var(--color-border)] {rounded
      ? 'rounded-[var(--radius-md)]'
      : 'rounded-full'} {SIZES[size]} {className}"
  />
{:else}
  <span
    class="avatar-fallback flex shrink-0 items-center justify-center font-semibold select-none {rounded
      ? 'rounded-[var(--radius-md)]'
      : 'rounded-full'} {SIZES[size]} {className}"
    style={hue === null ? undefined : `--avatar-h:${hue};`}
    aria-hidden="true"
  >{initials}</span>
{/if}

<style>
  /* No name to hash — stay neutral rather than picking hue 0, which would make
     every unnamed record red. */
  .avatar-fallback {
    background: var(--color-surface-2);
    color: var(--color-muted);
    box-shadow: inset 0 0 0 1px var(--color-border);
  }
  .avatar-fallback[style*='--avatar-h'] {
    background: hsl(var(--avatar-h) 52% 93%);
    color: hsl(var(--avatar-h) 45% 32%);
    box-shadow: inset 0 0 0 1px hsl(var(--avatar-h) 40% 84%);
  }
  :global([data-theme='dark']) .avatar-fallback[style*='--avatar-h'] {
    background: hsl(var(--avatar-h) 30% 18%);
    color: hsl(var(--avatar-h) 55% 78%);
    box-shadow: inset 0 0 0 1px hsl(var(--avatar-h) 28% 30%);
  }
</style>
