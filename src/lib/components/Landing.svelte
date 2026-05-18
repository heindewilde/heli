<script lang="ts">
  import {
    Github,
    ArrowRight,
    Lock,
    Database,
    Zap,
    Sparkles,
    BookmarkPlus,
    Users,
    Download,
    MessagesSquare,
    FolderKanban,
    Moon,
    Sun
  } from 'lucide-svelte';
  import { onMount } from 'svelte';
  import Sky from './Sky.svelte';
  import AuthModal from './AuthModal.svelte';

  type Props = {
    authConfig?: { registrationDisabled?: boolean; multiRegion?: boolean };
  };
  let { authConfig = {} }: Props = $props();

  let authModalOpen = $state(false);
  let authModalMode = $state<'login' | 'register'>('login');

  function openAuth(mode: 'login' | 'register', e: MouseEvent) {
    // Allow modifier-click / middle-click to do the default navigation so
    // power users can still open /auth in a new tab.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    authModalMode = mode;
    authModalOpen = true;
  }

  const GITHUB_URL = 'https://github.com/heindewilde/heli';

  let isDark = $state(false);
  onMount(() => {
    isDark = document.documentElement.dataset.theme === 'dark';
  });

  function toggleDark() {
    isDark = !isDark;
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    } catch {}
  }

  const features = [
    {
      icon: Lock,
      title: 'Private by design',
      body: 'No tracking, no ads, no third-party access. Your contacts and relationships are yours alone.'
    },
    {
      icon: Database,
      title: 'Choose where your data lives',
      body: 'US, EU, APAC, or your own server. Export or move it any time — no lock-in, ever.'
    },
    {
      icon: BookmarkPlus,
      title: 'Save in one click',
      body: 'A bookmarklet or a simple paste. Add anyone to your CRM in seconds without breaking your flow.'
    },
    {
      icon: Users,
      title: 'People and companies',
      body: 'Track individuals and organizations side by side. See who works where, who introduced whom.'
    },
    {
      icon: MessagesSquare,
      title: 'Log every interaction',
      body: 'Calls, emails, coffee chats — a running log of every touchpoint so nothing slips through the cracks.'
    },
    {
      icon: FolderKanban,
      title: 'Projects and pipelines',
      body: 'Group contacts into projects and move them through stages. Simple boards, no complexity tax.'
    },
    {
      icon: Zap,
      title: 'Keyboard first',
      body: 'j/k to navigate, Enter to open, / to search. Every action has a shortcut. The mouse is a fallback.'
    },
    {
      icon: Sparkles,
      title: 'Smart enrichment',
      body: 'Paste a LinkedIn or website link and Heli fills in the details — name, role, company — automatically.'
    },
    {
      icon: Download,
      title: 'Export your data',
      body: 'Download your full contact list as CSV any time. You own your data and can take it anywhere.'
    }
  ];
</script>

