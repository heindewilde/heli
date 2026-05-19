<script lang="ts">
  import { enhance } from '$app/forms';
  import PersonPicker from '$lib/components/PersonPicker.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import { COLLECTION_ICON_MAP, COLLECTION_ICON_NAMES } from '$lib/collectionIcons';
  import type { BillingType, ProjectStatus } from '$lib/server/schema';
  import { autofocus } from '$lib/actions';

  let { form } = $props();
  let submitting = $state(false);

  let billingType = $state<BillingType>('none');
  let showBilling = $state(false);
  let status = $state<ProjectStatus>('active');
  let hourlyRate = $state('');
  let fixedFee = $state('');
  let currency = $state('USD');
  let selectedIcon = $state<string | null>(null);

  const STATUSES: ProjectStatus[] = ['active', 'paused', 'completed', 'archived'];
  const BILLING_TYPES_UI: BillingType[] = ['none', 'hourly', 'fixed'];

  type Person = { id: string; name: string; avatarUrl: string | null; role: string | null };
  type Company = { id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null };

  let selectedPeople = $state<Person[]>([]);
  let selectedCompany = $state<Company | null>(null);
  let extraCompanies = $state<Company[]>([]);

  const inputClass =
    'rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2';

  function addCompanyToList() {
    if (selectedCompany && !extraCompanies.some((c) => c.id === selectedCompany!.id)) {
      extraCompanies = [...extraCompanies, selectedCompany];
      selectedCompany = null;
    }
  }
  function removeCompany(id: string) {
    extraCompanies = extraCompanies.filter((c) => c.id !== id);
  }
</script>

<article class="mx-auto flex max-w-2xl flex-col gap-4">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">New project</h1>
    <p class="text-sm text-[var(--color-muted)]">
      Track a fundraise, a launch, a consulting engagement, or any ongoing collaboration.
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
    class="flex flex-col gap-4"
  >
    {#if selectedIcon}
      <input type="hidden" name="icon" value={selectedIcon} />
    {/if}

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
      <div class="flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
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
      {#if selectedIcon}
        <p class="text-xs text-[var(--color-subtle)]">
          <span class="font-medium text-[var(--color-text)]">{selectedIcon}</span> selected
        </p>
      {/if}
    </div>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Name *</span>
      <input name="name" required maxlength="200" class={inputClass} use:autofocus />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Description</span>
      <textarea name="description" rows="3" class={inputClass}></textarea>
    </label>

    <fieldset class="flex flex-wrap items-center gap-1.5 text-sm">
      <legend class="w-full text-[var(--color-muted)]">Status</legend>
      {#each STATUSES as s (s)}
        <label class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 {status === s
          ? 'border-[var(--color-highlight-border)] bg-[var(--color-highlight-bg)] text-[var(--color-text)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'}">
          <input
            type="radio"
            name="status"
            value={s}
            bind:group={status}
            class="sr-only"
          />
          {s}
        </label>
      {/each}
    </fieldset>

    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[var(--color-muted)]">Start date</span>
        <input type="date" name="startDate" class={inputClass} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[var(--color-muted)]">End date</span>
        <input type="date" name="endDate" class={inputClass} />
      </label>
    </div>

    <!-- Billing (optional) -->
    {#if !showBilling}
      <button
        type="button"
        onclick={() => (showBilling = true)}
        class="self-start text-xs text-[var(--color-subtle)] underline hover:text-[var(--color-text)]"
      >+ Add billing details</button>
    {:else}
      <fieldset class="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
        <div class="flex items-center justify-between">
          <legend class="text-xs text-[var(--color-muted)]">Billing</legend>
          <button
            type="button"
            onclick={() => { showBilling = false; billingType = 'none'; }}
            class="text-xs text-[var(--color-subtle)] hover:text-[var(--color-text)]"
          >Remove</button>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          {#each BILLING_TYPES_UI as t (t)}
            <label class="inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="billingType"
                value={t}
                bind:group={billingType}
              />
              <span>{t}</span>
            </label>
          {/each}
        </div>
        {#if billingType !== 'none'}
          <div class="flex flex-wrap items-end gap-3">
            {#if billingType === 'hourly'}
              <label class="flex flex-col gap-1 text-sm">
                <span class="text-[var(--color-muted)]">Hourly rate</span>
                <input
                  name="hourlyRate"
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  min="0"
                  bind:value={hourlyRate}
                  placeholder="200.00"
                  class="w-32 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                />
              </label>
            {:else if billingType === 'fixed'}
              <label class="flex flex-col gap-1 text-sm">
                <span class="text-[var(--color-muted)]">Fixed fee</span>
                <input
                  name="fixedFee"
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  min="0"
                  bind:value={fixedFee}
                  placeholder="10000.00"
                  class="w-40 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
                />
              </label>
            {/if}
            <label class="flex flex-col gap-1 text-sm">
              <span class="text-[var(--color-muted)]">Currency</span>
              <input
                name="currency"
                maxlength="3"
                bind:value={currency}
                placeholder="USD"
                class="w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 uppercase"
              />
            </label>
          </div>
        {/if}
      </fieldset>
    {/if}

    <div class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">People</span>
      <PersonPicker
        selected={selectedPeople}
        onAdd={(p) => (selectedPeople = [...selectedPeople, p])}
        onRemove={(id) => (selectedPeople = selectedPeople.filter((p) => p.id !== id))}
      />
      <input type="hidden" name="personIds" value={selectedPeople.map((p) => p.id).join(',')} />
    </div>

    <div class="flex flex-col gap-2 text-sm">
      <span class="text-[var(--color-muted)]">Companies</span>
      <CompanyPicker selected={selectedCompany} onPick={(c) => (selectedCompany = c)} />
      {#if selectedCompany}
        <button
          type="button"
          onclick={addCompanyToList}
          class="self-start rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface)]"
        >Add to project</button>
      {/if}
      {#if extraCompanies.length > 0}
        <ul class="flex flex-wrap gap-1.5">
          {#each extraCompanies as c (c.id)}
            <li class="inline-flex items-center gap-1 rounded-full bg-[var(--color-highlight-bg)] px-2 py-0.5 text-xs text-[var(--color-text)]">
              <span>{c.name}</span>
              <button
                type="button"
                onclick={() => removeCompany(c.id)}
                aria-label="Remove {c.name}"
                class="rounded-full p-0.5 hover:bg-[var(--color-highlight-border)]"
              >×</button>
            </li>
          {/each}
        </ul>
      {/if}
      <input type="hidden" name="companyIds" value={extraCompanies.map((c) => c.id).join(',')} />
    </div>

    {#if form?.error}
      <p class="rounded-[var(--radius-sm)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
        {form.error}
      </p>
    {/if}

    <div class="flex items-center gap-2">
      <button
        type="submit"
        disabled={submitting}
        class="rounded-[var(--radius-sm)] bg-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-hover)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60"
      >{submitting ? 'Saving…' : 'Save project'}</button>
      <a href="/projects" class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm">Cancel</a>
    </div>
  </form>
</article>
