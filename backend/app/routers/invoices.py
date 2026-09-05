from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from ..database import get_database
from ..models import InvoiceInDB
from ..schemas import InvoiceCreate, InvoiceResponse, InvoiceStatusUpdate
from ..services.paydunya import PayDunyaClient
from .auth import current_user, super_admin

router = APIRouter(prefix="/invoices", tags=["invoices"])


def serialize_invoice(document: dict) -> InvoiceResponse:
    invoice = invoice_from_document(document)
    return InvoiceResponse(
        id=str(document["_id"]),
        customer_name=invoice.customer_name,
        customer_email=invoice.customer_email,
        customer_phone=invoice.customer_phone,
        currency=invoice.currency,
        business_id=invoice.business_id,
        items=invoice.items,
        amount=invoice.amount,
        status=invoice.status,
        payment_url=invoice.payment_url,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


def invoice_from_document(document: dict) -> InvoiceInDB:
    invoice_data = {**document, "_id": str(document["_id"])}
    if document.get("business_id") is not None:
        invoice_data["business_id"] = str(document["business_id"])
    return InvoiceInDB(**invoice_data)


async def find_invoice_or_404(invoice_id: str) -> dict:
    if not ObjectId.is_valid(invoice_id):
        raise HTTPException(status_code=404, detail="Invoice not found")

    db = get_database()
    document = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if document is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return document


def can_access_business(business: dict, user: dict) -> bool:
    return (
        user["role"] == "super_admin"
        or user["_id"] == business["owner_id"]
        or user["_id"] in business.get("member_ids", [])
    )


async def require_invoice_access(document: dict, user: dict) -> None:
    """Allow super admins, a business member, or the invoice creator only."""
    if user["role"] == "super_admin":
        return

    if document.get("created_by") == user["_id"]:
        return

    business_id = document.get("business_id")
    if business_id is None:
        raise HTTPException(status_code=403, detail="You do not have access to this invoice")

    business = await get_database().businesses.find_one({"_id": business_id})
    if business is None or not can_access_business(business, user):
        raise HTTPException(status_code=403, detail="You do not have access to this invoice")


async def accessible_business_ids(user: dict) -> list[ObjectId]:
    if user["role"] == "super_admin":
        return []
    rows = await get_database().businesses.find(
        {"$or": [{"owner_id": user["_id"]}, {"member_ids": user["_id"]}]},
        {"_id": 1},
    ).to_list(length=500)
    return [row["_id"] for row in rows]


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    payload: InvoiceCreate,
    user: dict = Depends(current_user),
) -> InvoiceResponse:
    db = get_database()
    now = datetime.utcnow()
    business_id = None
    if payload.business_id is not None:
        if not ObjectId.is_valid(payload.business_id):
            raise HTTPException(status_code=422, detail="Invalid business ID")
        business_id = ObjectId(payload.business_id)
        business = await db.businesses.find_one({"_id": business_id})
        if business is None:
            raise HTTPException(status_code=404, detail="Business not found")
        if not can_access_business(business, user):
            raise HTTPException(status_code=403, detail="You do not have access to this business")
        product_ids = [item.product_id for item in payload.items if item.product_id]
        if product_ids:
            valid_product_ids = [ObjectId(product_id) for product_id in product_ids if ObjectId.is_valid(product_id)]
            matching_products = await db.products.count_documents(
                {"_id": {"$in": valid_product_ids}, "business_id": business_id}
            )
            if matching_products != len(product_ids):
                raise HTTPException(status_code=422, detail="Each product must belong to this business")
    document = {
        "customer_name": payload.customer_name,
        "customer_email": payload.customer_email,
        "customer_phone": payload.customer_phone,
        "currency": payload.currency,
        "business_id": business_id,
        "created_by": user["_id"],
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
async def list_invoices(user: dict = Depends(current_user)) -> list[InvoiceResponse]:
    db = get_database()
    if user["role"] == "super_admin":
        query = {}
    else:
        business_ids = await accessible_business_ids(user)
        clauses: list[dict] = [{"created_by": user["_id"]}]
        if business_ids:
            clauses.append({"business_id": {"$in": business_ids}})
        query = {"$or": clauses}
    documents = await db.invoices.find(query).sort("created_at", -1).to_list(length=100)
    return [serialize_invoice(document) for document in documents]


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    user: dict = Depends(current_user),
) -> InvoiceResponse:
    document = await find_invoice_or_404(invoice_id)
    await require_invoice_access(document, user)
    return serialize_invoice(document)


@router.patch("/{invoice_id}/status", response_model=InvoiceResponse)
async def update_invoice_status(
    invoice_id: str,
    payload: InvoiceStatusUpdate,
    _: dict = Depends(super_admin),
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
async def create_payment_link(
    invoice_id: str,
    user: dict = Depends(current_user),
) -> InvoiceResponse:
    document = await find_invoice_or_404(invoice_id)
    await require_invoice_access(document, user)
    invoice = invoice_from_document(document)

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
