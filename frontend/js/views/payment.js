// Public payment page (payer.html). The unguessable token in the URL is the
// payer's credential, so this view intentionally makes no authenticated calls.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;
  var el = ui.el;
  var icon = ui.icon;

  var state = {
    container: null,
    token: '',
    invoice: null,
    cancelled: false,
    matchError: false,
    preparing: false,
  };

  function readParam(name) {
    var search = window.location.search || '';
    try {
      return (new URLSearchParams(search).get(name) || '').trim();
    } catch (err) {
      var match = search.match(new RegExp('[?&]' + name + '=([^&]*)'));
      return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')).trim() : '';
    }
  }

  function pageUrl(page) {
    var path = String(window.location.pathname || '');
    var base = path.replace(/[^/]*$/, '');
    if (window.location.protocol === 'file:') {
      return App.config.API_ROOT + base + page + '?token=' + encodeURIComponent(state.token);
    }
    return window.location.origin + base + page + '?token=' + encodeURIComponent(state.token);
  }

  function permanentUrl(invoice) {
    var url = invoice && invoice.permanent_url ? String(invoice.permanent_url).trim() : '';
    return url || pageUrl('facture.html');
  }

  function lineTotal(item) {
    var quantity = Number(item && item.quantity);
    var price = Number(item && item.unit_price);
    return (isFinite(quantity) ? quantity : 0) * (isFinite(price) ? price : 0);
  }

  function shell(children, extraClass) {
    return el(
      'div',
      { class: 'mx-auto w-full max-w-2xl px-4 sm:px-6 lg:px-8 ' + (extraClass || '') },
      children
    );
  }

  function mount(content) {
    ui.mount(state.container, content);
  }

  function renderLoading() {
    mount(
      shell(
        [
          el('div', { class: 'space-y-3', role: 'status', 'aria-label': 'Chargement du paiement' }, [
            el('div', { class: 'skeleton h-3 w-24 rounded' }),
            el('div', { class: 'skeleton h-8 w-2/3 rounded-lg' }),
          ]),
          el('div', { class: cls.cardPad + ' mt-6 space-y-4' }, [
            el('div', { class: 'flex items-center gap-3' }, [
              el('div', { class: 'skeleton h-14 w-14 rounded-2xl shrink-0' }),
              el('div', { class: 'flex-1 space-y-2' }, [
                el('div', { class: 'skeleton h-3 w-1/2 rounded' }),
                el('div', { class: 'skeleton h-3 w-1/3 rounded' }),
              ]),
            ]),
            el('div', { class: 'skeleton h-14 w-full rounded-xl' }),
            el('div', { class: 'skeleton h-12 w-full rounded-xl' }),
          ]),
        ],
        'py-8 sm:py-10'
      )
    );
  }

  function renderMissingToken() {
    document.title = state.matchError ? 'Paiement introuvable · PayDunya' : 'Payer ma facture · PayDunya';
    mount(
      shell(
        [
          ui.emptyState({
            icon: state.matchError ? 'warning' : 'link',
            title: state.matchError ? 'Lien de paiement introuvable' : 'Lien de paiement incomplet',
            message: state.matchError
              ? 'Ce lien ne correspond à aucune facture. Vérifiez le lien reçu auprès de la boutique.'
              : 'Utilisez le lien complet envoyé par la boutique pour consulter et régler votre commande.',
          }),
        ],
        'py-14 sm:py-20'
      )
    );
  }

  function renderNotFound() {
    document.title = 'Paiement introuvable · PayDunya';
    mount(
      shell(
        [
          ui.emptyState({
            icon: 'link',
            title: 'Ce lien n’est plus disponible',
            message: 'Vérifiez le lien reçu ou demandez à la boutique de vous en envoyer un nouveau.',
            action: {
              label: 'Réessayer',
              icon: 'refresh',
              onClick: load,
            },
          }),
        ],
        'py-14 sm:py-20'
      )
    );
  }

  function renderFailure(error) {
    document.title = 'Payer ma facture · PayDunya';
    mount(
      shell(
        [
          ui.errorState({
            title: 'Impossible de charger le paiement',
            message:
              (error && error.message) ||
              'Une erreur est survenue. Vérifiez votre connexion puis réessayez.',
            onRetry: load,
          }),
        ],
        'py-14 sm:py-20'
      )
    );
  }

  function itemsCard(invoice) {
    var items = Array.isArray(invoice.items) ? invoice.items : [];
    var rows = el('div', { class: 'divide-y divide-stone-100 dark:divide-stone-800/70' });

    items.forEach(function (item) {
      var quantity = Number(item && item.quantity);
      var unitPrice = Number(item && item.unit_price);
      rows.appendChild(
        el('div', { class: 'flex items-start justify-between gap-4 py-3.5' }, [
          el('div', { class: 'min-w-0' }, [
            el('p', {
              class: 'text-sm font-semibold text-stone-800 dark:text-stone-100 [overflow-wrap:anywhere]',
              text: (item && item.name) || 'Article',
            }),
            el('p', {
              class: cls.mutedSm + ' mt-1',
              text:
                ui.number(isFinite(quantity) ? quantity : 0) +
                ' × ' +
                ui.money(isFinite(unitPrice) ? unitPrice : 0, invoice.currency),
            }),
          ]),
          el('p', {
            class: 'shrink-0 text-sm font-extrabold text-stone-900 dark:text-stone-50 whitespace-nowrap',
            text: ui.money(lineTotal(item), invoice.currency),
          }),
        ])
      );
    });

    return el('section', { class: cls.cardPad }, [
      el('div', { class: 'flex items-center justify-between gap-3' }, [
        el('h2', { class: cls.cardTitle, text: 'Votre commande' }),
        el('span', {
          class: cls.badgeNeutral,
          text: ui.number(items.length) + ' article' + (items.length > 1 ? 's' : ''),
        }),
      ]),
      rows,
      el('div', { class: 'flex items-center justify-between gap-4 pt-4 ' + cls.divider }, [
        el('p', { class: 'text-sm font-bold ' + cls.muted, text: 'Total à régler' }),
        el('p', {
          class: 'text-2xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 whitespace-nowrap',
          text: ui.money(invoice.amount, invoice.currency),
        }),
      ]),
    ]);
  }

  function paymentAction(invoice) {
    var status = String(invoice.status || 'pending');
    var card = el('section', { class: cls.cardPad + ' space-y-4' }, [
      el('div', { class: 'flex items-start justify-between gap-3' }, [
        el('div', { class: 'min-w-0' }, [
          el('h2', { class: cls.cardTitle, text: 'Paiement sécurisé' }),
          el('p', {
            class: cls.mutedSm + ' mt-1 leading-relaxed',
            text: 'Vous serez redirigé vers la page de paiement sécurisée PayDunya.',
          }),
        ]),
        el('span', { class: 'shrink-0', html: ui.statusBadge(status) }),
      ]),
    ]);

    if (status === 'paid') {
      card.appendChild(
        el('div', { class: cls.alertSuccess }, [
          el('span', { class: 'shrink-0 mt-0.5', html: icon('check-circle', 'w-5 h-5') }),
          el('div', { class: 'min-w-0' }, [
            el('p', { class: 'font-bold', text: 'Cette facture est déjà réglée.' }),
            el('p', {
              class: 'mt-1 text-sm leading-relaxed',
              text: 'Votre facture est disponible à tout moment depuis son lien permanent.',
            }),
          ]),
        ])
      );
      card.appendChild(
        el('a', {
          href: permanentUrl(invoice),
          class: cls.btnPrimary + ' w-full sm:w-auto',
          html: icon('invoice', 'w-4 h-4') + 'Voir ma facture',
        })
      );
      return card;
    }

    if (status === 'canceled') {
      card.appendChild(
        el('div', { class: cls.alertError }, [
          el('span', { class: 'shrink-0 mt-0.5', html: icon('error', 'w-5 h-5') }),
          el('div', { class: 'min-w-0' }, [
            el('p', { class: 'font-bold', text: 'Cette facture a été annulée.' }),
            el('p', {
              class: 'mt-1 text-sm leading-relaxed',
              text: 'Contactez la boutique si vous pensez qu’il s’agit d’une erreur.',
            }),
          ]),
        ])
      );
      return card;
    }

    if (state.cancelled) {
      card.appendChild(
        el('div', { class: cls.alertInfo }, [
          el('span', { class: 'shrink-0 mt-0.5', html: icon('info', 'w-5 h-5') }),
          el('p', {
            class: 'leading-relaxed',
            text: 'Le précédent paiement a été annulé. Vous pouvez réessayer lorsque vous êtes prêt.',
          }),
        ])
      );
    }

    if (invoice.payment_url) {
      card.appendChild(
        el('a', {
          href: invoice.payment_url,
          class: cls.btnPrimary + ' w-full',
          html:
            icon('card', 'w-5 h-5') +
            (status === 'canceled' || state.cancelled ? 'Réessayer le paiement' : 'Payer maintenant'),
        })
      );
    } else {
      var prepare = el('button', {
        type: 'button',
        class: cls.btnPrimary + ' w-full',
        html: icon('card', 'w-5 h-5') + 'Préparer le paiement',
        onclick: function () {
          if (state.preparing) return;
          state.preparing = true;
          ui.setBusy(prepare, true, 'Préparation…');
          App.api.createPublicPaymentLink(state.token).then(
            function (updated) {
              state.preparing = false;
              state.invoice = updated || state.invoice;
              if (state.invoice && state.invoice.payment_url) {
                window.location.assign(state.invoice.payment_url);
                return;
              }
              renderInvoice();
            },
            function (error) {
              state.preparing = false;
              ui.setBusy(prepare, false);
              ui.toastError(error);
            }
          );
        },
      });
      card.appendChild(prepare);
    }

    card.appendChild(
      el('p', {
        class: 'text-xs leading-relaxed ' + cls.muted,
        text: 'Après confirmation du paiement, votre facture sera téléchargée automatiquement et envoyée par e-mail.',
      })
    );
    return card;
  }

  function renderInvoice() {
    var invoice = state.invoice || {};
    document.title = (invoice.business_name || 'Payer ma facture') + ' · PayDunya';

    var header = el('section', { class: cls.cardPad + ' overflow-hidden relative' }, [
      el('div', { class: 'hero-glow -right-20 -top-20 h-52 w-52', 'aria-hidden': 'true' }),
      el('div', { class: 'relative flex items-center gap-4 min-w-0' }, [
        ui.imageThumb(invoice.business_image_url, {
          size: 'lg',
          rounded: '2xl',
          icon: 'business',
          alt: invoice.business_name ? 'Logo de ' + invoice.business_name : 'Image de la boutique',
        }),
        el('div', { class: 'min-w-0' }, [
          el('p', { class: cls.eyebrow, text: 'Paiement PayDunya' }),
          el('h1', {
            class: 'mt-1 text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 [overflow-wrap:anywhere]',
            text: invoice.business_name || 'Votre commande',
          }),
          el('p', {
            class: cls.mutedSm + ' mt-1',
            text: invoice.customer_name ? 'Bonjour ' + invoice.customer_name + '.' : 'Vérifiez votre commande avant de payer.',
          }),
        ]),
      ]),
    ]);

    var receipt = el('section', { class: cls.cardPad + ' space-y-3' }, [
      el('div', { class: 'flex items-center justify-between gap-3' }, [
        el('div', {}, [
          el('h2', { class: cls.cardTitle, text: 'Conserver votre facture' }),
          el('p', {
            class: cls.mutedSm + ' mt-1 leading-relaxed',
            text: 'Ce lien reste disponible pour consulter votre facture à tout moment.',
          }),
        ]),
        el('span', { class: 'shrink-0 text-cyan-600 dark:text-cyan-400', html: icon('invoice', 'w-5 h-5') }),
      ]),
      el('div', { class: 'flex flex-col sm:flex-row gap-2' }, [
        el('a', {
          href: permanentUrl(invoice),
          class: cls.btnSecondary + ' flex-1',
          html: icon('eye', 'w-4 h-4') + 'Voir la facture',
        }),
        el('button', {
          type: 'button',
          class: cls.btnSecondary,
          html: icon('copy', 'w-4 h-4') + 'Copier le lien',
          onclick: function () {
            ui.copyToClipboard(permanentUrl(invoice), 'Lien permanent copié.');
          },
        }),
      ]),
    ]);

    mount(shell([el('div', { class: 'space-y-5 sm:space-y-6' }, [header, itemsCard(invoice), paymentAction(invoice), receipt])], 'py-6 sm:py-10'));
  }

  function load() {
    if (!state.token) {
      renderMissingToken();
      return Promise.resolve();
    }
    renderLoading();
    return App.api.getPublicInvoice(state.token).then(
      function (invoice) {
        state.invoice = invoice || {};
        renderInvoice();
      },
      function (error) {
        if (error && error.status === 404) renderNotFound();
        else renderFailure(error);
      }
    );
  }

  App.views.payment = {
    render: function (container, params) {
      state.container = container;
      state.invoice = null;
      state.preparing = false;
      state.token = ((params && params.token) || readParam('token') || '').trim();
      state.cancelled = readParam('annule') === '1';
      state.matchError = readParam('erreur') === 'introuvable';
      return load();
    },
  };

  function boot() {
    var toggle = document.getElementById('theme-toggle');
    if (toggle) {
      ui.theme.apply();
      toggle.addEventListener('click', function () {
        ui.theme.toggle();
      });
    }
    var outlet = document.getElementById('payment-view');
    if (outlet) App.views.payment.render(outlet);
  }

  if (document.getElementById('payment-view')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
