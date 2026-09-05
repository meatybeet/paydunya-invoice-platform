const API_URL = "http://localhost:8000/api";

const form = document.querySelector("#invoice-form");
const list = document.querySelector("#invoice-list");
const refreshButton = document.querySelector("#refresh-button");

function money(value, currency = "XOF") {
  return new Intl.NumberFormat("fr-SN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function renderInvoices(invoices) {
  if (!invoices.length) {
    list.innerHTML = '<p class="muted">No invoices yet.</p>';
    return;
  }

  list.innerHTML = invoices
    .map(
      (invoice) => `
        <article class="invoice-card">
          <header>
            <strong>${invoice.customer_name}</strong>
            <span class="status">${invoice.status}</span>
          </header>
          <p class="muted">${invoice.customer_email || "No email"} · ${
        invoice.customer_phone || "No phone"
      }</p>
          <p><strong>${money(invoice.amount, invoice.currency)}</strong></p>
          ${
            invoice.payment_url
              ? `<a href="${invoice.payment_url}" target="_blank" rel="noreferrer">Open payment link</a>`
              : `<button data-payment="${invoice.id}" type="button">Generate payment link</button>`
          }
        </article>
      `,
    )
    .join("");
}

async function loadInvoices() {
  const response = await fetch(`${API_URL}/invoices`);
  const invoices = await response.json();
  renderInvoices(invoices);
}

async function createInvoice(event) {
  event.preventDefault();

  const payload = {
    customer_name: document.querySelector("#customer-name").value,
    customer_email: document.querySelector("#customer-email").value || null,
    customer_phone: document.querySelector("#customer-phone").value || null,
    currency: "XOF",
    items: [
      {
        name: document.querySelector("#item-name").value,
        quantity: Number(document.querySelector("#item-quantity").value),
        unit_price: Number(document.querySelector("#item-price").value),
      },
    ],
  };

  const response = await fetch(`${API_URL}/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    alert("Invoice creation failed");
    return;
  }

  form.reset();
  document.querySelector("#item-quantity").value = 1;
  document.querySelector("#item-price").value = 1000;
  await loadInvoices();
}

async function generatePaymentLink(invoiceId) {
  const response = await fetch(`${API_URL}/invoices/${invoiceId}/payment-link`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    alert(error.detail || "Payment link creation failed");
    return;
  }

  await loadInvoices();
}

form.addEventListener("submit", createInvoice);
refreshButton.addEventListener("click", loadInvoices);
list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-payment]");
  if (button) {
    generatePaymentLink(button.dataset.payment);
  }
});

loadInvoices().catch(() => {
  list.innerHTML = '<p class="muted">Start the backend, then refresh.</p>';
});
