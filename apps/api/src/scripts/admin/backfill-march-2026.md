# March 2026 Backfill Commands

Run these from `apps/api/` after the DB has been reset and migrations applied.

## Wolverine (Motive)

Last successful sync: 2026-03-17. Run the full month to ensure no gaps:

```bash
pnpm exec tsx src/telematics/motive/backdate.ts \
  --org=org_39B7lu1b8YKds8IOtzrk6LpKnLW \
  --start=2026-03-01 \
  --end=2026-03-31
```

After March, bring it current (April 1 → yesterday):

```bash
pnpm exec tsx src/telematics/motive/backdate.ts \
  --org=org_39B7lu1b8YKds8IOtzrk6LpKnLW \
  --start=2026-04-01 \
  --end=2026-04-09
```

## Atlas (Samsara)

Daily cron has been running. Run the full month as a safety backfill (idempotent):

```bash
pnpm exec tsx src/telematics/samsara/backdate.ts \
  --org=org_39RQY3qNO861ScQb0ZLFSUIFZkN \
  --start=2026-03-01 \
  --end=2026-03-31
```

## Previous months (on demand)

Use the same commands, adjusting `--start` and `--end` dates. There is no
schema or code dependency on date ordering — the sync is fully idempotent.

Example — February 2026 for Wolverine:
```bash
pnpm exec tsx src/telematics/motive/backdate.ts \
  --org=org_39B7lu1b8YKds8IOtzrk6LpKnLW \
  --start=2026-02-01 \
  --end=2026-02-28
```
