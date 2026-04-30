<script lang="ts">
  import { APP_NAME, APP_TAGLINE } from '$lib/branding';
</script>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-3 px-6">
  <span class="text-sm text-[var(--color-muted)]">Hello,</span>
  <h1 class="text-4xl font-semibold tracking-tight">{APP_NAME}</h1>
  <p class="text-[var(--color-muted)]">{APP_TAGLINE}</p>
</main>
