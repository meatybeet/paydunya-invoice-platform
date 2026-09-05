// Public invoice page (facture.html). Standalone, no authentication and no
// router: the unguessable ?token= in the address bar is the credential.
// It is both the permanent link handed to the customer and the page PayDunya
// redirects to after a successful payment (with &auto=1, which starts the
// download by itself).
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;
  var el = ui.el;
  var icon = ui.icon;

  // Horizontal rhythm shared with the page header and footer of facture.html.
  // The print stylesheet targets .receipt-shell to drop the page padding.
  var SHELL = 'receipt-shell mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10';

  var state = {
    container: null,
    token: '',
    auto: false,
    waitingForConfirmation: false,
    matchError: false,
    invoice: null,
    // The automatic download must fire once per page load, never once per render.
    autoDownloadDone: false,
    confirmationPollTimer: null,
    confirmationPollAttempts: 0,
    printHooked: false,
  };

  // ---------------------------------------------------------------------------
  // Query string
  // ---------------------------------------------------------------------------

  function readParam(name) {
    var search = window.location.search || '';
    try {
      return (new URLSearchParams(search).get(name) || '').trim();
    } catch (err) {
      var match = search.match(new RegExp('[?&]' + name + '=([^&]*)'));
      return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')).trim() : '';
    }
  }

  /** Sibling page of facture.html, so the link works from disk and from a domain. */
  function siblingPage(page, token) {
    var path = window.location.pathname || '';
    var base = path.replace(/[^/]*$/, '');
    return base + page + '?token=' + encodeURIComponent(token);
  }

  /** The backend sends permanent_url; fall back to the current address. */
  function permanentUrl(invoice) {
    var value = invoice && invoice.permanent_url ? String(invoice.permanent_url).trim() : '';
    if (value) return value;
    if (window.location.protocol === 'file:') return siblingPage('facture.html', state.token);
    return window.location.origin + siblingPage('facture.html', state.token);
  }

  // ---------------------------------------------------------------------------
  // Downloading and printing
  // ---------------------------------------------------------------------------

  /**
   * Starts the download without a click on a visible control. Browsers are
   * allowed to block this because there is no user gesture behind it, which is
   * exactly why the visible "Télécharger la facture" button is not optional.
   */
  function triggerAutoDownload() {
    if (
      state.autoDownloadDone ||
      !state.token ||
      !state.invoice ||
      state.invoice.status !== 'paid'
    ) {
      return;
    }
    state.autoDownloadDone = true;

    var anchor = el('a', {
      href: App.api.invoiceDownloadUrl(state.token),
      download: true,
      class: 'sr-only',
      tabindex: '-1',
      'aria-hidden': 'true',
    });
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } catch (err) {
      /* blocked: the visible button below is the fallback */
    }
    window.setTimeout(function () {
      if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
    }, 2000);
  }

  // A dark page prints as a black sheet, so the theme is dropped for the job.
  // Registered once so Ctrl+P is covered as well as the button.
  function hookPrintTheme() {
    if (state.printHooked) return;
    state.printHooked = true;
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

  // ---------------------------------------------------------------------------
  // Small building blocks
  // ---------------------------------------------------------------------------

  function shell(extraClass) {
    return el('div', { class: SHELL + (extraClass ? ' ' + extraClass : '') });
  }

  function lineTotal(item) {
    var quantity = Number(item && item.quantity);
    var price = Number(item && item.unit_price);
    return (isFinite(quantity) ? quantity : 0) * (isFinite(price) ? price : 0);
  }

  function definition(label, value) {
    return el('div', { class: 'min-w-0' }, [
      el('dt', { class: cls.eyebrow, text: label }),
      el('dd', {
        class:
          'mt-1 text-sm font-semibold text-stone-800 dark:text-stone-100 ' + cls.breakAnywhere,
        text: value || '—',
      }),
    ]);
  }

  /**
   * Document-shaped loading placeholder. ui.skeleton() only ships dashboard
   * shapes (card grid, stat tiles, list rows), none of which reads as an
   * invoice sheet, so this page composes its own from the same .skeleton class.
   */
  function loadingSkeleton() {
    var wrap = shell('space-y-6');
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', 'Chargement de la facture');
    wrap.setAttribute('aria-busy', 'true');
    wrap.innerHTML =
      '<div class="space-y-3">' +
      '<div class="skeleton h-3 w-24 rounded"></div>' +
      '<div class="skeleton h-8 w-3/4 max-w-xs rounded"></div>' +
      '</div>' +
      '<div class="' +
      cls.card +
      ' p-5 sm:p-6 space-y-4">' +
      '<div class="flex items-start gap-4">' +
      '<div class="skeleton h-14 w-14 rounded-2xl shrink-0"></div>' +
      '<div class="flex-1 space-y-2 min-w-0">' +
      '<div class="skeleton h-3 w-1/3 rounded"></div>' +
      '<div class="skeleton h-3 w-1/2 rounded"></div>' +
      '</div>' +
      '</div>' +
      '<div class="skeleton h-3 w-2/3 rounded"></div>' +
      '<div class="skeleton h-3 w-1/2 rounded"></div>' +
      '</div>' +
      '<div class="' +
      cls.card +
      ' p-5 sm:p-6 space-y-4">' +
      '<div class="skeleton h-3 w-28 rounded"></div>' +
      '<div class="skeleton h-3 w-full rounded"></div>' +
      '<div class="skeleton h-3 w-5/6 rounded"></div>' +
      '<div class="skeleton h-3 w-4/6 rounded"></div>' +
      '<div class="skeleton h-10 w-40 rounded-xl"></div>' +
      '</div>';
    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Invoice document
  // ---------------------------------------------------------------------------

  function titleBlock(invoice) {
    var reference = invoice.receipt_number
      ? 'Facture ' + invoice.receipt_number
      : 'Votre facture';

    return el('div', { class: 'space-y-2' }, [
      el('p', { class: cls.eyebrow, text: 'Document de facturation' }),
      el('h1', {
        class: cls.pageTitle + ' ' + cls.breakAnywhere,
        text: reference,
      }),
      el('p', {
        class: cls.pageSubtitle,
        text:
          (invoice.business_name ? invoice.business_name + ' · ' : '') +
          'Émise le ' +
          ui.dateTime(invoice.created_at),
      }),
    ]);
  }

  /** Download / print / open, kept at the top so they are visible immediately. */
  function actionsCard(invoice) {
    if (invoice.status !== 'paid') {
      return el('section', { class: cls.cardPad + ' space-y-2', 'data-print': 'hide' }, [
        el('h2', { class: cls.cardTitle, text: 'Votre facture' }),
        el('p', {
          class: cls.mutedSm + ' leading-relaxed',
          text: state.waitingForConfirmation
            ? 'Nous attendons la confirmation sécurisée de PayDunya. Le téléchargement démarrera automatiquement dès qu’elle arrivera.'
            : 'Le téléchargement et l’impression seront disponibles dès que le paiement aura été confirmé.',
        }),
      ]);
    }

    var row = el('div', { class: 'flex flex-col sm:flex-row sm:flex-wrap gap-2' });

    row.appendChild(
      el('a', {
        href: App.api.invoiceDownloadUrl(state.token),
        download: true,
        class: cls.btnPrimary + ' w-full sm:w-auto',
        html: icon('upload', 'w-4 h-4 rotate-180') + 'Télécharger la facture',
      })
    );

    row.appendChild(
      el('button', {
        type: 'button',
        class: cls.btnSecondary + ' w-full sm:w-auto',
        html: icon('invoice', 'w-4 h-4') + 'Imprimer',
        onclick: printInvoice,
      })
    );

    row.appendChild(
      el('a', {
        href: App.api.invoiceHtmlUrl(state.token),
        target: '_blank',
        rel: 'noopener noreferrer',
        class: cls.btnSecondary + ' w-full sm:w-auto',
        html: icon('external', 'w-4 h-4') + 'Ouvrir dans un nouvel onglet',
      })
    );

    var card = el('section', { class: cls.cardPad + ' space-y-3', 'data-print': 'hide' }, [
      el('h2', { class: cls.cardTitle, text: 'Votre facture, où que vous soyez' }),
      el('p', {
        class: cls.mutedSm + ' leading-relaxed',
        text:
          'Téléchargez le document, imprimez-le ou ouvrez-le dans un nouvel onglet. ' +
          'Aucune information de paiement ne vous est demandée ici.',
      }),
      row,
    ]);

    if (state.auto && invoice.status === 'paid') {
      // The automatic download can be blocked when it happens with no click
      // behind it, so the customer is told where the manual button is.
      card.insertBefore(
        el('p', { class: cls.alertInfo, role: 'status' }, [
          el('span', { class: 'shrink-0 mt-0.5', html: icon('info', 'w-5 h-5') }),
          el('span', {
            class: 'min-w-0 leading-relaxed',
            text:
              'Le téléchargement démarre automatiquement. S’il ne démarre pas, ' +
              'cliquez sur le bouton « Télécharger la facture » ci-dessous.',
          }),
        ]),
        card.firstChild
      );
    }

    return card;
  }

  /** Status banner: paid confirmation, pending call to action, cancellation. */
  function statusNotice(invoice) {
    if (invoice.status === 'paid') {
      return el('div', { class: cls.alertSuccess, role: 'status' }, [
        el('span', { class: 'shrink-0 mt-0.5', html: icon('check-circle', 'w-5 h-5') }),
        el('div', { class: 'min-w-0 space-y-0.5' }, [
          el('p', { class: 'font-bold', text: 'Paiement confirmé. Merci !' }),
          el('p', {
            class: 'leading-relaxed',
            text: invoice.paid_at
              ? 'Votre règlement a été enregistré le ' + ui.dateTime(invoice.paid_at) + '.'
              : 'Votre règlement a bien été enregistré.',
          }),
        ]),
      ]);
    }

    if (invoice.status === 'canceled') {
      return el('div', { class: cls.alertError, role: 'status' }, [
        el('span', { class: 'shrink-0 mt-0.5', html: icon('error', 'w-5 h-5') }),
        el('div', { class: 'min-w-0 space-y-0.5' }, [
          el('p', { class: 'font-bold', text: 'Cette facture a été annulée.' }),
          el('p', {
            class: 'leading-relaxed',
            text:
              'Elle ne peut plus être réglée. Contactez la boutique si vous pensez ' +
              'qu’il s’agit d’une erreur.',
          }),
        ]),
      ]);
    }

    if (state.waitingForConfirmation) {
      return el('div', { class: cls.alertInfo, role: 'status' }, [
        el('span', { class: 'shrink-0 mt-0.5', html: icon('info', 'w-5 h-5') }),
        el('div', { class: 'min-w-0 space-y-0.5' }, [
          el('p', { class: 'font-bold', text: 'Paiement en cours de confirmation' }),
          el('p', {
            class: 'leading-relaxed',
            text: 'PayDunya confirme généralement le paiement en quelques secondes. Cette page se met à jour automatiquement.',
          }),
        ]),
      ]);
    }

    // Pending: the customer still has to pay, so send them back to payer.html.
    var block = el('div', { class: cls.alertWarning }, [
      el('span', { class: 'shrink-0 mt-0.5', html: icon('warning', 'w-5 h-5') }),
      el('div', { class: 'min-w-0 space-y-2' }, [
        el('div', { class: 'space-y-0.5' }, [
          el('p', { class: 'font-bold', text: 'Cette facture n’est pas encore payée.' }),
          el('p', {
            class: 'leading-relaxed',
            text:
              'Vous pouvez la régler en ligne maintenant, ou conserver ce lien et y revenir ' +
              'plus tard.',
          }),
        ]),
        el('a', {
          href: siblingPage('payer.html', state.token),
          class: cls.btnPrimarySm,
          'data-print': 'hide',
          html: icon('card', 'w-3.5 h-3.5') + 'Payer cette facture',
        }),
      ]),
    ]);
    return block;
  }

  /** Masthead: the shop on one side, the reference and status on the other. */
  function mastheadCard(invoice) {
    var shopName = invoice.business_name || 'Boutique';

    var shopSide = el('div', { class: 'flex items-start gap-3 sm:gap-4 min-w-0' }, [
      ui.imageThumb(invoice.business_image_url, {
        alt: invoice.business_name ? 'Logo de ' + invoice.business_name : '',
        size: 'lg',
        rounded: '2xl',
        icon: 'business',
        class: 'shrink-0',
      }),
      el('div', { class: 'min-w-0 space-y-1' }, [
        el('p', { class: cls.eyebrow, text: 'Vendeur' }),
        el('p', {
          class:
            'text-lg sm:text-xl font-extrabold tracking-tight text-stone-900 ' +
            'dark:text-stone-50 ' +
            cls.breakAnywhere,
          text: shopName,
        }),
        el('p', { class: cls.mutedSm, text: 'Paiement sécurisé par PayDunya' }),
      ]),
    ]);

    var referenceSide = el(
      'div',
      { class: 'flex flex-col gap-2 sm:items-end sm:text-right shrink-0 min-w-0' },
      [
        el('span', { html: ui.statusBadge(invoice.status) }),
        el('div', { class: 'min-w-0' }, [
          el('p', { class: cls.eyebrow, text: 'Numéro de facture' }),
          el('p', {
            class:
              'mt-1 text-base font-extrabold text-stone-900 dark:text-stone-50 ' +
              cls.breakAnywhere,
            text: invoice.receipt_number || 'En attente de numérotation',
          }),
        ]),
      ]
    );

    var facts = el('dl', {
      class: 'grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 mt-5 ' + cls.divider,
    });
    facts.appendChild(definition('Facturé à', invoice.customer_name));
    facts.appendChild(definition('Date d’émission', ui.dateTime(invoice.created_at)));
    facts.appendChild(
      definition(
        invoice.status === 'paid' ? 'Date de paiement' : 'Statut',
        invoice.status === 'paid'
          ? ui.dateTime(invoice.paid_at)
          : ui.statusLabel(invoice.status) || '—'
      )
    );

    return el('section', { class: cls.cardPad }, [
      el(
        'div',
        { class: 'flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between' },
        [shopSide, referenceSide]
      ),
      facts,
    ]);
  }

  /** Line items plus the grand total. */
  function itemsCard(invoice) {
    var items = Array.isArray(invoice.items) ? invoice.items : [];
    var list = el('div', { class: 'divide-y divide-stone-100 dark:divide-stone-800/70' });

    if (!items.length) {
      list.appendChild(
        el('p', {
          class: 'py-5 text-sm ' + cls.muted,
          text: 'Cette facture ne détaille aucun article.',
        })
      );
    }

    items.forEach(function (item) {
      var quantity = Number(item.quantity);
      var price = Number(item.unit_price);
      var meta =
        ui.number(isFinite(quantity) ? quantity : 0) +
        ' × ' +
        ui.money(isFinite(price) ? price : 0, invoice.currency);

      list.appendChild(
        el('div', { class: 'flex items-start justify-between gap-3 sm:gap-4 py-4' }, [
          el('div', { class: 'min-w-0' }, [
            el('p', {
              class: 'font-semibold text-stone-800 dark:text-stone-100 ' + cls.breakAnywhere,
              text: item.name || 'Article',
            }),
            el('p', { class: cls.mutedSm + ' mt-1', text: meta }),
          ]),
          el('p', {
            class:
              'shrink-0 text-sm font-extrabold text-stone-900 dark:text-stone-50 whitespace-nowrap',
            text: ui.money(lineTotal(item), invoice.currency),
          }),
        ])
      );
    });

    return el('section', { class: cls.cardPad }, [
      el('div', { class: 'mb-1 flex items-center justify-between gap-3' }, [
        el('h2', { class: cls.cardTitle, text: 'Détail de la facture' }),
        el('span', {
          class: cls.badgeNeutral,
          text: ui.number(items.length) + ' article' + (items.length > 1 ? 's' : ''),
        }),
      ]),
      list,
      el(
        'div',
        {
          class:
            'flex flex-col gap-1 pt-4 ' +
            cls.divider +
            ' sm:flex-row sm:items-end sm:justify-between sm:gap-4',
        },
        [
          el('p', {
            class: 'text-sm font-bold ' + cls.muted,
            text: invoice.status === 'paid' ? 'Montant payé' : 'Montant total',
          }),
          el('p', {
            class:
              'text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900 ' +
              'dark:text-stone-50 leading-none ' +
              cls.breakAnywhere,
            text: ui.money(invoice.amount, invoice.currency),
          }),
        ]
      ),
    ]);
  }

  /** The permanent link, shown as selectable text with a copy button. */
  function permanentLinkCard(invoice) {
    var url = permanentUrl(invoice);

    var value = el('p', {
      class:
        cls.surface +
        ' px-3.5 py-3 text-xs sm:text-sm font-semibold text-stone-700 dark:text-stone-200 ' +
        'select-all ' +
        cls.breakAnywhere,
      text: url,
    });

    var copyButton = el('button', {
      type: 'button',
      class: cls.btnSecondary + ' w-full sm:w-auto shrink-0',
      html: icon('copy', 'w-4 h-4') + 'Copier le lien',
      onclick: function () {
        ui.copyToClipboard(url, 'Lien de la facture copié.');
      },
    });

    return el(
      'section',
      { class: cls.cardPad + ' space-y-3', 'data-print': 'hide', 'aria-labelledby': 'permanent-link-title' },
      [
        el('h2', {
          id: 'permanent-link-title',
          class: cls.cardTitle,
          text: 'Lien permanent de votre facture',
        }),
        el('p', {
          class: cls.mutedSm + ' leading-relaxed',
          text:
            'Conservez ce lien : il reste valable et vous permet de retrouver, ' +
            'imprimer ou télécharger cette facture à tout moment.',
        }),
        el('div', { class: 'flex flex-col sm:flex-row sm:items-center gap-2' }, [
          el('div', { class: 'min-w-0 flex-1' }, [value]),
          copyButton,
        ]),
      ]
    );
  }

  // ---------------------------------------------------------------------------
  // Full-page states
  // ---------------------------------------------------------------------------

  function renderLoading() {
    ui.mount(state.container, loadingSkeleton());
  }

  function renderInvoice() {
    var invoice = state.invoice || {};
    var wrap = shell('space-y-6 animate-fade-in');

    wrap.appendChild(titleBlock(invoice));
    if (state.matchError) wrap.appendChild(matchErrorNotice());
    wrap.appendChild(statusNotice(invoice));
    wrap.appendChild(actionsCard(invoice));
    wrap.appendChild(mastheadCard(invoice));
    wrap.appendChild(itemsCard(invoice));
    wrap.appendChild(permanentLinkCard(invoice));

    ui.mount(state.container, wrap);

    if (state.auto && invoice.status === 'paid') {
      state.waitingForConfirmation = false;
      clearConfirmationPoll();
      triggerAutoDownload();
    } else if (state.auto && invoice.status !== 'canceled') {
      scheduleConfirmationPoll();
    } else {
      clearConfirmationPoll();
    }
  }

  function clearConfirmationPoll() {
    if (state.confirmationPollTimer) {
      window.clearTimeout(state.confirmationPollTimer);
      state.confirmationPollTimer = null;
    }
  }

  /**
   * The return redirect often reaches the browser a moment before PayDunya's
   * authoritative callback reaches our server. Poll only for an automatic
   * return, stop after one minute, and never download a pending document.
   */
  function scheduleConfirmationPoll() {
    clearConfirmationPoll();
    if (!state.auto || !state.token || state.confirmationPollAttempts >= 24) return;
    state.confirmationPollTimer = window.setTimeout(function () {
      state.confirmationPollTimer = null;
      state.confirmationPollAttempts += 1;
      App.api.getPublicInvoice(state.token).then(
        function (invoice) {
          state.invoice = invoice || state.invoice;
          renderInvoice();
        },
        function () {
          // A temporary network failure should not turn a successful payment
          // into an error screen. Try again while the bounded window remains.
          scheduleConfirmationPoll();
        }
      );
    }, 2500);
  }

  /**
   * The payment provider sent the customer back without an invoice we could
   * match. The money may well have been taken, so the wording must not deny
   * the payment - it points at the link received by e-mail instead.
   */
  function matchErrorNotice() {
    return el('div', { class: cls.alertWarning, role: 'alert' }, [
      el('span', { class: 'shrink-0 mt-0.5', html: icon('warning', 'w-5 h-5') }),
      el('div', { class: 'min-w-0 space-y-0.5' }, [
        el('p', { class: 'font-bold', text: 'Nous n’avons pas pu retrouver votre facture.' }),
        el('p', {
          class: 'leading-relaxed',
          text:
            'Votre paiement a peut-être bien été enregistré. Ouvrez le lien reçu par e-mail ' +
            'pour consulter votre facture, ou contactez la boutique en indiquant la date et ' +
            'le montant de votre paiement.',
        }),
      ]),
    ]);
  }

  function renderMatchError() {
    var wrap = shell('space-y-6 animate-fade-in');
    wrap.appendChild(
      el('div', { class: 'space-y-2' }, [
        el('p', { class: cls.eyebrow, text: 'Document de facturation' }),
        el('h1', { class: cls.pageTitle, text: 'Facture introuvable' }),
      ])
    );
    wrap.appendChild(matchErrorNotice());
    wrap.appendChild(
      ui.emptyState({
        icon: 'mail',
        title: 'Utilisez le lien reçu par e-mail',
        message:
          'Chaque facture possède un lien personnel de la forme facture.html?token=… ' +
          'C’est ce lien qui affiche votre document. Si vous ne le retrouvez pas, ' +
          'demandez-le à la boutique.',
      })
    );
    ui.mount(state.container, wrap);
  }

  function renderMissingToken() {
    var wrap = shell('space-y-6 animate-fade-in');
    wrap.appendChild(
      el('div', { class: 'space-y-2' }, [
        el('p', { class: cls.eyebrow, text: 'Document de facturation' }),
        el('h1', { class: cls.pageTitle, text: 'Lien de facture incomplet' }),
      ])
    );
    wrap.appendChild(
      ui.emptyState({
        icon: 'link',
        title: 'Il manque une partie du lien',
        message:
          'Cette page a besoin du lien complet reçu par e-mail ou transmis par la boutique. ' +
          'Copiez-le entièrement dans la barre d’adresse, puis réessayez.',
      })
    );
    ui.mount(state.container, wrap);
  }

  function renderNotFound() {
    var wrap = shell('space-y-6 animate-fade-in');
    wrap.appendChild(
      el('div', { class: 'space-y-2' }, [
        el('p', { class: cls.eyebrow, text: 'Document de facturation' }),
        el('h1', { class: cls.pageTitle, text: 'Cette facture n’existe pas' }),
      ])
    );
    wrap.appendChild(
      ui.emptyState({
        icon: 'invoice',
        title: 'Lien inconnu ou expiré',
        message:
          'Aucune facture ne correspond à ce lien. Vérifiez que vous l’avez copié en entier, ' +
          'puis contactez la boutique si le problème persiste.',
        action: {
          label: 'Réessayer',
          icon: 'refresh',
          variant: 'Secondary',
          onClick: load,
        },
      })
    );
    ui.mount(state.container, wrap);
  }

  function renderFailure(error) {
    var wrap = shell('space-y-6 animate-fade-in');
    wrap.appendChild(
      el('div', { class: 'space-y-2' }, [
        el('p', { class: cls.eyebrow, text: 'Document de facturation' }),
        el('h1', { class: cls.pageTitle, text: 'Votre facture' }),
      ])
    );
    wrap.appendChild(
      ui.errorState({
        title: 'Impossible d’afficher la facture',
        message:
          (error && error.message) ||
          'Une erreur est survenue. Vérifiez votre connexion, puis réessayez.',
        onRetry: load,
      })
    );
    // The document itself is unreachable, but the download endpoint may still
    // answer, so the customer keeps a way out.
    if (state.token) {
      wrap.appendChild(
        el('section', { class: cls.cardPad + ' space-y-3', 'data-print': 'hide' }, [
          el('h2', { class: cls.cardTitle, text: 'Télécharger quand même' }),
          el('p', {
            class: cls.mutedSm + ' leading-relaxed',
            text:
              'Vous pouvez tenter de télécharger directement le document de facturation ' +
              'sans attendre l’affichage de cette page.',
          }),
          el('a', {
            href: App.api.invoiceDownloadUrl(state.token),
            download: true,
            class: cls.btnPrimary + ' w-full sm:w-auto',
            html: icon('upload', 'w-4 h-4 rotate-180') + 'Télécharger la facture',
          }),
        ])
      );
    }
    ui.mount(state.container, wrap);
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  function load() {
    if (!state.token) {
      document.title = state.matchError
        ? 'Facture introuvable · PayDunya'
        : 'Facture · PayDunya';
      if (state.matchError) renderMatchError();
      else renderMissingToken();
      return Promise.resolve();
    }

    renderLoading();

    return App.api.getPublicInvoice(state.token).then(
      function (invoice) {
        state.invoice = invoice || {};
        document.title =
          (state.invoice.receipt_number
            ? 'Facture ' + state.invoice.receipt_number
            : 'Facture') + ' · PayDunya';
        renderInvoice();
      },
      function (error) {
        if (error && error.status === 404) {
          document.title = 'Facture introuvable · PayDunya';
          renderNotFound();
          return;
        }
        document.title = 'Facture · PayDunya';
        renderFailure(error);
      }
    );
  }

  // ---------------------------------------------------------------------------
  // View module
  // ---------------------------------------------------------------------------

  App.views.receipt = {
    render: function (container, params) {
      state.container = container;
      state.invoice = null;
      state.token = ((params && params.token) || readParam('token') || '').trim();
      state.auto = readParam('auto') === '1';
      state.waitingForConfirmation = readParam('attente') === '1';
      state.matchError = readParam('erreur') === 'introuvable';
      state.autoDownloadDone = false;
      state.confirmationPollAttempts = 0;
      clearConfirmationPoll();
      hookPrintTheme();
      return load();
    },
  };

  // ---------------------------------------------------------------------------
  // Standalone page bootstrap (facture.html has no router)
  // ---------------------------------------------------------------------------

  function boot() {
    var toggle = document.getElementById('theme-toggle');
    if (toggle) {
      ui.theme.apply();
      toggle.addEventListener('click', function () {
        ui.theme.toggle();
      });
    }

    var outlet = document.getElementById('receipt-view');
    if (outlet) App.views.receipt.render(outlet);
  }

  if (document.getElementById('receipt-view')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})();
