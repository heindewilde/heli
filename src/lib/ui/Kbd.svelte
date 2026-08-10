<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = { children: Snippet };
  let { children }: Props = $props();
</script>

<kbd
  class="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-px font-sans text-[10px] leading-none text-[var(--color-muted)]"
>
  {@render children()}
</kbd>
