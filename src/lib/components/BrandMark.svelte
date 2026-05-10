<script lang="ts">
  type Props = { size?: number; class?: string };
  let { size = 24, class: klass = '' }: Props = $props();
</script>

<!--
  Brand mark — a graphite "g" enclosed in a softly rounded square.
  Single-color, sized to look balanced from 20–40px.
  Uses --color-accent so it inverts properly in dark mode.
-->
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 32 32"
  width={size}
  height={size}
  aria-hidden="true"
  class={klass}
>
  <rect x="0" y="0" width="32" height="32" rx="8" fill="var(--color-accent)" />
  <path
    d="M21.2 11.2v9.6c0 2.65-1.95 4.4-5.05 4.4-2.05 0-3.5-.6-4.45-1.55l1.2-1.6c.7.7 1.75 1.15 3.15 1.15 1.95 0 3.05-1 3.05-2.6v-.95c-.65.9-1.75 1.4-3.05 1.4-2.5 0-4.55-1.9-4.55-4.7s2.05-4.7 4.55-4.7c1.3 0 2.4.5 3.05 1.4v-1.85h2.1zm-2.1 5.15c0-1.7-1.15-2.85-2.75-2.85s-2.75 1.15-2.75 2.85 1.15 2.85 2.75 2.85 2.75-1.15 2.75-2.85z"
    fill="var(--color-accent-fg)"
  />
</svg>
