import secrets
import sys
from datetime import datetime

from ..config import settings
from ..database import get_database
from .auth import hash_password


async def ensure_invoice_public_tokens() -> None:
    """Give every existing invoice a public token and index it.

    Invoices created before the permanent-link feature have no token, so their
    receipt page would be unreachable.
    """
    database = get_database()
    cursor = database.invoices.find(
        {"$or": [{"public_token": {"$exists": False}}, {"public_token": None}]},
        {"_id": 1},
    )
    updated = 0
    async for row in cursor:
        await database.invoices.update_one(
            {"_id": row["_id"]},
            {"$set": {"public_token": secrets.token_urlsafe(24)}},
        )
        updated += 1
    if updated:
        print(f"Backfilled a public token on {updated} invoice(s).")

    try:
        await database.invoices.create_index("public_token", unique=True, sparse=True)
    except Exception as error:
        # A legacy duplicate must not stop the application from starting.
        print(f"Could not create the unique index on invoices.public_token: {error}")


async def ensure_super_admin() -> None:
    """Create the first administrator from .env or an interactive prompt."""
    database = get_database()
    if await database.users.count_documents({"role": "super_admin"}, limit=1):
        return

    email = settings.super_admin_email
    password = settings.super_admin_password
    if not email or not password:
        if not sys.stdin.isatty():
            print("No super admin exists. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in backend/.env.")
            return
        print("First run: create the super administrator.")
        email = input("Super admin email: ").strip()
        password = input("Super admin password (8+ characters): ").strip()

    if not email or len(password) < 8:
        print("Super admin was not created: email and a password of at least 8 characters are required.")
        return

    now = datetime.utcnow()
    await database.users.insert_one(
        {
            "email": email.lower(),
            "name": "Super Admin",
            "role": "super_admin",
            "password_hash": hash_password(password),
            "created_at": now,
        }
    )
    print(f"Created super admin: {email}")
