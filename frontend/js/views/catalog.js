// Public storefront catalog. Standalone page (catalog.html), no authentication,
// no sidebar. Reads ?slug=<business-slug> from the query string and renders the
// business hero plus its public product grid.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;

  // Horizontal rhythm shared by every section so the full-bleed hero can still
  // align its content with the grid below it.
  var SHELL = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8';

  // The public endpoints expose category_id but never a category name, so a
  // category filter would only ever show opaque identifiers to a visitor.
  // Availability and sorting are the filters that carry real meaning here.
  var SORTS = {
    recent: 'Les plus récents',
    price_asc: 'Prix croissant',
    price_desc: 'Prix décroissant',
    name_asc: 'Nom (A-Z)',
  };

  var LOW_STOCK_THRESHOLD = 5;

  var state = {
    container: null,
    slug: '',
    business: null,
    products: [],
    query: '',
    availability: 'all',
    sort: 'recent',
    resultsEl: null,
    countEl: null,
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Lowercase and strip accents so "cafe" matches "Café". */
  function normalize(text) {
    var value = String(text === null || text === undefined ? '' : text).toLowerCase();
    try {
      value = value.normalize('NFD').replace(/[̀-ͯ]/g, '');
    } catch (err) {
      /* older engines: fall back to the plain lowercase form */
    }
    return value;
  }

  function readSlugFromLocation() {
    var search = window.location.search || '';
    try {
      return (new URLSearchParams(search).get('slug') || '').trim();
    } catch (err) {
      var match = search.match(/[?&]slug=([^&]*)/);
      return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')).trim() : '';
    }
  }

  function catalogUrlFor(slug) {
    var path = window.location.pathname || App.config.CATALOG_PAGE;
    return path + '?slug=' + encodeURIComponent(slug);
  }

  /** Availability derived from the product quantity. */
  function stockMeta(product) {
    // A null quantity means the business does not track stock for this item.
    // Number(null) is 0, which would incorrectly mark every unlimited product
    // as sold out.
    var rawQuantity = product && product.quantity;
    if (rawQuantity === null || rawQuantity === undefined || rawQuantity === '') {
      return { label: 'Disponible', skin: cls.badgeNeutral, hint: '', sold: false };
    }
    var quantity = Number(rawQuantity);
    if (!isFinite(quantity)) {
      return { label: 'Disponible', skin: cls.badgeNeutral, hint: '', sold: false };
    }
    if (quantity <= 0) {
      return {
        label: 'Épuisé',
        skin: cls.badge + ' bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
        hint: 'Actuellement indisponible',
        sold: true,
      };
    }
    if (quantity <= LOW_STOCK_THRESHOLD) {
      return {
        label: 'Stock limité',
        skin: cls.badge + ' bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
        hint: ui.plural(quantity, 'unité') + ' restante' + (quantity > 1 ? 's' : ''),
        sold: false,
      };
    }
    return {
      label: 'En stock',
      skin: cls.badge + ' bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
      hint: ui.plural(quantity, 'unité') + ' disponible' + (quantity > 1 ? 's' : ''),
      sold: false,
    };
  }

  function section(extraClass) {
    return ui.el('div', { class: SHELL + (extraClass ? ' ' + extraClass : '') });
  }

  // ---------------------------------------------------------------------------
  // Filtering & sorting
  // ---------------------------------------------------------------------------

  function visibleProducts() {
    var needle = normalize(state.query).trim();
    var list = state.products.filter(function (product) {
      if (state.availability === 'in_stock') {
        var rawQuantity = product.quantity;
        if (rawQuantity === null || rawQuantity === undefined || rawQuantity === '') return true;
        var quantity = Number(rawQuantity);
        if (isFinite(quantity) && quantity <= 0) return false;
      }
      if (!needle) return true;
      var haystack = normalize(product.name) + ' ' + normalize(product.description);
      return haystack.indexOf(needle) !== -1;
    });

    var sorted = list.slice();
    if (state.sort === 'price_asc' || state.sort === 'price_desc') {
      var direction = state.sort === 'price_asc' ? 1 : -1;
      sorted.sort(function (a, b) {
        return direction * ((Number(a.price) || 0) - (Number(b.price) || 0));
      });
    } else if (state.sort === 'name_asc') {
      sorted.sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''), App.config.LOCALE);
      });
    } else {
      sorted.sort(function (a, b) {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    }
    return sorted;
  }

  // ---------------------------------------------------------------------------
  // Pieces
  // ---------------------------------------------------------------------------

  function productCard(product) {
    var stock = stockMeta(product);

    var card = ui.el('article', {
      class:
        cls.cardLift +
        ' flex h-full flex-col gap-3 animate-slide-up' +
        (stock.sold ? ' border-dashed' : ''),
    });

    card.innerHTML =
      '<div class="flex items-start justify-between gap-3">' +
      '<h3 class="' +
      cls.cardTitle +
      ' clamp-2 [overflow-wrap:anywhere] min-w-0">' +
      ui.escapeHtml(product.name || 'Produit') +
      '</h3>' +
      '<span class="' +
      stock.skin +
      ' shrink-0">' +
      ui.escapeHtml(stock.label) +
      '</span>' +
      '</div>' +
      (product.description
        ? '<p class="text-sm ' +
          cls.muted +
          ' clamp-3 leading-relaxed [overflow-wrap:anywhere]">' +
          ui.escapeHtml(product.description) +
          '</p>'
        : '') +
      '<div class="mt-auto pt-3 border-t border-stone-200/70 dark:border-stone-800/70 ' +
      'flex flex-wrap items-end justify-between gap-x-3 gap-y-1">' +
      '<p class="text-lg sm:text-xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 ' +
      '[overflow-wrap:anywhere]">' +
      ui.escapeHtml(ui.money(product.price)) +
      '</p>' +
      (stock.hint
        ? '<p class="' + cls.mutedSm + ' font-semibold">' + ui.escapeHtml(stock.hint) + '</p>'
        : '') +
      '</div>';

    return card;
  }

  function renderResults() {
    if (!state.resultsEl) return;

    var list = visibleProducts();
    var total = state.products.length;

    if (state.countEl) {
      state.countEl.textContent =
        total === 0
          ? 'Aucun produit publié'
          : list.length === total
          ? ui.plural(total, 'produit')
          : ui.plural(list.length, 'produit') + ' sur ' + ui.number(total);
    }

    if (!total) {
      ui.mount(
        state.resultsEl,
        ui.emptyState({
          icon: 'package',
          title: 'Le catalogue est vide',
          message:
            "Cette entreprise n'a pas encore publié de produit. Revenez un peu plus tard, la sélection arrive bientôt.",
        })
      );
      return;
    }

    if (!list.length) {
      ui.mount(
        state.resultsEl,
        ui.emptyState({
          icon: 'search',
          title: 'Aucun résultat',
          message:
            'Aucun produit ne correspond à votre recherche. Essayez un autre mot-clé ou réinitialisez les filtres.',
          action: {
            label: 'Réinitialiser les filtres',
            icon: 'refresh',
            onClick: resetFilters,
          },
        })
      );
      return;
    }

    var grid = ui.el('div', {
      class: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5',
    });
    list.forEach(function (product) {
      grid.appendChild(productCard(product));
    });
    ui.mount(state.resultsEl, grid);
  }

  function resetFilters() {
    state.query = '';
    state.availability = 'all';
    state.sort = 'recent';

    var search = document.getElementById('catalog-search');
    if (search) {
      search.value = '';
      search.focus();
    }
    var clear = document.getElementById('catalog-search-clear');
    if (clear) clear.hidden = true;
    var availability = document.getElementById('catalog-availability');
    if (availability) availability.value = 'all';
    var sort = document.getElementById('catalog-sort');
    if (sort) sort.value = 'recent';

    renderResults();
  }

  function buildHero(business, productCount) {
    var hero = ui.el('section', {
      class:
        'relative overflow-hidden border-b border-stone-200/70 dark:border-stone-800/70 ' +
        'bg-gradient-to-br from-cyan-50 via-[#fafaf9] to-stone-100 ' +
        'dark:from-cyan-950/40 dark:via-[#0c0a09] dark:to-stone-950',
    });

    hero.appendChild(
      ui.el('div', {
        class: 'hero-glow h-64 w-64 sm:h-96 sm:w-96 -top-24 -right-16 sm:-top-32 sm:-right-24',
        'aria-hidden': 'true',
      })
    );

    var inner = section('relative py-10 sm:py-14 lg:py-20 animate-fade-in');

    var badges = ui.el('div', { class: 'flex flex-wrap items-center gap-2' });
    badges.appendChild(
      ui.fromHTML(
        '<span class="' +
          cls.badgeAccent +
          '">' +
          ui.icon('globe', 'w-3 h-3') +
          'Catalogue public</span>'
      )
    );
    badges.appendChild(
      ui.fromHTML(
        '<span class="' +
          cls.badgeNeutral +
          '">' +
          ui.escapeHtml(ui.plural(productCount, 'produit')) +
          '</span>'
      )
    );
    inner.appendChild(badges);

    inner.appendChild(
      ui.el('h1', {
        class:
          'font-serif text-3xl sm:text-5xl lg:text-6xl leading-tight text-stone-900 ' +
          'dark:text-stone-50 mt-4 [overflow-wrap:anywhere]',
        text: business.name || 'Catalogue',
      })
    );

    if (business.description) {
      inner.appendChild(
        ui.el('p', {
          class:
            'mt-4 max-w-2xl text-base sm:text-lg leading-relaxed text-stone-600 ' +
            'dark:text-stone-300 [overflow-wrap:anywhere]',
          text: business.description,
        })
      );
    }

    var meta = ui.el('div', { class: 'mt-7 flex flex-wrap items-center gap-3' });
    meta.appendChild(
      ui.el('button', {
        type: 'button',
        class: cls.btnSecondary,
        html: ui.icon('link', 'w-4 h-4') + 'Partager le catalogue',
        onclick: function () {
          ui.copyToClipboard(window.location.href, 'Lien du catalogue copié.');
        },
      })
    );
    if (business.updated_at) {
      meta.appendChild(
        ui.el('p', {
          class: cls.mutedSm,
          text: 'Mis à jour ' + ui.timeAgo(business.updated_at),
        })
      );
    }
    inner.appendChild(meta);

    hero.appendChild(inner);
    return hero;
  }

  function buildToolbar() {
    var wrap = ui.el('section', {
      class:
        'md:sticky md:top-16 z-30 border-b border-stone-200/70 dark:border-stone-800/70 ' +
        'bg-[#fafaf9]/90 dark:bg-[#0c0a09]/90 backdrop-blur-xl',
    });

    var inner = section('py-4');
    var form = ui.el('form', {
      class: 'flex flex-col gap-3 md:flex-row md:items-center',
      role: 'search',
      'aria-label': 'Rechercher et filtrer les produits',
      onsubmit: function (event) {
        event.preventDefault();
      },
    });

    // --- Search ---------------------------------------------------------------
    var searchField = ui.el('div', { class: 'relative flex-1 min-w-0' });
    searchField.appendChild(
      ui.el('label', {
        class: 'sr-only',
        for: 'catalog-search',
        text: 'Rechercher un produit',
      })
    );
    searchField.appendChild(
      ui.fromHTML(
        '<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">' +
          ui.icon('search', 'w-5 h-5') +
          '</span>'
      )
    );

    var clearBtn = ui.el('button', {
      type: 'button',
      id: 'catalog-search-clear',
      class: cls.btnIconGhost + ' absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8',
      'aria-label': 'Effacer la recherche',
      html: ui.icon('close', 'w-4 h-4'),
      hidden: true,
      onclick: function () {
        state.query = '';
        var input = document.getElementById('catalog-search');
        if (input) {
          input.value = '';
          input.focus();
        }
        clearBtn.hidden = true;
        renderResults();
      },
    });

    var onSearch = ui.debounce(function (value) {
      state.query = value;
      renderResults();
    }, 180);

    var searchInput = ui.el('input', {
      id: 'catalog-search',
      type: 'search',
      name: 'q',
      class: cls.searchInput + ' pr-11',
      placeholder: 'Rechercher un produit…',
      autocomplete: 'off',
      oninput: function (event) {
        clearBtn.hidden = !event.target.value;
        onSearch(event.target.value);
      },
      onkeydown: function (event) {
        if (event.key === 'Escape' && event.target.value) {
          event.preventDefault();
          event.target.value = '';
          clearBtn.hidden = true;
          state.query = '';
          renderResults();
        }
      },
    });
    searchField.appendChild(searchInput);
    searchField.appendChild(clearBtn);
    form.appendChild(searchField);

    // --- Availability + sort --------------------------------------------------
    var selects = ui.el('div', { class: 'grid grid-cols-2 gap-3 md:flex md:items-center' });

    var availabilityField = ui.el('div', { class: 'min-w-0 md:w-44' });
    availabilityField.appendChild(
      ui.el('label', {
        class: 'sr-only',
        for: 'catalog-availability',
        text: 'Filtrer par disponibilité',
      })
    );
    var availabilitySelect = ui.el(
      'select',
      {
        id: 'catalog-availability',
        class: cls.select,
        onchange: function (event) {
          state.availability = event.target.value;
          renderResults();
        },
      },
      [
        ui.el('option', { value: 'all', text: 'Tous les produits' }),
        ui.el('option', { value: 'in_stock', text: 'En stock uniquement' }),
      ]
    );
    availabilityField.appendChild(availabilitySelect);
    selects.appendChild(availabilityField);

    var sortField = ui.el('div', { class: 'min-w-0 md:w-48' });
    sortField.appendChild(
      ui.el('label', { class: 'sr-only', for: 'catalog-sort', text: 'Trier les produits' })
    );
    var sortSelect = ui.el('select', {
      id: 'catalog-sort',
      class: cls.select,
      onchange: function (event) {
        state.sort = event.target.value;
        renderResults();
      },
    });
    Object.keys(SORTS).forEach(function (key) {
      sortSelect.appendChild(ui.el('option', { value: key, text: SORTS[key] }));
    });
    sortField.appendChild(sortSelect);
    selects.appendChild(sortField);

    form.appendChild(selects);
    inner.appendChild(form);
    wrap.appendChild(inner);
    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Full-page states
  // ---------------------------------------------------------------------------

  function renderLoading() {
    var wrap = ui.el('div');

    var heroSkeleton = ui.el('section', {
      class:
        'border-b border-stone-200/70 dark:border-stone-800/70 ' +
        'bg-gradient-to-br from-cyan-50 via-[#fafaf9] to-stone-100 ' +
        'dark:from-cyan-950/40 dark:via-[#0c0a09] dark:to-stone-950',
    });
    var heroInner = section('py-10 sm:py-14 lg:py-20');
    heroInner.setAttribute('role', 'status');
    heroInner.setAttribute('aria-label', 'Chargement du catalogue');
    heroInner.innerHTML =
      '<div class="skeleton h-6 w-32 rounded-full"></div>' +
      '<div class="skeleton h-10 sm:h-14 w-3/4 max-w-xl rounded-xl mt-5"></div>' +
      '<div class="skeleton h-4 w-full max-w-md rounded mt-5"></div>' +
      '<div class="skeleton h-4 w-2/3 max-w-sm rounded mt-3"></div>' +
      '<div class="skeleton h-11 w-52 rounded-xl mt-7"></div>';
    heroSkeleton.appendChild(heroInner);
    wrap.appendChild(heroSkeleton);

    var body = section('py-8 sm:py-10');
    body.appendChild(ui.skeleton('card', 6));
    wrap.appendChild(body);

    ui.mount(state.container, wrap);
  }

  /** No slug in the URL: explain how the page is meant to be opened. */
  function renderMissingSlug() {
    var wrap = section('py-14 sm:py-20 max-w-2xl');
    var card = ui.el('div', { class: cls.cardPad + ' animate-fade-in' });

    card.appendChild(
      ui.fromHTML(
        '<div class="h-14 w-14 rounded-2xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 ' +
          'dark:text-cyan-400 flex items-center justify-center mb-5">' +
          ui.icon('globe', 'w-7 h-7') +
          '</div>'
      )
    );
    card.appendChild(
      ui.el('h1', { class: cls.pageTitle, text: 'Quel catalogue souhaitez-vous ouvrir ?' })
    );
    card.appendChild(
      ui.el('p', {
        class: cls.pageSubtitle,
        text:
          'Cette page affiche le catalogue public d’une entreprise. Ajoutez son identifiant à ' +
          'l’adresse, par exemple catalog.html?slug=ma-boutique, ou saisissez-le ci-dessous.',
      })
    );

    var form = ui.el('form', { class: 'mt-6 space-y-4' });
    var field = ui.el('div', { class: cls.field });
    field.appendChild(
      ui.el('label', {
        class: cls.label,
        for: 'catalog-slug',
        text: 'Identifiant de l’entreprise',
      })
    );
    var input = ui.el('input', {
      id: 'catalog-slug',
      type: 'text',
      class: cls.input,
      placeholder: 'ma-boutique',
      autocomplete: 'off',
      autocapitalize: 'none',
      spellcheck: 'false',
    });
    field.appendChild(input);
    var error = ui.el('p', { class: cls.errorText, hidden: true, role: 'alert' });
    field.appendChild(error);
    field.appendChild(
      ui.el('p', {
        class: cls.hint,
        text: 'L’identifiant se trouve dans le lien de partage fourni par l’entreprise.',
      })
    );
    form.appendChild(field);

    form.appendChild(
      ui.el('button', {
        type: 'submit',
        class: cls.btnPrimary + ' ' + cls.btnBlock + ' sm:w-auto',
        html: ui.icon('search', 'w-4 h-4') + 'Ouvrir le catalogue',
      })
    );

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = input.value.trim();
      if (!value) {
        error.textContent = 'Veuillez saisir l’identifiant de l’entreprise.';
        error.hidden = false;
        input.className = cls.inputInvalid;
        input.focus();
        return;
      }
      window.location.href = catalogUrlFor(value);
    });
    input.addEventListener('input', function () {
      error.hidden = true;
      input.className = cls.input;
    });

    card.appendChild(form);
    wrap.appendChild(card);
    ui.mount(state.container, wrap);
  }

  /** 404: the business does not exist, or its catalog is private. */
  function renderUnavailable() {
    var wrap = section('py-14 sm:py-20');
    wrap.appendChild(
      ui.emptyState({
        icon: 'lock',
        title: 'Catalogue indisponible',
        message:
          'Ce catalogue n’existe pas ou n’est plus public. Vérifiez le lien reçu, ou demandez à ' +
          'l’entreprise de le partager à nouveau.',
        action: [
          {
            label: 'Réessayer',
            icon: 'refresh',
            onClick: load,
          },
          {
            label: 'Changer d’identifiant',
            variant: 'Secondary',
            onClick: function () {
              state.slug = '';
              renderMissingSlug();
            },
          },
        ],
      })
    );
    ui.mount(state.container, wrap);
  }

  function renderFailure(error) {
    var wrap = section('py-14 sm:py-20');
    wrap.appendChild(
      ui.errorState({
        title: 'Impossible d’afficher le catalogue',
        message: (error && error.message) || 'Une erreur est survenue. Veuillez réessayer.',
        onRetry: load,
      })
    );
    ui.mount(state.container, wrap);
  }

  function renderCatalog() {
    var wrap = ui.el('div');
    wrap.appendChild(buildHero(state.business, state.products.length));
    wrap.appendChild(buildToolbar());

    var body = section('py-8 sm:py-10 space-y-5');
    var head = ui.el('div', {
      class: 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1',
    });
    head.appendChild(ui.el('h2', { class: cls.sectionTitle, text: 'Nos produits' }));
    state.countEl = ui.el('p', {
      class: cls.mutedSm + ' font-semibold',
      'aria-live': 'polite',
    });
    head.appendChild(state.countEl);
    body.appendChild(head);

    state.resultsEl = ui.el('div');
    body.appendChild(state.resultsEl);
    wrap.appendChild(body);

    ui.mount(state.container, wrap);
    renderResults();
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  function load() {
    if (!state.slug) {
      renderMissingSlug();
      return Promise.resolve();
    }

    renderLoading();

    return Promise.all([
      App.api.getPublicBusiness(state.slug),
      App.api.listPublicProducts(state.slug),
    ]).then(
      function (results) {
        state.business = results[0] || {};
        state.products = Array.isArray(results[1]) ? results[1] : [];
        if (state.business.name) {
          document.title = state.business.name + ' · Catalogue PayDunya';
        }
        renderCatalog();
      },
      function (error) {
        if (error && error.status === 404) {
          document.title = 'Catalogue indisponible · PayDunya';
          renderUnavailable();
          return;
        }
        renderFailure(error);
      }
    );
  }

  // ---------------------------------------------------------------------------
  // View module
  // ---------------------------------------------------------------------------

  App.views.catalog = {
    render: function (container, params) {
      state.container = container;
      state.business = null;
      state.products = [];
      state.query = '';
      state.availability = 'all';
      state.sort = 'recent';
      state.slug = ((params && params.slug) || readSlugFromLocation() || '').trim();
      return load();
    },
  };

  // ---------------------------------------------------------------------------
  // Standalone page bootstrap (catalog.html has no router)
  // ---------------------------------------------------------------------------

  function boot() {
    var toggle = document.getElementById('theme-toggle');
    if (toggle) {
      ui.theme.apply();
      toggle.addEventListener('click', function () {
        ui.theme.toggle();
      });
    }

    var outlet = document.getElementById('catalog-view');
    if (outlet) App.views.catalog.render(outlet);
  }

  if (document.getElementById('catalog-view')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})();
