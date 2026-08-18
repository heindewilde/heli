<script lang="ts">
  import Popover from '$lib/ui/Popover.svelte';
  // OutreachDialog is imported lazily at its mount point below.
  //
  // That lazy import is only safe because `/people/[id]/+page.svelte` imports
  // the same component *statically*, which keeps it in a static chunk. Delete
  // that import — or add a third call site that is dynamic-only — and Rollup
  // gives OutreachDialog a chunk of its own, which transitively reaches
  // `squire-rte`; CLAUDE.md records that exact shape blanking every page in
  // production three times.
  import { Send, Building2, User } from 'lucide-svelte';
  import type { CompanyRecipient, Sender } from '$lib/outreach/render';

  type Person = {
    id: string;
    name: string;
    role: string | null;
    email: string | null;
    location: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    xUrl: string | null;
  };

  type Props = {
    /** The company itself, addressable when company templates exist. */
    company: CompanyRecipient & {
      id: string;
      /** LinkTarget fields, for the deep link. */
      phone: string | null;
      linkedinUrl: string | null;
      xUrl: string | null;
    };
    people: Person[];
    sender: Sender;
    /** True when the workspace has at least one `target='company'` template. */
    hasCompanyTemplates: boolean;
    onSent?: () => void;
  };

  let { company, people, sender, hasCompanyTemplates, onSent }: Props = $props();

  /**
   * Two ways to write from a company page, and the difference is who the
   * message is addressed to.
   *
   * A company template writes to the company's own address — `hello@`, its
   * LinkedIn page. A person template still addresses one person, so it means
   * choosing which of the company's people to write to. This used to render
   * nothing at all when a company had no linked people; now the company itself
   * is a valid addressee, so there is always something to offer.
   */
  let pickerOpen = $state(false);
  let dialogOpen = $state(false);
  let chosen = $state<{ recipient: Person | typeof company; target: 'person' | 'company' } | null>(
    null
  );

  /** Skip the picker when there is exactly one thing it could offer. */
  const onlyChoice = $derived(
    hasCompanyTemplates && people.length === 0
      ? ({ recipient: company, target: 'company' } as const)
      : !hasCompanyTemplates && people.length === 1
        ? ({ recipient: people[0], target: 'person' } as const)
        : null
  );

  const anything = $derived(hasCompanyTemplates || people.length > 0);

  function open(next: { recipient: Person | typeof company; target: 'person' | 'company' }) {
    chosen = next;
    pickerOpen = false;
    dialogOpen = true;
  }

  const triggerClass =
    'rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]';
</script>

{#if onlyChoice}
  <button
    type="button"
    title={`Write outreach to ${onlyChoice.recipient.name}`}
    onclick={() => open(onlyChoice)}
    class={triggerClass}
  >
    <Send size={16} strokeWidth={2} />
  </button>
{:else if anything}
  <Popover bind:open={pickerOpen} label="Write outreach" placement="bottom-end" panelClass="w-60">
    {#snippet trigger(attrs)}
      <button {...attrs} type="button" title="Write outreach" class={triggerClass}>
        <Send size={16} strokeWidth={2} />
      </button>
    {/snippet}

    {#snippet content()}
      <div class="flex flex-col gap-1 p-2">
        {#if hasCompanyTemplates}
          <button
            type="button"
            onclick={() => open({ recipient: company, target: 'company' })}
            class="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1.5 text-left hover:bg-[var(--color-bg)]"
          >
            <Building2 size={12} strokeWidth={2} class="shrink-0 text-[var(--color-subtle)]" />
            <span class="truncate text-xs font-medium">Write to {company.name}</span>
          </button>
        {/if}

        {#if people.length > 0}
          {#if hasCompanyTemplates}
            <span class="my-0.5 h-px bg-[var(--color-border)]" aria-hidden="true"></span>
          {/if}
          <p class="flex items-center gap-1.5 px-1.5 text-xs text-[var(--color-muted)]">
            <User size={11} strokeWidth={2} />
            …or write to someone here
          </p>
          <ul class="max-h-64 overflow-y-auto">
            {#each people as p (p.id)}
              <li>
                <button
                  type="button"
                  onclick={() => open({ recipient: p, target: 'person' })}
                  class="flex w-full flex-col items-start rounded-[var(--radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--color-bg)]"
                >
                  <span class="truncate text-xs font-medium">{p.name}</span>
                  {#if p.role}
                    <span class="truncate text-[11px] text-[var(--color-subtle)]">{p.role}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/snippet}
  </Popover>
{/if}

<!--
  Lazy for the same reason as on the person page: this button lives on
  `/companies/[id]`, and the composer only exists once somebody has picked who
  they are writing to. See the note at the top about why that is safe.
-->
{#if chosen}
  {#await import('./OutreachDialog.svelte') then { default: OutreachDialog }}
    <OutreachDialog
      open={dialogOpen}
      recipient={chosen.target === 'company'
        ? company
        : { ...(chosen.recipient as Person), companyName: company.name }}
      target={chosen.target}
      {sender}
      onclose={() => (dialogOpen = false)}
      {onSent}
    />
  {/await}
{/if}
