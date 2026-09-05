import hashlib
import json
import re
from urllib.parse import parse_qs

from fastapi import APIRouter, HTTPException, Request

from ..config import settings
from ..database import get_database

router = APIRouter(prefix="/payments", tags=["payments"])


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
    result = await get_database().invoices.update_one(
        {"paydunya_token": token}, {"$set": {"status": status_value}}
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Invoice for this PayDunya token was not found")
    return {"status": "received"}


@router.get("/success")
async def payment_success(token: str | None = None) -> dict[str, str | None]:
    return {"status": "Payment was completed. Confirmation is handled by the payment callback.", "token": token}


@router.get("/cancel")
async def payment_cancel(token: str | None = None) -> dict[str, str | None]:
    return {"status": "Payment was canceled.", "token": token}
