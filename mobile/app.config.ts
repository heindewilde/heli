import type { ExpoConfig } from 'expo/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pkg from './package.json';

/**
 * Brand strings still come from `src/lib/branding.ts` — the single rename point
 * for the whole product — but they are *read* rather than imported.
 *
 * This file is evaluated by Node before Metro exists, so `watchFolders` does
 * not apply and there is no TypeScript resolution for a path outside this
 * directory: a plain `import … from '../src/lib/branding'` fails with
 * `Cannot find module`. Parsing the declarations is the same trade
 * `scripts/tokens.mjs` makes against `app.css`, and it beats the alternative,
 * which is a second copy of the product's name that nobody remembers to change.
 */
function brand(name: string): string {
  const src = readFileSync(resolve(__dirname, '../src/lib/branding.ts'), 'utf8');
  const found = new RegExp(`export const ${name} = '([^']*)'`).exec(src)?.[1];
  if (!found) throw new Error(`app.config: ${name} not found in src/lib/branding.ts`);
  return found;
}

const APP_NAME = brand('APP_NAME');
const APP_DOMAIN = brand('APP_DOMAIN');

/**
 * Dynamic config, so the version comes from `mobile/package.json` and the two
 * cannot drift — the same trick `extension/scripts/build.mjs` uses to stamp the
 * manifest.
 *
 * The version is deliberately **independent of the repo root's**. Every push to
 * `main` auto-bumps a `v*` tag and deploys the web app; coupling to that would
 * mean a store submission per web deploy. Mobile releases are tagged
 * `mobile-v*`, which matches neither `fly-deploy.yml`'s
 * `v[0-9]*.[0-9]*.[0-9]*` filter nor `docker.yml`'s `v*`.
 */
const config: ExpoConfig = {
  name: APP_NAME,
  slug: 'heli',
  version: pkg.version,
  orientation: 'portrait',
  scheme: 'heli',
  icon: './assets/icon.png',
  // Follow the OS, and let the in-app override sit on top — matching the web,
  // where an inline script in app.html writes `data-theme` from localStorage
  // falling back to prefers-color-scheme.
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'so.heli.app',
    associatedDomains: [`applinks:${APP_DOMAIN}`],
    infoPlist: {
      // Pairing is the only thing the camera is for, and the string says so.
      // A missing usage string is both an App Review rejection and a hard crash
      // the first time the API is touched.
      NSCameraUsageDescription:
        `${APP_NAME} uses the camera only to scan the pairing code shown in your browser.`,
      NSContactsUsageDescription:
        `${APP_NAME} matches your contacts against people already in your workspace. Nothing is uploaded unless you choose to import it.`,
      NSAppTransportSecurity: {
        // Self-hosted instances on a LAN are plain HTTP — the same reality
        // src/lib/client/clipboard.ts exists for. This permits local addresses
        // only; everything else still requires TLS.
        NSAllowsLocalNetworking: true
      }
    }
  },
  android: {
    package: 'so.heli.app',
    adaptiveIcon: {
      backgroundColor: '#f6f8fc',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png'
    },
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: APP_DOMAIN }],
        category: ['BROWSABLE', 'DEFAULT']
      }
    ]
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    // Fonts are bundled into the binary rather than fetched at runtime. A font
    // that arrives a beat after first paint reflows every screen once, which is
    // the flash of unstyled text that no native app has.
    ['expo-font', { fonts: ['./assets/fonts/Geist-Regular.ttf', './assets/fonts/Geist-Medium.ttf', './assets/fonts/Geist-SemiBold.ttf', './assets/fonts/Geist-Bold.ttf'] }],
    [
      'expo-notifications',
      {
        icon: './assets/splash-icon.png',
        color: '#15161a',
        // A default channel importance rather than max: a reminder is something
        // the user scheduled, not an emergency, and an app that arrives with a
        // full-screen intent on Android gets its notifications turned off.
        defaultChannel: 'reminders'
      }
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        // Heli's own paper, not Expo's white — and the dark variant matters
        // more than it sounds: a white flash before a dark app is the single
        // most jarring half-second in a phone's day.
        backgroundColor: '#f6f8fc',
        dark: { backgroundColor: '#0c0d11' }
      }
    ]
  ],
  experiments: { typedRoutes: true }
};

export default config;
