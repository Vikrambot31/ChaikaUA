# Stage 9 - Data, Migrations, And Compatibility Audit

Date: 2026-07-05
Status: static scripts/data-shape audit only; no data migrations executed.

## Scope

Reviewed operational scripts and migration/backfill patterns under:

- `scripts/*.mjs`
- `scripts/*.cjs`
- `scripts/*.js`
- root/package script references where relevant

No production writes were executed during this audit.

## Findings

### DATA-P1-001 - Mutating Firebase scripts do not share a consistent dry-run/apply gate

Some migration scripts are safe by default:

- `scripts/migrate-media-download-urls.mjs` defaults to dry-run and requires `--write`.
- `scripts/migrate-places-names.mjs` defaults to dry-run and requires `--write`.
- `scripts/backfill-profile-view-outgoing-index.mjs` defaults to dry-run and requires `--apply`.

Other scripts write by default or are seed/test utilities that write directly with Admin SDK:

- `scripts/backfill-community-photos-public.mjs:4` uses `--dry-run` only when explicitly passed; otherwise it updates `community_photos_public` at `:60`.
- `scripts/create-elena-requests.mjs`, `scripts/elena-do-all.mjs`, `scripts/seed-bot-users.mjs`, `scripts/test-kuplu-prodam.mjs`, and related step/test scripts write real records through Admin SDK.

Risk:

- A script launched for inspection can mutate production data if the operator misses a flag.
- Test/seed data can be mixed with real production content.

Recommended remediation:

- Standardize mutating scripts around `--dry-run` default and explicit `--apply` or `--write`.
- Require an environment confirmation for production database URLs.
- Add a short script inventory marking each script as read-only, dry-run-by-default, or writes-by-default.

### DATA-P2-001 - Generated function manifest exists locally but is not an authoritative tracked audit artifact

`functions/functions.yaml` and `functions/functions.yaml.bak` were present locally during review, but `git ls-files` did not show them as tracked. The generated manifest is useful for function inventory, schedules, and endpoint review, but it should not be treated as source of truth unless the release process explicitly records it.

Risk:

- Auditors may inspect stale generated output rather than deployed source code.
- Schedule/endpoint drift can be missed if the generated manifest is not refreshed.

Recommended remediation:

- Keep source files as the authoritative review target.
- If using generated manifests for release evidence, regenerate them in the release script and store a timestamped audit artifact.

### DATA-P2-002 - Legacy and projection data shapes need explicit compatibility ownership

The current app uses raw public listing branches plus newer public/projection-like paths in some areas. Stage 5 and Stage 6 found hidden phone and approved-only visibility risks where raw nodes still contain private fields.

Risk:

- Fixing privacy via public projection nodes will require migration/backfill ownership, legacy read fallback decisions, and emulator coverage.
- Without a clear owner, client code can be fixed while scripts continue to republish private fields into public branches.

Recommended remediation:

- Define canonical full-record paths and public projection paths for listings/photos.
- Update backfills to only publish allowed public fields.
- Add compatibility tests for old records with missing flags and new records with hidden/private contact fields.

## Verification

Static review only. No migration/backfill was run, and no code fix was made in this stage.