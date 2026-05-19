<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { autofocus } from '$lib/actions';
  let { data, form } = $props();
</script>

<svelte:head>
  <title>Admin — {APP_NAME}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
  {#if !data.authed}
    <div class="card">
      <h1>Admin</h1>
      <form method="POST" action="?/login">
        <input
          type="password"
          name="secret"
          placeholder="Admin secret"
          autocomplete="current-password"
          use:autofocus
        />
        {#if form?.error}<p class="error">{form.error}</p>{/if}
        <button type="submit">Sign in</button>
      </form>
    </div>
  {:else}
    <div class="card">
      <div class="header">
        <h1>Admin</h1>
        <form method="POST" action="?/logout">
          <button type="submit" class="signout">Sign out</button>
        </form>
      </div>

      <div class="stat">
        <span class="label">Total users</span>
        <span class="value">{data.total}</span>
      </div>

      {#if data.byRegion}
        <div class="regions">
          {#each data.byRegion as r}
            <div class="region">
              <span class="region-label">{r.label}</span>
              <span class="region-count">{r.count}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
  }

  .card {
    width: 100%;
    max-width: 360px;
    padding: 2rem;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: var(--color-surface);
  }

  h1 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 1.5rem;
    color: var(--color-text);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.875rem;
    box-sizing: border-box;
  }

  input:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  button[type='submit']:not(.signout) {
    padding: 0.5rem 0.75rem;
    background: var(--color-accent);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .error {
    font-size: 0.8rem;
    color: var(--color-danger, #e55);
    margin: 0;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .header h1 {
    margin: 0;
  }

  .signout {
    font-size: 0.8rem;
    color: var(--color-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .signout:hover {
    color: var(--color-text);
  }

  .stat {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 1rem;
  }

  .label {
    font-size: 0.875rem;
    color: var(--color-muted);
  }

  .value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--color-text);
    line-height: 1;
  }

  .regions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .region {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
  }

  .region-label {
    color: var(--color-muted);
  }

  .region-count {
    font-weight: 500;
    color: var(--color-text);
  }
</style>
