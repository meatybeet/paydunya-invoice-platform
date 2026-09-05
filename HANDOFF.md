# Continuation notes

This file records the current implementation state for the next contributor.
It replaces the earlier planning-only handoff: the public payment and receipt
pages now exist and are wired into the application.

## Delivered in this change

- Businesses and products accept optional PNG, JPEG, or WebP images (2 MB by
  default). Uploads are UUID-named; deletion is limited to the uploader, a
  manager of the business currently using the image, or a super administrator.
- A signed-in business user can select one or many saved products at
  `#/lien-de-paiement`, enter the customer name and required email address,
  and create a shareable `payer.html?token=...` link. Product names and prices
  always come from MongoDB, never from the browser.
- `payer.html` is public. Its token is the payer credential. It shows the
  order and sends the payer to PayDunya without requiring an account.
- PayDunya's verified callback is the only path that marks an invoice paid.
  It assigns an immutable receipt number, makes the permanent HTML invoice
  available, generates a PDF copy, and sends that PDF through configured SMTP.
- `facture.html?token=...` is the permanent public invoice page. It contains
  the permanent link, download and print controls. It downloads only after an
  invoice is confirmed paid. If PayDunya returns the browser before its
  callback, the page polls briefly and then starts the download automatically.
- The backend serves the frontend and uploads from the same origin, so a
  Cloudflare quick tunnel exposes the public catalog, payment page, receipt,
  and API together.
- `backend/seed_diallo.py` adds the requested DIALLO & FILS catalog safely
  without deleting existing records: five categories and 23 products.
- `how_to_go_live.md` is the production deployment and verification guide.

## Important invariants

- Do not let an unverified browser redirect mark a payment paid. The
  `/api/payments/callback` hash check is authoritative.
- A paid invoice is terminal. A delayed cancelled/failed callback must never
  change it back. Manual status changes are super-admin-only and may only
  cancel or reopen an unpaid invoice.
- Never create another PayDunya payment link for a paid or manually cancelled
  invoice.
- Public invoice tokens are intentionally unauthenticated but must never
  expose customer email, phone, PayDunya tokens, or Mongo IDs.
- Do not make CORS permissive. The normal deployment is same-origin;
  `CORS_ORIGINS` is empty unless a separately hosted frontend is intentional.
- Keep `backend/.env`, actual uploads, `venv/`, and unrelated user work out of
  commits.

## Run and verify locally

```powershell
python backend/app/main.py
```

For a public test, install `cloudflared` and use:

```powershell
python backend/app/main.py --tunnel
```

Then use the signed-in interface to create a product selection payment link.
The full production checklist, including a real PayDunya callback and SMTP
test, is in `how_to_go_live.md`.

To seed the example shop without erasing anything:

```powershell
.\venv\Scripts\python.exe backend\seed_diallo.py
```

Do **not** use `--reset` unless deleting every category and product of DIALLO
& FILS is deliberate.

## Known operational limits

- Product `quantity` is a catalog stock field, not a reservation system. A
  future inventory feature should add explicit stock reservations/expiry and
  atomic decrements rather than trying to infer stock changes from callbacks.
- SMTP delivery errors are logged and never undo a confirmed payment. Add a
  retry queue and an operator-facing resend action if delivery guarantees need
  to go beyond the configured SMTP provider's own retries.
- Quick Cloudflare tunnels are development tools only. Use the domain, Caddy,
  systemd, backups, and production database plan in `how_to_go_live.md` for
  live customers.
