from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

from .models import BusinessVisibility, InvoiceItem, InvoiceStatus, UserRole


class InvoiceCreate(BaseModel):
    customer_name: str = Field(min_length=2)
    # A paid invoice is automatically emailed to the payer, so a checkout
    # invoice must always carry a deliverable address.
    customer_email: EmailStr
    customer_phone: str | None = None
    currency: str = "XOF"
    business_id: str | None = None
    items: list[InvoiceItem]

    @model_validator(mode="after")
    def validate_minimum_checkout_amount(self) -> "InvoiceCreate":
        if sum(item.total for item in self.items) < 200:
            raise ValueError("PayDunya checkout invoices must total at least 200 FCFA")
        return self


class InvoiceStatusUpdate(BaseModel):
    status: InvoiceStatus


class InvoiceResponse(BaseModel):
    id: str
    customer_name: str
    customer_email: str | None = None
    customer_phone: str | None = None
    currency: str
    business_id: str | None = None
    items: list[InvoiceItem]
    amount: float
    status: InvoiceStatus
    payment_url: str | None = None
    public_token: str | None = None
    receipt_number: str | None = None
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Only set when an invoice was created but the payment link could not be
    # generated. Holds a French message meant to be shown to the operator.
    warning: str | None = None


class PaymentLinkItem(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)


class PaymentLinkRequest(BaseModel):
    """Payment link built from a selection of catalog products."""

    business_id: str
    customer_name: str = Field(min_length=2)
    customer_email: EmailStr
    customer_phone: str | None = None
    currency: str = "XOF"
    items: list[PaymentLinkItem] = Field(min_length=1)


class PublicInvoiceResponse(BaseModel):
    """Safe subset of an invoice, shown to a payer holding the public token.

    It must never expose the customer contact details, the PayDunya token or
    any internal identifier.
    """

    receipt_number: str | None = None
    customer_name: str
    currency: str
    items: list[InvoiceItem]
    amount: float
    status: InvoiceStatus
    created_at: datetime
    paid_at: datetime | None = None
    business_name: str | None = None
    business_image_url: str | None = None
    payment_url: str | None = None
    permanent_url: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=2, max_length=100)
    role: UserRole = UserRole.manager


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: UserRole
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class BusinessCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    visibility: BusinessVisibility = BusinessVisibility.private
    member_ids: list[str] = Field(default_factory=list)
    image_url: str | None = None


class BusinessUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    visibility: BusinessVisibility | None = None
    member_ids: list[str] | None = None
    image_url: str | None = None


class BusinessResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None = None
    visibility: BusinessVisibility
    owner_id: str
    member_ids: list[str]
    image_url: str | None = None
    created_at: datetime
    updated_at: datetime


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)


class CategoryResponse(BaseModel):
    id: str
    business_id: str
    name: str


class ProductCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    category_id: str | None = None
    price: float = Field(ge=0)
    quantity: int | None = Field(default=None, ge=0)
    image_url: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    category_id: str | None = None
    price: float | None = Field(default=None, ge=0)
    quantity: int | None = Field(default=None, ge=0)
    image_url: str | None = None


class ProductResponse(BaseModel):
    id: str
    business_id: str
    name: str
    description: str | None = None
    category_id: str | None = None
    price: float
    quantity: int | None = None
    image_url: str | None = None
    created_at: datetime
    updated_at: datetime
