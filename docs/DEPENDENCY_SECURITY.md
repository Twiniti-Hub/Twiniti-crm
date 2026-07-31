# Dependency security status

Last reviewed: 2026-07-31

## Resolved in this change

- React Router moved from the removed `react-router-dom` v7 re-export to `react-router` v8.3.0.
- React and React DOM were updated to 19.2.8.
- Vite was updated to 7.3.6 and `@vitejs/plugin-react` to 5.2.0, which are compatible with the React Router v8 baseline.
- All web imports were updated to use `react-router`.
- The deprecated Drizzle `@esbuild-kit/core-utils` dependency is forced to `esbuild` 0.25.12 through the root pnpm override. The database migration and generation commands were verified after the override.

## Open vendor exception

`pnpm audit --prod` reports `elliptic@6.6.1` through:

```text
@hexclave/react@1.0.70
  @hexclave/shared@1.0.70
    elliptic@6.6.1
```

The advisory is [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84) / CVE-2025-14505. The registry reports no patched `elliptic` release, and the current Hexclave release still declares the dependency. It must not be replaced with an arbitrary package because this is a cryptographic dependency.

Required follow-up:

1. Obtain a Hexclave release that removes or patches `elliptic`, or obtain a vendor-supported replacement for the affected signing path.
2. Confirm whether the affected ECDSA operations are used by this application and whether they can be disabled or isolated safely.
3. Re-run `pnpm audit --prod`, the web checks, and the authentication smoke test before removing this exception.

Until then, the remaining audit failure is explicitly tracked rather than hidden with an audit suppression.

## Verification

The following checks passed after the dependency changes:

- `pnpm --filter @twiniti/web typecheck`
- `pnpm --filter @twiniti/web test`
- `pnpm --filter @twiniti/web build`
- `pnpm db:migrate`

The final audit has no high or moderate findings. The only remaining finding is the documented Hexclave transitive `elliptic` exception.
