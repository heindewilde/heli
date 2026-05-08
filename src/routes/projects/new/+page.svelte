<script lang="ts">
  import { enhance } from '$app/forms';
  import PersonPicker from '$lib/components/PersonPicker.svelte';
  import CompanyPicker from '$lib/components/CompanyPicker.svelte';
  import type { BillingType, ProjectStatus } from '$lib/server/schema';

  let { form } = $props();
  let submitting = $state(false);

  let billingType = $state<BillingType>('none');
  let status = $state<ProjectStatus>('active');
  let hourlyRate = $state('');
  let fixedFee = $state('');
  let currency = $state('USD');

  const STATUSES: ProjectStatus[] = ['active', 'paused', 'archived'];
  const BILLING_TYPES_UI: BillingType[] = ['none', 'hourly', 'fixed'];

  type Person = { id: string; name: string; avatarUrl: string | null; role: string | null };
  type Company = { id: string; name: string; logoUrl: string | null; faviconUrl: string | null; domain: string | null };

  let selectedPeople = $state<Person[]>([]);
  let selectedCompany = $state<Company | null>(null);
  // Quick way to attach more than one company on creation: stash an array
  // below the picker. The form serialises both arrays as CSVs.
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
      Track a fundraise, a launch, a consulting engagement, or any ongoing collaboration. Members can come from people and companies you've already saved.
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
    class="flex flex-col gap-3"
  >
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Name *</span>
      <input name="name" required maxlength="200" class={inputClass} />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Description</span>
      <textarea name="description" rows="3" class={inputClass}></textarea>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[var(--color-muted)]">Next step</span>
      <input
        name="nextStep"
        maxlength="200"
        placeholder="One line — e.g. 'Send deck to Sequoia by Friday'"
        class={inputClass}
      />
    </label>

    <fieldset class="flex flex-wrap items-center gap-1.5 text-sm">
      <legend class="w-full text-[var(--color-muted)]">Status</legend>
      {#each STATUSES as s (s)}
        <label class="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 {status === s
          ? 'border-[var(--color-product-border)] bg-[var(--color-product-bg)] text-[var(--color-product)]'
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

    <fieldset class="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
      <legend class="px-1 text-xs text-[var(--color-muted)]">Billing</legend>
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
            <li class="inline-flex items-center gap-1 rounded-full bg-[var(--color-product-bg)] px-2 py-0.5 text-xs text-[var(--color-product)]">
              <span>{c.name}</span>
              <button
                type="button"
                onclick={() => removeCompany(c.id)}
                aria-label="Remove {c.name}"
                class="rounded-full p-0.5 hover:bg-[var(--color-product-border)]"
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
        class="rounded-[var(--radius-sm)] bg-[var(--color-product)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >{submitting ? 'Saving…' : 'Save project'}</button>
      <a href="/projects" class="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm">Cancel</a>
    </div>
  </form>
</article>
