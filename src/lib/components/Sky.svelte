<!--
  Decorative sky + drifting clouds backdrop. Pure visual layer, pointer-events
  disabled. The parent owns the surrounding gradient background; this just
  paints the sun glow and four soft cloud layers over the top.
-->
<script lang="ts"></script>

<div class="sky" aria-hidden="true">
  <div class="sun-glow"></div>
  <div class="cloud cloud-a"></div>
  <div class="cloud cloud-b"></div>
  <div class="cloud cloud-c"></div>
  <div class="cloud cloud-d"></div>
</div>

<style>
  .sky {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }

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

  .cloud {
    position: absolute;
    background-repeat: no-repeat;
    filter: blur(14px);
    will-change: transform;
  }

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

  @keyframes drift-a {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(20rem, 0, 0); }
  }

  @keyframes drift-b {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(-20rem, 0, 0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .cloud { animation: none; }
  }

  :global([data-theme='dark']) .cloud {
    opacity: 0.2;
    filter: blur(14px);
  }
</style>
