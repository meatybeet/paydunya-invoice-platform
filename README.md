# PayDunya Invoice Platform

Starter open-source invoice platform for creating invoices and generating Mobile Money payment links through PayDunya.

This is intentionally a basic scaffold so you can finish the business logic yourself.

## Tech Stack

- FastAPI backend
- MongoDB via Motor
- PayDunya API integration placeholder
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
      invoices.py
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

4. Edit `.env` and add your MongoDB URL and PayDunya keys.

5. Start the application:

```powershell
cd app
python main.py
```

6. Open `frontend/index.html` in your browser.

## API Endpoints

- `GET /health`
- `POST /api/invoices`
- `GET /api/invoices`
- `GET /api/invoices/{invoice_id}`
- `PATCH /api/invoices/{invoice_id}/status`
- `POST /api/invoices/{invoice_id}/payment-link`

## Next Steps

- Complete the PayDunya request payload in `backend/app/services/paydunya.py`.
- Add authentication for merchants.
- Store each merchant's own PayDunya keys securely.
- Add PayDunya webhook handling.
- Generate PDF invoices.
- Improve frontend validation and invoice management.
