// Dashboard view (#/). Aggregates GET /invoices and GET /businesses into a
// bento grid of KPI tiles, a recent-invoices panel and a status breakdown.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;

  // Single column below md so the whole screen reflows on phones and tablets.
  var KPI_GRID = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5';
  var SPLIT_GRID = 'grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 items-start';

  // Metric type scale: money strings are long in XOF, so they only grow at lg.
  var METRIC =
    'text-2xl lg:text-3xl font-extrabold tracking-tight leading-tight ' +
    'text-stone-900 dark:text-stone-50 [overflow-wrap:anywhere] mt-2';

  var TONE = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400',
    stone: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  };

  var STATUS_ORDER = ['paid', 'pending', 'canceled'];
  var STATUS_BAR = {
    paid: 'bg-emerald-500',
    pending: 'bg-amber-500',
    canceled: 'bg-rose-500',
  };

  // ---------------------------------------------------------------------------
  // Data helpers
  // ---------------------------------------------------------------------------
  function num(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : 0;
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function timestamp(value) {
    var date = new Date(value);
    var time = date.getTime();
    return isNaN(time) ? 0 : time;
  }

  function isThisMonth(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return false;
    var now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  // Never let one rejected call hide the data the other one returned.
  function reflect(promise) {
    return promise.then(
      function (value) {
        return { ok: true, value: value };
      },
      function (error) {
        return { ok: false, error: error };
      }
    );
  }

  function summarize(invoices) {
    var totals = {
      paidAmount: 0,
      pendingAmount: 0,
      counts: { paid: 0, pending: 0, canceled: 0 },
      thisMonth: 0,
      total: invoices.length,
      // The backend only issues XOF, but follow the data when it says otherwise.
      currency: (invoices[0] && invoices[0].currency) || App.config.DEFAULT_CURRENCY,
    };

    invoices.forEach(function (invoice) {
      var amount = num(invoice && invoice.amount);
      var status = invoice && invoice.status;
      if (status === 'paid') {
        totals.paidAmount += amount;
        totals.counts.paid += 1;
      } else if (status === 'canceled') {
        totals.counts.canceled += 1;
      } else {
        // Anything unexpected is treated as outstanding rather than dropped.
        totals.pendingAmount += amount;
        totals.counts.pending += 1;
      }
      if (isThisMonth(invoice && invoice.created_at)) totals.thisMonth += 1;
    });

    return totals;
  }

  // ---------------------------------------------------------------------------
  // Building blocks
  // ---------------------------------------------------------------------------
  function statTile(options) {
    return ui.el('div', { class: cls.card + ' p-5 card-lift min-w-0' }, [
      ui.el('div', { class: 'flex items-start justify-between gap-3' }, [
        ui.el('div', { class: 'min-w-0' }, [
          ui.el('p', { class: cls.eyebrow, text: options.label }),
          ui.el('p', {
            class: METRIC,
            text: options.value,
            title: options.value,
          }),
        ]),
        ui.el('span', {
          class:
            'h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ' +
            (TONE[options.tone] || TONE.stone),
          html: ui.icon(options.icon, 'w-5 h-5'),
        }),
      ]),
      options.hint
        ? ui.el('p', { class: cls.mutedSm + ' mt-3 [overflow-wrap:anywhere]', text: options.hint })
        : null,
    ]);
  }

  function sectionHeader(title, rightNode) {
    return ui.el(
      'div',
      {
        class:
          'flex items-center justify-between gap-3 px-5 py-4 border-b ' +
          'border-stone-200/70 dark:border-stone-800/70',
      },
      [ui.el('h2', { class: cls.cardTitle + ' min-w-0 truncate', text: title }), rightNode]
    );
  }

  function invoiceRow(invoice, businessName) {
    var name = (invoice && invoice.customer_name) || 'Client sans nom';
    var meta = ui.timeAgo(invoice && invoice.created_at);
    if (businessName) meta += ' · ' + businessName;

    return ui.el(
      'a',
      {
        href: App.router.paths.invoice(invoice.id),
        class:
          'flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-stone-100 ' +
          'dark:border-stone-800/60 last:border-0 transition-colors ' +
          'hover:bg-stone-50 dark:hover:bg-stone-800/40 ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ' +
          'focus-visible:ring-cyan-500 focus-visible:bg-cyan-50/60 dark:focus-visible:bg-cyan-500/10',
      },
      [
        ui.el('span', {
          class:
            'h-9 w-9 shrink-0 rounded-xl bg-stone-100 dark:bg-stone-800 ' +
            'text-[11px] font-extrabold text-stone-500 dark:text-stone-400 ' +
            'flex items-center justify-center',
          text: ui.initials(name),
          'aria-hidden': 'true',
        }),
        ui.el('span', { class: 'min-w-0 flex-1' }, [
          ui.el('span', {
            class: 'block text-sm font-bold text-stone-800 dark:text-stone-100 truncate',
            text: name,
          }),
          ui.el('span', { class: 'block ' + cls.mutedSm + ' truncate mt-0.5', text: meta }),
        ]),
        ui.el('span', { class: 'shrink-0 text-right' }, [
          ui.el('span', {
            class: 'block text-sm font-extrabold text-stone-900 dark:text-stone-50 tabular-nums',
            text: ui.money(invoice && invoice.amount, invoice && invoice.currency),
          }),
          ui.fromHTML('<span class="block mt-1">' + ui.statusBadge(invoice && invoice.status) + '</span>'),
        ]),
        ui.el('span', {
          class: 'hidden sm:block shrink-0 text-stone-300 dark:text-stone-700',
          html: ui.icon('chevron', 'w-4 h-4'),
          'aria-hidden': 'true',
        }),
      ]
    );
  }

  function recentPanel(invoices, businessNames, onRefresh) {
    var refreshButton = ui.el('button', {
      type: 'button',
      class: cls.btnIconGhost + ' h-8 w-8',
      'aria-label': 'Actualiser les données du tableau de bord',
      title: 'Actualiser',
      html: ui.icon('refresh', 'w-4 h-4'),
      onclick: onRefresh,
    });

    var headerRight = ui.el('div', { class: 'flex items-center gap-1 shrink-0' }, [
      ui.el('a', {
        href: App.router.paths.invoices,
        class: cls.link + ' text-xs hidden sm:inline-flex',
        text: 'Voir toutes les factures',
      }),
      refreshButton,
    ]);

    var panel = ui.el('section', { class: cls.card + ' overflow-hidden' }, [
      sectionHeader('Factures récentes', headerRight),
    ]);

    if (!invoices.length) {
      panel.appendChild(
        ui.el('div', { class: 'px-5 py-12 text-center' }, [
          ui.el('div', {
            class:
              'h-12 w-12 mx-auto rounded-2xl bg-stone-100 dark:bg-stone-800 ' +
              'text-stone-400 dark:text-stone-500 flex items-center justify-center mb-3',
            html: ui.icon('invoice', 'w-6 h-6'),
            'aria-hidden': 'true',
          }),
          ui.el('p', {
            class: 'text-sm font-bold text-stone-800 dark:text-stone-100',
            text: 'Aucune facture pour le moment',
          }),
          ui.el('p', {
            class: 'text-sm ' + cls.muted + ' mt-1.5 max-w-sm mx-auto leading-relaxed',
            text:
              'Dès que vous émettrez une facture, elle apparaîtra ici avec son statut de paiement.',
          }),
          ui.el('a', {
            href: App.router.paths.invoices,
            class: cls.btnPrimary + ' mt-5',
            html: ui.icon('plus', 'w-4 h-4') + 'Créer une facture',
          }),
        ])
      );
      return panel;
    }

    var rows = ui.el('div', { class: 'flex flex-col' });
    invoices.forEach(function (invoice) {
      rows.appendChild(invoiceRow(invoice, businessNames[invoice && invoice.business_id]));
    });
    panel.appendChild(rows);

    // The "voir tout" link is hidden in the header on phones; repeat it as a
    // full-width footer action so it stays reachable there.
    panel.appendChild(
      ui.el(
        'div',
        {
          class:
            'sm:hidden px-4 py-3 border-t border-stone-200/70 dark:border-stone-800/70 ' +
            'bg-stone-50/60 dark:bg-stone-950/30',
        },
        [
          ui.el('a', {
            href: App.router.paths.invoices,
            class: cls.btnSecondarySm + ' ' + cls.btnBlock,
            html: 'Voir toutes les factures' + ui.icon('chevron', 'w-3.5 h-3.5'),
          }),
        ]
      )
    );

    return panel;
  }

  function breakdownPanel(totals) {
    var panel = ui.el('section', { class: cls.card + ' overflow-hidden' }, [
      sectionHeader('Répartition des factures', null),
    ]);

    var content = ui.el('div', { class: 'px-5 py-5 space-y-4' });

    if (!totals.total) {
      content.appendChild(
        ui.el('p', {
          class: 'text-sm ' + cls.muted + ' leading-relaxed',
          text: 'La répartition par statut s’affichera dès votre première facture.',
        })
      );
      panel.appendChild(content);
      return panel;
    }

    // Proportional flex growth avoids rounding gaps a percentage width leaves.
    var bar = ui.el('div', {
      class: 'flex h-2.5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800',
      'aria-hidden': 'true',
    });
    STATUS_ORDER.forEach(function (status) {
      var count = totals.counts[status];
      if (!count) return;
      bar.appendChild(
        ui.el('span', {
          class: STATUS_BAR[status],
          style: { flex: count + ' 1 0px', minWidth: '4px' },
        })
      );
    });
    content.appendChild(bar);

    var legend = ui.el('ul', { class: 'space-y-2.5' });
    STATUS_ORDER.forEach(function (status) {
      var count = totals.counts[status];
      var percent = Math.round((count / totals.total) * 100);
      legend.appendChild(
        ui.el('li', { class: 'flex items-center gap-2.5' }, [
          ui.el('span', {
            class: 'h-2.5 w-2.5 shrink-0 rounded-full ' + STATUS_BAR[status],
            'aria-hidden': 'true',
          }),
          ui.el('span', {
            class: 'min-w-0 flex-1 truncate text-sm font-semibold text-stone-700 dark:text-stone-200',
            text: ui.statusLabel(status),
          }),
          ui.el('span', {
            class: 'shrink-0 text-sm font-extrabold text-stone-900 dark:text-stone-50 tabular-nums',
            text: ui.number(count),
          }),
          ui.el('span', {
            class: 'shrink-0 w-12 text-right ' + cls.mutedSm + ' tabular-nums',
            text: ui.number(percent) + ' %',
          }),
        ])
      );
    });
    content.appendChild(legend);

    content.appendChild(
      ui.el('p', {
        class: cls.mutedSm + ' pt-3 ' + cls.divider,
        text: ui.plural(totals.total, 'facture') + ' au total',
      })
    );

    panel.appendChild(content);
    return panel;
  }

  function quickActionsPanel() {
    return ui.el('section', { class: cls.cardPad + ' space-y-3' }, [
      ui.el('h2', { class: cls.cardTitle, text: 'Actions rapides' }),
      ui.el('p', {
        class: cls.mutedSm + ' leading-relaxed',
        text: 'Créez une facture payable en ligne ou ajoutez une nouvelle entreprise.',
      }),
      ui.el('div', { class: 'flex flex-col gap-2 pt-1' }, [
        ui.el('a', {
          href: App.router.paths.invoices,
          class: cls.btnPrimary + ' ' + cls.btnBlock,
          html: ui.icon('plus', 'w-4 h-4') + 'Nouvelle facture',
        }),
        ui.el('a', {
          href: App.router.paths.businesses,
          class: cls.btnSecondary + ' ' + cls.btnBlock,
          html: ui.icon('business', 'w-4 h-4') + 'Nouvelle entreprise',
        }),
      ]),
    ]);
  }

  // ---------------------------------------------------------------------------
  // States
  // ---------------------------------------------------------------------------
  function skeletonTile() {
    return ui.fromHTML(
      '<div class="' +
        cls.card +
        ' p-5"><div class="flex items-start justify-between gap-3">' +
        '<div class="flex-1 space-y-3"><div class="skeleton h-3 w-24 rounded"></div>' +
        '<div class="skeleton h-7 w-32 rounded"></div></div>' +
        '<div class="skeleton h-10 w-10 rounded-xl shrink-0"></div></div>' +
        '<div class="skeleton h-3 w-28 rounded mt-4"></div></div>'
    );
  }

  function loadingState() {
    var tiles = ui.el('div', { class: KPI_GRID });
    for (var index = 0; index < 4; index += 1) tiles.appendChild(skeletonTile());

    // The skeleton helpers already expose their own role="status" live region,
    // so this wrapper only carries the busy flag to avoid a double announcement.
    return ui.el(
      'div',
      { class: 'space-y-6', 'aria-busy': 'true' },
      [
        tiles,
        ui.el('div', { class: SPLIT_GRID }, [
          ui.el('div', { class: 'lg:col-span-2 min-w-0' }, [ui.skeleton('row', 5)]),
          ui.el('div', { class: 'min-w-0' }, [ui.skeleton('card', 1)]),
        ]),
      ]
    );
  }

  function welcomeState() {
    return ui.emptyState({
      icon: 'business',
      title: 'Bienvenue sur votre tableau de bord',
      message:
        'Commencez par créer une entreprise et son catalogue de produits, puis émettez ' +
        'votre première facture payable en ligne via PayDunya.',
      action: [
        {
          label: 'Créer une entreprise',
          icon: 'business',
          onClick: function () {
            App.router.navigate(App.router.paths.businesses);
          },
        },
        {
          label: 'Aller aux factures',
          icon: 'invoice',
          variant: 'Secondary',
          onClick: function () {
            App.router.navigate(App.router.paths.invoices);
          },
        },
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------
  function render(container) {
    var user = App.session.currentUser() || {};
    var firstName = String(user.name || '').trim().split(/\s+/)[0];

    var body = ui.el('div', { class: 'space-y-6' });

    ui.mount(
      container,
      ui.el('div', { class: cls.page }, [
        ui.pageHeader({
          title: 'Tableau de bord',
          subtitle: firstName
            ? 'Bonjour ' + firstName + ', voici l’activité de vos factures et de vos entreprises.'
            : 'Vue d’ensemble de vos factures et de vos entreprises.',
          actions: [
            {
              label: 'Nouvelle facture',
              icon: 'plus',
              href: App.router.paths.invoices,
              variant: 'Primary',
            },
            {
              label: 'Nouvelle entreprise',
              icon: 'business',
              href: App.router.paths.businesses,
              variant: 'Secondary',
            },
          ],
        }),
        body,
      ])
    );

    function paint(invoicesResult, businessesResult) {
      // Invoices drive most of the screen: without them there is nothing to show.
      if (!invoicesResult.ok) {
        ui.mount(
          body,
          ui.errorState({
            title: 'Impossible de charger le tableau de bord',
            message:
              (invoicesResult.error && invoicesResult.error.message) ||
              'Une erreur est survenue lors du chargement de vos données.',
            onRetry: load,
          })
        );
        return;
      }

      var invoices = list(invoicesResult.value);
      var businesses = businessesResult.ok ? list(businessesResult.value) : [];
      var businessesFailed = !businessesResult.ok;

      if (!invoices.length && !businesses.length && !businessesFailed) {
        ui.mount(body, welcomeState());
        return;
      }

      var businessNames = {};
      var publicCount = 0;
      businesses.forEach(function (business) {
        if (!business) return;
        businessNames[business.id] = business.name;
        if (business.visibility === 'public') publicCount += 1;
      });

      var totals = summarize(invoices);
      var recent = invoices
        .slice()
        .sort(function (left, right) {
          return timestamp(right && right.created_at) - timestamp(left && left.created_at);
        })
        .slice(0, 6);

      var tiles = ui.el('div', { class: KPI_GRID }, [
        statTile({
          label: 'Chiffre d’affaires encaissé',
          value: ui.money(totals.paidAmount, totals.currency),
          hint: ui.plural(totals.counts.paid, 'facture payée', 'factures payées'),
          icon: 'money',
          tone: 'emerald',
        }),
        statTile({
          label: 'Montant en attente',
          value: ui.money(totals.pendingAmount, totals.currency),
          hint: ui.plural(totals.counts.pending, 'facture à encaisser', 'factures à encaisser'),
          icon: 'history',
          tone: 'amber',
        }),
        statTile({
          label: 'Factures émises',
          value: ui.number(totals.total),
          hint: ui.plural(totals.thisMonth, 'facture ce mois-ci', 'factures ce mois-ci'),
          icon: 'invoice',
          tone: 'cyan',
        }),
        statTile({
          label: 'Entreprises',
          value: businessesFailed ? '—' : ui.number(businesses.length),
          hint: businessesFailed
            ? 'Liste des entreprises indisponible'
            : ui.plural(publicCount, 'catalogue public', 'catalogues publics'),
          icon: 'business',
          tone: 'stone',
        }),
      ]);

      var content = ui.el('div', { class: 'space-y-6' }, [
        tiles,
        ui.el('div', { class: SPLIT_GRID }, [
          ui.el('div', { class: 'lg:col-span-2 min-w-0' }, [
            recentPanel(recent, businessNames, load),
          ]),
          ui.el('div', { class: 'min-w-0 space-y-4 sm:space-y-5' }, [
            breakdownPanel(totals),
            quickActionsPanel(),
          ]),
        ]),
      ]);

      if (businessesFailed) {
        content.insertBefore(
          ui.el('div', { class: cls.alertWarning, role: 'status' }, [
            ui.fromHTML('<span class="shrink-0 mt-0.5">' + ui.icon('warning', 'w-5 h-5') + '</span>'),
            ui.el('span', { class: 'min-w-0 [overflow-wrap:anywhere]' }, [
              (businessesResult.error && businessesResult.error.message) ||
                'Vos entreprises n’ont pas pu être chargées.',
              ' Les chiffres liés aux entreprises sont incomplets.',
            ]),
          ]),
          content.firstChild
        );
      }

      ui.mount(body, content);
    }

    function load() {
      ui.mount(body, loadingState());
      Promise.all([reflect(App.api.listInvoices()), reflect(App.api.listBusinesses())]).then(
        function (results) {
          // The router reuses the same #view node, so the container is always
          // connected. Our own subtree is what gets detached on navigation, and
          // that is the reliable signal that this response is now stale.
          if (!body.isConnected) return;
          paint(results[0], results[1]);
        }
      );
    }

    load();
  }

  App.views.dashboard = { render: render };
})();
