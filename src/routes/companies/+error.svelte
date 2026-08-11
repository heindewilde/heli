<script lang="ts">
  /**
   * Scoped to the section, so a missing record renders inside the app shell
   * with the navigation intact. Without this file the root `+error.svelte`
   * replaces the entire shell, which for a stale link out of a reminder email
   * means losing the whole app to show a 404.
   */
  import { page } from '$app/state';
  import { Frown } from 'lucide-svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';

  const notFound = $derived(page.status === 404);
</script>

<div class="flex min-h-[60vh] items-center justify-center">
  <EmptyState
    icon={Frown}
    title={notFound ? 'That company is gone' : 'Something went wrong'}
    description={notFound
      ? 'The record was deleted, or the link points somewhere that never existed.'
      : page.error?.message}
    bordered={false}
  >
    {#snippet actions()}
      <Button href="/companies" variant="secondary" size="md">Back to companies</Button>
    {/snippet}
  </EmptyState>
</div>
