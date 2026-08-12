<script lang="ts">
  /**
   * One collection/project icon, resolved lazily.
   *
   * `collectionIcons.ts` statically imports all 60 lucide icons so the picker
   * can render a grid of them. That barrel compiles to a ~17.7 KB chunk, and it
   * was a *static* dependency of four routes that only ever render one icon —
   * including `/people/[id]` and `/companies/[id]`, the two heaviest pages in
   * the app, via `CollectionsCard`.
   *
   * Importing the barrel on demand keeps one canonical list (splitting it into
   * a second "names only" module would be two lists to keep in step) while
   * moving those 17.7 KB out of the pages that need one glyph from it. Every
   * card on a page shares the one fetch.
   *
   * The box is reserved at `size` so the icon cannot shift the layout when it
   * lands, and nothing is rendered when `name` is null — same as before.
   */
  type Props = {
    name: string | null;
    size?: number;
    strokeWidth?: number;
    class?: string;
  };

  let { name, size = 16, strokeWidth = 2, class: klass = '' }: Props = $props();

  async function load(icon: string) {
    const { COLLECTION_ICON_MAP } = await import('$lib/collectionIcons');
    return COLLECTION_ICON_MAP[icon] ?? null;
  }
</script>

{#if name}
  <span
    class="inline-flex shrink-0 items-center justify-center {klass}"
    style="width:{size}px;height:{size}px"
  >
    {#await load(name) then Icon}
      {#if Icon}
        <Icon {size} {strokeWidth} />
      {/if}
    {/await}
  </span>
{/if}
