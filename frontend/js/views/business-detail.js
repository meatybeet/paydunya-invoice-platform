// View: a single business at #/entreprises/:id.
// Owns the page shell plus the "Historique des paiements" and "Paramètres"
// tabs; the "Produits" tab is delegated to App.views.businessProducts.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;

  var TABS = [
    { key: 'produits', label: 'Produits', short: 'Produits', icon: 'package' },
    { key: 'paiements', label: 'Historique des paiements', short: 'Paiements', icon: 'history' },
    { key: 'parametres', label: 'Paramètres', short: 'Paramètres', icon: 'shield' },
  ];
  var DEFAULT_TAB = 'produits';
  var PAGE_SIZE = 25;
  var NAME_MIN = 2;
  var NAME_MAX = 150;
  var DESCRIPTION_MAX = 1000;

  var STATUS_FILTERS = [
    { value: 'all', label: 'Tous les statuts' },
    { value: 'pending', label: 'En attente' },
    { value: 'paid', label: 'Payées' },
    { value: 'canceled', label: 'Annulées' },
  ];

  // Carries the already-loaded business (and payment history) across a tab
  // change so switching tabs never re-fetches or flashes a skeleton.
  var handoff = null;

  // ---------------------------------------------------------------------------
  // Location helpers
  // ---------------------------------------------------------------------------
  function knownTab(value) {
    for (var index = 0; index < TABS.length; index += 1) {
      if (TABS[index].key === value) return value;
    }
    return null;
  }

  function tabFromQuery(query) {
    var parts = String(query || '').split('&');
    for (var index = 0; index < parts.length; index += 1) {
      var pair = parts[index].split('=');
      if (pair[0] === 'tab') {
        try {
          return knownTab(decodeURIComponent(pair[1] || ''));
        } catch (err) {
          return null;
        }
      }
    }
    return null;
  }

  // The hash router does not strip a query string, so the ":id" param can
  // arrive as "<id>?tab=paiements". Split it back apart here.
  function readLocation(params) {
    var raw = String((params && params.id) || '');
    var id = raw;
    var tab = null;

    var mark = raw.indexOf('?');
    if (mark !== -1) {
      id = raw.slice(0, mark);
      tab = tabFromQuery(raw.slice(mark + 1));
    }

    if (!tab) {
      var hash = String(window.location.hash || '');
      var hashMark = hash.indexOf('?');
      if (hashMark !== -1) tab = tabFromQuery(hash.slice(hashMark + 1));
      else if (/\/produits\/?$/.test(hash)) tab = 'produits';
    }

    return { id: id, tab: tab || DEFAULT_TAB };
  }

  function hashFor(id, tab) {
    var base = App.router.paths.business(id);
    return tab && tab !== DEFAULT_TAB ? base + '?tab=' + tab : base;
  }

  function goToTab(context, tab, focusTabs) {
    if (!knownTab(tab) || tab === context.tab) return;
    handoff = {
      id: context.id,
      business: context.business,
      history: context.history,
      focusTabs: Boolean(focusTabs),
    };
    App.router.navigate(hashFor(context.id, tab));
  }

  /** Absolute URL of the public catalog page for a slug (works on file://). */
  function catalogUrl(slug) {
    var href = window.location.href.split('#')[0].split('?')[0];
    var base = href.replace(/[^/]*$/, '');
    return base + App.config.CATALOG_PAGE + '?slug=' + encodeURIComponent(slug || '');
  }

  function backLink() {
    return ui.el('a', {
      href: App.router.paths.businesses,
      class:
        'inline-flex items-center gap-1.5 text-xs font-semibold ' +
        cls.muted +
        ' hover:text-stone-800 dark:hover:text-stone-100 transition-colors rounded',
      html: ui.icon('back', 'w-4 h-4') + 'Toutes les entreprises',
    });
  }

  // ---------------------------------------------------------------------------
  // Entry point
  // ---------------------------------------------------------------------------
  function render(container, params) {
    var location = readLocation(params);
    var carried = handoff && handoff.id === location.id ? handoff : null;
    handoff = null;

    if (!location.id) {
      ui.mount(container, missingState());
      return;
    }

    if (carried && carried.business) {
      paint(container, location, carried.business, carried);
      return;
    }

    ui.mount(container, loadingShell());

    return App.api.getBusiness(location.id).then(
      function (business) {
        paint(container, location, business, null);
      },
      function (error) {
        ui.mount(container, loadFailure(error));
      }
    );
  }

  function loadingShell() {
    return ui.el('div', { class: cls.page }, [
      backLink(),
      ui.el('div', { class: 'space-y-3', role: 'status', 'aria-label': 'Chargement en cours' }, [
        ui.el('div', { class: 'skeleton h-8 w-2/3 max-w-sm rounded-lg' }),
        ui.el('div', { class: 'skeleton h-4 w-full max-w-md rounded' }),
        ui.el('div', { class: 'flex flex-wrap gap-2 pt-1' }, [
          ui.el('div', { class: 'skeleton h-6 w-24 rounded-full' }),
          ui.el('div', { class: 'skeleton h-6 w-32 rounded-full' }),
        ]),
      ]),
      ui.el(
        'div',
        {
          class:
            'flex gap-6 pb-3 border-b border-stone-200/70 dark:border-stone-800/70 overflow-hidden',
        },
        [
          ui.el('div', { class: 'skeleton h-4 w-20 rounded shrink-0' }),
          ui.el('div', { class: 'skeleton h-4 w-32 rounded shrink-0' }),
          ui.el('div', { class: 'skeleton h-4 w-24 rounded shrink-0' }),
        ]
      ),
      ui.skeleton('card', 3),
    ]);
  }

  function stateWithBack(node) {
    return ui.el('div', { class: cls.page }, [backLink(), node]);
  }

  function missingState() {
    return stateWithBack(
      ui.emptyState({
        icon: 'search',
        title: 'Entreprise inconnue',
        message: "L'adresse utilisée ne désigne aucune entreprise.",
        action: {
          label: 'Retour aux entreprises',
          icon: 'business',
          onClick: function () {
            App.router.navigate(App.router.paths.businesses);
          },
        },
      })
    );
  }

  function loadFailure(error) {
    var status = error && error.status;

    if (status === 404) {
      return stateWithBack(
        ui.emptyState({
          icon: 'business',
          title: 'Entreprise introuvable',
          message:
            "Cette entreprise a été supprimée, ou le lien que vous avez utilisé n'est plus valide.",
          action: {
            label: 'Retour aux entreprises',
            icon: 'business',
            onClick: function () {
              App.router.navigate(App.router.paths.businesses);
            },
          },
        })
      );
    }

    if (status === 403) {
      return stateWithBack(
        ui.emptyState({
          icon: 'lock',
          title: 'Accès refusé',
          message:
            "Vous n'avez pas accès à cette entreprise. Demandez à son propriétaire de vous ajouter comme membre.",
          action: {
            label: 'Retour aux entreprises',
            icon: 'business',
            onClick: function () {
              App.router.navigate(App.router.paths.businesses);
            },
          },
        })
      );
    }

    return stateWithBack(
      ui.errorState({
        title: "Impossible d'afficher cette entreprise",
        message: (error && error.message) || 'Une erreur est survenue. Veuillez réessayer.',
        onRetry: function () {
          App.router.refresh();
        },
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Page assembly
  // ---------------------------------------------------------------------------
  function paint(container, location, business, carried) {
    var context = {
      id: location.id,
      tab: location.tab,
      business: business,
      history: (carried && carried.history) || null,
    };

    var page = ui.el('div', { class: cls.page });
    page.appendChild(buildHeader(context));
    page.appendChild(buildTabBar(context));

    var panel = ui.el('div', {
      id: 'business-tabpanel',
      role: 'tabpanel',
      tabindex: '0',
      'aria-labelledby': 'business-tab-' + context.tab,
      class: 'focus:outline-none',
    });
    page.appendChild(panel);

    ui.mount(container, page);
    renderTabContent(panel, context);

    if (carried && carried.focusTabs) {
      var active = page.querySelector('[role="tab"][aria-selected="true"]');
      if (active) active.focus();
    }
  }

  function buildHeader(context) {
    var business = context.business;
    var head = ui.pageHeader({
      back: { label: 'Toutes les entreprises', href: App.router.paths.businesses },
      title: business.name || 'Entreprise',
      subtitle: business.description || null,
    });

    var row = head.lastElementChild;
    if (row) {
      var titleBlock = row.firstElementChild;
      if (titleBlock) titleBlock.appendChild(buildMeta(context));
      row.appendChild(buildHeaderActions(context));
    }
    return head;
  }

  function relationChip(business) {
    var user = App.session.currentUser() || {};
    if (!user.id) return null;
    if (business.owner_id === user.id) return { label: 'Vous êtes propriétaire', icon: 'shield' };
    if (user.role === 'super_admin') return { label: 'Accès super administrateur', icon: 'shield' };
    if (Array.isArray(business.member_ids) && business.member_ids.indexOf(user.id) !== -1) {
      return { label: 'Membre de l’entreprise', icon: 'user' };
    }
    return null;
  }

  function buildMeta(context) {
    var business = context.business;
    var wrap = ui.el('div', { class: 'flex flex-wrap items-center gap-2 mt-3' });

    wrap.appendChild(ui.fromHTML(ui.visibilityBadge(business.visibility)));

    var relation = relationChip(business);
    if (relation) {
      wrap.appendChild(
        ui.el('span', {
          class: cls.chip,
          html: ui.icon(relation.icon, 'w-3.5 h-3.5 shrink-0') + ui.escapeHtml(relation.label),
        })
      );
    }

    wrap.appendChild(
      ui.el(
        'span',
        {
          class: cls.chip + ' max-w-full min-w-0',
          title: 'Identifiant public : ' + (business.slug || ''),
        },
        [
          ui.fromHTML(ui.icon('link', 'w-3.5 h-3.5 shrink-0')),
          ui.el('span', { class: 'truncate', text: business.slug || 'sans identifiant' }),
        ]
      )
    );

    wrap.appendChild(
      ui.el('span', {
        class: cls.mutedSm,
        text: 'Créée le ' + ui.dateOnly(business.created_at),
      })
    );

    return wrap;
  }

  function buildHeaderActions(context) {
    var business = context.business;
    var row = ui.el('div', { class: 'flex flex-wrap items-center gap-2 shrink-0' });

    if (business.visibility === 'public' && business.slug) {
      var url = catalogUrl(business.slug);

      row.appendChild(
        ui.el('a', {
          href: url,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: cls.btnSecondary,
          html:
            ui.icon('external', 'w-4 h-4') +
            'Voir le catalogue<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span>',
        })
      );

      row.appendChild(
        ui.el('button', {
          type: 'button',
          class: cls.btnIcon,
          title: 'Copier le lien du catalogue',
          'aria-label': 'Copier le lien public du catalogue',
          html: ui.icon('copy', 'w-4 h-4'),
          onclick: function () {
            ui.copyToClipboard(url, 'Lien du catalogue copié.');
          },
        })
      );
    }

    row.appendChild(
      ui.el('button', {
        type: 'button',
        class: cls.btnPrimary,
        html: ui.icon('edit', 'w-4 h-4') + 'Modifier',
        onclick: function () {
          if (context.tab === 'parametres') {
            var field = document.getElementById('business-name');
            if (field) {
              field.focus();
              if (typeof field.select === 'function') field.select();
            }
            return;
          }
          goToTab(context, 'parametres', false);
        },
      })
    );

    return row;
  }

  // ---------------------------------------------------------------------------
  // Tab bar
  // ---------------------------------------------------------------------------
  function buildTabBar(context) {
    var wrap = ui.el('div', {
      class:
        'sticky top-16 z-10 bg-[#fafaf9] dark:bg-[#0c0a09] ' +
        'border-b border-stone-200/70 dark:border-stone-800/70',
    });

    var list = ui.el('div', {
      role: 'tablist',
      'aria-label': 'Sections de l’entreprise',
      class: 'flex items-stretch gap-1 overflow-x-auto no-scrollbar -mb-px',
    });

    TABS.forEach(function (tab) {
      var isActive = tab.key === context.tab;
      list.appendChild(
        ui.el('button', {
          type: 'button',
          role: 'tab',
          id: 'business-tab-' + tab.key,
          'aria-selected': isActive ? 'true' : 'false',
          'aria-controls': 'business-tabpanel',
          tabindex: isActive ? '0' : '-1',
          class:
            'shrink-0 inline-flex items-center gap-2 whitespace-nowrap rounded-t-lg ' +
            'border-b-2 px-3 sm:px-4 py-3 text-sm font-semibold transition-colors ' +
            (isActive
              ? 'border-cyan-600 text-cyan-700 dark:text-cyan-400'
              : 'border-transparent text-stone-500 dark:text-stone-400 ' +
                'hover:text-stone-800 dark:hover:text-stone-100 ' +
                'hover:border-stone-300 dark:hover:border-stone-700'),
          html:
            ui.icon(tab.icon, 'w-4 h-4 shrink-0') +
            '<span class="sm:hidden">' +
            ui.escapeHtml(tab.short) +
            '</span><span class="hidden sm:inline">' +
            ui.escapeHtml(tab.label) +
            '</span>',
          onclick: function () {
            goToTab(context, tab.key, false);
          },
          onkeydown: function (event) {
            onTabKeydown(event, context, tab.key);
          },
        })
      );
    });

    wrap.appendChild(list);
    return wrap;
  }

  function onTabKeydown(event, context, key) {
    var index = -1;
    for (var position = 0; position < TABS.length; position += 1) {
      if (TABS[position].key === key) index = position;
    }
    if (index === -1) return;

    var next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next === null) return;

    event.preventDefault();
    goToTab(context, TABS[next].key, true);
  }

  function renderTabContent(panel, context) {
    var body = ui.el('div', { class: 'pt-5 sm:pt-6' });
    panel.appendChild(body);

    if (context.tab === 'paiements') return renderHistoryTab(body, context);
    if (context.tab === 'parametres') return renderSettingsTab(body, context);
    return renderProductsTab(body, context);
  }

  // ---------------------------------------------------------------------------
  // Tab: Produits (delegated to the sibling view module)
  // ---------------------------------------------------------------------------
  function renderProductsTab(host, context) {
    var module = App.views.businessProducts || App.views['business-products'];

    if (!module || typeof module.renderTab !== 'function') {
      ui.mount(
        host,
        ui.errorState({
          title: 'Section Produits indisponible',
          message:
            'Le catalogue produits n’a pas pu être chargé. Rechargez la page ; si le problème persiste, contactez votre administrateur.',
          onRetry: function () {
            window.location.reload();
          },
        })
      );
      return;
    }

    function fail(error) {
      ui.mount(
        host,
        ui.errorState({
          title: 'Le catalogue produits n’a pas pu s’afficher',
          message: (error && error.message) || 'Une erreur est survenue. Veuillez réessayer.',
          onRetry: function () {
            ui.mount(host, '');
            renderProductsTab(host, context);
          },
        })
      );
    }

    try {
      var result = module.renderTab(host, context.business);
      if (result && typeof result.catch === 'function') result.catch(fail);
    } catch (error) {
      fail(error);
    }
  }

  // ---------------------------------------------------------------------------
  // Tab: Historique des paiements
  // ---------------------------------------------------------------------------
  function renderHistoryTab(host, context) {
    if (context.history) {
      paintHistory(host, context);
      return;
    }

    ui.mount(
      host,
      ui.el('div', { class: 'space-y-5' }, [ui.skeleton('tile', 3), ui.skeleton('row', 5)])
    );

    App.api.listPaymentHistory(context.id).then(
      function (invoices) {
        context.history = Array.isArray(invoices) ? invoices : [];
        paintHistory(host, context);
      },
      function (error) {
        ui.mount(
          host,
          ui.errorState({
            title: 'Historique indisponible',
            message: (error && error.message) || 'Une erreur est survenue. Veuillez réessayer.',
            onRetry: function () {
              renderHistoryTab(host, context);
            },
          })
        );
      }
    );
  }

  function byNewest(first, second) {
    var left = new Date((second && second.created_at) || 0).getTime() || 0;
    var right = new Date((first && first.created_at) || 0).getTime() || 0;
    return left - right;
  }

  function summarize(invoices) {
    var totals = {
      count: invoices.length,
      paid: 0,
      pending: 0,
      paidCount: 0,
      pendingCount: 0,
      canceledCount: 0,
      currency: App.config.DEFAULT_CURRENCY,
    };

    invoices.forEach(function (invoice) {
      var amount = Number(invoice && invoice.amount);
      if (!isFinite(amount)) amount = 0;
      if (invoice && invoice.currency) totals.currency = invoice.currency;

      if (invoice && invoice.status === 'paid') {
        totals.paid += amount;
        totals.paidCount += 1;
      } else if (invoice && invoice.status === 'canceled') {
        totals.canceledCount += 1;
      } else {
        totals.pending += amount;
        totals.pendingCount += 1;
      }
    });

    return totals;
  }

  function statTile(options) {
    return ui.el('div', { class: cls.card + ' p-4 sm:p-5 min-w-0 ' + (options.span || '') }, [
      ui.el('div', { class: 'flex items-center gap-2 min-w-0' }, [
        ui.el('span', {
          class:
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ' + options.skin,
          html: ui.icon(options.icon, 'w-4 h-4'),
        }),
        ui.el('p', { class: cls.eyebrow + ' min-w-0 truncate', text: options.label }),
      ]),
      ui.el('p', {
        class:
          'mt-3 text-xl sm:text-2xl font-extrabold tracking-tight ' +
          'text-stone-900 dark:text-stone-50 [overflow-wrap:anywhere]',
        text: options.value,
      }),
      options.hint ? ui.el('p', { class: cls.mutedSm + ' mt-1', text: options.hint }) : null,
    ]);
  }

  function buildSummary(invoices) {
    var totals = summarize(invoices);
    var grid = ui.el('div', { class: 'grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4' });

    grid.appendChild(
      statTile({
        label: 'Total encaissé',
        value: ui.money(totals.paid, totals.currency),
        hint: ui.plural(totals.paidCount, 'facture payée', 'factures payées'),
        icon: 'check-circle',
        skin: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
      })
    );

    grid.appendChild(
      statTile({
        label: 'En attente',
        value: ui.money(totals.pending, totals.currency),
        hint: ui.plural(totals.pendingCount, 'facture en attente', 'factures en attente'),
        icon: 'history',
        skin: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
      })
    );

    grid.appendChild(
      statTile({
        label: 'Factures',
        value: ui.number(totals.count),
        hint: totals.canceledCount
          ? ui.plural(totals.canceledCount, 'facture annulée', 'factures annulées')
          : 'Aucune facture annulée',
        icon: 'invoice',
        skin: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400',
        span: 'col-span-2 sm:col-span-1',
      })
    );

    return grid;
  }

  function historyEmptyState() {
    return ui.emptyState({
      icon: 'history',
      title: 'Aucun paiement pour le moment',
      message:
        'Les factures créées pour cette entreprise apparaîtront ici, avec leur montant et leur statut de paiement.',
      action: {
        label: 'Voir les factures',
        icon: 'invoice',
        onClick: function () {
          App.router.navigate(App.router.paths.invoices);
        },
      },
    });
  }

  function paintHistory(host, context) {
    var invoices = (context.history || []).slice().sort(byNewest);

    if (!invoices.length) {
      ui.mount(host, historyEmptyState());
      return;
    }

    var state = { status: 'all', limit: PAGE_SIZE, expanded: {} };
    var wrap = ui.el('div', { class: 'space-y-5' });
    wrap.appendChild(buildSummary(invoices));

    var countNode = ui.el('p', { class: cls.mutedSm, 'aria-live': 'polite' });

    var filterSelect = ui.el('select', {
      id: 'history-status-filter',
      class: cls.select,
      onchange: function () {
        state.status = filterSelect.value;
        state.limit = PAGE_SIZE;
        paintList();
      },
    });
    STATUS_FILTERS.forEach(function (option) {
      filterSelect.appendChild(ui.el('option', { value: option.value, text: option.label }));
    });

    wrap.appendChild(
      ui.el(
        'div',
        { class: 'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between' },
        [
          ui.el('div', { class: 'min-w-0' }, [
            ui.el('h2', { class: cls.sectionTitle, text: 'Factures de l’entreprise' }),
            countNode,
          ]),
          ui.el('div', { class: cls.field + ' w-full sm:w-56' }, [
            ui.el('label', {
              class: cls.label,
              for: 'history-status-filter',
              text: 'Filtrer par statut',
            }),
            filterSelect,
          ]),
        ]
      )
    );

    var listHost = ui.el('div');
    wrap.appendChild(listHost);
    ui.mount(host, wrap);

    var media = window.matchMedia('(min-width: 768px)');

    function visibleRows() {
      if (state.status === 'all') return invoices;
      return invoices.filter(function (invoice) {
        return (invoice && invoice.status ? invoice.status : 'pending') === state.status;
      });
    }

    function paintList() {
      var rows = visibleRows();
      countNode.textContent =
        rows.length === invoices.length
          ? ui.plural(rows.length, 'facture')
          : ui.plural(rows.length, 'facture') + ' sur ' + ui.number(invoices.length);

      if (!rows.length) {
        ui.mount(
          listHost,
          ui.emptyState({
            icon: 'filter',
            title: 'Aucune facture avec ce statut',
            message: 'Modifiez le filtre pour retrouver les autres factures de cette entreprise.',
            action: {
              label: 'Afficher toutes les factures',
              icon: 'refresh',
              onClick: function () {
                state.status = 'all';
                filterSelect.value = 'all';
                state.limit = PAGE_SIZE;
                paintList();
              },
            },
          })
        );
        return;
      }

      var shown = rows.slice(0, state.limit);
      var block = ui.el('div', { class: 'space-y-4' }, [
        media.matches ? buildInvoiceTable(shown, state) : buildInvoiceCards(shown, state),
      ]);

      var remaining = rows.length - shown.length;
      if (remaining > 0) {
        block.appendChild(
          ui.el('div', { class: 'flex justify-center' }, [
            ui.el('button', {
              type: 'button',
              class: cls.btnSecondary,
              html:
                ui.icon('chevron-down', 'w-4 h-4') +
                'Afficher ' +
                ui.escapeHtml(ui.plural(Math.min(PAGE_SIZE, remaining), 'facture')) +
                ' de plus',
              onclick: function () {
                state.limit += PAGE_SIZE;
                paintList();
              },
            }),
          ])
        );
      }

      ui.mount(listHost, block);
    }

    // Table on desktop, stacked cards on mobile: two genuinely different
    // layouts, swapped when the breakpoint is crossed.
    function onMediaChange() {
      if (!document.body.contains(listHost)) {
        if (media.removeEventListener) media.removeEventListener('change', onMediaChange);
        else if (media.removeListener) media.removeListener(onMediaChange);
        return;
      }
      paintList();
    }

    if (media.addEventListener) media.addEventListener('change', onMediaChange);
    else if (media.addListener) media.addListener(onMediaChange);

    paintList();
  }

  function contactLine(invoice) {
    return (invoice && (invoice.customer_email || invoice.customer_phone)) || '';
  }

  function itemCount(invoice) {
    return Array.isArray(invoice && invoice.items) ? invoice.items.length : 0;
  }

  /** Detail block shared by the desktop table and the mobile cards. */
  function invoiceDetail(invoice) {
    var items = Array.isArray(invoice.items) ? invoice.items : [];
    var wrap = ui.el('div', { class: cls.surface + ' p-3 sm:p-4 space-y-3' });

    wrap.appendChild(ui.el('p', { class: cls.eyebrow, text: 'Articles de la facture' }));

    if (!items.length) {
      wrap.appendChild(
        ui.el('p', {
          class: cls.mutedSm,
          text: 'Aucun article n’est enregistré sur cette facture.',
        })
      );
    } else {
      var list = ui.el('ul', {
        class: 'divide-y divide-stone-200/70 dark:divide-stone-800/70',
      });

      items.forEach(function (item) {
        var quantity = Number(item && item.quantity);
        var unit = Number(item && item.unit_price);
        if (!isFinite(quantity)) quantity = 0;
        if (!isFinite(unit)) unit = 0;

        list.appendChild(
          ui.el('li', { class: 'flex items-start justify-between gap-3 py-2' }, [
            ui.el('div', { class: 'min-w-0' }, [
              ui.el('p', {
                class:
                  'text-sm font-semibold text-stone-800 dark:text-stone-100 [overflow-wrap:anywhere]',
                text: (item && item.name) || 'Article',
              }),
              ui.el('p', {
                class: cls.mutedSm,
                text: ui.number(quantity) + ' × ' + ui.money(unit, invoice.currency),
              }),
            ]),
            ui.el('p', {
              class: 'text-sm font-bold whitespace-nowrap text-stone-900 dark:text-stone-50',
              text: ui.money(quantity * unit, invoice.currency),
            }),
          ])
        );
      });

      wrap.appendChild(list);
    }

    wrap.appendChild(
      ui.el('div', { class: 'flex items-center justify-between gap-3 pt-3 ' + cls.divider }, [
        ui.el('p', { class: 'text-sm font-semibold ' + cls.muted, text: 'Total de la facture' }),
        ui.el('p', {
          class: 'text-base font-extrabold text-stone-900 dark:text-stone-50 whitespace-nowrap',
          text: ui.money(invoice.amount, invoice.currency),
        }),
      ])
    );

    var actions = ui.el('div', { class: 'flex flex-wrap gap-2' });
    actions.appendChild(
      ui.el('a', {
        href: App.router.paths.invoice(invoice.id),
        class: cls.btnSecondarySm,
        html: ui.icon('invoice', 'w-3.5 h-3.5') + 'Ouvrir la facture',
      })
    );

    if (invoice.payment_url) {
      actions.appendChild(
        ui.el('button', {
          type: 'button',
          class: cls.btnSecondarySm,
          html: ui.icon('copy', 'w-3.5 h-3.5') + 'Copier le lien de paiement',
          onclick: function () {
            ui.copyToClipboard(invoice.payment_url, 'Lien de paiement copié.');
          },
        })
      );
    }

    wrap.appendChild(actions);
    return wrap;
  }

  /** Wire an expand/collapse control to its detail block. */
  function wireToggle(button, detail, invoice, state, options) {
    var settings = options || {};

    function sync(open) {
      detail.hidden = !open;
      button.setAttribute('aria-expanded', open ? 'true' : 'false');

      var chevron = button.querySelector('svg');
      if (chevron) chevron.classList.toggle('rotate-180', open);

      if (settings.labelNode) {
        settings.labelNode.textContent = open ? 'Masquer les articles' : 'Voir les articles';
      }
      if (settings.iconOnly) {
        button.setAttribute(
          'aria-label',
          (open ? 'Masquer' : 'Afficher') +
            ' le détail de la facture de ' +
            (invoice.customer_name || 'ce client')
        );
      }
    }

    button.addEventListener('click', function () {
      var open = !state.expanded[invoice.id];
      state.expanded[invoice.id] = open;
      sync(open);
    });

    sync(Boolean(state.expanded[invoice.id]));
  }

  function buildInvoiceTable(rows, state) {
    var wrap = ui.el('div', { class: cls.tableWrap });
    var table = ui.el('table', { class: cls.table });

    var head = ui.el('thead', { class: cls.thead }, [
      ui.el('tr', {}, [
        ui.el('th', { class: cls.th, scope: 'col', text: 'Client' }),
        ui.el('th', { class: cls.th + ' text-right', scope: 'col', text: 'Montant' }),
        ui.el('th', { class: cls.th, scope: 'col', text: 'Statut' }),
        ui.el('th', { class: cls.th, scope: 'col', text: 'Date' }),
        ui.el('th', { class: cls.th, scope: 'col', text: 'Articles' }),
        ui.el('th', { class: cls.th + ' text-right', scope: 'col' }, [
          ui.el('span', { class: 'sr-only', text: 'Actions' }),
        ]),
      ]),
    ]);

    var body = ui.el('tbody');

    rows.forEach(function (invoice) {
      var detailId = 'invoice-items-' + invoice.id;
      var contact = contactLine(invoice);

      var toggle = ui.el('button', {
        type: 'button',
        class: cls.btnIcon,
        'aria-controls': detailId,
        html: ui.icon('chevron-down', 'w-4 h-4 transition-transform'),
      });

      var row = ui.el('tr', { class: cls.tr }, [
        ui.el('td', { class: cls.td + ' max-w-[16rem]' }, [
          ui.el('p', {
            class: 'font-semibold text-stone-800 dark:text-stone-100 truncate',
            text: invoice.customer_name || 'Client inconnu',
            title: invoice.customer_name || '',
          }),
          contact
            ? ui.el('p', { class: cls.mutedSm + ' truncate', text: contact, title: contact })
            : null,
        ]),
        ui.el('td', {
          class:
            cls.td + ' text-right font-bold whitespace-nowrap text-stone-900 dark:text-stone-50',
          text: ui.money(invoice.amount, invoice.currency),
        }),
        ui.el('td', { class: cls.td }, [ui.fromHTML(ui.statusBadge(invoice.status))]),
        ui.el('td', { class: cls.td + ' whitespace-nowrap' }, [
          ui.el('p', { class: 'text-sm', text: ui.dateTime(invoice.created_at) }),
          ui.el('p', { class: cls.mutedSm, text: ui.timeAgo(invoice.created_at) }),
        ]),
        ui.el('td', { class: cls.td + ' whitespace-nowrap' }, [
          ui.el('span', { class: cls.chip, text: ui.plural(itemCount(invoice), 'article') }),
        ]),
        ui.el('td', { class: cls.td }, [
          ui.el('div', { class: 'flex items-center justify-end gap-1.5' }, [
            ui.el('a', {
              href: App.router.paths.invoice(invoice.id),
              class: cls.btnIcon,
              title: 'Ouvrir la facture',
              'aria-label':
                'Ouvrir la facture de ' + (invoice.customer_name || 'ce client'),
              html: ui.icon('invoice', 'w-4 h-4'),
            }),
            toggle,
          ]),
        ]),
      ]);

      var detailCell = ui.el('td', { class: 'px-4 pb-5 pt-0', colspan: '6', id: detailId }, [
        invoiceDetail(invoice),
      ]);
      var detailRow = ui.el(
        'tr',
        {
          class:
            'bg-stone-50/70 dark:bg-stone-950/40 border-b border-stone-100 dark:border-stone-800/60',
        },
        [detailCell]
      );

      wireToggle(toggle, detailRow, invoice, state, { iconOnly: true });

      body.appendChild(row);
      body.appendChild(detailRow);
    });

    table.appendChild(head);
    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  function buildInvoiceCards(rows, state) {
    var list = ui.el('ul', { class: 'space-y-3' });

    rows.forEach(function (invoice) {
      var detailId = 'invoice-items-mobile-' + invoice.id;
      var contact = contactLine(invoice);

      var detail = ui.el('div', { id: detailId, class: 'mt-3' }, [invoiceDetail(invoice)]);
      var labelNode = ui.el('span', { text: 'Voir les articles' });

      var toggle = ui.el('button', {
        type: 'button',
        class: cls.btnSecondarySm + ' w-full mt-3',
        'aria-controls': detailId,
      });
      toggle.appendChild(ui.fromHTML(ui.icon('chevron-down', 'w-4 h-4 shrink-0 transition-transform')));
      toggle.appendChild(labelNode);

      var card = ui.el('li', { class: cls.card + ' p-4' }, [
        ui.el('div', { class: 'flex items-start justify-between gap-3' }, [
          ui.el('div', { class: 'min-w-0' }, [
            ui.el('p', {
              class:
                'font-bold text-stone-800 dark:text-stone-100 [overflow-wrap:anywhere] leading-snug',
              text: invoice.customer_name || 'Client inconnu',
            }),
            contact
              ? ui.el('p', { class: cls.mutedSm + ' [overflow-wrap:anywhere]', text: contact })
              : null,
          ]),
          ui.el('div', { class: 'shrink-0' }, [ui.fromHTML(ui.statusBadge(invoice.status))]),
        ]),
        ui.el('div', { class: 'mt-3 flex items-end justify-between gap-3 flex-wrap' }, [
          ui.el('p', {
            class:
              'text-xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 ' +
              '[overflow-wrap:anywhere]',
            text: ui.money(invoice.amount, invoice.currency),
          }),
          ui.el('p', { class: cls.mutedSm + ' text-right', text: ui.dateTime(invoice.created_at) }),
        ]),
        ui.el('div', { class: 'mt-3 flex flex-wrap items-center gap-2' }, [
          ui.el('span', { class: cls.chip, text: ui.plural(itemCount(invoice), 'article') }),
          ui.el('a', {
            href: App.router.paths.invoice(invoice.id),
            class: cls.btnGhostSm,
            html: ui.icon('invoice', 'w-3.5 h-3.5') + 'Ouvrir la facture',
          }),
        ]),
        toggle,
        detail,
      ]);

      wireToggle(toggle, detail, invoice, state, { labelNode: labelNode });
      list.appendChild(card);
    });

    return list;
  }

  // ---------------------------------------------------------------------------
  // Tab: Paramètres
  // ---------------------------------------------------------------------------
  function alertBlock(kind, message) {
    return ui.el('div', { class: cls[kind] }, [
      ui.fromHTML('<span class="shrink-0 mt-0.5">' + ui.icon('info', 'w-5 h-5') + '</span>'),
      ui.el('p', { class: 'leading-relaxed [overflow-wrap:anywhere]', text: message }),
    ]);
  }

  function field(options) {
    var wrap = ui.el('div', { class: cls.field });
    var label = ui.el('label', { class: cls.label, for: options.id });
    label.appendChild(document.createTextNode(options.label));
    if (options.required) {
      label.appendChild(
        ui.el('span', { class: cls.labelRequired, text: '*', 'aria-hidden': 'true' })
      );
    }
    wrap.appendChild(label);
    wrap.appendChild(options.control);
    if (options.hint) {
      wrap.appendChild(ui.el('p', { id: options.id + '-hint', class: cls.hint, text: options.hint }));
    }
    if (options.extra) wrap.appendChild(options.extra);
    if (options.error) wrap.appendChild(options.error);
    return wrap;
  }

  function visibilityOption(value, title, description, iconName, checked) {
    var input = ui.el('input', {
      type: 'radio',
      name: 'business-visibility',
      id: 'business-visibility-' + value,
      value: value,
      class: cls.radio + ' mt-1',
    });
    input.checked = checked;

    var label = ui.el('label', { class: cls.checkRow, for: 'business-visibility-' + value }, [
      input,
      ui.el('span', { class: 'min-w-0' }, [
        ui.el('span', {
          class: 'flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100',
          html: ui.icon(iconName, 'w-4 h-4 shrink-0') + ui.escapeHtml(title),
        }),
        ui.el('span', { class: 'block mt-1 ' + cls.hint, text: description }),
      ]),
    ]);

    return { input: input, label: label };
  }

  function renderSettingsTab(host, context) {
    var business = context.business;
    var canManage = App.session.canManageBusiness(business);
    var isAdmin = App.session.isSuperAdmin();
    var wrap = ui.el('div', { class: 'space-y-5 max-w-3xl' });

    // --- Identity form -------------------------------------------------------
    var form = ui.el('form', { class: cls.form, novalidate: true });

    var nameError = ui.el('p', { class: cls.errorText, hidden: true });
    var nameInput = ui.el('input', {
      type: 'text',
      id: 'business-name',
      name: 'name',
      class: cls.input,
      value: business.name || '',
      maxlength: String(NAME_MAX),
      required: true,
      autocomplete: 'organization',
      'aria-describedby': 'business-name-hint',
    });

    var descriptionInput = ui.el('textarea', {
      id: 'business-description',
      name: 'description',
      class: cls.textarea,
      rows: '4',
      maxlength: String(DESCRIPTION_MAX),
      'aria-describedby': 'business-description-hint',
    });
    descriptionInput.value = business.description || '';

    var counter = ui.el('p', { class: cls.hint + ' text-right' });
    function syncCounter() {
      counter.textContent = descriptionInput.value.length + ' / 1 000 caractères';
    }
    descriptionInput.addEventListener('input', syncCounter);
    syncCounter();

    var publicOption = visibilityOption(
      'public',
      'Public',
      'Le catalogue est visible par tout le monde grâce à un lien partageable.',
      'globe',
      business.visibility === 'public'
    );
    var privateOption = visibilityOption(
      'private',
      'Privé',
      'Seuls vous et les membres de l’entreprise peuvent consulter le catalogue.',
      'lock',
      business.visibility !== 'public'
    );

    var slugInput = ui.el('input', {
      type: 'text',
      id: 'business-slug',
      class: cls.input + ' cursor-not-allowed',
      value: business.slug || '',
      readonly: true,
      'aria-describedby': 'business-slug-hint',
    });

    var slugControl = ui.el('div', { class: 'flex items-center gap-2' }, [
      ui.el('div', { class: 'min-w-0 flex-1' }, [slugInput]),
      ui.el('button', {
        type: 'button',
        class: cls.btnIcon,
        title: 'Copier le lien du catalogue',
        'aria-label': 'Copier le lien du catalogue public',
        html: ui.icon('copy', 'w-4 h-4'),
        onclick: function () {
          ui.copyToClipboard(catalogUrl(business.slug), 'Lien du catalogue copié.');
        },
      }),
    ]);

    form.appendChild(
      ui.el('div', {}, [
        ui.el('h2', { class: cls.sectionTitle, text: 'Informations de l’entreprise' }),
        ui.el('p', {
          class: cls.mutedSm + ' mt-1',
          text: 'Ces informations apparaissent sur le catalogue public et sur vos factures.',
        }),
      ])
    );

    form.appendChild(
      field({
        id: 'business-name',
        label: 'Nom de l’entreprise',
        required: true,
        control: nameInput,
        hint: 'Entre 2 et 150 caractères.',
        error: nameError,
      })
    );

    form.appendChild(
      field({
        id: 'business-description',
        label: 'Description',
        control: descriptionInput,
        hint: 'Facultative. Présentez votre activité en quelques phrases.',
        extra: counter,
      })
    );

    form.appendChild(
      field({
        id: 'business-slug',
        label: 'Identifiant public',
        control: slugControl,
        hint:
          'Généré automatiquement à partir du nom, il ne peut pas être modifié. Il sert au lien du catalogue public.',
      })
    );

    form.appendChild(
      ui.el('fieldset', { class: 'space-y-2 min-w-0' }, [
        ui.el('legend', { class: cls.label + ' mb-2', text: 'Visibilité du catalogue' }),
        publicOption.label,
        privateOption.label,
      ])
    );

    // --- Members -------------------------------------------------------------
    var selectedMembers = {};
    (business.member_ids || []).forEach(function (id) {
      selectedMembers[id] = true;
    });

    var membersHost = ui.el('div', { class: 'space-y-3' });
    var membersSection = ui.el('div', { class: 'space-y-3 pt-2 ' + cls.divider }, [
      ui.el('div', { class: 'pt-4' }, [
        ui.el('h2', { class: cls.sectionTitle, text: 'Membres' }),
        ui.el('p', {
          class: cls.mutedSm + ' mt-1',
          text: 'Les membres peuvent gérer le catalogue et les factures de cette entreprise.',
        }),
      ]),
      membersHost,
    ]);
    form.appendChild(membersSection);

    if (isAdmin) {
      loadMembers();
    } else if (canManage) {
      membersHost.appendChild(
        alertBlock(
          'alertInfo',
          'Cette entreprise compte actuellement ' +
            ui.plural((business.member_ids || []).length, 'membre') +
            '. La liste des utilisateurs est réservée au super administrateur : contactez-le pour ajouter ou retirer un membre.'
        )
      );
    } else {
      membersHost.appendChild(
        alertBlock(
          'alertInfo',
          'Seul le propriétaire de l’entreprise, ou un super administrateur, peut gérer les membres et supprimer l’entreprise. Vous pouvez néanmoins modifier le nom, la description et la visibilité.'
        )
      );
    }

    function loadMembers() {
      ui.mount(membersHost, ui.skeleton('row', 3));
      App.api.listUsers().then(
        function (users) {
          paintMembers(Array.isArray(users) ? users : []);
        },
        function (error) {
          ui.mount(
            membersHost,
            ui.errorState({
              title: 'Liste des utilisateurs indisponible',
              message: (error && error.message) || 'Une erreur est survenue. Veuillez réessayer.',
              onRetry: loadMembers,
            })
          );
        }
      );
    }

    function paintMembers(users) {
      var candidates = users.filter(function (user) {
        return user && user.id !== business.owner_id;
      });

      ui.mount(membersHost, '');

      membersHost.appendChild(
        alertBlock(
          'alertInfo',
          'Le propriétaire de l’entreprise garde toujours l’accès : il n’apparaît pas dans cette liste.'
        )
      );

      if (!candidates.length) {
        membersHost.appendChild(
          ui.emptyState({
            icon: 'users',
            title: 'Aucun autre utilisateur',
            message:
              'Créez d’abord des comptes utilisateurs pour pouvoir les ajouter comme membres de cette entreprise.',
            action: {
              label: 'Gérer les utilisateurs',
              icon: 'users',
              onClick: function () {
                App.router.navigate(App.router.paths.users);
              },
            },
          })
        );
        return;
      }

      var summary = ui.el('p', { class: cls.mutedSm, 'aria-live': 'polite' });
      var listHost = ui.el('div', {
        class: 'space-y-2 max-h-80 overflow-y-auto pr-1',
      });

      function syncSummary() {
        var total = 0;
        Object.keys(selectedMembers).forEach(function (id) {
          if (selectedMembers[id]) total += 1;
        });
        summary.textContent = total
          ? ui.plural(total, 'membre sélectionné', 'membres sélectionnés')
          : 'Aucun membre sélectionné';
      }

      function paintRows(query) {
        var needle = String(query || '').trim().toLowerCase();
        var rows = candidates.filter(function (user) {
          if (!needle) return true;
          return (
            String(user.name || '').toLowerCase().indexOf(needle) !== -1 ||
            String(user.email || '').toLowerCase().indexOf(needle) !== -1
          );
        });

        ui.mount(listHost, '');

        if (!rows.length) {
          listHost.appendChild(
            ui.el('p', {
              class: cls.mutedSm + ' px-1 py-4 text-center',
              text: 'Aucun utilisateur ne correspond à cette recherche.',
            })
          );
          return;
        }

        rows.forEach(function (user) {
          var checkbox = ui.el('input', {
            type: 'checkbox',
            class: cls.checkbox + ' mt-1',
            id: 'member-' + user.id,
            value: user.id,
            onchange: function () {
              selectedMembers[user.id] = checkbox.checked;
              syncSummary();
            },
          });
          checkbox.checked = Boolean(selectedMembers[user.id]);

          listHost.appendChild(
            ui.el('label', { class: cls.checkRow, for: 'member-' + user.id }, [
              checkbox,
              ui.el('span', {
                class:
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ' +
                  'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 ' +
                  'text-[11px] font-extrabold',
                text: ui.initials(user.name),
              }),
              ui.el('span', { class: 'min-w-0 flex-1' }, [
                ui.el('span', {
                  class:
                    'block text-sm font-semibold text-stone-800 dark:text-stone-100 truncate',
                  text: user.name || user.email || 'Utilisateur',
                }),
                ui.el('span', {
                  class: 'block ' + cls.mutedSm + ' truncate',
                  text: user.email || '',
                }),
              ]),
              ui.fromHTML('<span class="shrink-0">' + ui.roleBadge(user.role) + '</span>'),
            ])
          );
        });
      }

      if (candidates.length > 6) {
        var search = ui.el('input', {
          type: 'search',
          class: cls.searchInput,
          placeholder: 'Rechercher un utilisateur…',
          'aria-label': 'Rechercher un utilisateur',
        });
        search.addEventListener(
          'input',
          ui.debounce(function () {
            paintRows(search.value);
          }, 200)
        );

        membersHost.appendChild(
          ui.el('div', { class: 'relative' }, [
            ui.fromHTML(
              '<span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">' +
                ui.icon('search', 'w-4 h-4') +
                '</span>'
            ),
            search,
          ])
        );
      }

      membersHost.appendChild(listHost);
      membersHost.appendChild(summary);
      paintRows('');
      syncSummary();
    }

    // --- Actions -------------------------------------------------------------
    var submitButton = ui.el('button', {
      type: 'submit',
      class: cls.btnPrimary + ' w-full sm:w-auto',
      html: ui.icon('check', 'w-4 h-4') + 'Enregistrer les modifications',
    });

    var resetButton = ui.el('button', {
      type: 'button',
      class: cls.btnSecondary + ' w-full sm:w-auto',
      html: ui.icon('refresh', 'w-4 h-4') + 'Annuler',
      onclick: function () {
        nameInput.value = business.name || '';
        descriptionInput.value = business.description || '';
        publicOption.input.checked = business.visibility === 'public';
        privateOption.input.checked = business.visibility !== 'public';
        selectedMembers = {};
        (business.member_ids || []).forEach(function (id) {
          selectedMembers[id] = true;
        });
        if (isAdmin) loadMembers();
        clearNameError();
        syncCounter();
        ui.toast({ message: 'Modifications annulées.', type: 'info' });
      },
    });

    form.appendChild(
      ui.el('div', { class: cls.formActions }, [resetButton, submitButton])
    );

    function clearNameError() {
      nameError.hidden = true;
      nameError.textContent = '';
      nameInput.className = cls.input;
      nameInput.removeAttribute('aria-invalid');
    }

    function showNameError(message) {
      nameError.textContent = message;
      nameError.hidden = false;
      nameInput.className = cls.inputInvalid;
      nameInput.setAttribute('aria-invalid', 'true');
      nameInput.focus();
    }

    nameInput.addEventListener('input', function () {
      if (!nameError.hidden) clearNameError();
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var name = nameInput.value.trim();
      var description = descriptionInput.value.trim();

      if (name.length < NAME_MIN) {
        showNameError('Le nom de l’entreprise doit contenir au moins 2 caractères.');
        return;
      }
      if (name.length > NAME_MAX) {
        showNameError('Le nom de l’entreprise ne doit pas dépasser 150 caractères.');
        return;
      }
      if (description.length > DESCRIPTION_MAX) {
        ui.toast({
          message: 'La description ne doit pas dépasser 1 000 caractères.',
          type: 'warning',
        });
        descriptionInput.focus();
        return;
      }
      clearNameError();

      var payload = {};
      if (name !== (business.name || '')) payload.name = name;
      if (description !== (business.description || '')) {
        payload.description = description || null;
      }

      var visibility = publicOption.input.checked ? 'public' : 'private';
      if (visibility !== business.visibility) payload.visibility = visibility;

      if (canManage) {
        var chosen = Object.keys(selectedMembers)
          .filter(function (id) {
            return selectedMembers[id];
          })
          .sort();
        var current = (business.member_ids || []).slice().sort();
        if (chosen.join(',') !== current.join(',')) payload.member_ids = chosen;
      }

      if (!Object.keys(payload).length) {
        ui.toast({ message: 'Aucune modification à enregistrer.', type: 'info' });
        return;
      }

      var restore = ui.setBusy(submitButton, true, 'Enregistrement…');
      App.api.updateBusiness(context.id, payload).then(
        function (updated) {
          restore();
          ui.toast({ message: 'Les modifications ont été enregistrées.', type: 'success' });
          // Re-render so the header badges, slug and catalog link stay in sync.
          handoff = {
            id: context.id,
            business: updated,
            history: context.history,
            focusTabs: false,
          };
          App.router.refresh();
        },
        function (error) {
          restore();
          ui.toastError(error);
        }
      );
    });

    wrap.appendChild(ui.el('div', { class: cls.cardPad }, [form]));

    // --- Danger zone ---------------------------------------------------------
    if (canManage) wrap.appendChild(buildDangerZone(context));

    ui.mount(host, wrap);
  }

  function buildDangerZone(context) {
    var business = context.business;

    var deleteButton = ui.el('button', {
      type: 'button',
      class: cls.btnDanger + ' w-full sm:w-auto',
      html: ui.icon('trash', 'w-4 h-4') + 'Supprimer l’entreprise',
      onclick: function () {
        ui.confirmDialog({
          danger: true,
          title: 'Supprimer cette entreprise ?',
          message:
            'L’entreprise « ' +
            (business.name || '') +
            ' » ainsi que tous ses produits et catégories seront définitivement supprimés. Cette action est irréversible. Les factures déjà émises sont conservées.',
          confirmLabel: 'Supprimer définitivement',
          cancelLabel: 'Conserver l’entreprise',
        }).then(function (confirmed) {
          if (!confirmed) return;

          var restore = ui.setBusy(deleteButton, true, 'Suppression…');
          App.api.deleteBusiness(context.id).then(
            function () {
              ui.toast({
                message: 'L’entreprise « ' + (business.name || '') + ' » a été supprimée.',
                type: 'success',
              });
              App.router.navigate(App.router.paths.businesses);
            },
            function (error) {
              restore();
              ui.toastError(error);
            }
          );
        });
      },
    });

    return ui.el(
      'div',
      {
        class:
          'bg-white dark:bg-stone-900 border border-rose-200/70 dark:border-rose-900/40 ' +
          'rounded-2xl shadow-sm p-5 sm:p-6 space-y-3',
      },
      [
        ui.el('h2', {
          class: 'text-lg font-bold tracking-tight text-rose-700 dark:text-rose-400',
          text: 'Zone de danger',
        }),
        ui.el('p', {
          class: 'text-sm ' + cls.muted + ' leading-relaxed',
          text:
            'La suppression efface définitivement l’entreprise, son catalogue produits et ses catégories. Son catalogue public ne sera plus accessible.',
        }),
        ui.el('div', { class: 'pt-1' }, [deleteButton]),
      ]
    );
  }

  App.views.businessDetail = { render: render };
})();
