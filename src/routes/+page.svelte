<script lang="ts">
  import Landing from '$lib/components/Landing.svelte';
  let { data } = $props();
</script>

{#if data.user}
  <section class="flex flex-col gap-2">
    <h1 class="text-2xl font-semibold tracking-tight">
      Welcome{data.user.username ? `, ${data.user.username}` : ''}.
    </h1>
    <p class="text-sm text-[var(--color-muted)]">
      Your dashboard will live here. People, Companies, and Interactions arrive in Phase 2 and 3.
    </p>
  </section>
{:else}
  <Landing />
{/if}
