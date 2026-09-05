"""Public invoice routes.

There is no authentication here on purpose: the payer has no account, so the
unguessable public token is the credential. An unknown token always answers 404
(never 403) so the endpoints cannot be used to confirm that a token exists.
"""

import re
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response

from ..database import get_database
from ..schemas import PublicInvoiceResponse
from ..services.paydunya import PayDunyaClient
from ..services.receipt import invoice_amount, permanent_url, render_invoice_html, render_invoice_pdf
from .invoices import invoice_from_document

router = APIRouter(prefix="/public/invoices", tags=["public invoices"])

INVOICE_NOT_FOUND = "Cette facture est introuvable. Vérifiez le lien reçu."
INVOICE_NOT_PAID = "La facture téléchargeable sera disponible après confirmation du paiement."


async def find_public_invoice_or_404(token: str) -> dict:
    """Exact match on the public token, 404 on anything else."""
    if not token:
        raise HTTPException(status_code=404, detail=INVOICE_NOT_FOUND)
    document = await get_database().invoices.find_one({"public_token": token})
    if document is None:
        raise HTTPException(status_code=404, detail=INVOICE_NOT_FOUND)
    return document


async def load_business(document: dict) -> dict | None:
    business_id = document.get("business_id")
    if business_id is None:
        return None
    return await get_database().businesses.find_one({"_id": business_id})


def serialize_public_invoice(document: dict, business: dict | None) -> PublicInvoiceResponse:
    return PublicInvoiceResponse(
        receipt_number=document.get("receipt_number"),
        customer_name=document.get("customer_name", ""),
        currency=document.get("currency") or "XOF",
        items=document.get("items") or [],
        amount=invoice_amount(document),
        status=document.get("status", "pending"),
        created_at=document.get("created_at") or datetime.utcnow(),
        paid_at=document.get("paid_at"),
        business_name=(business or {}).get("name"),
        business_image_url=(business or {}).get("image_url"),
        payment_url=document.get("payment_url"),
        permanent_url=permanent_url(document.get("public_token") or ""),
    )


def safe_download_filename(document: dict) -> str:
    """ASCII only, so the Content-Disposition header stays valid everywhere."""
    reference = document.get("receipt_number") or str(document.get("_id", ""))[-8:]
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "-", str(reference)).strip("-")
    return f"facture-{cleaned or 'sans-numero'}.pdf"


async def render_public_invoice(document: dict) -> str:
    business = await load_business(document)
    return render_invoice_html(
        document, business, permanent_url(document.get("public_token") or "")
    )


async def render_public_invoice_pdf(document: dict) -> bytes:
    business = await load_business(document)
    return render_invoice_pdf(
        document, business, permanent_url(document.get("public_token") or "")
    )


@router.get("/{token}", response_model=PublicInvoiceResponse)
async def public_invoice(token: str) -> PublicInvoiceResponse:
    document = await find_public_invoice_or_404(token)
    return serialize_public_invoice(document, await load_business(document))


@router.post("/{token}/payment-link", response_model=PublicInvoiceResponse)
async def public_payment_link(token: str) -> PublicInvoiceResponse:
    """Rebuild the PayDunya checkout when the invoice has no usable link yet."""
    document = await find_public_invoice_or_404(token)
    if document.get("status") == "paid":
        raise HTTPException(
            status_code=409,
            detail="Cette facture est déjà payée. Aucun nouveau lien de paiement n'est nécessaire.",
        )
    if document.get("status") == "canceled":
        raise HTTPException(
            status_code=409,
            detail="Cette facture est annulée et ne peut plus être réglée.",
        )

    if not document.get("payment_url"):
        try:
            payment = await PayDunyaClient().create_payment_link(invoice_from_document(document))
        except Exception as error:
            raise HTTPException(
                status_code=502,
                detail="Le lien de paiement n'a pas pu être généré. Veuillez réessayer dans un instant.",
            ) from error

        await get_database().invoices.update_one(
            {"_id": document["_id"]},
            {
                "$set": {
                    "payment_url": payment.url,
                    "paydunya_token": payment.token,
                    "updated_at": datetime.utcnow(),
                }
            },
        )
        document["payment_url"] = payment.url
        document["paydunya_token"] = payment.token

    return serialize_public_invoice(document, await load_business(document))


@router.get("/{token}/html", response_class=HTMLResponse)
async def public_invoice_html(token: str) -> HTMLResponse:
    document = await find_public_invoice_or_404(token)
    if document.get("status") != "paid":
        raise HTTPException(status_code=409, detail=INVOICE_NOT_PAID)
    return HTMLResponse(content=await render_public_invoice(document))


@router.get("/{token}/download", response_class=Response)
async def download_invoice(token: str) -> Response:
    document = await find_public_invoice_or_404(token)
    if document.get("status") != "paid":
        raise HTTPException(status_code=409, detail=INVOICE_NOT_PAID)
    return Response(
        content=await render_public_invoice_pdf(document),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_download_filename(document)}"'
        },
    )
