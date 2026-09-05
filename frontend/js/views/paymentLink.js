// View: payment-link builder at #/lien-de-paiement.
// An administrator picks a business, fills a basket from that business catalog,
// adds the customer details, and gets back a shareable payer.html link to send.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;
  var el = ui.el;
  var icon = ui.icon;

  var CURRENCY = App.config.DEFAULT_CURRENCY;
  var MIN_AMOUNT = App.config.MIN_INVOICE_AMOUNT;
  var MAX_QUANTITY = 9999;
  var PAGE_SIZE = 24;

  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  var PHONE_PATTERN = /^[+]?[0-9\s().-]{6,20}$/;

  // The draft survives a navigation away from the builder (checking a product,
  // opening a business) so a half-built basket is never lost. Cleared once an
  // invoice has actually been created.
  var draft = { businessId: null, lines: [], customer: { name: '', email: '', phone: '' } };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function normalize(text) {
    var value = String(text === null || text === undefined ? '' : text).toLowerCase();
    if (value.normalize) value = value.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return value;
  }

  function toInt(value) {
    var num = parseInt(String(value).replace(/[^\d]/g, ''), 10);
    return isFinite(num) ? num : NaN;
  }

  function clampQuantity(value) {
    var num = toInt(value);
    if (!isFinite(num) || num < 1) return 1;
    if (num > MAX_QUANTITY) return MAX_QUANTITY;
    return num;
  }

  function price(product) {
    var value = Number(product && product.price);
    return isFinite(value) ? value : 0;
  }

  /** Public link handed to the customer. */
  function shareLink(token) {
    var origin = window.location.origin;
    // Opened straight from disk the origin is "null": payer.html will actually
    // be served by the API host, so fall back to it.
    if (!origin || origin === 'null' || window.location.protocol === 'file:') {
      origin = App.config.API_ROOT;
    }
    return origin + '/payer.html?token=' + encodeURIComponent(token);
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function scrollToNode(node) {
    if (!node) return;
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
    if (typeof node.focus === 'function') {
      try {
        node.focus({ preventScroll: true });
      } catch (err) {
        node.focus();
      }
    }
  }

  function stepBadge(label) {
    return el('span', { class: cls.badgeAccent + ' shrink-0', text: label });
  }

  // ---------------------------------------------------------------------------
  // Text field with inline French validation.
  // ---------------------------------------------------------------------------
  var fieldSeq = 0;

  function textField(options) {
    var opts = options || {};
    fieldSeq += 1;
    var id = 'payment-link-field-' + fieldSeq;
    var errorId = id + '-error';
    var hintId = id + '-hint';

    var describedBy = opts.hint ? hintId : '';

    var input = el('input', {
      id: id,
      type: opts.type || 'text',
      class: cls.input,
      value: opts.value || '',
      placeholder: opts.placeholder || null,
      autocomplete: opts.autocomplete || 'off',
      inputmode: opts.inputmode || null,
      maxlength: opts.maxlength || null,
      'aria-required': opts.required ? 'true' : null,
      'aria-describedby': describedBy || null,
    });

    var error = el('p', { id: errorId, class: cls.errorText, role: 'alert' });
    error.hidden = true;

    var label = el('label', { class: cls.label, for: id }, [
      opts.label || '',
      opts.required
        ? el('span', { class: cls.labelRequired, text: '*', 'aria-hidden': 'true' })
        : null,
    ]);

    var wrap = el('div', { class: cls.field }, [
      label,
      input,
      error,
      opts.hint ? el('p', { id: hintId, class: cls.hint, text: opts.hint }) : null,
    ]);

    function setError(message) {
      input.className = cls.inputInvalid;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', (errorId + ' ' + describedBy).trim());
      error.textContent = message;
      error.hidden = false;
    }

    function clearError() {
      input.className = cls.input;
      input.removeAttribute('aria-invalid');
      if (describedBy) input.setAttribute('aria-describedby', describedBy);
      else input.removeAttribute('aria-describedby');
      error.textContent = '';
      error.hidden = true;
    }

    input.addEventListener('input', clearError);

    return {
      element: wrap,
      input: input,
      value: function () {
        return input.value.trim();
      },
      setError: setError,
      clearError: clearError,
    };
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------
  function render(container, params) {
    var query = params || {};

    var state = {
      businesses: [],
      businessId: null,
      products: [],
      productsState: 'idle', // idle | loading | ready | error
      productsError: '',
      lines: [], // [{id, quantity}] - order is the order the user picked
      search: '',
      visible: PAGE_SIZE,
      submitting: false,
    };

    // A business handed over in the hash query wins over the remembered draft.
    var requested = query.entreprise ? String(query.entreprise) : '';
    if (requested && requested !== draft.businessId) {
      draft.businessId = requested;
      draft.lines = [];
    }
    state.businessId = draft.businessId || null;
    state.lines = Array.isArray(draft.lines) ? draft.lines.slice() : [];

    var page = el('div', { class: cls.page });
    ui.mount(container, page);

    var generation = 0;

    function header() {
      return ui.pageHeader({
        title: 'Lien de paiement',
        subtitle:
          'Composez une commande à partir de votre catalogue, puis envoyez le lien de paiement ' +
          'à votre client. Il règle en ligne et reçoit sa facture par e-mail.',
      });
    }

    function productIndex() {
      var index = {};
      state.products.forEach(function (product) {
        index[product.id] = product;
      });
      return index;
    }

    function basketTotal() {
      var index = productIndex();
      var total = 0;
      state.lines.forEach(function (line) {
        var product = index[line.id];
        if (product) total += price(product) * line.quantity;
      });
      return total;
    }

    function findLine(productId) {
      for (var i = 0; i < state.lines.length; i += 1) {
        if (state.lines[i].id === productId) return state.lines[i];
      }
      return null;
    }

    function quantityOf(productId) {
      var line = findLine(productId);
      return line ? line.quantity : 0;
    }

    function rememberDraft() {
      draft.businessId = state.businessId;
      draft.lines = state.lines.slice();
    }

    // ------------------------------------------------------------- data loading
    function loadBusinesses() {
      ui.mount(page, [header(), ui.skeleton('form', 1), ui.skeleton('row', 4)]);

      App.api.listBusinesses().then(
        function (businesses) {
          state.businesses = Array.isArray(businesses) ? businesses : [];
          if (!state.businesses.length) {
            mountNoBusiness();
            return;
          }
          // A remembered (or requested) business the user can no longer reach
          // must not stay selected.
          var known = state.businesses.some(function (business) {
            return business.id === state.businessId;
          });
          if (!known) {
            state.businessId = null;
            state.lines = [];
            rememberDraft();
          }
          mountBuilder();
        },
        function (error) {
          ui.mount(page, [
            header(),
            ui.errorState({
              title: 'Vos entreprises n’ont pas pu être chargées',
              message: (error && error.message) || 'Une erreur est survenue. Veuillez réessayer.',
              onRetry: loadBusinesses,
            }),
          ]);
        }
      );
    }

    function mountNoBusiness() {
      ui.mount(page, [
        header(),
        ui.emptyState({
          icon: 'business',
          title: 'Aucune entreprise accessible',
          message:
            'Un lien de paiement se construit à partir du catalogue d’une entreprise. ' +
            'Créez une entreprise, ou demandez au propriétaire de vous ajouter comme membre.',
          action: [
            {
              label: 'Voir les entreprises',
              icon: 'business',
              onClick: function () {
                App.router.navigate(App.router.paths.businesses);
              },
            },
          ],
        }),
      ]);
    }

    function loadProducts(businessId) {
      generation += 1;
      var token = generation;
      state.productsState = 'loading';
      state.products = [];
      state.visible = PAGE_SIZE;
      renderCatalog();
      renderSummary();

      App.api.listProducts(businessId).then(
        function (products) {
          if (token !== generation || state.businessId !== businessId) return;
          state.products = Array.isArray(products) ? products : [];
          state.productsState = 'ready';
          dropMissingLines();
          renderCatalog();
          renderSummary();
        },
        function (error) {
          if (token !== generation || state.businessId !== businessId) return;
          state.productsState = 'error';
          state.productsError =
            (error && error.message) || 'Le catalogue n’a pas pu être chargé. Veuillez réessayer.';
          renderCatalog();
          renderSummary();
        }
      );
    }

    /** A remembered line whose product was deleted meanwhile is dropped. */
    function dropMissingLines() {
      if (!state.lines.length) return;
      var index = productIndex();
      var kept = state.lines.filter(function (line) {
        return Boolean(index[line.id]);
      });
      if (kept.length === state.lines.length) return;
      var removed = state.lines.length - kept.length;
      state.lines = kept;
      rememberDraft();
      ui.toast({
        message:
          removed > 1
            ? removed + ' produits enregistrés ne sont plus au catalogue : ils ont été retirés.'
            : 'Un produit enregistré n’est plus au catalogue : il a été retiré du récapitulatif.',
        type: 'warning',
      });
    }

    // --------------------------------------------------------------- basket ops
    var rowPainters = {};

    function setQuantity(productId, quantity, options) {
      var opts = options || {};
      var line = findLine(productId);
      var value = Number(quantity);

      if (!isFinite(value) || value < 1) {
        if (line) {
          state.lines = state.lines.filter(function (item) {
            return item.id !== productId;
          });
        }
      } else if (line) {
        line.quantity = Math.min(MAX_QUANTITY, Math.round(value));
      } else {
        state.lines.push({ id: productId, quantity: Math.min(MAX_QUANTITY, Math.round(value)) });
      }

      rememberDraft();
      if (rowPainters[productId] && !opts.skipRow) rowPainters[productId](opts);
      renderSummary(opts);
    }

    function clearBasket() {
      ui.confirmDialog({
        title: 'Vider le récapitulatif',
        message: 'Tous les produits sélectionnés seront retirés. Vous pourrez les rechoisir ensuite.',
        confirmLabel: 'Vider',
        cancelLabel: 'Conserver',
        danger: true,
      }).then(function (confirmed) {
        if (!confirmed) return;
        var ids = state.lines.map(function (line) {
          return line.id;
        });
        state.lines = [];
        rememberDraft();
        ids.forEach(function (id) {
          if (rowPainters[id]) rowPainters[id]();
        });
        renderSummary();
      });
    }

    // ------------------------------------------------------------------- shell
    var businessSelect = null;
    var businessHint = null;
    var catalogBody = null;
    var catalogCount = null;
    var searchInput = null;
    var summaryBody = null;
    var summaryCard = null;
    var totalLabel = null;
    var minNote = null;
    var submitButton = null;
    var submitReason = null;
    var mobileBar = null;
    var mobileBarTotal = null;
    var mobileBarCount = null;
    var mobileSpacer = null;
    var nameField = null;
    var emailField = null;
    var phoneField = null;

    function buildBusinessCard() {
      businessSelect = el('select', {
        class: cls.select,
        id: 'payment-link-business',
        'aria-describedby': 'payment-link-business-hint',
      });
      businessSelect.appendChild(
        el('option', { value: '', text: '— Choisissez une entreprise —' })
      );
      state.businesses.forEach(function (business) {
        businessSelect.appendChild(el('option', { value: business.id, text: business.name }));
      });
      businessSelect.value = state.businessId || '';

      businessHint = el('p', {
        id: 'payment-link-business-hint',
        class: cls.hint,
        text: 'Les produits et les prix proviennent du catalogue de cette entreprise.',
      });

      businessSelect.addEventListener('change', function () {
        var nextId = businessSelect.value;
        if (nextId === state.businessId) return;

        function apply() {
          state.businessId = nextId || null;
          state.lines = [];
          state.search = '';
          if (searchInput) searchInput.value = '';
          rememberDraft();
          rowPainters = {};
          if (!state.businessId) {
            state.products = [];
            state.productsState = 'idle';
            renderCatalog();
            renderSummary();
            return;
          }
          loadProducts(state.businessId);
        }

        if (!state.lines.length) {
          apply();
          return;
        }
        // Product ids belong to a single business: switching empties the basket.
        ui.confirmDialog({
          title: 'Changer d’entreprise',
          message:
            'Les produits déjà sélectionnés appartiennent à l’entreprise actuelle. ' +
            'Changer d’entreprise videra le récapitulatif.',
          confirmLabel: 'Changer',
          cancelLabel: 'Annuler',
        }).then(function (confirmed) {
          if (!confirmed) {
            businessSelect.value = state.businessId || '';
            return;
          }
          apply();
        });
      });

      return el('section', { class: cls.cardPad + ' space-y-4' }, [
        el('div', { class: 'flex items-center gap-3' }, [
          stepBadge('Étape 1'),
          el('h2', { class: cls.sectionTitle, text: 'Entreprise' }),
        ]),
        el('div', { class: cls.field }, [
          el('label', {
            class: cls.label,
            for: 'payment-link-business',
            text: 'Entreprise facturée',
          }),
          businessSelect,
          businessHint,
        ]),
      ]);
    }

    // ----------------------------------------------------------------- catalog
    function filteredProducts() {
      var needle = normalize(state.search).trim();
      if (!needle) return state.products;
      return state.products.filter(function (product) {
        return (
          normalize(product.name).indexOf(needle) !== -1 ||
          normalize(product.description).indexOf(needle) !== -1
        );
      });
    }

    function quantityStepper(product, compact) {
      var quantity = quantityOf(product.id);

      var minusLabel =
        quantity > 1
          ? 'Diminuer la quantité de ' + product.name
          : 'Retirer ' + product.name + ' du récapitulatif';

      var minus = el('button', {
        type: 'button',
        class: cls.btnIconGhost,
        'aria-label': minusLabel,
        onclick: function () {
          setQuantity(product.id, quantity - 1, { focus: quantity - 1 < 1 ? 'add' : 'minus' });
        },
      });
      minus.appendChild(
        el('span', {
          class: 'block h-[1.7px] w-3.5 rounded-full bg-current',
          'aria-hidden': 'true',
        })
      );

      var input = el('input', {
        type: 'text',
        inputmode: 'numeric',
        pattern: '[0-9]*',
        value: String(quantity),
        class:
          'h-9 w-11 shrink-0 rounded-lg border-0 bg-transparent text-center text-sm font-bold ' +
          'text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50',
        'aria-label': 'Quantité pour ' + product.name,
      });
      input.addEventListener('input', function () {
        var typed = toInt(input.value);
        if (!isFinite(typed) || typed < 1) return; // let the user clear the field
        setQuantity(product.id, typed, { skipRow: true, silent: true });
      });
      input.addEventListener('blur', function () {
        var clamped = clampQuantity(input.value);
        input.value = String(clamped);
        setQuantity(product.id, clamped);
      });

      var plus = el('button', {
        type: 'button',
        class: cls.btnIconGhost,
        'aria-label': 'Augmenter la quantité de ' + product.name,
        html: icon('plus', 'w-4 h-4'),
        disabled: quantity >= MAX_QUANTITY,
        onclick: function () {
          setQuantity(product.id, quantity + 1, { focus: 'plus' });
        },
      });

      var wrap = el(
        'div',
        {
          class:
            'inline-flex items-center rounded-xl border border-stone-200 dark:border-stone-800 ' +
            'bg-white dark:bg-stone-900 p-0.5 shadow-sm shrink-0' +
            (compact ? '' : ''),
        },
        [minus, input, plus]
      );

      return { element: wrap, input: input, minus: minus, plus: plus };
    }

    function stockNote(product) {
      var stock = product.quantity;
      if (stock === null || stock === undefined) return null;
      var value = Number(stock);
      if (!isFinite(value)) return null;
      if (value <= 0) {
        return el('span', {
          class: 'text-[11px] font-bold text-amber-600 dark:text-amber-400',
          text: 'Rupture de stock',
        });
      }
      return el('span', {
        class: cls.mutedSm,
        text: 'Stock : ' + ui.number(value),
      });
    }

    function productRow(product) {
      var controls = el('div', { class: 'shrink-0' });
      var row = el('li', { class: 'p-3 sm:p-4 transition-colors' });
      var mode = null;

      function paint(options) {
        var opts = options || {};
        var quantity = quantityOf(product.id);
        var wanted = quantity > 0 ? 'stepper' : 'add';

        row.className =
          'p-3 sm:p-4 transition-colors ' +
          (quantity > 0
            ? 'bg-cyan-50/50 dark:bg-cyan-500/5'
            : 'hover:bg-stone-50/70 dark:hover:bg-stone-800/30');

        if (wanted === mode && wanted === 'stepper' && controls.firstChild) {
          var field = controls.querySelector('input');
          if (field && document.activeElement !== field) field.value = String(quantity);
          return;
        }

        mode = wanted;
        controls.innerHTML = '';

        if (wanted === 'add') {
          var add = el('button', {
            type: 'button',
            class: cls.btnSecondarySm,
            html: icon('plus', 'w-3.5 h-3.5') + 'Ajouter',
            'aria-label': 'Ajouter ' + product.name + ' au récapitulatif',
            onclick: function () {
              setQuantity(product.id, 1, { focus: 'plus' });
            },
          });
          controls.appendChild(add);
          if (opts.focus === 'add') {
            window.setTimeout(function () {
              add.focus();
            }, 0);
          }
          return;
        }

        var stepper = quantityStepper(product);
        controls.appendChild(stepper.element);
        if (opts.focus === 'plus' || opts.focus === 'minus') {
          var target = opts.focus === 'plus' ? stepper.plus : stepper.minus;
          window.setTimeout(function () {
            if (target && !target.disabled) target.focus();
          }, 0);
        }
      }

      row.appendChild(
        el('div', { class: 'flex items-start gap-3 sm:gap-4' }, [
          ui.imageThumb(product.image_url, {
            alt: '',
            icon: 'package',
            size: 'h-12 w-12 sm:h-14 sm:w-14 shrink-0',
            rounded: 'xl',
          }),
          el('div', { class: 'min-w-0 flex-1' }, [
            el('p', {
              class:
                'text-sm font-bold text-stone-800 dark:text-stone-100 ' + cls.breakAnywhere,
              text: product.name,
            }),
            el('div', { class: 'mt-1 flex flex-wrap items-center gap-x-2 gap-y-1' }, [
              el('span', {
                class: 'text-sm font-semibold text-cyan-700 dark:text-cyan-400 whitespace-nowrap',
                text: ui.money(price(product), CURRENCY),
              }),
              stockNote(product),
            ]),
          ]),
          controls,
        ])
      );

      rowPainters[product.id] = paint;
      paint();
      return row;
    }

    function renderCatalog() {
      if (!catalogBody) return;
      catalogBody.innerHTML = '';
      rowPainters = {};

      if (!state.businessId) {
        catalogCount.textContent = '';
        catalogBody.appendChild(
          ui.emptyState({
            icon: 'business',
            title: 'Choisissez d’abord une entreprise',
            message:
              'Sélectionnez l’entreprise à facturer : son catalogue s’affichera ici pour composer la commande.',
          })
        );
        return;
      }

      if (state.productsState === 'loading') {
        catalogCount.textContent = 'Chargement…';
        catalogBody.appendChild(ui.skeleton('row', 5));
        return;
      }

      if (state.productsState === 'error') {
        catalogCount.textContent = '';
        catalogBody.appendChild(
          ui.errorState({
            title: 'Catalogue indisponible',
            message: state.productsError,
            onRetry: function () {
              loadProducts(state.businessId);
            },
          })
        );
        return;
      }

      if (!state.products.length) {
        catalogCount.textContent = '';
        catalogBody.appendChild(
          ui.emptyState({
            icon: 'package',
            title: 'Ce catalogue est vide',
            message:
              'Ajoutez au moins un produit à cette entreprise pour pouvoir composer une commande.',
            action: {
              label: 'Gérer les produits',
              icon: 'package',
              onClick: function () {
                App.router.navigate(App.router.paths.businessProducts(state.businessId));
              },
            },
          })
        );
        return;
      }

      var matches = filteredProducts();
      catalogCount.textContent =
        matches.length === state.products.length
          ? ui.plural(state.products.length, 'produit')
          : matches.length + ' sur ' + ui.plural(state.products.length, 'produit');

      if (!matches.length) {
        catalogBody.appendChild(
          ui.emptyState({
            icon: 'search',
            title: 'Aucun produit trouvé',
            message: 'Aucun produit ne correspond à « ' + state.search +' ».',
            action: {
              label: 'Effacer la recherche',
              icon: 'close',
              variant: 'Secondary',
              onClick: function () {
                state.search = '';
                if (searchInput) searchInput.value = '';
                renderCatalog();
                if (searchInput) searchInput.focus();
              },
            },
          })
        );
        return;
      }

      var list = el('ul', {
        class:
          'divide-y divide-stone-100 dark:divide-stone-800/60 rounded-2xl border ' +
          'border-stone-200/70 dark:border-stone-800/70 bg-white dark:bg-stone-900 ' +
          'overflow-hidden shadow-sm',
        role: 'list',
      });
      matches.slice(0, state.visible).forEach(function (product) {
        list.appendChild(productRow(product));
      });
      catalogBody.appendChild(list);

      if (matches.length > state.visible) {
        var remaining = matches.length - state.visible;
        catalogBody.appendChild(
          el('div', { class: 'flex justify-center pt-4' }, [
            el('button', {
              type: 'button',
              class: cls.btnSecondary,
              html:
                icon('chevron-down', 'w-4 h-4') +
                'Afficher ' +
                ui.plural(Math.min(PAGE_SIZE, remaining), 'produit') +
                ' de plus',
              onclick: function () {
                state.visible += PAGE_SIZE;
                renderCatalog();
              },
            }),
          ])
        );
      }
    }

    function buildCatalogCard() {
      catalogCount = el('span', { class: cls.mutedSm });

      searchInput = el('input', {
        type: 'search',
        class: cls.searchInput,
        placeholder: 'Rechercher un produit…',
        'aria-label': 'Rechercher un produit dans le catalogue',
        autocomplete: 'off',
        value: state.search,
      });
      var applySearch = ui.debounce(function () {
        state.search = searchInput.value.trim();
        state.visible = PAGE_SIZE;
        renderCatalog();
      }, 200);
      searchInput.addEventListener('input', applySearch);
      searchInput.addEventListener('search', applySearch);

      var searchWrap = el('div', { class: 'relative' }, [
        el('span', {
          class:
            'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ' +
            'text-stone-400 dark:text-stone-500',
          html: icon('search', 'w-4 h-4'),
        }),
        searchInput,
      ]);

      catalogBody = el('div', { class: 'space-y-3' });

      return el('section', { class: 'space-y-4 min-w-0' }, [
        el('div', { class: 'flex flex-wrap items-center gap-3' }, [
          stepBadge('Étape 2'),
          el('h2', { class: cls.sectionTitle, text: 'Produits' }),
          el('span', { class: 'ml-auto', html: '' }, [catalogCount]),
        ]),
        searchWrap,
        catalogBody,
      ]);
    }

    // ----------------------------------------------------------------- summary
    var summaryLines = {}; // product id -> {element, update}
    var summaryOrder = '';

    function summaryLine(product) {
      var totalNode = el('p', {
        class: 'text-sm font-extrabold text-stone-900 dark:text-stone-50 whitespace-nowrap',
      });
      var detailNode = el('p', { class: cls.mutedSm });
      var warnNode = el('p', { class: 'text-[11px] font-bold text-amber-600 dark:text-amber-400' });
      warnNode.hidden = true;

      var stepper = quantityStepper(product, true);

      var remove = el('button', {
        type: 'button',
        class: cls.btnIconDanger,
        'aria-label': 'Retirer ' + product.name + ' du récapitulatif',
        html: icon('trash', 'w-4 h-4'),
        onclick: function () {
          setQuantity(product.id, 0);
        },
      });

      var element = el('li', { class: 'py-3 first:pt-0 last:pb-0 space-y-2' }, [
        el('div', { class: 'flex items-start justify-between gap-3' }, [
          el('p', {
            class: 'text-sm font-bold text-stone-800 dark:text-stone-100 ' + cls.breakAnywhere,
            text: product.name,
          }),
          totalNode,
        ]),
        el('div', { class: 'flex flex-wrap items-center justify-between gap-2' }, [
          stepper.element,
          el('div', { class: 'flex items-center gap-2 min-w-0' }, [detailNode, remove]),
        ]),
        warnNode,
      ]);

      function update() {
        var quantity = quantityOf(product.id);
        if (document.activeElement !== stepper.input) stepper.input.value = String(quantity);
        stepper.plus.disabled = quantity >= MAX_QUANTITY;
        detailNode.textContent = '× ' + ui.money(price(product), CURRENCY);
        totalNode.textContent = ui.money(price(product) * quantity, CURRENCY);

        var stock = Number(product.quantity);
        if (isFinite(stock) && product.quantity !== null && quantity > stock) {
          warnNode.textContent =
            'Quantité supérieure au stock enregistré (' + ui.number(stock) + ').';
          warnNode.hidden = false;
        } else {
          warnNode.hidden = true;
        }
      }

      update();
      return { element: element, update: update };
    }

    function renderSummary(options) {
      if (!summaryBody) return;
      var opts = options || {};
      var index = productIndex();
      var lines = state.lines.filter(function (line) {
        return Boolean(index[line.id]);
      });

      var total = 0;
      lines.forEach(function (line) {
        total += price(index[line.id]) * line.quantity;
      });

      var signature = lines
        .map(function (line) {
          return line.id;
        })
        .join('|');

      if (!lines.length) {
        summaryLines = {};
        summaryOrder = '';
        summaryBody.innerHTML = '';
        summaryBody.appendChild(
          el('div', { class: cls.surface + ' px-4 py-6 text-center' }, [
            el('span', {
              class:
                'mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl ' +
                'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500',
              html: icon('cart', 'w-5 h-5'),
            }),
            el('p', {
              class: 'text-sm font-bold text-stone-700 dark:text-stone-200',
              text: 'Aucun produit sélectionné',
            }),
            el('p', {
              class: cls.mutedSm + ' mt-1',
              text: 'Ajoutez des produits du catalogue : ils apparaîtront ici avec leur total.',
            }),
          ])
        );
      } else if (signature !== summaryOrder) {
        summaryOrder = signature;
        summaryLines = {};
        summaryBody.innerHTML = '';
        var list = el('ul', {
          class: 'divide-y divide-stone-100 dark:divide-stone-800/60',
          role: 'list',
        });
        lines.forEach(function (line) {
          var built = summaryLine(index[line.id]);
          summaryLines[line.id] = built;
          list.appendChild(built.element);
        });
        summaryBody.appendChild(list);
      } else {
        lines.forEach(function (line) {
          if (summaryLines[line.id]) summaryLines[line.id].update();
        });
      }

      totalLabel.textContent = ui.money(total, CURRENCY);

      var missing = MIN_AMOUNT - total;
      if (!lines.length) {
        minNote.hidden = true;
        submitReason.textContent = 'Ajoutez au moins un produit pour générer le lien.';
        submitReason.hidden = false;
      } else if (missing > 0) {
        minNote.textContent =
          'Il manque ' +
          ui.money(missing, CURRENCY) +
          ' pour atteindre le minimum de ' +
          ui.money(MIN_AMOUNT, CURRENCY) +
          ' exigé par PayDunya.';
        minNote.hidden = false;
        submitReason.textContent =
          'Le total doit atteindre ' + ui.money(MIN_AMOUNT, CURRENCY) + ' pour créer le lien.';
        submitReason.hidden = false;
      } else {
        minNote.hidden = true;
        submitReason.hidden = true;
        submitReason.textContent = '';
      }

      var blocked = !lines.length || total < MIN_AMOUNT || state.submitting;
      if (!state.submitting) submitButton.disabled = blocked;

      if (clearButton) clearButton.hidden = !lines.length;
      if (summaryCount) {
        summaryCount.textContent = lines.length ? ui.plural(lines.length, 'ligne') : '';
      }

      // Mobile shortcut bar: only useful once something is in the basket.
      var showBar = lines.length > 0;
      mobileBar.hidden = !showBar;
      mobileSpacer.hidden = !showBar;
      mobileBarTotal.textContent = ui.money(total, CURRENCY);
      mobileBarCount.textContent = ui.plural(lines.length, 'produit');

      if (opts.silent) return;
    }

    var clearButton = null;
    var summaryCount = null;

    function buildSummaryCard() {
      summaryBody = el('div', { class: 'min-w-0' });
      totalLabel = el('p', {
        class:
          'text-2xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50 whitespace-nowrap',
        text: ui.money(0, CURRENCY),
      });
      minNote = el('p', {
        class: cls.alertWarning + ' mt-3',
        role: 'status',
      });
      minNote.hidden = true;

      summaryCount = el('span', { class: cls.mutedSm });

      clearButton = el('button', {
        type: 'button',
        class: cls.btnGhostSm,
        html: icon('trash', 'w-3.5 h-3.5') + 'Vider',
        onclick: clearBasket,
      });
      clearButton.hidden = true;

      submitButton = el('button', {
        type: 'submit',
        class: cls.btnPrimary + ' ' + cls.btnBlock,
        html: icon('link', 'w-4 h-4') + 'Générer le lien de paiement',
        disabled: true,
        'aria-describedby': 'payment-link-submit-reason',
      });

      submitReason = el('p', {
        id: 'payment-link-submit-reason',
        class: cls.hint + ' text-center',
      });

      nameField = textField({
        label: 'Nom du client',
        required: true,
        placeholder: 'Ex. Awa Ndiaye',
        autocomplete: 'name',
        maxlength: 120,
        value: draft.customer.name || '',
      });

      emailField = textField({
        label: 'E-mail du client',
        required: true,
        type: 'email',
        inputmode: 'email',
        placeholder: 'client@exemple.sn',
        autocomplete: 'email',
        maxlength: 160,
        value: draft.customer.email || '',
        hint: 'La facture et son lien permanent seront envoyés à cette adresse après le paiement.',
      });

      phoneField = textField({
        label: 'Téléphone du client',
        type: 'tel',
        inputmode: 'tel',
        placeholder: '77 123 45 67',
        autocomplete: 'tel',
        maxlength: 30,
        value: draft.customer.phone || '',
        hint: 'Facultatif. Utile pour relancer le client si le paiement n’aboutit pas.',
      });

      [nameField, emailField, phoneField].forEach(function (built) {
        built.input.addEventListener('input', function () {
          draft.customer = {
            name: nameField.value(),
            email: emailField.value(),
            phone: phoneField.value(),
          };
        });
      });

      var form = el('form', { novalidate: true, class: 'space-y-5' }, [
        el('div', { class: 'flex items-center gap-3' }, [
          stepBadge('Étape 4'),
          el('h2', { class: cls.sectionTitle, text: 'Client' }),
        ]),
        nameField.element,
        emailField.element,
        phoneField.element,
        el('div', { class: 'space-y-2 pt-1' }, [submitButton, submitReason]),
      ]);
      form.addEventListener('submit', onSubmit);

      summaryCard = el('section', { class: cls.cardPad + ' space-y-5', tabindex: '-1' }, [
        el('div', { class: 'flex flex-wrap items-center gap-3' }, [
          stepBadge('Étape 3'),
          el('h2', { class: cls.sectionTitle, text: 'Récapitulatif' }),
          el('span', { class: 'ml-auto flex items-center gap-2' }, [summaryCount, clearButton]),
        ]),
        summaryBody,
        el('div', { class: 'pt-4 ' + cls.divider }, [
          el('div', { class: 'flex items-end justify-between gap-3' }, [
            el('div', { class: 'min-w-0' }, [
              el('p', { class: cls.eyebrow, text: 'Total à payer' }),
              el('p', { class: cls.mutedSm + ' mt-0.5', text: 'Taxes et frais inclus' }),
            ]),
            totalLabel,
          ]),
          minNote,
        ]),
        el('div', { class: 'pt-4 ' + cls.divider }, [form]),
      ]);

      return summaryCard;
    }

    function buildMobileBar() {
      mobileBarTotal = el('p', {
        class: 'text-sm font-extrabold text-stone-900 dark:text-stone-50 whitespace-nowrap',
      });
      mobileBarCount = el('p', { class: cls.mutedSm + ' truncate' });

      mobileBar = el(
        'div',
        {
          class:
            'lg:hidden fixed inset-x-3 bottom-[4.75rem] md:bottom-5 z-30 flex items-center gap-3 ' +
            'rounded-2xl border border-stone-200/70 dark:border-stone-800/70 bg-white/95 ' +
            'dark:bg-stone-900/95 backdrop-blur-xl shadow-lg shadow-stone-900/10 px-3 py-2.5',
        },
        [
          el('div', { class: 'min-w-0 flex-1' }, [mobileBarTotal, mobileBarCount]),
          el('button', {
            type: 'button',
            class: cls.btnPrimarySm + ' shrink-0',
            html: icon('cart', 'w-3.5 h-3.5') + 'Récapitulatif',
            onclick: function () {
              scrollToNode(summaryCard);
            },
          }),
        ]
      );
      mobileBar.hidden = true;

      mobileSpacer = el('div', { class: 'h-24 lg:hidden', 'aria-hidden': 'true' });
      mobileSpacer.hidden = true;

      return mobileBar;
    }

    // ------------------------------------------------------------------ submit
    function validateCustomer() {
      var ok = true;
      var firstInvalid = null;

      nameField.clearError();
      emailField.clearError();
      phoneField.clearError();

      var name = nameField.value();
      if (name.length < 2) {
        nameField.setError('Indiquez le nom du client (2 caractères minimum).');
        firstInvalid = firstInvalid || nameField.input;
        ok = false;
      }

      var email = emailField.value();
      if (!email) {
        emailField.setError('Indiquez l’adresse e-mail qui recevra la facture.');
        firstInvalid = firstInvalid || emailField.input;
        ok = false;
      } else if (!EMAIL_PATTERN.test(email)) {
        emailField.setError('Cette adresse e-mail n’est pas valide. Exemple : client@exemple.sn');
        firstInvalid = firstInvalid || emailField.input;
        ok = false;
      }

      var phone = phoneField.value();
      if (phone && !PHONE_PATTERN.test(phone)) {
        phoneField.setError('Ce numéro n’est pas valide. Exemple : 77 123 45 67');
        firstInvalid = firstInvalid || phoneField.input;
        ok = false;
      }

      if (!ok && firstInvalid) {
        firstInvalid.focus();
        if (typeof firstInvalid.scrollIntoView === 'function') {
          firstInvalid.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
        return null;
      }

      return { name: name, email: email, phone: phone };
    }

    function onSubmit(event) {
      event.preventDefault();
      if (state.submitting) return;

      var index = productIndex();
      var lines = state.lines.filter(function (line) {
        return Boolean(index[line.id]);
      });
      if (!lines.length) {
        ui.toast({ message: 'Ajoutez au moins un produit avant de générer le lien.', type: 'warning' });
        return;
      }

      var total = 0;
      lines.forEach(function (line) {
        total += price(index[line.id]) * line.quantity;
      });
      if (total < MIN_AMOUNT) {
        ui.toast({
          message:
            'Le total doit atteindre au moins ' +
            ui.money(MIN_AMOUNT, CURRENCY) +
            ' pour créer un lien de paiement.',
          type: 'warning',
        });
        return;
      }

      var customer = validateCustomer();
      if (!customer) return;

      var payload = {
        business_id: state.businessId,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone || null,
        currency: CURRENCY,
        // Names and prices are read from the database: never sent by the client.
        items: lines.map(function (line) {
          return { product_id: line.id, quantity: line.quantity };
        }),
      };

      state.submitting = true;
      submitButton.disabled = false;
      ui.setBusy(submitButton, true, 'Création du lien…');

      App.api.createInvoiceFromProducts(payload).then(
        function (invoice) {
          state.submitting = false;
          ui.setBusy(submitButton, false);
          draft.lines = [];
          draft.customer = { name: '', email: '', phone: '' };
          state.lines = [];
          mountSuccess(invoice, customer);
        },
        function (error) {
          state.submitting = false;
          ui.setBusy(submitButton, false);
          renderSummary();
          ui.toastError(error);
        }
      );
    }

    // ----------------------------------------------------------------- success
    function mountSuccess(invoice, customer) {
      var token = invoice && invoice.public_token ? invoice.public_token : '';
      var link = token ? shareLink(token) : '';
      var nodes = [header()];

      var banner = el('section', { class: cls.cardPad + ' space-y-2', tabindex: '-1' }, [
        el('div', { class: 'flex items-start gap-3' }, [
          el('span', {
            class:
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ' +
              'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            html: icon('check-circle', 'w-6 h-6'),
          }),
          el('div', { class: 'min-w-0' }, [
            el('h2', {
              class: 'text-lg font-extrabold tracking-tight text-stone-900 dark:text-stone-50',
              text: 'Lien de paiement créé',
            }),
            el('p', {
              class: cls.mutedSm + ' mt-1 ' + cls.breakAnywhere,
              text:
                'Facture de ' +
                ui.money(invoice && invoice.amount, (invoice && invoice.currency) || CURRENCY) +
                ' au nom de ' +
                ((invoice && invoice.customer_name) || customer.name) +
                '.',
            }),
          ]),
        ]),
      ]);
      nodes.push(banner);

      // PayDunya may have been unreachable: the invoice still exists and the
      // customer can retry the payment from the link.
      if (invoice && invoice.warning) {
        nodes.push(
          el('div', { class: cls.alertWarning, role: 'status' }, [
            el('span', { class: 'shrink-0 mt-0.5', html: icon('warning', 'w-5 h-5') }),
            el('div', { class: 'min-w-0 space-y-1' }, [
              el('p', { class: 'font-bold', text: 'Le paiement en ligne n’est pas encore prêt' }),
              el('p', { class: cls.breakAnywhere, text: invoice.warning }),
              el('p', {
                text:
                  'Le lien ci-dessous reste valable : votre client pourra relancer le paiement ' +
                  'directement depuis cette page dès que le service sera de nouveau disponible.',
              }),
            ]),
          ])
        );
      }

      if (link) {
        var linkInput = el('input', {
          type: 'text',
          readonly: true,
          value: link,
          class: cls.input + ' font-mono text-xs sm:text-sm',
          'aria-label': 'Lien de paiement à envoyer au client',
          onclick: function (event) {
            event.target.select();
          },
        });

        nodes.push(
          el('section', { class: cls.cardPad + ' space-y-4' }, [
            el('div', { class: 'flex items-center gap-3' }, [
              el('span', { class: 'text-cyan-600 dark:text-cyan-400', html: icon('link', 'w-5 h-5') }),
              el('h2', { class: cls.sectionTitle, text: 'Lien à envoyer au client' }),
            ]),
            el('p', {
              class: 'text-sm ' + cls.muted + ' leading-relaxed',
              text:
                'Envoyez ce lien à votre client par WhatsApp, SMS ou e-mail. Il ouvrira une page ' +
                'de paiement sécurisée où il pourra régler la commande.',
            }),
            linkInput,
            el('div', { class: 'flex flex-col sm:flex-row gap-2' }, [
              el('button', {
                type: 'button',
                class: cls.btnPrimary + ' w-full sm:w-auto',
                html: icon('copy', 'w-4 h-4') + 'Copier le lien',
                onclick: function () {
                  ui.copyToClipboard(link, 'Lien de paiement copié. Envoyez-le à votre client.');
                },
              }),
              el('a', {
                href: link,
                target: '_blank',
                rel: 'noopener',
                class: cls.btnSecondary + ' w-full sm:w-auto',
                html: icon('external', 'w-4 h-4') + 'Ouvrir la page de paiement',
              }),
            ]),
            el('p', {
              class: cls.hint,
              text: 'La facture sera envoyée à ' + customer.email + ' après le paiement.',
            }),
          ])
        );
      } else {
        nodes.push(
          el('div', { class: cls.alertError, role: 'alert' }, [
            el('span', { class: 'shrink-0 mt-0.5', html: icon('error', 'w-5 h-5') }),
            el('div', { class: 'min-w-0 space-y-1' }, [
              el('p', { class: 'font-bold', text: 'Lien public indisponible' }),
              el('p', {
                text:
                  'La facture a bien été enregistrée, mais son lien public n’a pas été renvoyé. ' +
                  'Ouvrez la facture pour générer un lien de paiement.',
              }),
            ]),
          ])
        );
      }

      var actions = el('div', { class: 'flex flex-col sm:flex-row gap-2' });
      if (invoice && invoice.id) {
        actions.appendChild(
          el('a', {
            href: App.router.paths.invoice(invoice.id),
            class: cls.btnSecondary + ' w-full sm:w-auto',
            html: icon('invoice', 'w-4 h-4') + 'Voir la facture',
          })
        );
      }
      actions.appendChild(
        el('button', {
          type: 'button',
          class: cls.btnSecondary + ' w-full sm:w-auto',
          html: icon('plus', 'w-4 h-4') + 'Créer un autre lien',
          onclick: function () {
            state.search = '';
            state.visible = PAGE_SIZE;
            mountBuilder();
          },
        })
      );
      nodes.push(el('section', { class: cls.cardPad }, [actions]));

      ui.mount(page, nodes);
      scrollToNode(banner);
      ui.toast({
        title: 'Lien de paiement créé',
        message: 'Copiez le lien et envoyez-le à votre client.',
        type: 'success',
      });
    }

    // ------------------------------------------------------------------ layout
    function mountBuilder() {
      rowPainters = {};
      summaryLines = {};
      summaryOrder = '';

      var businessCard = buildBusinessCard();
      var catalog = buildCatalogCard();
      var summary = buildSummaryCard();
      var bar = buildMobileBar();

      var grid = el(
        'div',
        { class: 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start' },
        [
          el('div', { class: 'min-w-0 space-y-5' }, [catalog]),
          el(
            'div',
            {
              class:
                'min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto ' +
                'lg:pb-2 space-y-5',
            },
            [summary]
          ),
        ]
      );

      ui.mount(page, [header(), businessCard, grid, mobileSpacer, bar]);

      renderCatalog();
      renderSummary();

      if (state.businessId && state.productsState === 'idle') loadProducts(state.businessId);
    }

    loadBusinesses();
  }

  App.views.paymentLink = { render: render };
})();
