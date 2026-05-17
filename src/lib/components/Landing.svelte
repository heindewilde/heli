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
  <div class="sky" aria-hidden="true">
    <div class="sun-glow"></div>
    <div class="cloud cloud-a"></div>
    <div class="cloud cloud-b"></div>
    <div class="cloud cloud-c"></div>
    <div class="cloud cloud-d"></div>
    <div class="cloud cloud-e"></div>
    <div class="cloud cloud-f"></div>
  </div>

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
      <a class="btn-ghost" href="/auth">Sign in</a>
      <a class="btn-primary" href="/auth?mode=register">Sign up</a>
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
        <a class="btn-primary-lg" href="/auth?mode=register">
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
    <a href="/auth">Sign in</a>
  </footer>
</div>

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

  .sky {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }

  /* Warm ambient glow from the top-right — pale peach fading into the
     sky-blue. Sits behind the clouds so they get backlit by it. */
  .sun-glow {
    position: absolute;
    top: -16rem;
    right: -16rem;
    width: 38rem;
    height: 38rem;
    border-radius: 50%;
    background: radial-gradient(
      circle at 50% 50%,
      rgba(255, 230, 195, 0.85) 0%,
      rgba(255, 220, 185, 0.5) 18%,
      rgba(255, 218, 188, 0.22) 38%,
      rgba(255, 218, 188, 0) 62%
    );
    filter: blur(10px);
  }

  :global([data-theme='dark']) .sun-glow {
    background: radial-gradient(
      circle at 50% 50%,
      rgba(255, 215, 170, 0.18) 0%,
      rgba(255, 210, 170, 0.08) 35%,
      rgba(255, 210, 170, 0) 65%
    );
  }

  /* Each cloud builds its silhouette from a wide flat base + several
     overlapping puff gradients. No single tall peak — bumps are spread
     across the top at varied heights for a rolling cumulus profile.
     Each .cloud-* variant supplies its own gradient set so no two
     clouds share the same shape. */
  .cloud {
    position: absolute;
    background-repeat: no-repeat;
    filter: blur(14px);
    will-change: transform;
  }

  /* Cloud A: sloping silhouette, taller on the left, trailing to the right */
  .cloud-a {
    background-image:
      radial-gradient(ellipse 56% 34% at 48% 76%, rgba(255, 255, 255, 0.72) 0%, rgba(255, 255, 255, 0.5) 55%, rgba(255, 255, 255, 0) 100%),
      radial-gradient(ellipse 10% 22% at 8% 70%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 78%),
      radial-gradient(ellipse 18% 40% at 22% 52%, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 21% 46% at 38% 40%, rgba(255, 255, 255, 0.76) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 17% 38% at 56% 46%, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 14% 30% at 74% 56%, rgba(255, 255, 255, 0.62) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 9% 20% at 90% 68%, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0) 78%);
  }

  /* Cloud B: camel-back with two roughly equal humps and a low saddle */
  .cloud-b {
    background-image:
      radial-gradient(ellipse 60% 36% at 50% 76%, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.48) 55%, rgba(255, 255, 255, 0) 100%),
      radial-gradient(ellipse 9% 20% at 7% 68%, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0) 78%),
      radial-gradient(ellipse 21% 46% at 28% 40%, rgba(255, 255, 255, 0.74) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 13% 28% at 47% 52%, rgba(255, 255, 255, 0.64) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 22% 46% at 66% 42%, rgba(255, 255, 255, 0.74) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 12% 26% at 82% 60%, rgba(255, 255, 255, 0.58) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 8% 18% at 93% 70%, rgba(255, 255, 255, 0.46) 0%, rgba(255, 255, 255, 0) 78%);
  }

  /* Cloud C: wide and flat — gentle rolling top with no dominant bump */
  .cloud-c {
    background-image:
      radial-gradient(ellipse 64% 34% at 50% 78%, rgba(255, 255, 255, 0.68) 0%, rgba(255, 255, 255, 0.46) 55%, rgba(255, 255, 255, 0) 100%),
      radial-gradient(ellipse 9% 18% at 8% 70%, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0) 78%),
      radial-gradient(ellipse 16% 34% at 22% 54%, rgba(255, 255, 255, 0.68) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 22% 42% at 40% 46%, rgba(255, 255, 255, 0.72) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 22% 40% at 60% 48%, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 14% 30% at 78% 56%, rgba(255, 255, 255, 0.62) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 10% 22% at 92% 66%, rgba(255, 255, 255, 0.48) 0%, rgba(255, 255, 255, 0) 78%);
  }

  /* Cloud D: chunky on the left, long trailing wisp to the right */
  .cloud-d {
    background-image:
      radial-gradient(ellipse 58% 34% at 42% 76%, rgba(255, 255, 255, 0.66) 0%, rgba(255, 255, 255, 0.46) 55%, rgba(255, 255, 255, 0) 100%),
      radial-gradient(ellipse 12% 26% at 12% 62%, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 22% 48% at 30% 40%, rgba(255, 255, 255, 0.76) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 17% 38% at 48% 46%, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 14% 30% at 64% 54%, rgba(255, 255, 255, 0.62) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 11% 24% at 80% 62%, rgba(255, 255, 255, 0.54) 0%, rgba(255, 255, 255, 0) 75%),
      radial-gradient(ellipse 7% 16% at 94% 70%, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0) 78%);
  }

  .cloud-a {
    top: 5%;
    left: -10%;
    width: 30rem;
    height: 13rem;
    opacity: 0.8;
    animation: drift-a 75s linear infinite alternate;
  }

  .cloud-b {
    top: 28%;
    right: -14%;
    width: 34rem;
    height: 14rem;
    opacity: 0.7;
    animation: drift-b 90s linear infinite alternate;
  }

  .cloud-c {
    top: 54%;
    left: -8%;
    width: 26rem;
    height: 11rem;
    opacity: 0.6;
    animation: drift-a 105s linear infinite alternate;
  }

  .cloud-d {
    top: 78%;
    right: -10%;
    width: 32rem;
    height: 13rem;
    opacity: 0.5;
    animation: drift-b 120s linear infinite alternate;
  }

  .cloud-e,
  .cloud-f {
    display: none;
  }

  @keyframes drift-a {
    from {
      transform: translate3d(0, 0, 0);
    }
    to {
      transform: translate3d(20rem, 0, 0);
    }
  }

  @keyframes drift-b {
    from {
      transform: translate3d(0, 0, 0);
    }
    to {
      transform: translate3d(-20rem, 0, 0);
    }
  }


  @media (prefers-reduced-motion: reduce) {
    .cloud {
      animation: none;
    }
  }

  :global([data-theme='dark']) .cloud {
    opacity: 0.2;
    filter: blur(14px);
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

  .hero-note {
    color: var(--color-subtle);
    font-size: 0.8125rem;
    margin: 1.25rem 0 0;
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
