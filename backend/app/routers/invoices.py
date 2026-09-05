from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, HTTPException, status

from ..database import get_database
from ..models import InvoiceInDB
from ..schemas import InvoiceCreate, InvoiceResponse, InvoiceStatusUpdate
from ..services.paydunya import PayDunyaClient

router = APIRouter(prefix="/invoices", tags=["invoices"])


def serialize_invoice(document: dict) -> InvoiceResponse:
    invoice = InvoiceInDB(**{**document, "_id": str(document["_id"])})
    return InvoiceResponse(
        id=str(document["_id"]),
        customer_name=invoice.customer_name,
        customer_email=invoice.customer_email,
        customer_phone=invoice.customer_phone,
        currency=invoice.currency,
        items=invoice.items,
        amount=invoice.amount,
        status=invoice.status,
        payment_url=invoice.payment_url,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


async def find_invoice_or_404(invoice_id: str) -> dict:
    if not ObjectId.is_valid(invoice_id):
        raise HTTPException(status_code=404, detail="Invoice not found")

    db = get_database()
    document = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if document is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return document


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(payload: InvoiceCreate) -> InvoiceResponse:
    db = get_database()
    now = datetime.utcnow()
    document = {
        "customer_name": payload.customer_name,
        "customer_email": payload.customer_email,
        "customer_phone": payload.customer_phone,
        "currency": payload.currency,
        "items": [item.model_dump() for item in payload.items],
        "status": "pending",
        "payment_url": None,
        "paydunya_token": None,
        "metadata": {},
        "created_at": now,
        "updated_at": now,
    }
    result = await db.invoices.insert_one(document)
    document["_id"] = result.inserted_id
    return serialize_invoice(document)


@router.get("", response_model=list[InvoiceResponse])
async def list_invoices() -> list[InvoiceResponse]:
    db = get_database()
    documents = await db.invoices.find().sort("created_at", -1).to_list(length=100)
    return [serialize_invoice(document) for document in documents]


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(invoice_id: str) -> InvoiceResponse:
    document = await find_invoice_or_404(invoice_id)
    return serialize_invoice(document)


@router.patch("/{invoice_id}/status", response_model=InvoiceResponse)
async def update_invoice_status(
    invoice_id: str,
    payload: InvoiceStatusUpdate,
) -> InvoiceResponse:
    document = await find_invoice_or_404(invoice_id)
    db = get_database()
    await db.invoices.update_one(
        {"_id": document["_id"]},
        {"$set": {"status": payload.status.value, "updated_at": datetime.utcnow()}},
    )
    updated = await find_invoice_or_404(invoice_id)
    return serialize_invoice(updated)


@router.post("/{invoice_id}/payment-link", response_model=InvoiceResponse)
async def create_payment_link(invoice_id: str) -> InvoiceResponse:
    document = await find_invoice_or_404(invoice_id)
    invoice = InvoiceInDB(**{**document, "_id": str(document["_id"])})

    paydunya = PayDunyaClient()
    try:
        payment = await paydunya.create_payment_link(invoice)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    db = get_database()
    await db.invoices.update_one(
        {"_id": document["_id"]},
        {
            "$set": {
                "payment_url": payment.url,
                "paydunya_token": payment.token,
                "updated_at": datetime.utcnow(),
            }
        },
    )
    updated = await find_invoice_or_404(invoice_id)
    return serialize_invoice(updated)
