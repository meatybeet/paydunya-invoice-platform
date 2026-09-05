from dataclasses import dataclass

import httpx

from ..config import settings
from ..models import InvoiceInDB


@dataclass
class PayDunyaPaymentLink:
    token: str
    url: str


class PayDunyaClient:
    def __init__(self) -> None:
        if settings.paydunya_mode == "live":
            self.base_url = "https://app.paydunya.com/api/v1"
        else:
            self.base_url = "https://app.paydunya.com/sandbox-api/v1"

    @property
    def headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "PAYDUNYA-MASTER-KEY": settings.paydunya_master_key,
            "PAYDUNYA-PRIVATE-KEY": settings.paydunya_private_key,
            "PAYDUNYA-TOKEN": settings.paydunya_token,
        }

    async def create_payment_link(self, invoice: InvoiceInDB) -> PayDunyaPaymentLink:
        payload = {
            "invoice": {
                "items": [
                    {
                        "name": item.name,
                        "quantity": item.quantity,
                        "unit_price": item.unit_price,
                        "total_price": item.total,
                        "description": item.name,
                    }
                    for item in invoice.items
                ],
                "total_amount": invoice.amount,
                "description": f"Invoice for {invoice.customer_name}",
            },
            "store": {
                "name": settings.paydunya_store_name,
            },
            "actions": {
                "callback_url": settings.paydunya_callback_url,
                "return_url": settings.paydunya_return_url,
                "cancel_url": settings.paydunya_cancel_url,
            },
        }

        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{self.base_url}/checkout-invoice/create",
                headers=self.headers,
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        if data.get("response_code") != "00":
            message = data.get("response_text", "PayDunya payment link failed")
            raise ValueError(message)

        return PayDunyaPaymentLink(
            token=data["token"],
            url=data["response_text"],
        )
