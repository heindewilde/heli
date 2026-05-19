<script lang="ts">
  import { enhance } from '$app/forms';
  import { FolderOpen, Search, X, Users, Building2 } from 'lucide-svelte';
  import { COLLECTION_ICON_MAP, COLLECTION_ICON_NAMES } from '$lib/collectionIcons';
  import { autofocus } from '$lib/actions';

  let { form } = $props();
  let submitting = $state(false);

  // Icon picker
  let selectedIcon = $state<string | null>(null);

  // Member search
  type Hit = { kind: 'person' | 'company'; id: string; title: string; sub: string | null };
  let memberQuery = $state('');
  let searchResults = $state<Hit[]>([]);
  let searching = $state(false);
  let selectedMembers = $state<Hit[]>([]);

  const inputClass =
    'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]';

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  async function onMemberInput() {
    if (searchTimer) clearTimeout(searchTimer);
    const q = memberQuery.trim();
    if (!q) { searchResults = []; return; }
    searchTimer = setTimeout(async () => {
      searching = true;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          searchResults = (data.items as Hit[]).filter(
            (h) => h.kind === 'person' || h.kind === 'company'
          );
        }
      } finally {
        searching = false;
      }
    }, 200);
  }

  function addMember(hit: Hit) {
    if (!selectedMembers.some((m) => m.kind === hit.kind && m.id === hit.id)) {
      selectedMembers = [...selectedMembers, hit];
    }
    memberQuery = '';
    searchResults = [];
  }

  function removeMember(hit: Hit) {
    selectedMembers = selectedMembers.filter((m) => !(m.kind === hit.kind && m.id === hit.id));
  }
</script>

<article class="mx-auto flex max-w-2xl flex-col gap-6">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">New collection</h1>
    <p class="mt-1 text-sm text-[var(--color-muted)]">
      A named group of people and companies — like "warm intros" or "speakers I follow".
    </p>
  </header>

  <form
    method="POST"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        await update();
        submitting = false;
      };
    }}
    class="flex flex-col gap-5"
  >
    <!-- Hidden inputs for icon and members -->
    {#if selectedIcon}
      <input type="hidden" name="icon" value={selectedIcon} />
    {/if}
    {#each selectedMembers as m}
      <input type="hidden" name="member" value="{m.kind}:{m.id}" />
    {/each}

    <!-- Icon picker -->
    <div class="flex flex-col gap-2">
      <span class="text-sm text-[var(--color-muted)]">
        Icon
        {#if selectedIcon}
          <button
            type="button"
            onclick={() => (selectedIcon = null)}
            class="ml-1 text-xs text-[var(--color-subtle)] underline hover:text-[var(--color-text)]"
          >clear</button>
        {/if}
      </span>
      <div class="flex flex-wrap gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 max-h-48 overflow-y-auto">
        {#each COLLECTION_ICON_NAMES as name}
          {@const Ic = COLLECTION_ICON_MAP[name]}
          <button
            type="button"
            title={name}
            onclick={() => (selectedIcon = selectedIcon === name ? null : name)}
            class="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] transition-colors {selectedIcon === name
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
              : 'text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]'}"
          >
            <Ic size={16} strokeWidth={2} />
          </button>
        {/each}
      </div>
      <p class="text-xs text-[var(--color-subtle)]">
        {#if selectedIcon}
          <span class="font-medium text-[var(--color-text)]">{selectedIcon}</span> selected
        {:else}
          No icon selected — defaults to folder
        {/if}
      </p>
    </div>

    <!-- Name -->
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Name <span class="text-[var(--color-danger)]">*</span></span>
      <input name="name" required maxlength="200" class={inputClass} use:autofocus />
    </label>

    <!-- Description -->
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Description</span>
      <textarea name="description" rows="2" class={inputClass}></textarea>
    </label>

    <!-- Member search -->
    <div class="flex flex-col gap-2">
      <span class="text-sm text-[var(--color-muted)]">Members <span class="text-xs text-[var(--color-subtle)]">— add more later</span></span>

      {#if selectedMembers.length > 0}
        <div class="flex flex-wrap gap-1.5">
          {#each selectedMembers as m (m.kind + m.id)}
            <span class="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-0.5 pl-2 pr-1 text-xs text-[var(--color-text)]">
              {#if m.kind === 'person'}
                <Users size={11} strokeWidth={2} class="text-[var(--color-muted)] shrink-0" />
              {:else}
                <Building2 size={11} strokeWidth={2} class="text-[var(--color-muted)] shrink-0" />
              {/if}
              <span class="max-w-[12rem] truncate">{m.title}</span>
              <button
                type="button"
                onclick={() => removeMember(m)}
                class="ml-0.5 rounded-full p-0.5 hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)]"
              ><X size={10} strokeWidth={2.5} /></button>
            </span>
          {/each}
        </div>
      {/if}

      <div class="relative">
        <span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--color-subtle)]">
          {#if searching}
            <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-muted)]"></span>
          {:else}
            <Search size={14} strokeWidth={2} />
          {/if}
        </span>
        <input
          bind:value={memberQuery}
          oninput={onMemberInput}
          type="search"
          placeholder="Search people and companies…"
          autocomplete="off"
          class="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-3 text-sm focus:outline-none focus:border-[var(--color-accent)]"
        />
        {#if searchResults.length > 0}
          <ul class="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-lg">
            {#each searchResults as hit (hit.kind + hit.id)}
              {@const already = selectedMembers.some((m) => m.kind === hit.kind && m.id === hit.id)}
              <li>
                <button
                  type="button"
                  onclick={() => addMember(hit)}
                  class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors {already
                    ? 'opacity-40'
                    : 'hover:bg-[var(--color-surface)]'}"
                >
                  <span class="shrink-0 text-[var(--color-subtle)]">
                    {#if hit.kind === 'person'}
                      <Users size={14} strokeWidth={2} />
                    {:else}
                      <Building2 size={14} strokeWidth={2} />
                    {/if}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium text-[var(--color-text)]">{hit.title}</span>
                    {#if hit.sub}
                      <span class="block truncate text-xs text-[var(--color-muted)]">{hit.sub}</span>
                    {/if}
                  </span>
                  {#if already}
                    <span class="shrink-0 text-xs text-[var(--color-subtle)]">Added</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>

    {#if form?.error}
      <p class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
        {form.error}
      </p>
    {/if}

    <div class="flex items-center gap-2 pt-1">
      <button
        type="submit"
        disabled={submitting}
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60"
      >{submitting ? 'Saving…' : 'Create collection'}</button>
      <a href="/collections" class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface)]">Cancel</a>
    </div>
  </form>
</article>
