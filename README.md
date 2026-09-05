# PayDunya Invoice Platform

An open-source platform for managing multiple businesses, their product catalogs,
invoices, and PayDunya Mobile Money payment links.

## Tech Stack

- FastAPI backend
- MongoDB via Motor
- Role-based users and business access
- Public or private product catalogs
- PayDunya payment-link integration
- Simple static HTML frontend

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
  styles.css
  app.js
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
first time it starts from an interactive terminal. MongoDB must be running.

5. Start the application:

```powershell
cd app
python main.py
```

6. Open `frontend/index.html` in your browser.

To expose the local API temporarily through Cloudflare, install
[`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/),
then run:

```powershell
cd backend\app
python main.py --tunnel
```

The terminal prints a temporary `trycloudflare.com` URL and automatically uses
it for the PayDunya callback, return, and cancel URLs. The included
`cloudflared.example.yml` is a starting point for a permanent named tunnel.

## Roles and access

- A **super admin** creates and lists users, and can manage every business.
- **Managers** and **staff** can create businesses and manage businesses where
  they are the owner or a member.
- Only a business owner or super admin can delete a business. Only a super
  admin can create users.
- A business owner can add existing users as members with `member_ids` when
  creating or updating a business.

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
- `GET /api/public/businesses/{slug}`
- `GET /api/public/businesses/{slug}/products`
- `POST /api/invoices`
- `GET /api/invoices`
- `GET /api/invoices/{invoice_id}`
- `PATCH /api/invoices/{invoice_id}/status`
- `POST /api/invoices/{invoice_id}/payment-link`

Protected routes need this header after login:

```text
Authorization: Bearer <access_token>
```

## Next steps

- Complete the PayDunya request payload in `backend/app/services/paydunya.py`.
- Add PayDunya webhook handling.
- Generate PDF invoices.
- Build a signed-in frontend for business and product management.
