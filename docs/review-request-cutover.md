# 1-Tap Review: production cutover (PR #4, then PR #5)

This page contains no credentials. Keys and webhook URLs are created and entered by the owner and
never go in this repository, a chat, an email or a ticket.

## Node.js

- `.node-version` pins Node.js **22**, the documented way to set the Netlify build version. Netlify
  uses it to install dependencies (`npm install` from `package.json` / `package-lock.json`), and the
  functions runtime follows the build version by default. `@netlify/blobs` 11.1.2 requires Node
  `>=22.12.0` (`engines` in `package.json`), and "22" resolves to the latest 22.x release.
- **Check in Netlify before the merge** (Project configuration → Environment variables, and
  Developer settings → Dependency management):
  - no `NODE_VERSION` variable is set to anything below 22.12 (an existing variable could take
    precedence over the file; remove it or set it to `22`);
  - `AWS_LAMBDA_JS_RUNTIME` is unset, or set to `nodejs22.x` or later. It overrides the functions
    runtime, and Netlify allows it only in the UI, CLI or API.
- If dependencies are missing, the function bundle fails and Netlify keeps the previous deploy
  live. Check the first deploy log: dependency installation runs on Node 22, and
  `review-request` is listed among the deployed functions.

## Environment variables (Netlify → Project configuration → Environment variables)

Each one: **Contains secret values** ON · **Scopes:** Functions only · **Deploy contexts:**
Production only. Previews and branch deploys then cannot send. Changes take effect at the next
deploy, so set them **before** merging.

| Name | Needed from | Value format (never commit or paste the value anywhere else) |
|---|---|---|
| `REVIEW_WEBHOOK_URL` | PR #4 | The **new** GoHighLevel inbound-webhook URL, `https://services.leadconnectorhq.com/hooks/…` (letters, digits, `/`, `_`, `-` only). |
| `REVIEW_STAFF_KEYS` | PR #4 | Exactly one entry, `juan:<64 hex characters>`, from `node tools/review-staff-key.mjs juan` run by the owner on their own computer. |
| `REVIEW_REPORT_KEYS` | PR #5 | `moa-report:<64 hex characters>`, from `node tools/review-staff-key.mjs moa-report --report` (PR #5 tool). |

- If `REVIEW_WEBHOOK_URL` or `REVIEW_STAFF_KEYS` is missing or malformed, `/api/review-request`
  answers 503 and sends nothing (fails closed).
- **Between the PR #4 and PR #5 merges, Juan-only depends on configuration.** PR #4 lets any
  listed label send; PR #5 adds the code-level Juan-only rule. Keep `REVIEW_STAFF_KEYS` to the
  single `juan:` entry.
- The staff link (the one containing `#key=`) is sent to Juan privately, once. The tool prints
  the hash, which is not secret; the key and the link are.

## GoHighLevel

The live page posts `{ "full_name", "phone" }` to the current webhook. The function posts the same
two fields to `REVIEW_WEBHOOK_URL`, with the phone in `+1XXXXXXXXXX` form, so the workflow's
actions and field mapping carry over.

1. Duplicate the current review workflow and leave the original **on**.
2. In the copy, add a new **Inbound Webhook** trigger and map `full_name` and `phone`. Do the
   mapping while the copy is a **draft**, using a sample with the owner's own number, so no
   customer is texted. Then publish the copy.
3. The original workflow and its webhook stay on until Test A passes (step 7 below).

## Order

1. Confirm the Node checks above.
2. Prepare the new GoHighLevel workflow, with the original still on.
3. The owner generates the keys locally.
4. Juan enters the three variables. Note the current production deploy as the rollback point.
5. Merge PR #4 (production deploy).
6. Run **Test A**.
7. Only after Test A passes, turn off the original workflow's trigger. This retires the webhook
   that the old page published.
8. Retarget PR #5 to `main`, merge it, and run **Test B** (`docs/review-request-metrics.md`).

## Test A — after the PR #4 deploy: sending

No customer is texted. Stop at the first failure and roll back as described below.

| # | Step | Pass |
|---|---|---|
| A1 | Netlify deploy log | Node 22.x used; `review-request` function deployed; no bundling errors. |
| A2 | `curl.exe -s -X POST https://jmirrigationco.com/api/review-request` (no key) | `401` `{"ok":false,"code":"unauthorized"}`. A `503 not_configured` means a variable is missing: stop. |
| A3 | View source of `https://jmirrigationco.com/review.html` | No `leadconnectorhq` anywhere; `noindex`; it calls `/api/review-request`. |
| A4 | Juan opens his staff link once on his phone | The form shows, and the `#key=…` part disappears from the address bar. |
| A5 | Juan sends **his own** name and cell number | "✓ Sent!". The text arrives from the **new** workflow (check its execution history). The original workflow shows no new execution. |
| A6 | Juan taps Send again with the same number | "Not sent: this number already got a review request in the last 24 hours." Nothing new in GoHighLevel. |
| A7 | Netlify → Functions → `review-request` logs | Lines show only `outcome`, `status`, `staff`, `request_id` and `ms`. No name or number. |

## Rollback

- **Before step 7:** in Netlify Deploys, publish the noted pre-cutover deploy. That restores
  today's page, which uses only the original, already-public webhook. The new webhook exists only
  in the Functions environment and never appears in a page. Unlock auto-publishing after the fix.
- **After step 7:** never restore the old page (its webhook is retired). Fix forward. Most
  failures are a variable correction plus a redeploy, because the function fails closed. Meanwhile
  Juan can send review requests from the GoHighLevel app.
- **PR #5 problem:** publish the PR #4 deploy, or revert the PR #5 merge on GitHub.
- **Lost or leaked key:** replace the `REVIEW_STAFF_KEYS` / `REVIEW_REPORT_KEYS` entry and redeploy.
