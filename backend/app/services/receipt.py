"""Invoice rendering: receipt numbers, permanent links, HTML and PDF.

The generated document has to survive three very different readers: a browser,
a file saved on disk and opened offline, and an email client. So it carries no
external font, no CDN, no script and no remote image, it repeats the important
styles inline on the elements themselves (many email clients drop <style>), and
it uses tables wherever a client would otherwise break the layout.
"""

from datetime import datetime
from io import BytesIO
from html import escape
from pathlib import Path
from typing import Any

from pymongo import ReturnDocument
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..config import resolved_upload_directory, settings


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


def _local_logo_path(business_document: dict | None) -> Path | None:
    """Return a safe local upload path for embedding a business logo in a PDF."""
    if not business_document:
        return None
    image_url = business_document.get("image_url")
    if not isinstance(image_url, str) or not image_url.startswith("/uploads/"):
        return None
    filename = Path(image_url).name
    if filename != image_url.removeprefix("/uploads/"):
        return None
    candidate = resolved_upload_directory() / filename
    return candidate if candidate.is_file() else None


def render_invoice_pdf(
    invoice_document: dict,
    business_document: dict | None,
    invoice_permanent_url: str,
) -> bytes:
    """Create a polished, self-contained A4 PDF for a confirmed invoice."""
    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=_document_title(invoice_document),
        author=(business_document or {}).get("name") or settings.paydunya_store_name,
    )
    styles = getSampleStyleSheet()
    accent = colors.HexColor("#0f766e")
    ink = colors.HexColor("#111827")
    muted = colors.HexColor("#6b7280")
    pale = colors.HexColor("#f0fdfa")
    border = colors.HexColor("#d1d5db")

    title = ParagraphStyle(
        "InvoiceTitle", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22,
        leading=26, textColor=ink, spaceAfter=2,
    )
    label = ParagraphStyle(
        "InvoiceLabel", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8,
        leading=10, textColor=muted, uppercase=True,
    )
    normal = ParagraphStyle(
        "InvoiceNormal", parent=styles["Normal"], fontName="Helvetica", fontSize=9.5,
        leading=14, textColor=ink,
    )
    small = ParagraphStyle(
        "InvoiceSmall", parent=normal, fontSize=8.5, leading=11, textColor=muted,
    )
    number = ParagraphStyle(
        "InvoiceNumber", parent=normal, alignment=TA_RIGHT, fontName="Helvetica-Bold",
    )
    total = ParagraphStyle(
        "InvoiceTotal", parent=normal, alignment=TA_RIGHT, fontName="Helvetica-Bold",
        fontSize=18, leading=22, textColor=accent,
    )

    business_name = (business_document or {}).get("name") or settings.paydunya_store_name
    receipt_number = invoice_document.get("receipt_number") or "En attente de paiement"
    created = format_date(invoice_document.get("created_at")) or "-"
    paid = format_datetime(invoice_document.get("paid_at")) or "Paiement confirmé"
    currency = invoice_document.get("currency") or "XOF"
    status = "PAYÉE" if invoice_document.get("status") == PAID_STATUS else "EN ATTENTE"

    story: list[Any] = []
    logo = _local_logo_path(business_document)
    branding: list[Any] = []
    if logo:
        try:
            branding.append(Image(str(logo), width=15 * mm, height=15 * mm, kind="proportional"))
        except Exception:
            # A corrupt logo must never prevent a customer from getting paid.
            pass
    branding.append(
        Paragraph(
            f'<b>{escape(str(business_name))}</b><br/><font color="#6b7280">FACTURE CLIENT</font>',
            normal,
        )
    )
    left = Table([branding], colWidths=[17 * mm, 83 * mm]) if len(branding) == 2 else branding[0]
    right = [
        Paragraph("NUMÉRO", label),
        Paragraph(escape(str(receipt_number)), number),
        Paragraph(f"Émise le {escape(created)}", ParagraphStyle("Issue", parent=small, alignment=TA_RIGHT)),
    ]
    header = Table([[left, right]], colWidths=[104 * mm, 68 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.extend([header, Spacer(1, 8 * mm)])

    status_box = Table(
        [[
            Paragraph(status, ParagraphStyle("Status", parent=normal, fontName="Helvetica-Bold", textColor=accent)),
            Paragraph(f"Facture acquittée le {escape(paid)}", ParagraphStyle("PaidOn", parent=small, alignment=TA_RIGHT)),
        ]],
        colWidths=[45 * mm, 127 * mm],
    )
    status_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), pale),
        ("BOX", (0, 0), (-1, -1), 0.75, accent),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    story.extend([status_box, Spacer(1, 8 * mm)])

    customer_lines = [escape(str(invoice_document.get("customer_name") or "-"))]
    if invoice_document.get("customer_email"):
        customer_lines.append(escape(str(invoice_document["customer_email"])))
    if invoice_document.get("customer_phone"):
        customer_lines.append(escape(str(invoice_document["customer_phone"])))
    story.extend([
        Paragraph("FACTURÉ À", label),
        Paragraph("<br/>".join(customer_lines), normal),
        Spacer(1, 7 * mm),
    ])

    rows: list[list[Any]] = [[
        Paragraph("DÉSIGNATION", label), Paragraph("QTÉ", ParagraphStyle("QtyHead", parent=label, alignment=TA_RIGHT)),
        Paragraph("PRIX UNITAIRE", ParagraphStyle("PriceHead", parent=label, alignment=TA_RIGHT)),
        Paragraph("TOTAL", ParagraphStyle("TotalHead", parent=label, alignment=TA_RIGHT)),
    ]]
    for item in _items_of(invoice_document):
        quantity = int(item.get("quantity", 0) or 0)
        unit_price = float(item.get("unit_price", 0) or 0)
        rows.append([
            Paragraph(escape(str(item.get("name") or "Article")), normal),
            Paragraph(str(quantity), number),
            Paragraph(format_amount(unit_price, currency), number),
            Paragraph(format_amount(quantity * unit_price, currency), number),
        ])
    if len(rows) == 1:
        rows.append([Paragraph("Aucun article.", normal), "", "", ""])
    item_table = Table(rows, colWidths=[79 * mm, 18 * mm, 38 * mm, 37 * mm], repeatRows=1)
    item_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ink),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, border),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
    ]))
    story.extend([item_table, Spacer(1, 6 * mm)])

    amount = format_amount(invoice_amount(invoice_document), currency)
    amount_table = Table([[Paragraph("TOTAL PAYÉ", label), Paragraph(amount, total)]], colWidths=[86 * mm, 86 * mm])
    amount_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.extend([amount_table, Spacer(1, 8 * mm)])

    safe_link = escape(invoice_permanent_url, quote=True)
    link_text = escape(invoice_permanent_url)
    link_box = Table([[Paragraph(
        "<b>Lien permanent de votre facture</b><br/>"
        "Conservez ce lien pour retrouver et télécharger cette facture à tout moment.<br/>"
        f'<font color="#0f766e"><link href="{safe_link}">{link_text}</link></font>',
        ParagraphStyle("LinkBox", parent=small, textColor=ink, leading=13),
    )]], colWidths=[172 * mm])
    link_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
        ("BOX", (0, 0), (-1, -1), 0.75, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.extend([link_box, Spacer(1, 7 * mm)])
    story.append(Paragraph(
        f"Merci de votre confiance. Pour toute question, contactez {escape(str(business_name))} en indiquant le numéro de facture.",
        small,
    ))

    def add_page_number(canvas, _document) -> None:
        canvas.saveState()
        canvas.setStrokeColor(border)
        canvas.line(document.leftMargin, 12 * mm, A4[0] - document.rightMargin, 12 * mm)
        canvas.setFillColor(muted)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(document.leftMargin, 7 * mm, str(business_name))
        canvas.drawRightString(A4[0] - document.rightMargin, 7 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    document.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    return output.getvalue()


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
