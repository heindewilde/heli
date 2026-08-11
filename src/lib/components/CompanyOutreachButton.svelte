<script lang="ts">
  import Popover from '$lib/ui/Popover.svelte';
  import OutreachDialog from './OutreachDialog.svelte';
  import { Send } from 'lucide-svelte';
  import type { Sender } from '$lib/outreach/render';

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
    companyName: string;
    people: Person[];
    sender: Sender;
    onSent?: () => void;
  };

  let { companyName, people, sender, onSent }: Props = $props();

  /**
   * A template addresses a person — you cannot DM a company — so writing from
   * a company page means choosing which of its people to write to. With
   * exactly one there is nothing to choose, so the picker is skipped.
   */
  let pickerOpen = $state(false);
  let dialogOpen = $state(false);
  let chosen = $state<Person | null>(null);

  function open(person: Person) {
    chosen = person;
    pickerOpen = false;
    dialogOpen = true;
  }
</script>

{#if people.length === 1}
  <button
    type="button"
    title={`Write outreach to ${people[0].name}`}
    onclick={() => open(people[0])}
    class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
  >
    <Send size={16} strokeWidth={2} />
  </button>
{:else if people.length > 1}
  <Popover
    bind:open={pickerOpen}
    label="Who at {companyName}?"
    placement="bottom-end"
    panelClass="w-56"
  >
    {#snippet trigger(attrs)}
      <button
        {...attrs}
        type="button"
        title="Write outreach"
        class="rounded-[var(--radius-sm)] p-2 text-[var(--color-subtle)] hover:bg-[var(--color-surface)]"
      >
        <Send size={16} strokeWidth={2} />
      </button>
    {/snippet}

    {#snippet content()}
      <div class="flex flex-col gap-1 p-2">
        <p class="px-1 text-xs text-[var(--color-muted)]">Who at {companyName}?</p>
        <ul class="max-h-64 overflow-y-auto">
          {#each people as p (p.id)}
            <li>
              <button
                type="button"
                onclick={() => open(p)}
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
      </div>
    {/snippet}
  </Popover>
{/if}

{#if chosen}
  <OutreachDialog
    open={dialogOpen}
    person={{ ...chosen, companyName }}
    {sender}
    onclose={() => (dialogOpen = false)}
    {onSent}
  />
{/if}
