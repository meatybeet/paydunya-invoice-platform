// Invoice list and creation flow (#/factures).
// Owns: the toolbar (search + status segments), the responsive list (table from
// lg up, stacked cards below) and the multi-item "Nouvelle facture" builder.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;
  var el = ui.el;
  var icon = ui.icon;

  var MIN_AMOUNT = App.config.MIN_INVOICE_AMOUNT;
  var CURRENCY = App.config.DEFAULT_CURRENCY;

  // Rows rendered before the "show more" button appears. Keeps the DOM bounded
  // when an account has hundreds of invoices.
  var PAGE_SIZE = 25;

  var STATUS_FILTERS = [
    { key: 'all', label: 'Toutes' },
    { key: 'pending', label: 'En attente' },
    { key: 'paid', label: 'Payées' },
    { key: 'canceled', label: 'Annulées' },
  ];

  // Combining diacritical marks, used to fold accents out of search terms.
  var DIACRITICS = /[\u0300-\u036f]/g;

  var seq = 0;
  function uid(prefix) {
    seq += 1;
    return prefix + '-' + seq;
  }

  /**
   * Show / hide a node. Tailwind's `.flex` utility wins over the `[hidden]`
   * base rule, so flex containers must be toggled with the `hidden` class.
   */
  function setHidden(node, isHidden) {
    node.classList.toggle('hidden', Boolean(isHidden));
  }

  // ---------------------------------------------------------------------------
  // Small pure helpers
  // ---------------------------------------------------------------------------

  /** Lowercase and strip accents so "ndiaye" matches "Ndiayé". */
  function fold(value) {
    var text = String(value === null || value === undefined ? '' : value).toLowerCase();
    if (typeof text.normalize === 'function') {
      text = text.normalize('NFD').replace(DIACRITICS, '');
    }
    return text;
  }

  function toNumber(value) {
    var raw = String(value === null || value === undefined ? '' : value).trim().replace(',', '.');
    if (!raw) return NaN;
    var parsed = Number(raw);
    return isFinite(parsed) ? parsed : NaN;
  }

  function lineTotal(item) {
    var quantity = toNumber(item.quantity);
    var price = toNumber(item.unit_price);
    if (!isFinite(quantity) || !isFinite(price)) return 0;
    return Math.max(0, quantity) * Math.max(0, price);
  }

  function itemsTotal(items) {
    return items.reduce(function (sum, item) {
      return sum + lineTotal(item);
    }, 0);
  }

  function invoiceTime(invoice) {
    var time = new Date(invoice && invoice.created_at).getTime();
    return isNaN(time) ? 0 : time;
  }

  function sortInvoices(list) {
    return list.slice().sort(function (a, b) {
      return invoiceTime(b) - invoiceTime(a);
    });
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim());
  }

  function isValidPhone(value) {
    var text = String(value).trim();
    var digits = text.replace(/[^\d]/g, '');
    return /^[\d\s+().-]+$/.test(text) && digits.length >= 6 && digits.length <= 15;
  }

  /**
   * A payment link is only worth asking PayDunya for while the invoice is still
   * awaiting payment; paid and canceled invoices keep the link they already have.
   */
  function canGenerateLink(invoice) {
    return invoice.status === 'pending' && !invoice.payment_url;
  }

  // ---------------------------------------------------------------------------
  // Row actions, shared by the desktop table and the mobile cards
  // ---------------------------------------------------------------------------

  /**
   * @param {object} invoice
   * @param {boolean} compact   true inside the desktop table (small controls)
   * @param {function} onUpdate receives the refreshed invoice after a link is created
   */
  function buildActions(invoice, compact, onUpdate) {
    var nodes = [];
    var name = invoice.customer_name || 'ce client';

    nodes.push(
      el('a', {
        href: App.router.paths.invoice(invoice.id),
        class: compact ? cls.btnSecondarySm : cls.btnSecondary + ' flex-1',
        html: icon('eye', 'w-4 h-4') + 'Ouvrir',
        'aria-label': 'Ouvrir la facture de ' + name,
      })
    );

    if (invoice.payment_url) {
      nodes.push(
        el('button', {
          type: 'button',
          class: compact ? cls.btnGhostSm : cls.btnSecondary + ' flex-1',
          title: 'Copier le lien de paiement',
          'aria-label': 'Copier le lien de paiement de ' + name,
          html: icon('copy', 'w-4 h-4') + (compact ? '' : 'Copier le lien'),
          onclick: function () {
            ui.copyToClipboard(invoice.payment_url, 'Lien de paiement copié.');
          },
        })
      );
      if (compact) {
        // On mobile the link is shared, not opened, so this stays desktop-only.
        nodes.push(
          el('a', {
            href: invoice.payment_url,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: cls.btnGhostSm,
            title: 'Ouvrir la page de paiement',
            'aria-label': 'Ouvrir la page de paiement de ' + name,
            html: icon('external', 'w-4 h-4'),
          })
        );
      }
    } else if (canGenerateLink(invoice)) {
      var generate = el('button', {
        type: 'button',
        class: compact ? cls.btnPrimarySm : cls.btnPrimary + ' flex-1',
        html: icon('link', 'w-4 h-4') + 'Générer le lien',
        'aria-label': 'Générer le lien de paiement de ' + name,
        onclick: function () {
          ui.setBusy(generate, true, 'Génération…');
          App.api.createPaymentLink(invoice.id).then(
            function (updated) {
              ui.toast({
                message: 'Lien de paiement généré. Vous pouvez le partager avec votre client.',
                type: 'success',
              });
              onUpdate(updated || invoice);
            },
            function (error) {
              ui.setBusy(generate, false);
              ui.toastError(error);
            }
          );
        },
      });
      nodes.push(generate);
    } else {
      nodes.push(
        el('span', {
          class: cls.mutedSm + ' whitespace-nowrap',
          text: invoice.status === 'canceled' ? 'Facture annulée' : 'Aucun lien',
        })
      );
    }

    return nodes;
  }

  function contactLines(invoice, compact) {
    var wrap = el('div', { class: 'space-y-1 min-w-0' });
    var rowClass =
      'flex items-center gap-1.5 min-w-0 ' + (compact ? 'text-xs ' : 'text-sm ') + cls.muted;
    var iconClass = 'w-3.5 h-3.5 shrink-0 text-stone-400 dark:text-stone-500';

    if (invoice.customer_email) {
      wrap.appendChild(
        el('span', { class: rowClass }, [
          ui.fromHTML(icon('mail', iconClass)),
          el('span', { class: 'truncate', text: invoice.customer_email }),
        ])
      );
    }
    if (invoice.customer_phone) {
      wrap.appendChild(
        el('span', { class: rowClass }, [
          ui.fromHTML(icon('phone', iconClass)),
          el('span', { class: 'truncate', text: invoice.customer_phone }),
        ])
      );
    }
    if (!wrap.childNodes.length) {
      wrap.appendChild(el('span', { class: cls.mutedSm, text: 'Aucun contact renseigné' }));
    }
    return wrap;
  }

  // ---------------------------------------------------------------------------
  // List renderers
  // ---------------------------------------------------------------------------

  function buildTable(rows, onUpdate) {
    var head = el('thead', { class: cls.thead }, [
      el('tr', {}, [
        el('th', { class: cls.th, scope: 'col', text: 'Client' }),
        el('th', { class: cls.th, scope: 'col', text: 'Contact' }),
        el('th', { class: cls.th + ' text-right', scope: 'col', text: 'Montant' }),
        el('th', { class: cls.th, scope: 'col', text: 'Statut' }),
        el('th', { class: cls.th, scope: 'col', text: 'Date' }),
        el('th', { class: cls.th + ' text-right', scope: 'col' }, [
          el('span', { class: 'sr-only', text: 'Actions' }),
        ]),
      ]),
    ]);

    var body = el('tbody');
    rows.forEach(function (invoice) {
      var itemCount = Array.isArray(invoice.items) ? invoice.items.length : 0;

      body.appendChild(
        el('tr', { class: cls.tr }, [
          el('td', { class: cls.td + ' max-w-[15rem]' }, [
            el('p', {
              class: 'font-bold text-stone-900 dark:text-stone-100 truncate',
              text: invoice.customer_name || 'Client sans nom',
              title: invoice.customer_name || '',
            }),
            el('p', {
              class: cls.mutedSm + ' mt-0.5',
              text: itemCount ? ui.plural(itemCount, 'article') : 'Aucun article',
            }),
          ]),
          el('td', { class: cls.td + ' max-w-[14rem]' }, [contactLines(invoice, true)]),
          el('td', { class: cls.td + ' text-right whitespace-nowrap' }, [
            el('span', {
              class: 'font-bold text-stone-900 dark:text-stone-100 tabular-nums',
              text: ui.money(invoice.amount, invoice.currency),
            }),
          ]),
          el('td', { class: cls.td, html: ui.statusBadge(invoice.status) }),
          el('td', { class: cls.td + ' whitespace-nowrap' }, [
            el('span', {
              class: 'text-xs ' + cls.muted,
              text: ui.dateTime(invoice.created_at),
              title: ui.timeAgo(invoice.created_at),
            }),
          ]),
          el('td', { class: cls.td }, [
            el(
              'div',
              { class: 'flex items-center justify-end gap-1 whitespace-nowrap' },
              buildActions(invoice, true, onUpdate)
            ),
          ]),
        ])
      );
    });

    // Hidden below lg: the fixed 256px sidebar leaves too little room for six
    // columns at tablet widths, so the card list takes over there.
    return el('div', { class: cls.tableWrap + ' hidden lg:block' }, [
      el('table', { class: cls.table }, [
        el('caption', { class: 'sr-only', text: 'Liste des factures' }),
        head,
        body,
      ]),
    ]);
  }

  function buildCards(rows, onUpdate) {
    var wrap = el('div', { class: 'space-y-3 lg:hidden' });

    rows.forEach(function (invoice) {
      var itemCount = Array.isArray(invoice.items) ? invoice.items.length : 0;

      wrap.appendChild(
        el('article', { class: cls.card + ' p-4 sm:p-5 space-y-3.5' }, [
          el('div', { class: 'flex items-start justify-between gap-3' }, [
            el('div', { class: 'min-w-0' }, [
              el('h3', {
                class:
                  'text-base font-bold text-stone-900 dark:text-stone-100 ' + cls.breakAnywhere,
                text: invoice.customer_name || 'Client sans nom',
              }),
              el('p', {
                class: cls.mutedSm + ' mt-0.5',
                text:
                  (itemCount ? ui.plural(itemCount, 'article') : 'Aucun article') +
                  ' · ' +
                  ui.dateTime(invoice.created_at),
              }),
            ]),
            el('span', { class: 'shrink-0', html: ui.statusBadge(invoice.status) }),
          ]),

          contactLines(invoice, false),

          el(
            'div',
            { class: cls.surface + ' px-3.5 py-3 flex items-baseline justify-between gap-3' },
            [
              el('span', { class: cls.eyebrow, text: 'Montant' }),
              el('span', {
                class:
                  'text-lg font-extrabold tracking-tight text-stone-900 dark:text-stone-50 tabular-nums',
                text: ui.money(invoice.amount, invoice.currency),
              }),
            ]
          ),

          el(
            'div',
            { class: 'flex flex-wrap items-center gap-2' },
            buildActions(invoice, false, onUpdate)
          ),
        ])
      );
    });

    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Create-invoice builder
  // ---------------------------------------------------------------------------

  function newItem() {
    return { key: uid('item'), name: '', quantity: 1, unit_price: '', product_id: null, refs: null };
  }

  function openCreateModal(onCreated) {
    var state = {
      businesses: [],
      businessId: '',
      products: [],
      productsState: 'idle', // idle | loading | ready | error
      items: [newItem()],
      showErrors: false,
      submitting: false,
    };

    var form = el('form', { class: 'space-y-6', novalidate: true });

    // --- Customer block -----------------------------------------------------
    var nameId = uid('client');
    var emailId = uid('email');
    var phoneId = uid('tel');

    var nameInput = el('input', {
      id: nameId,
      class: cls.input,
      type: 'text',
      name: 'customer_name',
      autocomplete: 'name',
      required: true,
      placeholder: 'Ex. Awa Diallo',
      'aria-describedby': nameId + '-error',
    });
    var nameError = el('p', { id: nameId + '-error', class: cls.errorText, hidden: true });

    var emailInput = el('input', {
      id: emailId,
      class: cls.input,
      type: 'email',
      name: 'customer_email',
      autocomplete: 'email',
      inputmode: 'email',
      required: true,
      placeholder: 'client@exemple.sn',
      'aria-describedby': emailId + '-error',
    });
    var emailError = el('p', { id: emailId + '-error', class: cls.errorText, hidden: true });

    var phoneInput = el('input', {
      id: phoneId,
      class: cls.input,
      type: 'tel',
      name: 'customer_phone',
      autocomplete: 'tel',
      inputmode: 'tel',
      placeholder: '+221 77 000 00 00',
      'aria-describedby': phoneId + '-error',
    });
    var phoneError = el('p', { id: phoneId + '-error', class: cls.errorText, hidden: true });

    var customerSection = el('fieldset', { class: 'space-y-4 min-w-0' }, [
      el('legend', { class: cls.eyebrow + ' mb-1', text: 'Client' }),
      el('div', { class: cls.formGrid }, [
        el('div', { class: cls.field + ' sm:col-span-2' }, [
          el('label', { class: cls.label, for: nameId }, [
            'Nom du client',
            el('span', { class: cls.labelRequired, text: '*', 'aria-hidden': 'true' }),
          ]),
          nameInput,
          nameError,
        ]),
        el('div', { class: cls.field }, [
          el('label', { class: cls.label, for: emailId }, [
            'E-mail du client',
            el('span', { class: cls.labelRequired, text: '*', 'aria-hidden': 'true' }),
          ]),
          emailInput,
          emailError,
        ]),
        el('div', { class: cls.field }, [
          el('label', { class: cls.label, for: phoneId, text: 'Téléphone (facultatif)' }),
          phoneInput,
          phoneError,
        ]),
      ]),
    ]);

    // --- Business selector --------------------------------------------------
    var businessFieldId = uid('entreprise');
    var businessSelect = el('select', {
      id: businessFieldId,
      class: cls.select,
      name: 'business_id',
      disabled: true,
      'aria-describedby': businessFieldId + '-hint',
    });
    businessSelect.appendChild(el('option', { value: '', text: 'Chargement des entreprises…' }));

    var businessHint = el('p', {
      id: businessFieldId + '-hint',
      class: cls.hint,
      text: 'Rattachez la facture à une entreprise pour choisir ses produits dans le catalogue.',
    });

    var businessSection = el('div', { class: cls.field }, [
      el('label', { class: cls.label, for: businessFieldId, text: 'Entreprise (facultatif)' }),
      businessSelect,
      businessHint,
    ]);

    // --- Items --------------------------------------------------------------
    var itemsWrap = el('div', { class: 'space-y-3' });

    var addButton = el('button', {
      type: 'button',
      class: cls.btnSecondarySm,
      html: icon('plus', 'w-4 h-4') + 'Ajouter un article',
      onclick: function () {
        state.items.push(newItem());
        renderItems(state.items.length - 1);
      },
    });

    var totalValue = el('span', {
      class: 'text-2xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 tabular-nums',
      text: ui.money(0, CURRENCY),
    });

    var minimumAlert = el('div', { class: cls.alertWarning + ' mt-3 hidden', role: 'status' });

    var totalBox = el('div', { class: cls.surface + ' px-4 py-3.5' }, [
      el('div', { class: 'flex flex-wrap items-baseline justify-between gap-2' }, [
        el('span', { class: cls.eyebrow, text: 'Total de la facture' }),
        totalValue,
      ]),
      minimumAlert,
    ]);

    var itemsSection = el('section', { class: 'space-y-3 min-w-0' }, [
      el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
        el('h3', { class: cls.eyebrow, text: 'Articles' }),
        addButton,
      ]),
      itemsWrap,
      totalBox,
    ]);

    // --- Footer -------------------------------------------------------------
    var cancelButton = el('button', {
      type: 'button',
      class: cls.btnSecondary + ' w-full sm:w-auto',
      text: 'Annuler',
    });
    var submitButton = el('button', {
      type: 'submit',
      class: cls.btnPrimary + ' w-full sm:w-auto',
      html: icon('check', 'w-4 h-4') + 'Créer la facture',
    });

    form.appendChild(customerSection);
    form.appendChild(el('div', { class: cls.divider }));
    form.appendChild(businessSection);
    form.appendChild(el('div', { class: cls.divider }));
    form.appendChild(itemsSection);
    form.appendChild(el('div', { class: cls.formActions }, [cancelButton, submitButton]));

    var handle = ui.modal({
      title: 'Nouvelle facture',
      subtitle: 'Renseignez le client, puis ajoutez les articles à facturer.',
      size: 'xl',
      body: form,
    });

    cancelButton.addEventListener('click', function () {
      handle.close(null);
    });

    // --- Field error helpers -----------------------------------------------
    function clearFieldError(input, errorNode) {
      input.className = cls.input;
      input.removeAttribute('aria-invalid');
      errorNode.hidden = true;
      errorNode.textContent = '';
    }

    function setFieldError(input, errorNode, message) {
      input.className = cls.inputInvalid;
      input.setAttribute('aria-invalid', 'true');
      errorNode.textContent = message;
      errorNode.hidden = false;
    }

    // --- Item rows ----------------------------------------------------------
    function buildProductField(item) {
      var selectId = uid('produit');
      var select = el('select', { id: selectId, class: cls.select });
      select.appendChild(el('option', { value: '', text: '— Saisie libre —' }));
      state.products.forEach(function (product) {
        select.appendChild(
          el('option', {
            value: product.id,
            text: product.name + ' — ' + ui.money(product.price, CURRENCY),
          })
        );
      });
      select.value = item.product_id || '';

      select.addEventListener('change', function () {
        var chosen = null;
        state.products.forEach(function (product) {
          if (String(product.id) === select.value) chosen = product;
        });
        if (chosen) {
          item.product_id = chosen.id;
          item.name = chosen.name;
          item.unit_price = chosen.price;
        } else {
          item.product_id = null;
        }
        renderItems();
      });

      return el('div', { class: cls.field }, [
        el('label', { class: cls.label, for: selectId, text: 'Produit du catalogue' }),
        select,
      ]);
    }

    function itemRow(item, index) {
      var designationId = uid('designation');
      var quantityId = uid('quantite');
      var priceId = uid('prix');

      var designation = el('input', {
        id: designationId,
        class: cls.input,
        type: 'text',
        value: item.name,
        placeholder: 'Ex. Prestation de service',
        'aria-describedby': designationId + '-error',
      });
      var designationError = el('p', {
        id: designationId + '-error',
        class: cls.errorText,
        hidden: true,
      });

      var quantity = el('input', {
        id: quantityId,
        class: cls.input,
        type: 'number',
        min: '1',
        step: '1',
        inputmode: 'numeric',
        value: item.quantity,
        'aria-describedby': quantityId + '-error',
      });
      var quantityError = el('p', { id: quantityId + '-error', class: cls.errorText, hidden: true });

      var price = el('input', {
        id: priceId,
        class: cls.input,
        type: 'number',
        min: '0',
        step: '1',
        inputmode: 'numeric',
        value: item.unit_price,
        placeholder: '0',
        'aria-describedby': priceId + '-error',
      });
      var priceError = el('p', { id: priceId + '-error', class: cls.errorText, hidden: true });

      var rowTotal = el('span', {
        class: 'text-sm font-bold text-stone-900 dark:text-stone-100 tabular-nums',
        text: ui.money(lineTotal(item), CURRENCY),
      });

      designation.addEventListener('input', function () {
        item.name = designation.value;
        clearFieldError(designation, designationError);
      });
      quantity.addEventListener('input', function () {
        item.quantity = quantity.value;
        clearFieldError(quantity, quantityError);
        updateTotals();
      });
      price.addEventListener('input', function () {
        item.unit_price = price.value;
        clearFieldError(price, priceError);
        updateTotals();
      });

      item.refs = {
        designation: designation,
        designationError: designationError,
        quantity: quantity,
        quantityError: quantityError,
        price: price,
        priceError: priceError,
        rowTotal: rowTotal,
      };

      var removeButton = el('button', {
        type: 'button',
        class: cls.btnIconDanger,
        title:
          state.items.length < 2
            ? 'Une facture doit contenir au moins un article'
            : 'Supprimer cet article',
        'aria-label': 'Supprimer l’article ' + (index + 1),
        html: icon('trash', 'w-4 h-4'),
        onclick: function () {
          state.items.splice(index, 1);
          if (!state.items.length) state.items.push(newItem());
          renderItems(Math.max(0, index - 1));
        },
      });
      if (state.items.length < 2) removeButton.disabled = true;

      var grid = el('div', {
        class: 'grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3',
      });
      grid.appendChild(
        el('div', { class: cls.field + ' col-span-2 sm:col-span-1' }, [
          el('label', { class: cls.label, for: designationId }, [
            'Désignation',
            el('span', { class: cls.labelRequired, text: '*', 'aria-hidden': 'true' }),
          ]),
          designation,
          designationError,
        ])
      );
      grid.appendChild(
        el('div', { class: cls.field }, [
          el('label', { class: cls.label, for: quantityId, text: 'Quantité' }),
          quantity,
          quantityError,
        ])
      );
      grid.appendChild(
        el('div', { class: cls.field }, [
          el('label', { class: cls.label, for: priceId, text: 'Prix unitaire' }),
          price,
          priceError,
        ])
      );

      return el('div', { class: cls.surface + ' p-3.5 sm:p-4 space-y-3' }, [
        el('div', { class: 'flex items-center justify-between gap-2' }, [
          el('span', { class: cls.eyebrow, text: 'Article ' + (index + 1) }),
          removeButton,
        ]),
        state.productsState === 'ready' && state.products.length ? buildProductField(item) : null,
        grid,
        el('div', { class: 'flex items-baseline justify-between gap-2 pt-1' }, [
          el('span', { class: cls.mutedSm, text: 'Total de la ligne' }),
          rowTotal,
        ]),
      ]);
    }

    function renderItems(focusIndex) {
      itemsWrap.innerHTML = '';
      state.items.forEach(function (item, index) {
        itemsWrap.appendChild(itemRow(item, index));
      });
      updateTotals();
      // Keep already-surfaced errors visible across a re-render.
      if (state.showErrors) validate(true);
      if (typeof focusIndex === 'number' && state.items[focusIndex]) {
        var refs = state.items[focusIndex].refs;
        if (refs && refs.designation) refs.designation.focus();
      }
    }

    function updateTotals() {
      var total = itemsTotal(state.items);

      state.items.forEach(function (item) {
        if (item.refs && item.refs.rowTotal) {
          item.refs.rowTotal.textContent = ui.money(lineTotal(item), CURRENCY);
        }
      });
      totalValue.textContent = ui.money(total, CURRENCY);

      if (total < MIN_AMOUNT) {
        minimumAlert.innerHTML =
          '<span class="shrink-0 mt-0.5">' +
          icon('warning', 'w-4 h-4') +
          '</span><span>Le total doit atteindre au moins ' +
          ui.escapeHtml(ui.money(MIN_AMOUNT, CURRENCY)) +
          ' pour créer un paiement PayDunya. Il manque ' +
          ui.escapeHtml(ui.money(MIN_AMOUNT - total, CURRENCY)) +
          '.</span>';
        setHidden(minimumAlert, false);
        submitButton.disabled = true;
        submitButton.setAttribute(
          'title',
          'Le total doit atteindre au moins ' + ui.money(MIN_AMOUNT, CURRENCY) + '.'
        );
      } else {
        setHidden(minimumAlert, true);
        minimumAlert.innerHTML = '';
        if (!state.submitting) submitButton.disabled = false;
        submitButton.removeAttribute('title');
      }

      return total;
    }

    /** Validate everything. Returns the payload, or null when something is invalid. */
    function validate(silent) {
      var firstInvalid = null;
      var ok = true;

      function fail(input, errorNode, message) {
        setFieldError(input, errorNode, message);
        if (!firstInvalid) firstInvalid = input;
        ok = false;
      }

      var name = nameInput.value.trim();
      clearFieldError(nameInput, nameError);
      if (name.length < 2) {
        fail(nameInput, nameError, 'Indiquez le nom du client (2 caractères minimum).');
      }

      var email = emailInput.value.trim();
      clearFieldError(emailInput, emailError);
      if (!email) {
        fail(emailInput, emailError, 'Indiquez l’adresse e-mail qui recevra la facture.');
      } else if (!isValidEmail(email)) {
        fail(emailInput, emailError, 'Cette adresse e-mail n’est pas valide.');
      }

      var phone = phoneInput.value.trim();
      clearFieldError(phoneInput, phoneError);
      if (phone && !isValidPhone(phone)) {
        fail(phoneInput, phoneError, 'Ce numéro de téléphone n’est pas valide.');
      }

      var payloadItems = [];
      state.items.forEach(function (item) {
        var refs = item.refs;
        if (!refs) return;
        clearFieldError(refs.designation, refs.designationError);
        clearFieldError(refs.quantity, refs.quantityError);
        clearFieldError(refs.price, refs.priceError);

        var label = String(item.name || '').trim();
        var quantity = toNumber(item.quantity);
        var price = toNumber(item.unit_price);

        if (!label) fail(refs.designation, refs.designationError, 'La désignation est obligatoire.');
        if (!isFinite(quantity) || quantity < 1 || Math.floor(quantity) !== quantity) {
          fail(refs.quantity, refs.quantityError, 'La quantité doit être un nombre entier d’au moins 1.');
        }
        if (!isFinite(price) || price < 0) {
          fail(refs.price, refs.priceError, 'Indiquez un prix unitaire valide.');
        }

        payloadItems.push({
          name: label,
          quantity: quantity,
          unit_price: price,
          // product_id only ever travels with the business it belongs to.
          product_id: state.businessId ? item.product_id || null : null,
        });
      });

      if (updateTotals() < MIN_AMOUNT) ok = false;

      if (!ok) {
        if (!silent && firstInvalid) {
          firstInvalid.focus();
          if (typeof firstInvalid.scrollIntoView === 'function') {
            firstInvalid.scrollIntoView({ block: 'center', behavior: 'auto' });
          }
        }
        return null;
      }

      return {
        customer_name: name,
        customer_email: email,
        customer_phone: phone || null,
        currency: CURRENCY,
        business_id: state.businessId || null,
        items: payloadItems,
      };
    }

    nameInput.addEventListener('input', function () {
      clearFieldError(nameInput, nameError);
    });
    emailInput.addEventListener('input', function () {
      clearFieldError(emailInput, emailError);
    });
    phoneInput.addEventListener('input', function () {
      clearFieldError(phoneInput, phoneError);
    });

    // --- Businesses and their catalog ---------------------------------------
    function setHint(message, tone) {
      businessHint.textContent = message;
      businessHint.className = tone === 'error' ? cls.errorText : cls.hint;
    }

    function loadProducts(businessId) {
      state.productsState = 'loading';
      state.products = [];
      setHint('Chargement du catalogue…');
      renderItems();

      App.api.listProducts(businessId).then(
        function (products) {
          if (state.businessId !== businessId) return; // selection changed meanwhile
          state.products = Array.isArray(products) ? products : [];
          state.productsState = 'ready';
          setHint(
            state.products.length
              ? 'Catalogue chargé : ' +
                  ui.plural(state.products.length, 'produit') +
                  ' à choisir dans vos articles.'
              : 'Cette entreprise n’a encore aucun produit. Saisissez les articles manuellement.'
          );
          renderItems();
        },
        function (error) {
          if (state.businessId !== businessId) return;
          state.productsState = 'error';
          setHint(
            (error && error.message ? error.message + ' ' : '') +
              'Vous pouvez saisir les articles manuellement.',
            'error'
          );
          renderItems();
        }
      );
    }

    businessSelect.addEventListener('change', function () {
      state.businessId = businessSelect.value;
      // Product ids belong to one business only: never carry them across.
      state.items.forEach(function (item) {
        item.product_id = null;
      });
      if (!state.businessId) {
        state.products = [];
        state.productsState = 'idle';
        setHint('Rattachez la facture à une entreprise pour choisir ses produits dans le catalogue.');
        renderItems();
        return;
      }
      loadProducts(state.businessId);
    });

    function fillBusinessOptions(businesses) {
      businessSelect.innerHTML = '';
      businessSelect.appendChild(
        el('option', { value: '', text: 'Aucune entreprise (articles libres)' })
      );
      businesses.forEach(function (business) {
        businessSelect.appendChild(el('option', { value: business.id, text: business.name }));
      });
      businessSelect.disabled = false;
    }

    App.api.listBusinesses().then(
      function (businesses) {
        state.businesses = Array.isArray(businesses) ? businesses : [];
        fillBusinessOptions(state.businesses);
        if (!state.businesses.length) {
          setHint('Aucune entreprise accessible : les articles seront saisis librement.');
        }
      },
      function () {
        fillBusinessOptions([]);
        setHint(
          'Les entreprises n’ont pas pu être chargées. Vous pouvez tout de même saisir les articles librement.',
          'error'
        );
      }
    );

    // --- Submit -------------------------------------------------------------
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (state.submitting) return;
      state.showErrors = true;

      var payload = validate(false);
      if (!payload) {
        if (itemsTotal(state.items) < MIN_AMOUNT) {
          ui.toast({
            message: 'Le total doit atteindre au moins ' + ui.money(MIN_AMOUNT, CURRENCY) + '.',
            type: 'warning',
          });
        }
        return;
      }

      state.submitting = true;
      ui.setBusy(submitButton, true, 'Création…');
      cancelButton.disabled = true;

      App.api.createInvoice(payload).then(
        function (invoice) {
          var amount = invoice && invoice.amount ? invoice.amount : itemsTotal(state.items);
          handle.close(null);
          ui.toast({
            title: 'Facture créée',
            message:
              'La facture de ' +
              payload.customer_name +
              ' pour ' +
              ui.money(amount, CURRENCY) +
              ' a été enregistrée.',
            type: 'success',
          });
          onCreated(invoice);
        },
        function (error) {
          state.submitting = false;
          ui.setBusy(submitButton, false);
          cancelButton.disabled = false;
          updateTotals();
          ui.toastError(error);
        }
      );
    });

    renderItems();
    return handle;
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------

  function render(container) {
    var state = {
      invoices: [],
      loading: true,
      error: null,
      search: '',
      filter: 'all',
      visible: PAGE_SIZE,
    };

    var listRegion = el('div', { class: 'space-y-4' });
    var filterButtons = {};

    var searchInput = el('input', {
      id: uid('recherche'),
      type: 'search',
      class: cls.searchInput,
      placeholder: 'Rechercher un client…',
      'aria-label': 'Rechercher une facture par client, e-mail ou téléphone',
      autocomplete: 'off',
    });

    var searchBox = el('div', { class: 'relative min-w-0 flex-1' }, [
      el('span', {
        class:
          'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 ' +
          'text-stone-400 dark:text-stone-500',
        html: icon('search', 'w-4 h-4'),
      }),
      searchInput,
    ]);

    var segments = el('div', {
      class:
        'flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 ' +
        'sm:flex-wrap sm:overflow-visible',
      role: 'group',
      'aria-label': 'Filtrer les factures par statut',
    });

    STATUS_FILTERS.forEach(function (filter) {
      var count = el('span', { class: 'ml-1 text-[10px] font-bold tabular-nums', text: '0' });
      var button = el('button', {
        type: 'button',
        class: cls.btnGhostSm + ' shrink-0',
        'aria-pressed': 'false',
        onclick: function () {
          if (state.filter === filter.key) return;
          state.filter = filter.key;
          state.visible = PAGE_SIZE;
          draw();
        },
      });
      button.appendChild(document.createTextNode(filter.label));
      button.appendChild(count);
      filterButtons[filter.key] = { button: button, count: count };
      segments.appendChild(button);
    });

    var toolbar = el(
      'div',
      { class: cls.card + ' p-3 sm:p-4 flex flex-col gap-3 lg:flex-row lg:items-center hidden' },
      [searchBox, segments]
    );

    var resultLine = el('p', {
      class: cls.mutedSm + ' hidden',
      role: 'status',
      'aria-live': 'polite',
    });

    var header = ui.pageHeader({
      title: 'Factures',
      subtitle:
        'Créez des factures, suivez leur statut et partagez le lien de paiement PayDunya avec vos clients.',
      actions: [
        {
          label: 'Nouvelle facture',
          icon: 'plus',
          variant: 'Primary',
          onClick: function () {
            openCreateModal(handleCreated);
          },
        },
        {
          label: 'Actualiser',
          icon: 'refresh',
          variant: 'Secondary',
          onClick: function () {
            load();
          },
        },
      ],
    });

    ui.mount(container, el('div', { class: cls.page }, [header, toolbar, resultLine, listRegion]));

    // --- State transitions --------------------------------------------------
    function handleCreated(invoice) {
      if (invoice && invoice.id) {
        state.invoices = sortInvoices([invoice].concat(state.invoices));
        // Show the new invoice whatever filter was active.
        state.filter = 'all';
        state.search = '';
        searchInput.value = '';
        state.visible = PAGE_SIZE;
        draw();
      } else {
        load();
      }
    }

    function replaceInvoice(updated) {
      if (!updated || !updated.id) return;
      state.invoices = state.invoices.map(function (invoice) {
        return invoice.id === updated.id ? updated : invoice;
      });
      draw();
    }

    function filtered() {
      var needle = fold(state.search.trim());
      return state.invoices.filter(function (invoice) {
        if (state.filter !== 'all' && invoice.status !== state.filter) return false;
        if (!needle) return true;
        return (
          fold(invoice.customer_name).indexOf(needle) !== -1 ||
          fold(invoice.customer_email).indexOf(needle) !== -1 ||
          fold(invoice.customer_phone).indexOf(needle) !== -1
        );
      });
    }

    function updateToolbar() {
      var counts = { all: state.invoices.length, pending: 0, paid: 0, canceled: 0 };
      state.invoices.forEach(function (invoice) {
        if (counts[invoice.status] !== undefined) counts[invoice.status] += 1;
      });

      STATUS_FILTERS.forEach(function (filter) {
        var refs = filterButtons[filter.key];
        var active = state.filter === filter.key;
        refs.count.textContent = ui.number(counts[filter.key] || 0);
        refs.button.className = (active ? cls.btnPrimarySm : cls.btnGhostSm) + ' shrink-0';
        refs.count.className =
          'ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ' +
          (active
            ? 'bg-white/25 text-white'
            : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400');
        refs.button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      setHidden(
        toolbar,
        state.loading || Boolean(state.error) || state.invoices.length === 0
      );
    }

    function drawList() {
      listRegion.innerHTML = '';
      setHidden(resultLine, true);

      if (state.loading) {
        listRegion.appendChild(ui.skeleton('row', 6));
        return;
      }

      if (state.error) {
        listRegion.appendChild(
          ui.errorState({
            title: 'Les factures n’ont pas pu être chargées',
            message: state.error.message || 'Une erreur est survenue. Veuillez réessayer.',
            onRetry: load,
          })
        );
        return;
      }

      if (!state.invoices.length) {
        listRegion.appendChild(
          ui.emptyState({
            icon: 'invoice',
            title: 'Aucune facture pour le moment',
            message:
              'Créez votre première facture pour encaisser un client via PayDunya. Le montant total doit atteindre au moins ' +
              ui.money(MIN_AMOUNT, CURRENCY) +
              '.',
            action: {
              label: 'Créer une facture',
              icon: 'plus',
              onClick: function () {
                openCreateModal(handleCreated);
              },
            },
          })
        );
        return;
      }

      var rows = filtered();

      if (!rows.length) {
        listRegion.appendChild(
          ui.emptyState({
            icon: 'search',
            title: 'Aucune facture ne correspond',
            message:
              'Aucun résultat pour cette recherche ou ce statut. Modifiez vos critères pour voir davantage de factures.',
            action: {
              label: 'Réinitialiser les filtres',
              icon: 'refresh',
              variant: 'Secondary',
              onClick: function () {
                state.search = '';
                state.filter = 'all';
                state.visible = PAGE_SIZE;
                searchInput.value = '';
                draw();
                searchInput.focus();
              },
            },
          })
        );
        return;
      }

      var shown = rows.slice(0, state.visible);
      resultLine.textContent =
        shown.length < rows.length
          ? ui.plural(shown.length, 'facture') +
            ' affichée' +
            (shown.length > 1 ? 's' : '') +
            ' sur ' +
            ui.number(rows.length)
          : ui.plural(rows.length, 'facture');
      setHidden(resultLine, false);

      listRegion.appendChild(buildTable(shown, replaceInvoice));
      listRegion.appendChild(buildCards(shown, replaceInvoice));

      if (rows.length > shown.length) {
        listRegion.appendChild(
          el('div', { class: 'flex justify-center pt-1' }, [
            el('button', {
              type: 'button',
              class: cls.btnSecondary,
              html:
                icon('chevron-down', 'w-4 h-4') +
                'Afficher plus (' +
                ui.number(rows.length - shown.length) +
                ' restantes)',
              onclick: function () {
                state.visible += PAGE_SIZE;
                draw();
              },
            }),
          ])
        );
      }
    }

    function draw() {
      updateToolbar();
      drawList();
    }

    function load() {
      state.loading = true;
      state.error = null;
      draw();

      return App.api.listInvoices().then(
        function (invoices) {
          state.loading = false;
          state.invoices = sortInvoices(Array.isArray(invoices) ? invoices : []);
          state.visible = PAGE_SIZE;
          draw();
        },
        function (error) {
          state.loading = false;
          state.error = error || new Error('Une erreur est survenue.');
          draw();
        }
      );
    }

    var onSearch = ui.debounce(function () {
      state.search = searchInput.value;
      state.visible = PAGE_SIZE;
      draw();
    }, 200);

    searchInput.addEventListener('input', onSearch);
    // The native "clear" button on type=search fires `search`, not `input`, in Safari.
    searchInput.addEventListener('search', function () {
      state.search = searchInput.value;
      state.visible = PAGE_SIZE;
      draw();
    });

    return load();
  }

  App.views.invoices = { render: render };
})();
