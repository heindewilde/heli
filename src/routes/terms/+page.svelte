<script lang="ts">
  import { APP_NAME, APP_DOMAIN } from '$lib/branding';
</script>

<svelte:head>
  <title>Terms of Service — {APP_NAME}</title>
  <meta name="description" content="Terms governing use of the {APP_NAME} cloud service." />
</svelte:head>

<article class="prose">
  <h1>Terms of Service</h1>
  <p class="meta">Last updated: 20 May 2025 · Applies to the cloud service at {APP_DOMAIN}</p>

  <h2>1. Provider</h2>
  <p>
    The Heli cloud service is operated by <strong>Brainpower</strong>, a company registered in the Netherlands.
    Contact: <a href="mailto:info@heindewilde.com">info@heindewilde.com</a>.
    By creating an account, you agree to these terms.
  </p>

  <h2>2. Your account</h2>
  <p>
    You must provide an accurate email address when registering. You are responsible for keeping your password secure and
    for all activity that occurs under your account. Notify us immediately at <a href="mailto:info@heindewilde.com">info@heindewilde.com</a>
    if you suspect unauthorized access.
  </p>

  <h2>3. Acceptable use</h2>
  <p>You may not use Heli to:</p>
  <ul>
    <li>Store or process data you have no lawful right to process under applicable law, including GDPR.</li>
    <li>Upload, transmit, or link to illegal content.</li>
    <li>Attempt to gain unauthorized access to our systems or other users' data.</li>
    <li>Scrape, reverse-engineer, or resell the service without prior written consent.</li>
    <li>Use the service in a way that degrades availability for other users.</li>
  </ul>

  <h2>4. Your contact data and GDPR</h2>
  <p>
    You are the data controller for the contact data you store in Heli. You are responsible for ensuring
    you have a lawful basis under GDPR (or any other applicable privacy law) to process information about
    the people and companies you add. We process that data on your behalf as a data processor.
  </p>

  <h2>5. The service — no uptime guarantee</h2>
  <p>
    Heli is provided <strong>"as is"</strong> and <strong>"as available"</strong>, without warranty of any kind,
    express or implied. We do not warrant that the service will be uninterrupted, error-free, or free of harmful
    components. We make no guarantees about uptime, response times, or fitness for any particular purpose.
    We may modify, suspend, or discontinue features at any time, and will give reasonable notice of significant
    changes where possible.
  </p>

  <h2>6. Data and backups</h2>
  <p>
    You are solely responsible for maintaining copies of your data. We make reasonable efforts to prevent data
    loss but do not guarantee that your data will never be lost, corrupted, or inaccessible. We provide an
    export feature (Settings → Export) so you can download your data at any time. We strongly recommend
    doing so regularly. We are not liable for any data loss, however caused.
  </p>

  <h2>7. Self-hosted instances</h2>
  <p>
    The Heli source code is available under the AGPL-3.0 licence. Self-hosted instances are governed by
    that licence, not by these terms. You are your own operator and bear full responsibility for your deployment,
    your users, and your data.
  </p>

  <h2>8. Suspension and termination</h2>
  <p>
    We may suspend or terminate accounts that violate these terms, without notice in cases of serious abuse.
    You may delete your account at any time from Settings → Danger zone. On deletion, all your data is
    permanently erased in accordance with our <a href="/privacy">Privacy Policy</a>.
  </p>

  <h2>9. Limitation of liability</h2>
  <p>
    To the maximum extent permitted by Dutch law, Brainpower's total liability to you for any claim arising
    out of or related to these terms or your use of Heli — whether based in contract, tort, statute, or any
    other theory, and whether direct, indirect, incidental, consequential, or otherwise — is limited to the
    amount you have paid us in the 12 months preceding the claim, or €50, whichever is greater.
  </p>
  <p>
    In particular, Brainpower is not liable for: loss of data; loss of profits or revenue; loss of business
    or goodwill; service interruptions; or any other direct or indirect losses, even if we have been advised
    of the possibility of such damages. This limitation does not apply to liability caused by gross negligence
    or willful misconduct on our part, as Dutch law does not permit exclusion of such liability.
  </p>

  <h2>10. Governing law</h2>
  <p>
    These terms are governed by the laws of the Netherlands. Any disputes shall be submitted to the
    competent court in Amsterdam, unless mandatory consumer protection law in your country of residence
    requires otherwise.
  </p>

  <h2>11. Changes</h2>
  <p>
    We will notify registered users by email at least 30 days before any material change to these terms.
    Continued use of the service after the effective date constitutes acceptance of the updated terms.
  </p>
</article>

<style>
  .prose {
    max-width: 65ch;
    margin: 3rem auto 5rem;
    padding: 0 1.5rem;
    color: var(--color-text);
    line-height: 1.65;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    margin: 0 0 0.375rem;
  }

  .meta {
    font-size: 0.8125rem;
    color: var(--color-muted);
    margin: 0 0 2.5rem;
  }

  h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 2rem 0 0.5rem;
  }

  p, ul {
    font-size: 0.9375rem;
    margin: 0 0 0.75rem;
    color: var(--color-muted);
  }

  ul {
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  a {
    color: var(--color-accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
