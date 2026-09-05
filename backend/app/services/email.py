"""Outgoing invoice mail, standard library only.

A payment has already succeeded by the time these helpers run, so nothing here
is ever allowed to raise: every failure is logged and reported as False.
"""

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from html import escape

from ..config import settings
from .receipt import format_amount, invoice_amount

logger = logging.getLogger(__name__)


def email_is_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def build_invoice_email_body(invoice_document: dict, invoice_permanent_url: str) -> str:
    """Short French HTML body announcing the invoice and its permanent link."""
    customer_name = escape(str(invoice_document.get("customer_name", "")))
    currency = invoice_document.get("currency") or "XOF"
    total = escape(format_amount(invoice_amount(invoice_document), currency))
    receipt_number = invoice_document.get("receipt_number")
    reference = (
        f'<p style="margin:0 0 12px;">Référence de votre facture : '
        f"<strong>{escape(str(receipt_number))}</strong>.</p>"
        if receipt_number
        else ""
    )
    safe_link = escape(invoice_permanent_url, quote=True)

    return f"""<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:24px;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.6;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:14px;">
    <tr>
      <td style="padding:26px;">
        <p style="margin:0 0 12px;font-size:17px;font-weight:bold;">Bonjour {customer_name},</p>
        <p style="margin:0 0 12px;">
          Nous vous remercions pour votre paiement de <strong>{total}</strong>.
          Votre facture est confirmée.
        </p>
        {reference}
        <p style="margin:0 0 12px;">
          Elle est jointe à ce message au format PDF : vous pouvez l'ouvrir,
          l'imprimer ou la conserver sur votre appareil.
        </p>
        <p style="margin:0 0 16px;">
          Vous pouvez également la retrouver à tout moment grâce à ce lien permanent :
        </p>
        <p style="margin:0 0 16px;word-break:break-all;">
          <a href="{safe_link}" style="color:#0f766e;text-decoration:underline;">{escape(invoice_permanent_url)}</a>
        </p>
        <p style="margin:0;color:#6b7280;font-size:13px;">
          Conservez ce lien précieusement, il reste valable.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _build_message(
    to_address: str,
    subject: str,
    html_body: str,
    attachment_pdf: bytes | None,
    attachment_filename: str | None,
) -> EmailMessage:
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to_address
    message["Subject"] = subject
    # Plain text alternative for clients that refuse HTML.
    message.set_content(
        "Votre facture PDF est jointe à ce message. Vous pouvez aussi utiliser "
        "le lien permanent qu'il contient."
    )
    message.add_alternative(html_body, subtype="html")
    if attachment_pdf and attachment_filename:
        message.add_attachment(
            attachment_pdf,
            maintype="application",
            subtype="pdf",
            filename=attachment_filename,
        )
    return message


def _send_message(message: EmailMessage) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
        if settings.smtp_starttls:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)


async def send_invoice_email(
    to_address: str,
    subject: str,
    html_body: str,
    attachment_pdf: bytes | None = None,
    attachment_filename: str | None = None,
) -> bool:
    """Send the invoice mail. Returns False instead of raising on any failure."""
    if not to_address:
        logger.warning("Invoice email skipped: no recipient address.")
        return False
    if not email_is_configured():
        logger.warning(
            "Invoice email skipped: SMTP_HOST or SMTP_FROM is not configured."
        )
        return False

    try:
        message = _build_message(
            to_address, subject, html_body, attachment_pdf, attachment_filename
        )
        await asyncio.to_thread(_send_message, message)
    except Exception as error:
        logger.warning("Invoice email to %s failed: %s", to_address, error)
        return False

    logger.info("Invoice email sent to %s.", to_address)
    return True
