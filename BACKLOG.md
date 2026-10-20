# Backlog

Ideas and improvements deliberately deferred — not urgent, but worth picking up later.

## HTML design for the "statement received" confirmation email

`receive-statement-email` currently sends a plain-text confirmation reply (subject + body only, no branding) when a forwarded statement is received. Upgrade it to send an HTML version alongside the plain-text one (Mailgun's Messages API accepts both `html` and `text` in the same call — the client picks whichever it supports), styled with Poquet's branding, similar to how TripIt replies to a forwarded itinerary email.

Blocker: needs a publicly reachable URL for the Poquet logo — email HTML can't reference local project assets, so the logo needs to be hosted somewhere accessible from the internet (e.g. uploaded to Supabase Storage as a public file, or wherever the marketing site ends up living) before this can be built.

Touches: `receive-statement-email` edge function (`sendReceivedNotice`).

## Multi-currency, phase 2 (after `feat/multi-currency`)

Phase 1 stops amounts in different currencies from being added together (Home, Insights currency selector, Transactions, Calendar, Pay, the advisor). Still open:

- **Dual-currency statements.** Many Colombian (and Costa Rican) cards print one statement with a pesos section and a dollars section. `cards.currency` holds one currency per card, so those dollar lines would land as pesos and the balance check fails. Needs a currency per transaction (or two balances per card) in `parse-statement`, `receive-statement-email`, `apply-statement` and the app.
- **Local number format.** `money()` always prints `1,234.56`. Colombia writes `$ 1.234.567` (often without decimals). Format by currency or by the user's region.
- **Test with real statements** from Colombia's three biggest banks before any marketing there.
- `apply-statement`'s merchant classifier prompt still says "mostly Panama".

Touches: `src/format.ts`, the three statement edge functions, `cards` / `transactions` schema.
