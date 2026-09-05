// View: a single invoice at #/factures/:id.
// Shows the payment record together with its business and product origins.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;
  var el = ui.el;
  var icon = ui.icon;

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
      el('div', { class: 'flex items-center justify-between gap-4 pt-4 ' + cls.divider }, [
        el('p', { class: 'text-sm font-bold ' + cls.muted, text: 'Total de la facture' }),
        el('p', {
          class: 'text-xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 whitespace-nowrap',
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

  function relationshipCard(invoice) {
    var content = [
      el('h2', { class: cls.cardTitle, text: 'Origine de la facture' }),
      el('p', {
        class: cls.mutedSm + ' mt-1',
        text: 'Retrouvez l’entreprise et les produits associés à ce paiement.',
      }),
    ];

    if (invoice.business_id) {
      content.push(
        el('a', {
          href: App.router.paths.business(invoice.business_id),
          class:
            'mt-4 flex items-center justify-between gap-3 rounded-xl border border-stone-200 dark:border-stone-800 ' +
            'bg-stone-50 dark:bg-stone-950 px-3.5 py-3 transition hover:border-cyan-500/50 hover:bg-white dark:hover:bg-stone-900 ' +
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
          'aria-label': 'Ouvrir l’entreprise liée à cette facture',
        }, [
          el('span', { class: 'min-w-0' }, [
            el('span', { class: cls.eyebrow + ' block', text: 'Entreprise liée' }),
            el('span', {
              class: 'mt-1 block text-sm font-bold text-stone-800 dark:text-stone-100',
              text: 'Voir l’entreprise ' + shortId(invoice.business_id),
            }),
          ]),
          el('span', { class: 'shrink-0 text-cyan-600 dark:text-cyan-400', html: icon('chevron', 'w-5 h-5') }),
        ])
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
        el('div', { class: 'mt-3 flex flex-wrap gap-2' }, [
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

  function paint(container, invoice) {
    function refresh(updated) {
      paint(container, updated);
    }

    ui.mount(
      container,
      el('div', { class: cls.page }, [
        ui.pageHeader({
          title: 'Facture ' + shortId(invoice.id),
          subtitle: 'Créée le ' + ui.dateTime(invoice.created_at),
          back: back(),
          actions: invoice.business_id
            ? [{ label: 'Voir l’entreprise', href: App.router.paths.business(invoice.business_id), icon: 'business', variant: 'secondary' }]
            : [],
        }),
        el('div', { class: 'grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)] gap-5 sm:gap-6 items-start' }, [
          linesCard(invoice),
          el('div', { class: 'space-y-5 sm:space-y-6' }, [
            paymentCard(invoice, refresh),
            customerCard(invoice),
            relationshipCard(invoice),
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
        paint(container, invoice);
      },
      function (error) {
        ui.mount(container, errorPage(error));
      }
    );
  }

  App.views.invoiceDetail = { render: render };
})();
