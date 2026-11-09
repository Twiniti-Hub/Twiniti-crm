# Application theme — revision 0.10.55.15

TWI-1080 application scope: TWI-1070 tokens, TWI-1073 authentication and
onboarding, TWI-1074 signed-in shell. George explicitly excluded the landing
page on 9 November 2026. Public pricing, marketing hero and email templates
are outside this implementation.

`apps/web/src/application-theme.css` loads after existing web styles.
Every visual override is gated by `html:has(.shell, .auth-page)`, including
document tokens. This supports portalled dialogs while leaving the React
landing route and separate `apps/landing` bundle unchanged. Avoid ungated
global selectors when extending the theme. The original stylesheet owns
component layout and responsive breakpoints.

Tokens: paper #FFFFFF, tint #F9F9F9, elevated #F2F2F2, border #E5E5E5,
ink #1A1C1C, accent #FF9902. Accent is reserved for primary actions and
focus indicators, with dark text on orange. Status and destructive feedback
retain semantic colors. Radius is 8px for controls and 16px for frames.
Inter is the UI font; Hanken Grotesk is used for headings and labels.
Fonts load from Google Fonts with system fallbacks and `display=swap`. The
stylesheet link is injected only while `.shell` or `.auth-page` is mounted and
is removed on the public React landing route.

The app stays light under an OS dark preference, including drawers and
dialogs. Preserve keyboard focus outlines and disabled states. Existing
authentication, regional routing, licensing and billing logic are unchanged.

Verify web typecheck, build and auth helper tests; inspect desktop and mobile
shell/auth forms under light and dark OS preferences. Development authenticated
smoke and customer review remain separate release gates. Rollback: revert the
theme import and stylesheet; no database change for this design revision.
The accompanying WV setup revision still requires migration 0026 before API deployment.
