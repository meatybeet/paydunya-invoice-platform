import hashlib
import json
import logging
import re
from datetime import datetime
from urllib.parse import parse_qs

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from ..config import settings
from ..database import get_database
from ..services.email import build_invoice_email_body, send_invoice_email
from ..services.receipt import next_receipt_number, permanent_url, render_invoice_html
from .invoices import new_public_token
from .receipts import safe_download_filename

router = APIRouter(prefix="/payments", tags=["payments"])

logger = logging.getLogger(__name__)


def read_callback_data(body: bytes) -> dict:
    """Read PayDunya's form-encoded `data` payload without extra dependencies."""
    form = parse_qs(body.decode("utf-8"), keep_blank_values=True)
    raw_data = form.get("data", [""])[0]
    if raw_data:
        try:
            return json.loads(raw_data)
        except json.JSONDecodeError:
            pass

    data: dict = {}
    for key, value in form.items():
        parts = re.findall(r"[^\[\]]+", key)
        if not parts or parts[0] != "data":
            continue
        target = data
        for part in parts[1:-1]:
            target = target.setdefault(part, {})
        if len(parts) > 1:
            target[parts[-1]] = value[0]
    return data


def frontend_page(page: str, query: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/{page}?{query}"


async def send_paid_invoice_email(document: dict) -> None:
    """Email the invoice to the payer. Never raises: the money already moved."""
    recipient = document.get("customer_email")
    if not recipient:
        return

    try:
        business = None
        if document.get("business_id") is not None:
            business = await get_database().businesses.find_one({"_id": document["business_id"]})
        link = permanent_url(document.get("public_token") or "")
        reference = document.get("receipt_number") or ""
        await send_invoice_email(
            to_address=recipient,
            subject=f"Votre facture {reference}".strip(),
            html_body=build_invoice_email_body(document, link),
            attachment_html=render_invoice_html(document, business, link),
            attachment_filename=safe_download_filename(document),
        )
    except Exception as error:
        logger.warning("Could not send the invoice email for %s: %s", document.get("_id"), error)


async def finalize_paid_invoice(document: dict) -> None:
    """Mark an invoice paid, number it once, and email it once.

    PayDunya retries callbacks, so this has to be idempotent: an invoice that
    already carries a receipt number is never renumbered and never re-emailed.
    """
    db = get_database()
    now = datetime.utcnow()

    if document.get("receipt_number"):
        # An earlier callback already numbered and emailed this invoice.
        await db.invoices.update_one(
            {"_id": document["_id"]},
            {
                "$set": {
                    "status": "paid",
                    "paid_at": document.get("paid_at") or now,
                    "updated_at": now,
                }
            },
        )
        return

    updates = {
        "status": "paid",
        "paid_at": document.get("paid_at") or now,
        "receipt_number": await next_receipt_number(db),
        "updated_at": now,
    }
    if not document.get("public_token"):
        updates["public_token"] = new_public_token()

    # Claiming the receipt number atomically: only one concurrent retry wins,
    # so only one of them sends the email.
    result = await db.invoices.update_one(
        {
            "_id": document["_id"],
            "$or": [{"receipt_number": None}, {"receipt_number": {"$exists": False}}],
        },
        {"$set": updates},
    )
    if not result.modified_count:
        return

    await send_paid_invoice_email({**document, **updates})


@router.post("/callback")
async def paydunya_callback(request: Request) -> dict[str, str]:
    data = read_callback_data(await request.body())
    expected_hash = hashlib.sha512(settings.paydunya_master_key.encode("utf-8")).hexdigest()
    if not settings.paydunya_master_key or data.get("hash") != expected_hash:
        raise HTTPException(status_code=403, detail="Unverified PayDunya callback")

    invoice_data = data.get("invoice", {})
    token = invoice_data.get("token") if isinstance(invoice_data, dict) else data.get("token")
    if not token:
        raise HTTPException(status_code=422, detail="PayDunya callback has no invoice token")

    payment_status = str(data.get("status", "")).lower()
    status_value = "paid" if payment_status == "completed" else "canceled" if payment_status in {"cancelled", "canceled", "failed"} else "pending"

    db = get_database()
    document = await db.invoices.find_one({"paydunya_token": token})
    if document is None:
        raise HTTPException(status_code=404, detail="Invoice for this PayDunya token was not found")

    if status_value == "paid":
        await finalize_paid_invoice(document)
    elif document.get("status") not in {"paid", "canceled"}:
        # A cancelled/failed checkout is not an invoice cancellation: the
        # payer may return to the same link and try again.  Crucially, never
        # let a delayed non-paid callback regress an already-paid invoice.
        await db.invoices.update_one(
            {"_id": document["_id"]},
            {
                "$set": {
                    "status": "pending",
                    "metadata.last_paydunya_status": payment_status,
                    "updated_at": datetime.utcnow(),
                }
            },
        )
    return {"status": "received"}


@router.get("/success")
async def payment_success(token: str | None = None) -> RedirectResponse:
    """Send the payer straight to their invoice page, which auto-downloads it."""
    document = None
    if token:
        document = await get_database().invoices.find_one({"paydunya_token": token})
    if document is None or not document.get("public_token"):
        return RedirectResponse(
            frontend_page("facture.html", "erreur=introuvable"), status_code=303
        )
    query = f"token={document['public_token']}&auto=1"
    if document.get("status") != "paid":
        # The browser redirect commonly beats PayDunya's server-to-server
        # callback. receipt.js polls safely and downloads only after the
        # authoritative callback records a paid invoice.
        query += "&attente=1"
    return RedirectResponse(frontend_page("facture.html", query), status_code=303)


@router.get("/cancel")
async def payment_cancel(token: str | None = None) -> RedirectResponse:
    """Back to the payment page so the customer can try again."""
    document = None
    if token:
        document = await get_database().invoices.find_one({"paydunya_token": token})
    if document is None or not document.get("public_token"):
        return RedirectResponse(
            frontend_page("payer.html", "erreur=introuvable"), status_code=303
        )
    return RedirectResponse(
        frontend_page("payer.html", f"token={document['public_token']}&annule=1"),
        status_code=303,
    )
