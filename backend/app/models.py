from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class InvoiceStatus(StrEnum):
    pending = "pending"
    paid = "paid"
    canceled = "canceled"


class InvoiceItem(BaseModel):
    name: str
    quantity: int = Field(gt=0)
    unit_price: float = Field(ge=0)

    @property
    def total(self) -> float:
        return self.quantity * self.unit_price


class InvoiceInDB(BaseModel):
    id: str | None = Field(default=None, alias="_id")
    customer_name: str
    customer_email: str | None = None
    customer_phone: str | None = None
    currency: str = "XOF"
    items: list[InvoiceItem]
    status: InvoiceStatus = InvoiceStatus.pending
    payment_url: str | None = None
    paydunya_token: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def amount(self) -> float:
        return sum(item.total for item in self.items)
