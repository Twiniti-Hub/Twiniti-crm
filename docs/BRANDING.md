# Application branding

Twiniti Loop uses the supplied Loop product lockup as its sole visible logo.
The shared React `Brand` component is used on the CRM sidebar, public
application landing screen, and authentication screens. The dedicated landing
site uses the same assets for its navigation, content, footer, and favicon.

## Logo assets

| Asset | Usage |
| --- | --- |
| `apps/web/public/branding/loop-logo-light.png` | Loop lockup for standard and light surfaces |
| `apps/web/public/branding/loop-logo-dark.png` | Loop lockup for dark mode and the dark CRM sidebar |
| `apps/landing/public/branding/loop-logo-light.png` | Landing-site Loop lockup for light surfaces |
| `apps/landing/public/branding/loop-logo-dark.png` | Landing-site Loop lockup for dark surfaces and favicon |

The browser selects the dark Loop lockup when `prefers-color-scheme: dark`
matches. The CRM sidebar always uses the dark lockup because its surface is
dark in every application theme. The compact sidebar keeps a smaller Loop
lockup visible rather than falling back to the retired Twiniti mark.

## Guidance for contributors and AI agents

- Keep both Loop variants together when changing application branding.
- Preserve each brand wrapper's accessible `Twiniti Loop` label; logo images
  are decorative to avoid duplicate screen-reader announcements.
- Do not reintroduce the legacy Twiniti icon beside or in place of Loop.
- Do not replace or recolor the supplied raster artwork in CSS.
- Validate both standard and dark color-scheme rendering after a brand change.

## User behavior

No setting is required. Loop follows the device's light or dark appearance for
the product lockup, maintains the correct variant on dark surfaces, and remains
visible when the application sidebar is compact.
