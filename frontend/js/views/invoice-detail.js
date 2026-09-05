// View: a single invoice at #/factures/:id.
// Shows the payment record together with its business and product origins.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;
  var el = ui.el;
  var icon = ui.icon;

  // ---------------------------------------------------------------------------
  // Printing.
  // The app shell is a dashboard, so the printed page needs its own rules:
  // no navigation, no action controls, no dark theme, full-width document.
  // The stylesheet is injected once, from here, so the shell stays untouched.
  // ---------------------------------------------------------------------------
  var PRINT_STYLE_ID = 'invoice-print-style';
  var printThemeHooked = false;

  var PRINT_CSS = [
    '@page { margin: 14mm; }',
    '@media print {',
    '  #app-shell aside,',
    '  #app-shell header,',
    '  #app-shell > nav,',
    '  #skip-to-content,',
    '  #toast-container,',
    '  .noise-overlay,',
    '  [data-print="hide"] { display: none !important; }',
    '  html, body { background: #ffffff !important; }',
    '  #app-shell > div { padding-left: 0 !important; min-height: 0 !important; }',
    '  #view { max-width: none !important; padding: 0 !important; }',
    '  [data-print="stack"] { display: block !important; }',
    '  [data-print="stack"] > * + * { margin-top: 16px; }',
    '  #view section { box-shadow: none !important; break-inside: avoid; }',
    '  a[href]::after { content: "" !important; }',
    '}',
  ].join('\n');

  function ensurePrintStyles() {
    if (document.getElementById(PRINT_STYLE_ID)) return;
    var style = el('style', { id: PRINT_STYLE_ID });
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
  }

  // Dark mode would print as a black page: drop it for the duration of the job.
  // Registered once so that Ctrl+P is covered as well as the button.
  function hookPrintTheme() {
    if (printThemeHooked) return;
    printThemeHooked = true;
    var restoreDark = false;
    window.addEventListener('beforeprint', function () {
      restoreDark = document.documentElement.classList.contains('dark');
      if (restoreDark) document.documentElement.classList.remove('dark');
    });
    window.addEventListener('afterprint', function () {
      if (restoreDark) document.documentElement.classList.add('dark');
      restoreDark = false;
    });
  }

  // Some browsers never fire beforeprint, so the button path drops the theme itself.
  function printInvoice() {
    var root = document.documentElement;
    var wasDark = root.classList.contains('dark');
    var restored = false;

    function restore() {
      if (restored) return;
      restored = true;
      window.removeEventListener('afterprint', restore);
      if (wasDark) root.classList.add('dark');
    }

    if (wasDark) root.classList.remove('dark');
    window.addEventListener('afterprint', restore);
    window.setTimeout(restore, 3000);

    try {
      window.print();
    } catch (err) {
      restore();
    }
  }

  // pageHeader() renders [optional back link, row[title block, optional actions]].
  // Neither belongs on a printed invoice.
  function markHeaderForPrint(header) {
    for (var index = 0; index < header.children.length; index += 1) {
      var child = header.children[index];
      if (child.tagName === 'A') child.setAttribute('data-print', 'hide');
      else if (child.children.length > 1) child.children[1].setAttribute('data-print', 'hide');
    }
    return header;
  }

  function back() {
    return { label: 'Toutes les factures', href: App.router.paths.invoices };
  }

  function shortId(id) {
    var value = String(id || '');
    return value.length > 12 ? value.slice(0, 8) + '…' + value.slice(-4) : value || '—';
  }

  function lineTotal(item) {
    var quantity = Number(item && item.quantity);
    var price = Number(item && item.unit_price);
    return (isFinite(quantity) ? quantity : 0) * (isFinite(price) ? price : 0);
  }

  function definition(label, value, href) {
    if (!value) return null;
    return el('div', { class: 'min-w-0' }, [
      el('dt', { class: cls.eyebrow, text: label }),
      href
        ? el('a', { href: href, class: cls.link + ' mt-1 block ' + cls.breakAnywhere, text: value })
        : el('dd', {
            class: 'mt-1 text-sm font-semibold text-stone-800 dark:text-stone-100 ' + cls.breakAnywhere,
            text: value,
          }),
    ]);
  }

  // Document header band: reference, issue date, status and grand total.
  // Doubles as the masthead of the printed invoice.
  function summaryCard(invoice) {
    var items = Array.isArray(invoice.items) ? invoice.items : [];
    return el('section', { class: cls.cardPad }, [
      el('div', { class: 'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between' }, [
        el('div', { class: 'min-w-0' }, [
          el('p', { class: cls.eyebrow, text: 'Référence' }),
          el('p', {
            class: 'mt-1 text-lg font-extrabold tracking-tight text-stone-900 dark:text-stone-50 ' + cls.breakAnywhere,
            text: shortId(invoice.id),
          }),
          el('p', { class: cls.mutedSm + ' mt-1', text: 'Émise le ' + ui.dateTime(invoice.created_at) }),
        ]),
        el('div', { class: 'flex flex-col gap-2 sm:items-end' }, [
          el('span', { html: ui.statusBadge(invoice.status) }),
          el('p', {
            class:
              'text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 ' +
              'whitespace-nowrap',
            text: ui.money(invoice.amount, invoice.currency),
          }),
          el('p', { class: cls.mutedSm, text: ui.plural(items.length, 'article') }),
        ]),
      ]),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Status control.
  // ---------------------------------------------------------------------------
  var STATUS_OPTIONS = [
    { value: 'pending', label: 'En attente' },
    { value: 'canceled', label: 'Annulée' },
  ];

  var STATUS_SUCCESS = {
    pending: 'La facture est de nouveau en attente de paiement.',
    canceled: 'La facture a été annulée.',
  };

  var SEGMENT_BASE =
    'inline-flex w-full items-center justify-center rounded-xl border px-2.5 py-2.5 text-xs font-bold ' +
    'transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-[#fafaf9] dark:focus-visible:ring-offset-[#0c0a09]';

  var SEGMENT_IDLE =
    'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 ' +
    'text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/60 ' +
    'hover:text-stone-800 dark:hover:text-stone-100';

  var SEGMENT_SELECTED = {
    pending:
      'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300',
    paid:
      'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300',
    canceled:
      'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300',
  };

  function statusCard(invoice, onRefresh) {
    if (invoice.status === 'paid') {
      return el('section', { class: cls.cardPad + ' mt-6' }, [
        el('h2', { class: cls.cardTitle, text: 'Statut de la facture' }),
        el('p', {
          class: cls.mutedSm + ' mt-2 leading-relaxed',
          text: 'Paiement confirmé par PayDunya. Une facture réglée ne peut plus être modifiée manuellement.',
        }),
      ]);
    }

    if (!App.session.isSuperAdmin()) {
      return el('section', { class: cls.cardPad + ' mt-6' }, [
        el('h2', { class: cls.cardTitle, text: 'Statut de la facture' }),
        el('p', {
          class: cls.mutedSm + ' mt-2 leading-relaxed',
          text: 'Le statut de paiement est confirmé automatiquement par PayDunya. Seul le super administrateur peut annuler ou rouvrir une facture.',
        }),
      ]);
    }

    var current = invoice.status;
    var busy = false;
    var buttons = {};

    var group = el('div', {
      class: 'mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2',
      role: 'group',
      'aria-label': 'Statut de la facture',
    });

    var feedback = el('p', { class: cls.mutedSm + ' mt-3 hidden items-center gap-2', role: 'status' });

    function applySelection(value) {
      current = value;
      STATUS_OPTIONS.forEach(function (option) {
        var selected = option.value === value;
        var button = buttons[option.value];
        button.className = SEGMENT_BASE + ' ' + (selected ? SEGMENT_SELECTED[option.value] : SEGMENT_IDLE);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
    }

    function setBusyState(flag, label) {
      busy = flag;
      STATUS_OPTIONS.forEach(function (option) {
        buttons[option.value].disabled = flag;
      });
      if (flag) {
        group.setAttribute('aria-busy', 'true');
        feedback.className = cls.mutedSm + ' mt-3 flex items-center gap-2';
        feedback.innerHTML =
          '<span class="inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current ' +
          'border-r-transparent spin"></span>' +
          ui.escapeHtml(label || 'Veuillez patienter…');
      } else {
        group.removeAttribute('aria-busy');
        feedback.className = cls.mutedSm + ' mt-3 hidden items-center gap-2';
        feedback.textContent = '';
      }
    }

    function commit(value) {
      var previous = current;
      applySelection(value);
      setBusyState(true, 'Mise à jour du statut…');

      App.api.updateInvoiceStatus(invoice.id, value).then(
        function (updated) {
          ui.toast({ message: STATUS_SUCCESS[value] || 'Statut mis à jour.', type: 'success' });
          onRefresh(updated || invoice);
        },
        function (error) {
          setBusyState(false);
          applySelection(previous);
          ui.toastError(error);
        }
      );
    }

    function choose(value) {
      if (busy || value === current) return;
      if (value !== 'canceled') {
        commit(value);
        return;
      }
      ui.confirmDialog({
        title: 'Annuler cette facture ?',
        message:
          'Le client ne pourra plus la régler et le lien de paiement deviendra inutilisable. ' +
          'Vous pourrez toujours la remettre en attente ensuite.',
        danger: true,
        confirmLabel: 'Annuler la facture',
        cancelLabel: 'Conserver la facture',
      }).then(function (confirmed) {
        if (confirmed) commit('canceled');
      });
    }

    STATUS_OPTIONS.forEach(function (option) {
      var button = el('button', {
        type: 'button',
        class: SEGMENT_BASE + ' ' + SEGMENT_IDLE,
        text: option.label,
        'aria-pressed': 'false',
        onclick: function () {
          choose(option.value);
        },
      });
      buttons[option.value] = button;
      group.appendChild(button);
    });

    applySelection(current);

    return el('section', { class: cls.cardPad, 'data-print': 'hide' }, [
      el('h2', { class: cls.cardTitle, text: 'Statut de la facture' }),
      el('p', {
        class: cls.mutedSm + ' mt-1',
        text: 'Mettez le statut à jour dès que le paiement est confirmé ou que la commande est annulée.',
      }),
      group,
      feedback,
    ]);
  }

  function linesCard(invoice) {
    var items = Array.isArray(invoice.items) ? invoice.items : [];
    var list = el('div', { class: 'divide-y divide-stone-100 dark:divide-stone-800/70' });

    if (!items.length) {
      list.appendChild(el('p', { class: 'py-5 text-sm ' + cls.muted, text: 'Cette facture ne contient aucun article.' }));
    }

    items.forEach(function (item) {
      var quantity = Number(item.quantity);
      var price = Number(item.unit_price);
      var meta = ui.number(isFinite(quantity) ? quantity : 0) + ' × ' + ui.money(isFinite(price) ? price : 0, invoice.currency);
      if (item.product_id) meta += ' · Produit ' + shortId(item.product_id);

      list.appendChild(
        el('div', { class: 'flex items-start justify-between gap-4 py-4' }, [
          el('div', { class: 'min-w-0' }, [
            el('p', {
              class: 'font-semibold text-stone-800 dark:text-stone-100 [overflow-wrap:anywhere]',
              text: item.name || 'Article',
            }),
            el('p', { class: cls.mutedSm + ' mt-1', text: meta }),
          ]),
          el('p', {
            class: 'shrink-0 text-sm font-extrabold text-stone-900 dark:text-stone-50 whitespace-nowrap',
            text: ui.money(lineTotal(item), invoice.currency),
          }),
        ])
      );
    });

    return el('section', { class: cls.cardPad }, [
      el('div', { class: 'mb-1 flex items-center justify-between gap-3' }, [
        el('h2', { class: cls.cardTitle, text: 'Articles facturés' }),
        el('span', {
          class: cls.badgeNeutral,
          text: ui.number(items.length) + ' article' + (items.length > 1 ? 's' : ''),
        }),
      ]),
      list,
      el('div', { class: 'flex items-end justify-between gap-4 pt-4 ' + cls.divider }, [
        el('p', { class: 'text-sm font-bold ' + cls.muted, text: 'Total de la facture' }),
        el('p', {
          class:
            'text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 ' +
            'whitespace-nowrap leading-none',
          text: ui.money(invoice.amount, invoice.currency),
        }),
      ]),
    ]);
  }

  function customerCard(invoice) {
    var fields = [
      definition('Client', invoice.customer_name),
      definition('E-mail', invoice.customer_email, invoice.customer_email ? 'mailto:' + invoice.customer_email : null),
      definition('Téléphone', invoice.customer_phone, invoice.customer_phone ? 'tel:' + invoice.customer_phone : null),
    ].filter(Boolean);

    return el('section', { class: cls.cardPad }, [
      el('h2', { class: cls.cardTitle, text: 'Client' }),
      fields.length
        ? el('dl', { class: 'mt-4 grid grid-cols-1 gap-4' }, fields)
        : el('p', { class: cls.mutedSm + ' mt-3', text: 'Aucune information client n’est enregistrée.' }),
    ]);
  }

  function relationshipCard(invoice, business) {
    var content = [
      el('h2', { class: cls.cardTitle, text: 'Origine de la facture' }),
      el('p', {
        class: cls.mutedSm + ' mt-1',
        text: 'Retrouvez l’entreprise et les produits associés à ce paiement.',
      }),
    ];

    var blockClass =
      'mt-4 flex items-center justify-between gap-3 rounded-xl border border-stone-200 dark:border-stone-800 ' +
      'bg-stone-50 dark:bg-stone-950 px-3.5 py-3';

    if (invoice.business_id && business && business.name) {
      content.push(
        el('a', {
          href: App.router.paths.business(invoice.business_id),
          class:
            blockClass +
            ' transition hover:border-cyan-500/50 hover:bg-white dark:hover:bg-stone-900 ' +
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
          'aria-label': 'Ouvrir l’entreprise ' + business.name,
        }, [
          el('span', { class: 'min-w-0' }, [
            el('span', { class: cls.eyebrow + ' block', text: 'Entreprise liée' }),
            el('span', {
              class: 'mt-1 block text-sm font-bold text-stone-800 dark:text-stone-100 ' + cls.breakAnywhere,
              text: business.name,
            }),
          ]),
          el('span', {
            class: 'shrink-0 text-cyan-600 dark:text-cyan-400',
            html: icon('chevron', 'w-5 h-5'),
            'data-print': 'hide',
          }),
        ])
      );
    } else if (invoice.business_id) {
      // The business could not be loaded (403 or 404): show the reference only.
      content.push(
        el('div', { class: blockClass }, [
          el('span', { class: 'min-w-0' }, [
            el('span', { class: cls.eyebrow + ' block', text: 'Entreprise liée' }),
            el('span', {
              class: 'mt-1 block text-sm font-bold text-stone-800 dark:text-stone-100 ' + cls.breakAnywhere,
              text: shortId(invoice.business_id),
            }),
          ]),
        ])
      );
      content.push(
        el('p', {
          class: cls.mutedSm + ' mt-2',
          text: 'Les détails de cette entreprise ne sont pas accessibles avec votre compte.',
        })
      );
    } else {
      content.push(
        el('p', {
          class: 'mt-4 rounded-xl bg-stone-50 dark:bg-stone-950 px-3.5 py-3 text-sm ' + cls.muted,
          text: 'Cette facture n’est liée à aucune entreprise. Elle a probablement été créée avant le suivi par entreprise.',
        })
      );
    }

    return el('section', { class: cls.cardPad }, content);
  }

  function paymentCard(invoice, onRefresh) {
    var card = el('section', { class: cls.cardPad }, [
      el('div', { class: 'flex items-start justify-between gap-3' }, [
        el('div', {}, [
          el('h2', { class: cls.cardTitle, text: 'Paiement' }),
          el('p', { class: cls.mutedSm + ' mt-1', text: 'Statut et lien de règlement PayDunya.' }),
        ]),
        el('span', { html: ui.statusBadge(invoice.status) }),
      ]),
    ]);

    if (invoice.payment_url) {
      card.appendChild(
        el('div', {
          class: 'mt-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-3',
        }, [
          el('p', { class: cls.eyebrow, text: 'Lien de paiement' }),
          el('p', { class: 'mt-1 text-xs leading-relaxed ' + cls.muted + ' ' + cls.breakAnywhere, text: invoice.payment_url }),
        ])
      );
      card.appendChild(
        el('div', { class: 'mt-3 flex flex-wrap gap-2', 'data-print': 'hide' }, [
          el('a', {
            href: invoice.payment_url,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: cls.btnPrimarySm,
            html: icon('external', 'w-4 h-4') + 'Ouvrir le paiement',
          }),
          el('button', {
            type: 'button',
            class: cls.btnSecondarySm,
            html: icon('copy', 'w-4 h-4') + 'Copier le lien',
            onclick: function () {
              ui.copyToClipboard(invoice.payment_url, 'Lien de paiement copié.');
            },
          }),
        ])
      );
    } else if (invoice.status === 'pending') {
      var generate = el('button', {
        type: 'button',
        class: cls.btnPrimary + ' mt-4 w-full sm:w-auto',
        html: icon('link', 'w-4 h-4') + 'Générer le lien de paiement',
        'data-print': 'hide',
        onclick: function () {
          ui.setBusy(generate, true, 'Génération…');
          App.api.createPaymentLink(invoice.id).then(
            function (updated) {
              ui.toast({
                message: 'Lien de paiement généré. Vous pouvez maintenant le partager avec le client.',
                type: 'success',
              });
              onRefresh(updated || invoice);
            },
            function (error) {
              ui.setBusy(generate, false);
              ui.toastError(error);
            }
          );
        },
      });
      card.appendChild(generate);
    } else {
      card.appendChild(
        el('p', {
          class: 'mt-4 rounded-xl bg-stone-50 dark:bg-stone-950 px-3.5 py-3 text-sm ' + cls.muted,
          text: invoice.status === 'paid' ? 'Cette facture est réglée.' : 'Cette facture a été annulée avant son règlement.',
        })
      );
    }
    return card;
  }

  function paint(container, invoice, business) {
    function refresh(updated) {
      paint(container, updated, business);
    }

    var actions = [{ label: 'Imprimer', onClick: printInvoice, icon: 'invoice', variant: 'secondary' }];
    if (invoice.business_id) {
      actions.push({
        label: 'Voir l’entreprise',
        href: App.router.paths.business(invoice.business_id),
        icon: 'business',
        variant: 'secondary',
      });
    }

    ui.mount(
      container,
      el('div', { class: cls.page }, [
        markHeaderForPrint(
          ui.pageHeader({
            title: 'Facture ' + shortId(invoice.id),
            subtitle: invoice.customer_name ? 'Client : ' + invoice.customer_name : 'Facture sans client renseigné',
            back: back(),
            actions: actions,
          })
        ),
        summaryCard(invoice),
        el('div', {
          class: 'grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)] gap-5 sm:gap-6 items-start',
          'data-print': 'stack',
        }, [
          linesCard(invoice),
          el('div', { class: 'space-y-5 sm:space-y-6' }, [
            statusCard(invoice, refresh),
            paymentCard(invoice, refresh),
            customerCard(invoice),
            relationshipCard(invoice, business),
            el('section', { class: cls.cardPad }, [
              el('h2', { class: cls.cardTitle, text: 'Informations' }),
              el('dl', { class: 'mt-4 grid grid-cols-2 gap-4' }, [
                definition('Référence', shortId(invoice.id)),
                definition('Dernière mise à jour', ui.dateTime(invoice.updated_at)),
                definition('Devise', invoice.currency || App.config.DEFAULT_CURRENCY),
                definition('Statut', ui.statusLabel(invoice.status)),
              ]),
            ]),
          ]),
        ]),
      ])
    );
  }

  function errorPage(error) {
    var missing = error && error.status === 404;
    return el('div', { class: cls.page }, [
      ui.pageHeader({ title: missing ? 'Facture introuvable' : 'Impossible de charger la facture', back: back() }),
      ui.emptyState({
        icon: missing ? 'invoice' : 'warning',
        title: missing ? 'Cette facture n’existe plus' : 'Le chargement a échoué',
        message: missing
          ? 'Elle a peut-être été supprimée, ou le lien utilisé est incomplet.'
          : (error && error.message) || 'Une erreur est survenue. Réessayez dans un instant.',
        action: {
          label: missing ? 'Retour aux factures' : 'Réessayer',
          icon: missing ? 'invoice' : 'refresh',
          onClick: function () {
            if (missing) App.router.navigate(App.router.paths.invoices);
            else App.router.refresh();
          },
        },
      }),
    ]);
  }

  function render(container, params) {
    var id = String((params && params.id) || '');
    ensurePrintStyles();
    hookPrintTheme();

    if (!id) {
      ui.mount(container, errorPage({ status: 404 }));
      return;
    }

    ui.mount(
      container,
      el('div', { class: cls.page }, [
        ui.pageHeader({ title: 'Chargement de la facture', back: back() }),
        ui.skeleton('card', 2),
      ])
    );
    return App.api.getInvoice(id).then(
      function (invoice) {
        if (!invoice || !invoice.business_id) {
          paint(container, invoice, null);
          return null;
        }
        // The business name is a nicety: a 403 or 404 here must not break the page.
        return App.api.getBusiness(invoice.business_id).then(
          function (business) {
            paint(container, invoice, business);
          },
          function () {
            paint(container, invoice, null);
          }
        );
      },
      function (error) {
        ui.mount(container, errorPage(error));
      }
    );
  }

  App.views.invoiceDetail = { render: render };
})();
