# Contributing & workflow

How we work in this monorepo. **Extend this file as conventions solidify** — add subsections, links, and checklists rather than one-off Slack notes.

---

## How to use this document

| Section | When to read |
|--------|----------------|
| [Local development](#local-development) | First-time setup |
| [Branches & commits](#branches--commits) | Daily work |
| [Pull requests](#pull-requests) | Before opening a PR |
| [Quality checks](#quality-checks-before-push) | Before push / CI |
| [Databases & migrations](#databases--migrations) | Schema / Prisma changes |
| [Docs & roadmap hygiene](#docs--roadmap-hygiene) | Placeholders, integrations, known gaps |
| [Security](#security) | Always |

---

## Local development

- **Install:** `pnpm install` (repo root).
- **Run app:** See [README.md](./README.md) — `pnpm dev`, env files, Prisma generate/migrate.
- **Packages:** `apps/web` (Next.js), `apps/api` (Express). Prefer workspace commands from root when documented.

*(Add: Node version, required tooling, IDE settings.)*

---

## Branches & commits

- **Branches:** *(e.g. `main` for production, feature branches — define your naming: `feat/`, `fix/`, `chore/`.)*
- **Commits:** Prefer focused commits with messages that explain *why* when non-obvious.
- **Conventional commits:** *(Optional — add here if you adopt `feat:`, `fix:`, etc.)*

---

## Pull requests

- Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) on GitHub (checklist).
- Keep PRs reviewable: scope, description, linked issue/ticket if applicable.
- **Request review** when ready; don’t merge secrets or `.env` files.

*(Add: required reviewers, merge strategy, squash vs merge.)*

---

## Quality checks before push

Run what your change touches; CI may enforce more.

```bash
# API (from apps/api)
pnpm exec tsc --noEmit

# Web (from apps/web) — if you have a typecheck script
pnpm exec tsc --noEmit
```

*(Add: `pnpm lint`, test commands, e2e.)*

---

## Databases & migrations

| Database | Role |
|----------|------|
| **Repair** | Read-only introspection (`prisma:repair:pull`). Never migrate against production repair. |
| **App** | Portal data — migrations under `apps/api/prisma/app/migrations`. Run `prisma:app:migrate` / deploy migrations in the right environment. |

After **app** schema changes: `pnpm prisma:app:generate` (or root documented command). See README for details.

*(Add: staging vs production migration process, Render/other host steps.)*

---

## Docs & roadmap hygiene

- **[TODO.md](./TODO.md)** — Cross-cutting gaps (e.g. placeholder pages, Samsara driver work, code TODOs).  
  **Update in the same PR** when you:
  - Add/remove a “coming soon” or placeholder route.
  - Introduce or close a major integration gap (telematics, shop system, etc.).
- **README.md** — Setup and architecture; link out to deeper docs instead of duplicating.

*(Add: ADR folder, internal wiki links.)*

---

## Security

- Never commit API keys, `CRON_SECRET`, database URLs with passwords, or Clerk secrets.
- Use `.env.example` / templates only for *names* and fake values.

---

## Extending this document

Suggested additions as the team grows:

1. **Coding standards** — TypeScript/React/API patterns (or split to `.cursor/rules/`).
2. **Release process** — tagging, changelog, production promotion.
3. **Onboarding checklist** — day-one for new devs.
4. **Incident / rollback** — who to ping, how to revert.

When you add a new section, drop a one-line pointer here in “Extending” so the outline stays discoverable.
