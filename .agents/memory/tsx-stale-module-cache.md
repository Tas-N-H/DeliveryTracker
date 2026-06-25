---
name: tsx stale module cache
description: Adding a Drizzle column mid-session without restarting the tsx server causes that column to be silently omitted from INSERT queries.
---

## The rule
Any time a Drizzle table definition in `shared/schema.ts` is changed (column added, renamed, removed), the `tsx` server process **must be restarted** before the change takes effect in ORM queries.

**Why:** `tsx` (without `--watch`) uses the standard Node.js module cache. Once `shared/schema.ts` is loaded, the compiled Drizzle table objects are frozen in memory. Subsequent file edits are not picked up until the process restarts. Drizzle silently omits unknown keys from `.values({})` rather than throwing, so inserts succeed but the new column is left NULL.

**How to apply:**
- After every schema change, verify the workflow was restarted (check the log timestamp).
- If users report a new column always saving as NULL despite correct code, suspect the stale-cache issue first — confirm by checking the Drizzle SELECT log: if the column appears in SELECT queries the schema is live; if not, restart the workflow.
- Direct SQL inserts (`executeSql`) bypass this issue entirely and can be used to verify the DB column itself is healthy.
