import secrets
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from ..database import get_database
from ..models import InvoiceInDB, InvoiceItem, InvoiceStatus
from ..schemas import InvoiceCreate, InvoiceResponse, InvoiceStatusUpdate, PaymentLinkRequest
from ..services.paydunya import PayDunyaClient
from .auth import current_user, super_admin

router = APIRouter(prefix="/invoices", tags=["invoices"])

# PayDunya refuses a checkout below this amount.
MINIMUM_CHECKOUT_AMOUNT = 200


def new_public_token() -> str:
    """Unguessable credential used by the public invoice and receipt routes."""
    return secrets.token_urlsafe(24)


def serialize_invoice(document: dict, warning: str | None = None) -> InvoiceResponse:
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
        public_token=invoice.public_token,
        receipt_number=invoice.receipt_number,
        paid_at=invoice.paid_at,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
        warning=warning,
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
        "public_token": new_public_token(),
        "receipt_number": None,
        "paid_at": None,
        "metadata": {},
        "created_at": now,
        "updated_at": now,
    }
    result = await db.invoices.insert_one(document)
    document["_id"] = result.inserted_id
    return serialize_invoice(document)


@router.post("/from-products", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice_from_products(
    payload: PaymentLinkRequest,
    user: dict = Depends(current_user),
) -> InvoiceResponse:
    """Build an invoice from a selection of catalog products and link it to PayDunya."""
    # Imported here on purpose: businesses.py imports this module at import time,
    # so a module level import would be circular.
    from .businesses import require_manager

    business = await require_manager(payload.business_id, user)
    db = get_database()

    product_ids: list[ObjectId] = []
    for entry in payload.items:
        if not ObjectId.is_valid(entry.product_id):
            raise HTTPException(status_code=422, detail="Un produit sélectionné est introuvable dans cette entreprise.")
        product_ids.append(ObjectId(entry.product_id))

    rows = await db.products.find(
        {"_id": {"$in": product_ids}, "business_id": business["_id"]}
    ).to_list(length=len(product_ids))
    products = {str(row["_id"]): row for row in rows}

    # Names and prices always come from the database, never from the client.
    items: list[InvoiceItem] = []
    for entry in payload.items:
        product = products.get(entry.product_id)
        if product is None:
            raise HTTPException(status_code=422, detail="Un produit sélectionné est introuvable dans cette entreprise.")
        items.append(
            InvoiceItem(
                name=product["name"],
                quantity=entry.quantity,
                unit_price=float(product["price"]),
                product_id=str(product["_id"]),
            )
        )

    amount = sum(item.total for item in items)
    if amount < MINIMUM_CHECKOUT_AMOUNT:
        raise HTTPException(
            status_code=422,
            detail=f"Le montant total doit être d'au moins {MINIMUM_CHECKOUT_AMOUNT} FCFA pour créer un lien de paiement.",
        )

    now = datetime.utcnow()
    document = {
        "customer_name": payload.customer_name,
        "customer_email": payload.customer_email,
        "customer_phone": payload.customer_phone,
        "currency": payload.currency,
        "business_id": business["_id"],
        "created_by": user["_id"],
        "items": [item.model_dump() for item in items],
        "status": "pending",
        "payment_url": None,
        "paydunya_token": None,
        "public_token": new_public_token(),
        "receipt_number": None,
        "paid_at": None,
        "metadata": {},
        "created_at": now,
        "updated_at": now,
    }
    result = await db.invoices.insert_one(document)
    document["_id"] = result.inserted_id

    # The invoice is already saved: a PayDunya outage must not lose it.
    try:
        payment = await PayDunyaClient().create_payment_link(invoice_from_document(document))
    except Exception:
        return serialize_invoice(
            document,
            warning="La facture a été créée mais le lien de paiement PayDunya n'a pas pu être généré. Réessayez depuis la facture.",
        )

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
    document["payment_url"] = payment.url
    document["paydunya_token"] = payment.token
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
    if document.get("status") == InvoiceStatus.paid.value:
        raise HTTPException(
            status_code=409,
            detail="Une facture payée ne peut plus être modifiée manuellement.",
        )
    if payload.status == InvoiceStatus.paid:
        raise HTTPException(
            status_code=422,
            detail="Le statut payé est réservé à la confirmation PayDunya.",
        )
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
    if invoice.status == InvoiceStatus.paid:
        raise HTTPException(
            status_code=409,
            detail="Cette facture est déjà payée. Aucun nouveau lien de paiement n'est nécessaire.",
        )
    if invoice.status == InvoiceStatus.canceled:
        raise HTTPException(
            status_code=409,
            detail="Cette facture est annulée et ne peut plus recevoir de lien de paiement.",
        )

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
