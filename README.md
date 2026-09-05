# PayDunya Invoice Platform

An open-source platform for managing multiple businesses, their product catalogs,
invoices, and PayDunya Mobile Money payment links.

## Tech Stack

- FastAPI backend
- MongoDB via Motor
- Role-based users and business access
- Public or private product catalogs
- PayDunya payment-link integration
- Product-selection payment links that a customer can open without an account
- Permanent, downloadable HTML invoices issued after PayDunya confirms payment
- Optional business and product images, stored locally and served safely
- Signed-in browser interface for businesses, products, invoices, and users

## Project Structure

```text
backend/
  app/
    main.py
    config.py
    database.py
    models.py
    schemas.py
    routers/
      auth.py
      businesses.py
      invoices.py
      public.py
    services/
      paydunya.py
frontend/
  index.html
  catalog.html
  styles.css
  js/
    views/
```

## Setup

1. Create a virtual environment:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
pip install -r requirements.txt
```

3. Copy environment variables:

```powershell
Copy-Item .env.example .env
```

4. Edit `.env`. At minimum, set a secure `AUTH_SECRET` and the first super-admin credentials:

```env
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=use-a-long-password
AUTH_SECRET=use-a-long-random-secret
```

If the two super-admin values are omitted, the application asks for them the
first time it starts from an interactive terminal.

5. Start the application:

```powershell
cd app
python main.py
```

6. Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser.

The FastAPI application serves the frontend itself. This is important for the
public catalog and Cloudflare tunnel: do not open `frontend/index.html` directly
from the filesystem when you want to share it.

When `MONGODB_URL` is `mongodb://localhost:27017`, starting the app also starts
the included MongoDB Docker container and waits until it is ready. Docker
Desktop must be running. The data is stored in the named Docker volume
`paydunya_mongo_data`, so restarting the app does not erase it.

To use MongoDB Atlas or another remote database instead, set `MONGODB_URL` to
that connection string; the local Docker container will be skipped.

To add the requested example catalog to an existing **DIALLO & FILS** business,
run this once from the repository root after MongoDB is available:

```powershell
.\venv\Scripts\python.exe backend\seed_diallo.py
```

The normal command is safe to run again: it adds only missing categories and
products. Do not pass `--reset` unless you intentionally want to delete every
product and category belonging to that business.

To expose the local API temporarily through Cloudflare, install
[`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/),
then run:

```powershell
cd backend\app
python main.py --tunnel
```

The application waits until the temporary `trycloudflare.com` URL is available,
then automatically uses it for the PayDunya callback, return, and cancel URLs
before starting the app. The URL serves both the browser interface and public
catalogs. A public catalog has the form
`https://<tunnel>.trycloudflare.com/catalog.html?slug=<business-slug>`; the
interface copies the correct link from the business page. The included
`cloudflared.example.yml` is a starting point for a permanent named tunnel.

## Going live

For a step-by-step production deployment guide covering HTTPS, MongoDB,
PayDunya callbacks, SMTP invoices, backups, and verification, read
[how_to_go_live.md](how_to_go_live.md).

## Roles and access

- A **super admin** creates and lists users, and can manage every business.
- **Managers** and **staff** can create businesses and manage businesses where
  they are the owner or a member.
- Only a business owner or super admin can delete a business. Only a super
  admin can create users.
- A business owner can add existing users as members with `member_ids` when
  creating or updating a business.
- Invoices are private: a super admin sees all invoices; other users see only
  invoices they created or invoices belonging to a business they can access.
  A super admin may cancel or reopen an unpaid invoice; only PayDunya's verified
  callback can mark one as paid.

## API endpoints

- `GET /health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/users` — super admin only
- `GET /api/auth/users` — super admin only
- `POST`, `GET`, `PATCH`, `DELETE /api/businesses`
- `POST`, `GET /api/businesses/{business_id}/categories`
- `POST`, `GET /api/businesses/{business_id}/products`
- `PATCH`, `DELETE /api/businesses/{business_id}/products/{product_id}`
- `GET /api/businesses/{business_id}/payment-history`
- `GET /api/public/businesses/{slug}`
- `GET /api/public/businesses/{slug}/products`
- `POST /api/uploads/image` and `DELETE /api/uploads/image/{filename}` — signed-in users only
- `POST /api/invoices` — authorised business members only
- `POST /api/invoices/from-products` — build a payment link from saved products
- `GET /api/invoices` — invoices visible to the signed-in user
- `GET /api/invoices/{invoice_id}` — authorised invoice viewers only
- `PATCH /api/invoices/{invoice_id}/status` — super admin only
- `POST /api/invoices/{invoice_id}/payment-link` — authorised invoice viewers only
- `GET /api/public/invoices/{token}` — safe public payment/invoice view
- `POST /api/public/invoices/{token}/payment-link` — payer retries link generation
- `GET /api/public/invoices/{token}/download` — paid invoice download

Protected routes need this header after login:

```text
Authorization: Bearer <access_token>
```

PayDunya checkout invoices must be at least **200 FCFA**.

To associate an invoice with a business and products, include the business ID at
the invoice root and each product ID on its matching item. The business payment
history endpoint then shows the invoice, customer, line items, and payment
status.

## Quick manual test

1. Sign in with the super-admin account created on first launch.
2. Create an enterprise, add a product, then create an invoice for at least
   **200 FCFA** from the **Factures** page.
3. Generate its payment link and open it in a new tab. The invoice detail page
   identifies its linked business and product line items.
4. Mark the business public and open its copied catalog link in a private
   browser window. For an internet test, start with `--tunnel` and use the
   `trycloudflare.com` link printed in the terminal.
