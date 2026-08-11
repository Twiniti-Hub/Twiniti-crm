# Application branding

Twiniti Loop presents the existing Twiniti icon together with the supplied
Loop product lockup. The shared React `Brand` component is used on the CRM
sidebar, public application landing screen, and authentication screens.

## Logo assets

| Asset | Usage |
| --- | --- |
| `apps/web/public/twiniti-loop-icon-light.png` | Existing Twiniti application mark |
| `apps/web/public/branding/loop-logo-light.png` | Loop lockup for standard and light surfaces |
| `apps/web/public/branding/loop-logo-dark.png` | Loop lockup for dark mode and the dark CRM sidebar |

The browser selects the dark Loop lockup when `prefers-color-scheme: dark`
matches. The CRM sidebar always uses the dark lockup because its surface is
dark in every application theme. At the compact sidebar breakpoint, the Loop
lockup is hidden and the existing Twiniti mark remains visible.

## Guidance for contributors and AI agents

- Keep both Loop variants together when changing application branding.
- Preserve the `Brand` wrapper's accessible `Twiniti Loop` label; the paired
  images are decorative to avoid duplicate screen-reader announcements.
- Do not replace or recolor the supplied raster artwork in CSS.
- Validate both standard and dark color-scheme rendering after a brand change.

## User behavior

No setting is required. Loop follows the device's light or dark appearance for
the product lockup, while maintaining the correct variant on the dark sidebar.
