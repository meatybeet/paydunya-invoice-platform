"""Invoice rendering: receipt numbers, permanent links and standalone HTML.

The generated document has to survive three very different readers: a browser,
a file saved on disk and opened offline, and an email client. So it carries no
external font, no CDN, no script and no remote image, it repeats the important
styles inline on the elements themselves (many email clients drop <style>), and
it uses tables wherever a client would otherwise break the layout.
"""

from datetime import datetime
from html import escape
from typing import Any

from pymongo import ReturnDocument

from ..config import settings


PAID_STATUS = "paid"


async def next_receipt_number(database: Any) -> str:
    """Return the next receipt number, atomically, as FAC-<year>-<counter>."""
    counter = await database.counters.find_one_and_update(
        {"_id": "receipt"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    value = int(counter.get("value", 1))
    return f"FAC-{datetime.utcnow().year}-{value:06d}"


def permanent_url(public_token: str) -> str:
    """Public page where the customer can find this invoice again at any time."""
    return f"{settings.frontend_url.rstrip('/')}/facture.html?token={public_token}"


def currency_label(currency: str | None) -> str:
    code = (currency or "XOF").upper()
    return "FCFA" if code in {"XOF", "FCFA", "CFA"} else code


def format_amount(value: float, currency: str | None = "XOF") -> str:
    """Money as read in Senegal: no decimals, a space every three digits."""
    rounded = int(round(value or 0))
    grouped = f"{rounded:,}".replace(",", " ")
    return f"{grouped} {currency_label(currency)}"


def format_datetime(value: datetime | None) -> str:
    if not isinstance(value, datetime):
        return ""
    return f"{value.day:02d}/{value.month:02d}/{value.year} à {value.hour:02d}:{value.minute:02d}"


def format_date(value: datetime | None) -> str:
    if not isinstance(value, datetime):
        return ""
    return f"{value.day:02d}/{value.month:02d}/{value.year}"


def _items_of(invoice_document: dict) -> list[dict]:
    items = invoice_document.get("items") or []
    return [item for item in items if isinstance(item, dict)]


def invoice_amount(invoice_document: dict) -> float:
    return sum(
        float(item.get("quantity", 0)) * float(item.get("unit_price", 0))
        for item in _items_of(invoice_document)
    )


def _remote_image(business_document: dict | None) -> str | None:
    """Resolve a trusted uploaded logo to an absolute URL for email clients."""
    if not business_document:
        return None
    image_url = business_document.get("image_url")
    if isinstance(image_url, str) and image_url.startswith(("http://", "https://")):
        return image_url
    if isinstance(image_url, str) and image_url.startswith("/uploads/"):
        return f"{settings.frontend_url.rstrip('/')}{image_url}"
    return None


def _document_title(invoice_document: dict) -> str:
    reference = invoice_document.get("receipt_number") or ""
    return f"Facture {reference}".strip()


def render_invoice_html(
    invoice_document: dict,
    business_document: dict | None,
    invoice_permanent_url: str,
) -> str:
    """Build the complete standalone HTML invoice sent to the customer."""
    currency = invoice_document.get("currency") or "XOF"
    is_paid = invoice_document.get("status") == PAID_STATUS
    receipt_number = invoice_document.get("receipt_number") or "En attente de paiement"
    business_name = (business_document or {}).get("name") or settings.paydunya_store_name
    logo_url = _remote_image(business_document)

    accent = "#0f766e" if is_paid else "#b45309"
    status_background = "#ecfdf5" if is_paid else "#fffbeb"
    status_label = "PAYÉE" if is_paid else "EN ATTENTE"
    if is_paid:
        paid_on = format_datetime(invoice_document.get("paid_at"))
        status_detail = f"Facture acquittée le {paid_on}" if paid_on else "Facture acquittée"
    else:
        status_detail = "Le paiement de cette facture n'a pas encore été confirmé."

    logo_html = ""
    if logo_url:
        logo_html = (
            f'<img src="{escape(logo_url, quote=True)}" alt="{escape(business_name)}" '
            'width="64" height="64" style="display:block;width:64px;height:64px;'
            'border-radius:12px;object-fit:cover;border:1px solid #e5e7eb;margin-bottom:10px;">'
        )

    rows: list[str] = []
    for index, item in enumerate(_items_of(invoice_document)):
        quantity = int(item.get("quantity", 0) or 0)
        unit_price = float(item.get("unit_price", 0) or 0)
        line_total = quantity * unit_price
        stripe = "#ffffff" if index % 2 == 0 else "#f9fafb"
        rows.append(
            f'<tr style="background-color:{stripe};">'
            f'<td class="cell" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">'
            f"{escape(str(item.get('name', '')))}</td>"
            f'<td class="cell num" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;'
            f'text-align:center;color:#374151;">{quantity}</td>'
            f'<td class="cell num" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;'
            f'text-align:right;color:#374151;white-space:nowrap;">{escape(format_amount(unit_price, currency))}</td>'
            f'<td class="cell num" style="padding:10px 12px;border-bottom:1px solid #e5e7eb;'
            f'text-align:right;color:#111827;font-weight:bold;white-space:nowrap;">'
            f"{escape(format_amount(line_total, currency))}</td>"
            "</tr>"
        )
    if not rows:
        rows.append(
            '<tr><td class="cell" colspan="4" style="padding:14px 12px;color:#6b7280;'
            'text-align:center;">Aucun article.</td></tr>'
        )

    customer_lines = [
        f'<div style="font-size:15px;font-weight:bold;color:#111827;">'
        f"{escape(str(invoice_document.get('customer_name', '')))}</div>"
    ]
    if invoice_document.get("customer_email"):
        customer_lines.append(
            f'<div style="font-size:13px;color:#4b5563;margin-top:2px;">'
            f"{escape(str(invoice_document['customer_email']))}</div>"
        )
    if invoice_document.get("customer_phone"):
        customer_lines.append(
            f'<div style="font-size:13px;color:#4b5563;margin-top:2px;">'
            f"{escape(str(invoice_document['customer_phone']))}</div>"
        )

    total_text = escape(format_amount(invoice_amount(invoice_document), currency))
    created_text = escape(format_date(invoice_document.get("created_at")))
    safe_link = escape(invoice_permanent_url, quote=True)

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(_document_title(invoice_document))}</title>
<style>
  body {{
    margin: 0;
    padding: 24px 12px;
    background-color: #f3f4f6;
    color: #111827;
    font-family: Arial, Helvetica, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-text-size-adjust: 100%;
  }}
  table {{ border-collapse: collapse; }}
  .sheet {{
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    background-color: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
  }}
  .pad {{ padding: 28px; }}
  .muted {{ color: #6b7280; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; }}
  .head-cell {{
    padding: 10px 12px;
    background-color: #111827;
    color: #ffffff;
    font-size: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    text-align: left;
  }}
  .link-box {{ word-break: break-all; }}
  @media only screen and (max-width: 520px) {{
    .pad {{ padding: 18px; }}
    .stack {{ display: block !important; width: 100% !important; text-align: left !important; }}
  }}
  @media print {{
    body {{ background-color: #ffffff; padding: 0; font-size: 12px; }}
    .sheet {{ border: none; border-radius: 0; max-width: none; }}
    .pad {{ padding: 0; }}
    .no-print {{ display: none !important; }}
    tr, td, table {{ page-break-inside: avoid; }}
  }}
</style>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f3f4f6;color:#111827;font-family:Arial,Helvetica,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;">
<table class="sheet" role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:720px;margin:0 auto;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:14px;">
  <tr>
    <td class="pad" style="padding:28px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td class="stack" valign="top" style="vertical-align:top;">
            {logo_html}
            <div style="font-size:20px;font-weight:bold;color:#111827;">{escape(business_name)}</div>
            <div class="muted" style="color:#6b7280;font-size:12px;">Facture client</div>
          </td>
          <td class="stack" valign="top" align="right" style="vertical-align:top;text-align:right;">
            <div class="muted" style="color:#6b7280;font-size:12px;">Numéro</div>
            <div style="font-size:16px;font-weight:bold;color:#111827;">{escape(str(receipt_number))}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:6px;">Émise le {created_text}</div>
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;">
        <tr>
          <td style="padding:14px 16px;background-color:{status_background};border:1px solid {accent};border-radius:10px;">
            <div style="font-size:18px;font-weight:bold;color:{accent};letter-spacing:0.08em;">{status_label}</div>
            <div style="font-size:13px;color:#374151;margin-top:2px;">{escape(status_detail)}</div>
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:22px;">
        <tr>
          <td>
            <div class="muted" style="color:#6b7280;font-size:12px;margin-bottom:6px;">Facturé à</div>
            {''.join(customer_lines)}
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:22px;border:1px solid #e5e7eb;border-radius:10px;">
        <tr>
          <th class="head-cell" style="padding:10px 12px;background-color:#111827;color:#ffffff;font-size:12px;text-transform:uppercase;text-align:left;">Désignation</th>
          <th class="head-cell" style="padding:10px 12px;background-color:#111827;color:#ffffff;font-size:12px;text-transform:uppercase;text-align:center;">Quantité</th>
          <th class="head-cell" style="padding:10px 12px;background-color:#111827;color:#ffffff;font-size:12px;text-transform:uppercase;text-align:right;">Prix unitaire</th>
          <th class="head-cell" style="padding:10px 12px;background-color:#111827;color:#ffffff;font-size:12px;text-transform:uppercase;text-align:right;">Total</th>
        </tr>
        {''.join(rows)}
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px;">
        <tr>
          <td align="right" style="text-align:right;">
            <div class="muted" style="color:#6b7280;font-size:12px;">Total à payer</div>
            <div style="font-size:28px;font-weight:bold;color:{accent};white-space:nowrap;">{total_text}</div>
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;">
        <tr>
          <td style="padding:16px;background-color:#f9fafb;border:1px dashed #9ca3af;border-radius:10px;">
            <div style="font-size:13px;font-weight:bold;color:#111827;">Lien permanent de votre facture</div>
            <div style="font-size:13px;color:#374151;margin-top:4px;">
              Conservez ce lien : il vous permet de retrouver cette facture à tout moment,
              de la revoir, de l'imprimer ou de la télécharger à nouveau.
            </div>
            <div class="link-box" style="margin-top:8px;font-size:13px;color:#0f766e;word-break:break-all;">
              <a href="{safe_link}" style="color:#0f766e;text-decoration:underline;">{escape(invoice_permanent_url)}</a>
            </div>
          </td>
        </tr>
      </table>

      <div style="margin-top:22px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
        Merci de votre confiance. Pour toute question concernant cette facture,
        contactez {escape(business_name)} en indiquant le numéro ci-dessus.
      </div>

    </td>
  </tr>
</table>
</body>
</html>
"""
