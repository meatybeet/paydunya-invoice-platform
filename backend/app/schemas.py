from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from .models import InvoiceItem, InvoiceStatus


class InvoiceCreate(BaseModel):
    customer_name: str = Field(min_length=2)
    customer_email: EmailStr | None = None
    customer_phone: str | None = None
    currency: str = "XOF"
    items: list[InvoiceItem]


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus


class InvoiceResponse(BaseModel):
    id: str
    customer_name: str
    customer_email: str | None = None
    customer_phone: str | None = None
    currency: str
    items: list[InvoiceItem]
    amount: float
    status: InvoiceStatus
    payment_url: str | None = None
    created_at: datetime
    updated_at: datetime