<div class="landing">
  <Sky />

  <header class="nav">
    <a href="/" class="brand" aria-label="Heli home">
      <span class="brand-mark" aria-hidden="true">🚁</span>
      <span class="brand-text">heli</span>
    </a>

    <nav class="nav-right" aria-label="Primary">
      <button class="icon-btn" onclick={toggleDark} aria-label="Toggle theme">
        {#if isDark}
          <Sun size={16} strokeWidth={2} />
        {:else}
          <Moon size={16} strokeWidth={2} />
        {/if}
      </button>
      <a class="btn-ghost" href="/auth" onclick={(e) => openAuth('login', e)}>Sign in</a>
      <a class="btn-primary" href="/auth?mode=register" onclick={(e) => openAuth('register', e)}>Sign up</a>
    </nav>
  </header>

  <main class="main">
    <section class="hero">
      <a class="eyebrow" href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
        <Github size={13} strokeWidth={2} />
        <span>Open source</span>
      </a>

      <h1>
        Finally, a delightful<span class="mobile-break"><br /></span> way to<span class="desktop-break"><br /></span> organize<span class="mobile-break"><br /></span> your <span class="nowrap"><span class="handwrite">(net)</span>work</span>
      </h1>

      <p class="subtitle">
        Heli is the CRM for freelancers and small businesses. More than a spreadsheet, less than bloated tools like Salesforce and HubSpot.
        Heli is fast, easy to use, and beautifully designed — once you're on board, you don't want to go back.
      </p>

      <div class="cta-row">
        <a class="btn-primary-lg" href="/auth?mode=register" onclick={(e) => openAuth('register', e)}>
          <span>Start flying</span>
          <ArrowRight size={15} strokeWidth={2} />
        </a>
      </div>

    </section>

    <section class="features" aria-label="Features">
      <div class="features-grid">
        {#each features as f}
          <article class="feature">
            <div class="feature-icon">
              <f.icon size={16} strokeWidth={2} />
            </div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        {/each}
      </div>
    </section>
  </main>

  <footer class="footer">
    <span class="footer-brand">🚁 heli</span>
    <span class="footer-sep">·</span>
    <span>The CRM for freelancers and small businesses</span>
    <span class="footer-spacer"></span>
    <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">GitHub</a>
    <a href="/auth" onclick={(e) => openAuth('login', e)}>Sign in</a>
  </footer>
</div>

<AuthModal
  bind:open={authModalOpen}
  initialMode={authModalMode}
  registrationDisabled={authConfig.registrationDisabled}
  multiRegion={authConfig.multiRegion}
/>

<style>
  .landing {
    position: relative;
    min-height: 100vh;
    background:
      linear-gradient(
        to bottom,
        #b8d0e6 0%,
        #c7daea 30%,
        #d6e3ee 60%,
        #e3ecf3 100%
      );
    color: var(--color-text);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :global([data-theme='dark']) .landing {
    background:
      linear-gradient(
        to bottom,
        #0b1626 0%,
        #111e2f 40%,
        #15243a 100%
      );
  }

  .nav {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 2rem;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    color: var(--color-text);
  }

  .brand-mark {
    font-size: 1.125rem;
    line-height: 1;
  }

  .brand-text {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.04em;
  }

  .nav-right {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-muted);
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .icon-btn:hover {
    background: var(--color-surface);
    border-color: var(--color-border);
    color: var(--color-text);
  }

  .btn-ghost {
    display: inline-flex;
    align-items: center;
    padding: 0.4rem 0.75rem;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-muted);
    text-decoration: none;
    transition: color 0.15s, background 0.15s;
  }

  .btn-ghost:hover {
    color: var(--color-text);
    background: var(--color-surface);
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    padding: 0.4rem 0.85rem;
    border-radius: var(--radius-md);
    background: var(--color-text);
    color: var(--color-bg);
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .btn-primary:hover {
    opacity: 0.88;
  }

  .main {
    position: relative;
    z-index: 1;
    flex: 1;
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
    padding: 0 2rem;
  }

  .hero {
    text-align: center;
    padding: 5rem 0 4.5rem;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.375rem 0.75rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.55);
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    color: var(--color-muted);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: -0.005em;
    text-decoration: none;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .eyebrow:hover {
    background: rgba(255, 255, 255, 0.7);
    border-color: rgba(255, 255, 255, 0.75);
    color: var(--color-text);
  }

  :global([data-theme='dark']) .eyebrow {
    background: rgba(20, 32, 50, 0.45);
    border-color: rgba(255, 255, 255, 0.08);
  }

  :global([data-theme='dark']) .eyebrow:hover {
    background: rgba(20, 32, 50, 0.6);
    border-color: rgba(255, 255, 255, 0.16);
  }

  h1 {
    margin: 1.5rem 0 1.25rem;
    font-size: clamp(2rem, 5vw, 3.375rem);
    line-height: 1.08;
    letter-spacing: -0.035em;
    font-weight: 600;
  }

  .desktop-break {
    display: inline;
  }

  .mobile-break {
    display: none;
  }

  .nowrap {
    white-space: nowrap;
  }

  .handwrite {
    font-family: 'Patrick Hand', cursive;
    font-weight: 400;
    font-size: 1.15em;
    letter-spacing: 0;
    color: #4b6ea8;
    display: inline-block;
    transform: translateY(0.03em) rotate(-2deg);
    transform-origin: center;
    margin: 0 0.04em;
  }

  :global([data-theme='dark']) .handwrite {
    color: #a9c3ee;
  }

  .subtitle {
    max-width: 40rem;
    margin: 0 auto;
    color: var(--color-muted);
    font-size: clamp(0.9375rem, 1.4vw, 1.0625rem);
    line-height: 1.55;
  }

  .cta-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    margin-top: 2rem;
    flex-wrap: wrap;
  }

  .btn-primary-lg {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.125rem;
    border-radius: var(--radius-md);
    font-size: 0.9375rem;
    font-weight: 500;
    text-decoration: none;
    background: var(--color-text);
    color: var(--color-bg);
    border: 1px solid var(--color-text);
    transition: opacity 0.15s;
  }

  .btn-primary-lg:hover {
    opacity: 0.9;
  }

  .features {
    padding: 1.5rem 0 5rem;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .feature {
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: var(--radius-lg);
    padding: 1.5rem 1.5rem 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  :global([data-theme='dark']) .feature {
    background: rgba(20, 32, 50, 0.45);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .feature-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.875rem;
    height: 1.875rem;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.6);
    color: var(--color-text);
    margin-bottom: 0.375rem;
  }

  :global([data-theme='dark']) .feature-icon {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
  }

  .feature h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .feature p {
    margin: 0;
    color: var(--color-muted);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .footer {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
    padding: 1.5rem 2rem 2rem;
    color: var(--color-muted);
    font-size: 0.8125rem;
    border-top: 1px solid var(--color-border);
  }

  .footer-brand {
    font-weight: 700;
    letter-spacing: -0.04em;
    color: var(--color-text);
  }

  .footer-sep {
    color: var(--color-subtle);
  }

  .footer-spacer {
    flex: 1;
  }

  .footer a {
    color: var(--color-muted);
    text-decoration: none;
    margin-left: 1rem;
    transition: color 0.15s;
  }

  .footer a:hover {
    color: var(--color-text);
  }

  @media (max-width: 860px) {
    .features-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .footer a {
    padding: 0.375rem 0.25rem;
  }

  @media (max-width: 640px) {
    .features-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .desktop-break {
      display: none;
    }

    .mobile-break {
      display: inline;
    }

    .nav {
      padding: 1rem 1.25rem;
    }

    .main {
      padding: 0 1.25rem;
    }

    .hero {
      padding: 3rem 0 3.5rem;
    }

    .footer {
      padding: 1.25rem 1.25rem 1.75rem;
      flex-wrap: wrap;
    }
  }
</style>
