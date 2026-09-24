# Backlog

Ideas and improvements deliberately deferred — not urgent, but worth picking up later.

## HTML design for the "statement received" confirmation email

`receive-statement-email` currently sends a plain-text confirmation reply (subject + body only, no branding) when a forwarded statement is received. Upgrade it to send an HTML version alongside the plain-text one (Mailgun's Messages API accepts both `html` and `text` in the same call — the client picks whichever it supports), styled with Poquet's branding, similar to how TripIt replies to a forwarded itinerary email.

Blocker: needs a publicly reachable URL for the Poquet logo — email HTML can't reference local project assets, so the logo needs to be hosted somewhere accessible from the internet (e.g. uploaded to Supabase Storage as a public file, or wherever the marketing site ends up living) before this can be built.

Touches: `receive-statement-email` edge function (`sendReceivedNotice`).
