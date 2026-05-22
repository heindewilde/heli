<script lang="ts">
  import { APP_NAME } from '$lib/branding';
  import { autofocus } from '$lib/actions';
  import StatGrid from './StatGrid.svelte';
  import Sparkline from './Sparkline.svelte';
  import Histogram from './Histogram.svelte';
  let { data, form } = $props();

  function fmt(n: number): string {
    return n.toLocaleString();
  }

  function fmtBytes(n: number | null): string {
    if (n == null) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function fmtUptime(sec: number): string {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
    return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
  }

  function fmtMoney(cents: number, currency: string): string {
    const v = cents / 100;
    try {
      return new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(v);
    } catch {
      return `${currency} ${v.toFixed(0)}`;
    }
  }

  function fmtAgo(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    if (diff < 30 * 86400_000) return `${Math.floor(diff / 86400_000)}d ago`;
    return new Date(ts).toISOString().slice(0, 10);
  }

  const tableLabels: Record<string, string> = {
    people: 'People',
    companies: 'Companies',
    interactions: 'Interactions',
    tasks: 'Tasks',
    reminders: 'Reminders',
    projects: 'Projects',
    pipelines: 'Pipelines',
    pipeline_items: 'Pipeline items',
    collections: 'Collections',
    tags: 'Tags',
    oauth_accounts: 'OAuth accounts'
  };
</script>

<svelte:head>
  <title>Admin — {APP_NAME}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if !data.authed}
  <div class="login-page">
    <div class="card login">
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
  </div>
{:else}
  <div class="dashboard">
    <header class="top">
      <h1>Admin · {APP_NAME}</h1>
      <div class="top-right">
        <span class="badge" data-tone={data.ops.selfHost ? 'self' : 'cloud'}>
          {data.ops.selfHost ? 'Self-hosted' : 'Cloud'} · {data.ops.version}
        </span>
        <form method="POST" action="?/logout">
          <button type="submit" class="signout">Sign out</button>
        </form>
      </div>
    </header>

    <!-- Section 1: Growth -->
    <section class="panel">
      <h2>Growth</h2>
      <StatGrid
        tiles={[
          { label: 'Total users', value: fmt(data.combined.totalUsers) },
          { label: 'New · 24h', value: fmt(data.combined.new24h) },
          { label: 'New · 7d', value: fmt(data.combined.new7d) },
          { label: 'New · 30d', value: fmt(data.combined.new30d) },
          { label: 'Active sessions', value: fmt(data.combined.activeSessions) },
          {
            label: 'Unused reset tokens',
            value: fmt(data.combined.resetTokens),
            tone: data.combined.resetTokens > 0 ? 'warn' : 'default'
          }
        ]}
      />

      <div class="two-col">
        <Sparkline values={data.combined.signupBuckets} label="Signups · last 30 days" />

        <div class="auth-block">
          <div class="block-title">Auth methods</div>
          <div class="auth-row">
            <span class="auth-lab">Password</span>
            <span class="auth-val">{fmt(data.combined.auth.passwordOnly)}</span>
          </div>
          <div class="auth-row">
            <span class="auth-lab">OAuth</span>
            <span class="auth-val">{fmt(data.combined.auth.oauthOnly)}</span>
          </div>
          {#if data.combined.auth.providers.length}
            <div class="providers">
              {#each data.combined.auth.providers as p (p.provider)}
                <span class="chip">{p.provider} · {fmt(p.count)}</span>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      {#if data.multi}
        <div class="region-table">
          <div class="block-title">By region</div>
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th>Users</th>
                <th>% total</th>
                <th>New 7d</th>
                <th>Active</th>
                <th>DB size</th>
              </tr>
            </thead>
            <tbody>
              {#each data.perRegion as r (r.region)}
                <tr>
                  <td>{r.label}</td>
                  <td>{fmt(r.users)}</td>
                  <td>{data.combined.totalUsers ? ((r.users / data.combined.totalUsers) * 100).toFixed(0) : 0}%</td>
                  <td>{fmt(r.newUsers7d)}</td>
                  <td>{fmt(r.activeSessions)}</td>
                  <td>{fmtBytes(r.dbSizeBytes)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <div class="two-col">
        <div>
          <div class="block-title">Top signup domains</div>
          <ul class="domain-list">
            {#each data.topDomains as d (d.domain)}
              <li>
                <span class="dom">{d.domain}</span>
                <span class="cnt">{fmt(d.count)}</span>
              </li>
            {/each}
            {#if data.topDomains.length === 0}
              <li class="empty">No data yet</li>
            {/if}
          </ul>
        </div>

        <div>
          <div class="block-title">Recent signups</div>
          <ul class="signup-list">
            {#each data.recents as r (r.maskedEmail + r.createdAt)}
              <li>
                <span class="mail">{r.maskedEmail}</span>
                <span class="meta">
                  <span class="badge sm" data-tone={r.authMethod === 'oauth' ? 'cloud' : 'self'}>{r.authMethod}</span>
                  {fmtAgo(r.createdAt)}
                </span>
              </li>
            {/each}
            {#if data.recents.length === 0}
              <li class="empty">No signups yet</li>
            {/if}
          </ul>
        </div>
      </div>
    </section>

    <!-- Section 2: Engagement -->
    <section class="panel">
      <h2>Engagement</h2>
      <StatGrid
        tiles={[
          { label: 'DAU', value: fmt(data.combined.dau), sub: '≈ logins last 24h' },
          { label: 'WAU', value: fmt(data.combined.wau), sub: '≈ logins last 7d' },
          { label: 'MAU', value: fmt(data.combined.mau), sub: 'sessions still valid' },
          { label: 'Stale users', value: fmt(data.staleUsers), sub: 'no recent session', tone: data.staleUsers > 0 ? 'warn' : 'default' }
        ]}
      />
      <Sparkline values={data.combined.dauTrend} label="DAU · last 30 days (from snapshots)" />
      <p class="caption">
        Sessions don't track last-seen separately. DAU/WAU/MAU are derived from session expiry
        assuming a 30-day TTL — accurate within a day on each end.
      </p>
    </section>

    <!-- Section 3: Content footprint -->
    <section class="panel">
      <h2>Content footprint</h2>
      <div class="content-grid">
        {#each data.combined.content as t (t.table)}
          <div class="content-cell">
            <div class="content-lab">{tableLabels[t.table] ?? t.table}</div>
            <div class="content-val">{fmt(t.total)}</div>
            <div class="content-sub">+{fmt(t.new7d)} · 7d</div>
          </div>
        {/each}
      </div>

      <div class="three-col">
        <Histogram bands={data.combined.peopleDist} title="People per user" />
        <Histogram bands={data.combined.companyDist} title="Companies per user" />
        <Histogram bands={data.combined.interactionDist} title="Interactions per user" />
      </div>

      <div class="two-col">
        <div>
          <div class="block-title">Pipeline outcomes</div>
          <table class="pipe">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Items</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {#each data.combined.outcomes as o (o.stageKind)}
                <tr>
                  <td><span class="kind kind-{o.stageKind}">{o.stageKind}</span></td>
                  <td>{fmt(o.count)}</td>
                  <td>
                    {#if o.valueByCurrency.length}
                      {#each o.valueByCurrency as v, i (v.currency)}
                        {#if i > 0}, {/if}{fmtMoney(v.cents, v.currency)}
                      {/each}
                    {:else}
                      —
                    {/if}
                  </td>
                </tr>
              {/each}
              {#if data.combined.outcomes.length === 0}
                <tr><td colspan="3" class="empty">No pipeline items yet</td></tr>
              {/if}
            </tbody>
          </table>
        </div>

        <div>
          <div class="block-title">Tasks &amp; reminders</div>
          <StatGrid
            tiles={[
              { label: 'Tasks open', value: fmt(data.combined.tasks.open) },
              { label: 'Tasks done', value: fmt(data.combined.tasks.completed), tone: 'good' },
              { label: 'Reminders pending', value: fmt(data.combined.reminders.pending) },
              {
                label: 'Reminders overdue',
                value: fmt(data.combined.reminders.overdue),
                tone: data.combined.reminders.overdue > 0 ? 'danger' : 'default'
              }
            ]}
          />
        </div>
      </div>

      <Sparkline
        values={data.combined.interactionBuckets}
        label="Interactions logged · last 30 days"
      />
    </section>

    <!-- Section 4: Ops & health -->
    <section class="panel">
      <h2>Ops &amp; health</h2>
      <StatGrid
        tiles={[
          { label: 'Version', value: data.ops.version },
          { label: 'Uptime', value: fmtUptime(data.ops.uptimeSec) },
          { label: 'RSS memory', value: fmtBytes(data.ops.rssBytes) },
          { label: 'Heap used', value: fmtBytes(data.ops.heapUsedBytes) },
          {
            label: 'Stale parsings',
            value: fmt(data.ops.staleParsingPeople + data.ops.staleParsingCompanies),
            sub: `${data.ops.staleParsingPeople} ppl · ${data.ops.staleParsingCompanies} co`,
            tone: data.ops.staleParsingPeople + data.ops.staleParsingCompanies > 0 ? 'warn' : 'default'
          },
          {
            label: 'Avatar cache',
            value: fmtBytes(data.ops.avatarCacheBytes),
            sub: data.ops.avatarCacheFiles != null ? `${fmt(data.ops.avatarCacheFiles)} files` : ''
          }
        ]}
      />

      <div class="two-col">
        <div>
          <div class="block-title">SQLite pragmas (primary region: {data.ops.primaryRegion})</div>
          <table class="pragma">
            <tbody>
              {#each data.ops.pragmas as p (p.name)}
                <tr>
                  <td class="pname">{p.name}</td>
                  <td class="pval">{p.value || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div>
          <div class="block-title">DB size {data.multi ? 'per region' : ''}</div>
          <ul class="dbsize">
            {#each data.perRegion as r (r.region)}
              <li>
                <span class="dom">{r.label}</span>
                <span class="cnt">{fmtBytes(r.dbSizeBytes)}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </section>

    <!-- Section 5: Trends -->
    <section class="panel">
      <h2>Trends from snapshots</h2>
      <p class="caption">
        Filled in once per day. Gaps mean nobody loaded /admin that day. Goes back as far as
        snapshots exist.
      </p>
      <div class="two-col">
        <Sparkline values={data.combined.dauTrend} label="DAU · 30d" />
        <Sparkline values={data.combined.interactionsTrend} label="Total interactions · 30d" />
      </div>
    </section>
  </div>
{/if}

<style>
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
  }
  .login {
    width: 100%;
    max-width: 360px;
    padding: 2rem;
  }
  .login h1 {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 1.5rem;
  }
  .login form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .login input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.875rem;
    box-sizing: border-box;
  }
  .login input:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  .login button[type='submit'] {
    padding: 0.5rem 0.75rem;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .dashboard {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .top h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text);
  }
  .top-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .badge {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
  }
  .badge.sm {
    font-size: 0.6875rem;
    padding: 0.0625rem 0.4375rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .badge[data-tone='cloud'] {
    background: var(--color-accent-soft);
    border-color: var(--color-accent-soft-border);
    color: var(--color-accent-soft-text);
  }
  .badge[data-tone='self'] {
    background: var(--color-highlight-bg);
    border-color: var(--color-highlight-border);
    color: var(--color-highlight-text);
  }

  .signout {
    font-size: 0.8125rem;
    color: var(--color-muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .signout:hover {
    color: var(--color-text);
  }

  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
  }

  .panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    padding: 1.25rem 1.25rem 1.375rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .panel h2 {
    font-size: 0.875rem;
    font-weight: 600;
    margin: 0;
    color: var(--color-text);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .three-col {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1rem;
  }
  @media (max-width: 720px) {
    .two-col,
    .three-col {
      grid-template-columns: 1fr;
    }
  }

  .block-title {
    font-size: 0.75rem;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 0.5rem;
  }

  .auth-block {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 0.75rem 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .auth-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
  }
  .auth-lab {
    color: var(--color-muted);
  }
  .auth-val {
    font-weight: 600;
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
  }
  .providers {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }
  .chip {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: var(--color-accent-soft);
    color: var(--color-accent-soft-text);
    border: 1px solid var(--color-accent-soft-border);
  }

  .region-table table,
  table.pipe,
  table.pragma {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .region-table th,
  .region-table td,
  table.pipe th,
  table.pipe td,
  table.pragma td {
    text-align: left;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }
  .region-table th,
  table.pipe th {
    color: var(--color-muted);
    font-weight: 500;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .region-table td:nth-child(n + 2),
  table.pipe td:nth-child(n + 2) {
    font-variant-numeric: tabular-nums;
  }
  table.pragma .pname {
    color: var(--color-muted);
    width: 50%;
  }
  table.pragma .pval {
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
  }

  .kind {
    font-size: 0.6875rem;
    text-transform: uppercase;
    padding: 0.125rem 0.4375rem;
    border-radius: 999px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .kind-open {
    background: var(--color-info-bg);
    color: var(--color-info);
    border: 1px solid var(--color-info-border);
  }
  .kind-won {
    background: var(--color-success-bg);
    color: var(--color-success);
    border: 1px solid var(--color-success-border);
  }
  .kind-lost {
    background: var(--color-danger-bg);
    color: var(--color-danger);
    border: 1px solid var(--color-danger-border);
  }

  .domain-list,
  .signup-list,
  .dbsize {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .domain-list li,
  .signup-list li,
  .dbsize li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0.5rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    font-size: 0.8125rem;
  }
  .dom {
    color: var(--color-text);
    font-family: ui-monospace, monospace;
    font-size: 0.8125rem;
  }
  .cnt {
    font-weight: 600;
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
  }
  .signup-list .mail {
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    color: var(--color-text);
  }
  .signup-list .meta {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.75rem;
    color: var(--color-muted);
  }
  .empty {
    color: var(--color-subtle);
    font-style: italic;
    justify-content: center !important;
  }

  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.5rem;
  }
  .content-cell {
    padding: 0.5rem 0.75rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
  }
  .content-lab {
    font-size: 0.6875rem;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .content-val {
    font-size: 1.125rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
    margin: 0.125rem 0;
  }
  .content-sub {
    font-size: 0.6875rem;
    color: var(--color-success);
  }

  .caption {
    font-size: 0.75rem;
    color: var(--color-muted);
    margin: 0;
    font-style: italic;
  }

  .error {
    font-size: 0.8rem;
    color: var(--color-danger);
    margin: 0;
  }
</style>
