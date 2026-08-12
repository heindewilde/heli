<script lang="ts">
  import { APP_NAME, APP_DOMAIN } from '$lib/branding';
</script>

<svelte:head>
  <title>Privacy Policy — {APP_NAME}</title>
  <meta name="description" content="How {APP_NAME} collects, uses, and protects your personal data." />
</svelte:head>

<article class="prose">
  <h1>{APP_NAME} Privacy Policy</h1>
  <p class="meta">Last updated: 21 May 2025 · Applies to the cloud service at {APP_DOMAIN}</p>

  <h2>1. Who we are</h2>
  <p>
    Heli is operated by <strong>Brainpower</strong>, a company registered in the Netherlands.
    For privacy matters, contact us at <a href="mailto:info@heindewilde.com">info@heindewilde.com</a>.
    We are your data controller for account data, and your data processor for the contact data you store in Heli.
  </p>

  <h2>2. What we collect</h2>
  <h3>Account data</h3>
  <p>
    When you register with email and password: your email address, a username, and a hashed password.
    We never store your password in plain text.
    When you register or sign in with Google: your Google account email address, display name, and a Google account identifier.
    We do not receive or store your Google password.
  </p>

  <h3>Your contact data</h3>
  <p>
    Everything you enter into Heli — people, companies, interactions, notes, tags, reminders — is <em>your</em> data.
    You are the data controller for it; we process it on your behalf to provide the service.
    You are responsible for having a lawful basis under GDPR to store information about your contacts.
  </p>

  <h3>Google Contacts import</h3>
  <p>
    If you choose to import from Google Contacts, Heli requests read-only access to your Google Contacts
    (<code>contacts.readonly</code> scope). We fetch your contacts, compare them against contacts already in your Heli
    account, and present a preview for your confirmation. Only the contacts you explicitly confirm are saved to
    your Heli account. We do not retain your Google access token after the import is complete; it is used
    once, in memory, and discarded.
    The imported contact records (name, email, phone, role, location, notes, organization) become part of
    your Heli contact data, governed by section 2 above.
  </p>
  <p>
    Heli's use and transfer of information received from Google APIs adheres to the
    <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer noopener">Google API Services User Data Policy</a>,
    including the Limited Use requirements. Specifically: Google user data is used only to provide the
    in-app import feature you requested; it is not used for advertising, sold to third parties, or used
    for any purpose unrelated to the feature.
  </p>

  <h3>Server logs</h3>
  <p>
    Our infrastructure records IP addresses, request timestamps, and HTTP status codes for security and debugging.
    These logs are not linked to your account and are purged after 30 days.
  </p>

  <h2>3. Legal basis for processing</h2>
  <ul>
    <li><strong>Account data</strong> — necessary to perform the contract (Art. 6(1)(b) GDPR).</li>
    <li><strong>Your contact data</strong> — processed on your behalf under the same contract.</li>
    <li><strong>Google Contacts import</strong> — performed only on your explicit request; data is then governed by the contract.</li>
    <li><strong>Server logs</strong> — legitimate interest in security and service reliability (Art. 6(1)(f) GDPR).</li>
  </ul>

  <h2>4. Where data is stored</h2>
  <p>
    Data is hosted on <strong>Fly.io</strong> in Amsterdam (EU) by default.
    Traffic passes through <strong>Cloudflare</strong>'s network for DDoS protection, TLS termination, and caching.
    If your account is routed to a replica region (EU/US/APAC), your data may be replicated to Turso infrastructure in that region.
    All providers are bound by data processing agreements and handle data in accordance with GDPR.
  </p>

  <h2>5. Cookies</h2>
  <p>
    We use first-party, HttpOnly, Secure cookies for authentication and short-lived OAuth flows only.
    These include your session cookie, and temporary state cookies used during Google sign-in or Google
    Contacts import (each expires within 10–15 minutes). None of these cookies contain tracking identifiers
    or are shared with third parties.
    We do not use advertising cookies, third-party trackers, or fingerprinting.
  </p>

  <h2>6. Analytics</h2>
  <p>
    The landing page uses <strong>Simple Analytics</strong>, a cookieless analytics service that does not collect personal data
    and is exempt from cookie consent requirements under GDPR. No analytics scripts run inside the authenticated app.
  </p>

  <h2>7. Data retention</h2>
  <p>
    We retain your account and contact data for as long as your account is active.
    When you delete your account, all your data is permanently erased from the primary database.
    Encrypted backups may retain data for up to 30 additional days before they age out.
  </p>

  <h2>8. Your rights</h2>
  <p>Under GDPR you have the right to:</p>
  <ul>
    <li><strong>Access</strong> — request a copy of your personal data (use the Export feature in Settings).</li>
    <li><strong>Rectification</strong> — correct inaccurate account data in Settings.</li>
    <li><strong>Erasure</strong> — delete your account and all data in Settings → Danger zone.</li>
    <li><strong>Portability</strong> — export your data as CSV from Settings.</li>
    <li><strong>Restriction / Objection</strong> — contact us at <a href="mailto:info@heindewilde.com">info@heindewilde.com</a>.</li>
    <li><strong>Complaint</strong> — you may lodge a complaint with the Dutch supervisory authority,
      the <a href="https://www.autoriteitpersoonsgegevens.nl" target="_blank" rel="noreferrer noopener">Autoriteit Persoonsgegevens</a>.</li>
  </ul>

  <h2>9. Self-hosted instances</h2>
  <p>
    If you run your own Heli instance, you are the data controller for all data on that instance.
    This policy does not apply to self-hosted deployments. You are responsible for your own privacy and security obligations.
  </p>

  <h2>10. Changes</h2>
  <p>
    We will notify registered users by email at least 14 days before any material change to this policy.
    Minor clarifications may be made without notice; the "last updated" date above always reflects the current version.
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

  h3 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 1.25rem 0 0.375rem;
  }

  p, ul {
    font-size: 0.9375rem;
    margin: 0 0 0.75rem;
    color: var(--color-muted);
  }

  ul {
    /* Tailwind's preflight sets `list-style: none` on every list. The bullets
       here used to come back via @tailwindcss/typography, which this page did
       not otherwise use and which is no longer loaded. */
    list-style: disc;
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

  code {
    font-size: 0.875em;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 0.1em 0.35em;
  }
</style>
