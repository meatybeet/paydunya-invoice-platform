// Products & categories tab of a business.
// Rendered by businessDetail.js through App.views.businessProducts.renderTab(container, business).
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;

  // ---------------------------------------------------------------------------
  // Local design tokens - filter pills are the only shape App.ui.cls does not
  // already cover. They follow the same focus-ring / radius language.
  // ---------------------------------------------------------------------------
  var FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-[#fafaf9] dark:focus-visible:ring-offset-[#0c0a09]';

  var PILL_BASE =
    'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ' +
    'transition-all duration-200 active:scale-[0.97] ' +
    FOCUS_RING;

  var PILL_IDLE =
    PILL_BASE +
    ' border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 ' +
    'text-stone-600 dark:text-stone-300 hover:border-cyan-500/40 ' +
    'hover:text-stone-900 dark:hover:text-stone-100 focus-visible:ring-stone-400';

  var PILL_ACTIVE =
    PILL_BASE +
    ' border border-cyan-600 bg-cyan-600 text-white shadow-sm shadow-cyan-900/10 ' +
    'focus-visible:ring-cyan-500';

  var PILL_ADD =
    PILL_BASE +
    ' border border-dashed border-stone-300 dark:border-stone-700 ' +
    'text-stone-500 dark:text-stone-400 hover:border-cyan-500 hover:text-cyan-600 ' +
    'dark:hover:text-cyan-400 focus-visible:ring-cyan-500';

  var CLAMP_2 = {
    display: '-webkit-box',
    WebkitLineClamp: '2',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };

  var NO_CATEGORY = '__none__';
  var MAX_NAME = 150;
  var MAX_DESCRIPTION = 1000;
  var LOW_STOCK_THRESHOLD = 5;

  var fieldSeq = 0;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Combining marks, built from escapes so the source file stays pure ASCII here.
  var DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

  /** Accent- and case-insensitive text used for searching. */
  function normalize(value) {
    var text = String(value === null || value === undefined ? '' : value).toLowerCase();
    try {
      return text.normalize('NFD').replace(DIACRITICS, '');
    } catch (err) {
      return text;
    }
  }

  function categoryName(state, categoryId) {
    if (!categoryId) return '';
    for (var index = 0; index < state.categories.length; index += 1) {
      if (state.categories[index].id === categoryId) return state.categories[index].name;
    }
    return '';
  }

  /** Stock pill copy + skin. Quantity is null when the business tracks no stock. */
  function stockMeta(quantity) {
    if (quantity === null || quantity === undefined) {
      return {
        label: 'Stock illimité',
        icon: 'package',
        skin: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
      };
    }
    var value = Number(quantity) || 0;
    if (value <= 0) {
      return {
        label: 'Rupture de stock',
        icon: 'warning',
        skin: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
      };
    }
    if (value < LOW_STOCK_THRESHOLD) {
      return {
        label: 'Stock faible : ' + ui.number(value),
        icon: 'warning',
        skin: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
      };
    }
    return {
      label: 'En stock : ' + ui.number(value),
      icon: 'package',
      skin: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
    };
  }

  /**
   * Labelled form field with inline error handling.
   * Returns {wrap, setError(message), clearError()}.
   */
  function makeField(options) {
    var opts = options || {};
    var control = opts.control;
    fieldSeq += 1;
    var id = 'pf-' + fieldSeq;
    var errorId = id + '-error';

    control.id = id;
    var baseClass = control.className;

    var label = ui.el('label', { class: cls.label, for: id }, [
      opts.label,
      opts.required ? ui.el('span', { class: cls.labelRequired, text: '*', 'aria-hidden': 'true' }) : null,
    ]);

    var error = ui.el('p', { class: cls.errorText, id: errorId, hidden: true });
    var hint = opts.hint ? ui.el('p', { class: cls.hint, text: opts.hint }) : null;

    var wrap = ui.el('div', { class: cls.field }, [label, control, error, hint]);

    return {
      wrap: wrap,
      control: control,
      setError: function (message) {
        error.textContent = message;
        error.hidden = false;
        control.className = baseClass.replace(cls.input, cls.inputInvalid);
        if (control.className === baseClass) {
          // Textareas / selects keep their own base: mark them without losing shape.
          control.classList.add('border-rose-400', 'dark:border-rose-900/60');
        }
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', errorId);
      },
      clearError: function () {
        error.textContent = '';
        error.hidden = true;
        control.className = baseClass;
        control.classList.remove('border-rose-400', 'dark:border-rose-900/60');
        control.removeAttribute('aria-invalid');
        control.removeAttribute('aria-describedby');
      },
    };
  }

  /** Submit the form when Enter is pressed outside a textarea. */
  function submitOnEnter(form, onSubmit) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      onSubmit();
    });
    form.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      var tag = event.target && event.target.tagName;
      // Enter must keep its native meaning on multi-line text and on controls.
      if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
      event.preventDefault();
      onSubmit();
    });
  }

  /** The submit button is always the last action rendered in the modal footer. */
  function submitButtonOf(dialog) {
    var buttons = dialog.querySelectorAll('button');
    return buttons.length ? buttons[buttons.length - 1] : null;
  }

  function restoreFocusTo(element) {
    return function () {
      if (element && element.isConnected) {
        try {
          element.focus();
        } catch (err) {
          /* element vanished during a re-render */
        }
      }
    };
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------
  function renderTab(container, business) {
    if (!container) return Promise.resolve();

    var state = {
      categories: [],
      products: [],
      category: 'all',
      search: '',
    };

    var listWrap = null;
    var stripWrap = null;
    var countLabel = null;
    var searchInput = null;
    var addProductButton = null;
    var generation = 0;

    // Products and categories are writable by the owner, the members and the
    // super admin - exactly what canAccessBusiness covers.
    if (!App.session.canAccessBusiness(business)) {
      ui.mount(
        container,
        ui.emptyState({
          icon: 'lock',
          title: 'Accès restreint',
          message:
            "Vous n'avez pas accès au catalogue de cette entreprise. Demandez au propriétaire de vous ajouter comme membre.",
        })
      );
      return Promise.resolve();
    }

    // ---------------------------------------------------------------- filtering
    function matchesFilters(product) {
      if (state.category === NO_CATEGORY) {
        if (product.category_id) return false;
      } else if (state.category !== 'all' && product.category_id !== state.category) {
        return false;
      }
      var query = normalize(state.search).trim();
      if (!query) return true;
      var haystack =
        normalize(product.name) +
        ' ' +
        normalize(product.description) +
        ' ' +
        normalize(categoryName(state, product.category_id));
      return haystack.indexOf(query) !== -1;
    }

    function visibleProducts() {
      return state.products.filter(matchesFilters);
    }

    /** After a create/edit, never leave the user staring at a filtered-out product. */
    function ensureVisible(product) {
      if (matchesFilters(product)) return;
      state.category = 'all';
      state.search = '';
      if (searchInput) searchInput.value = '';
    }

    function resetFilters() {
      state.category = 'all';
      state.search = '';
      if (searchInput) searchInput.value = '';
      renderStrip();
      renderList();
    }

    // ------------------------------------------------------------ category strip
    function renderStrip(focusKey) {
      if (!stripWrap) return;
      var counts = { all: state.products.length };
      var uncategorized = 0;
      state.products.forEach(function (product) {
        if (!product.category_id) {
          uncategorized += 1;
          return;
        }
        counts[product.category_id] = (counts[product.category_id] || 0) + 1;
      });

      var scroller = ui.el('div', {
        class: 'flex flex-1 min-w-0 items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1 -mx-1',
        role: 'group',
        'aria-label': 'Filtrer par catégorie',
      });

      function pill(key, label, count) {
        var active = state.category === key;
        return ui.el('button', {
          type: 'button',
          class: active ? PILL_ACTIVE : PILL_IDLE,
          'aria-pressed': active ? 'true' : 'false',
          dataset: { pill: String(key) },
          onclick: function () {
            state.category = key;
            renderStrip(key);
            renderList();
          },
          html:
            ui.escapeHtml(label) +
            (count === null || count === undefined
              ? ''
              : '<span class="' +
                (active ? 'text-white/70' : 'text-stone-400 dark:text-stone-500') +
                ' font-semibold">' +
                ui.escapeHtml(ui.number(count)) +
                '</span>'),
        });
      }

      scroller.appendChild(pill('all', 'Toutes', counts.all));
      state.categories.forEach(function (category) {
        scroller.appendChild(pill(category.id, category.name, counts[category.id] || 0));
      });
      if (uncategorized > 0) {
        scroller.appendChild(pill(NO_CATEGORY, 'Sans catégorie', uncategorized));
      }

      var addButton = ui.el('button', {
        type: 'button',
        class: PILL_ADD,
        'aria-label': 'Créer une nouvelle catégorie',
        title: 'Nouvelle catégorie',
        html:
          ui.icon('plus', 'w-3.5 h-3.5') +
          '<span class="hidden sm:inline">Nouvelle catégorie</span>',
        onclick: function (event) {
          openCategoryModal(event.currentTarget);
        },
      });

      ui.mount(
        stripWrap,
        ui.el('div', { class: 'flex items-center gap-2' }, [
          scroller,
          ui.el('div', { class: 'h-6 w-px bg-stone-200 dark:bg-stone-800 shrink-0' }),
          addButton,
        ])
      );

      // Re-rendering the strip destroys the button that was just clicked:
      // give the keyboard focus back and keep the active pill in view.
      if (focusKey !== undefined && focusKey !== null) {
        var focused = stripWrap.querySelector('[data-pill="' + String(focusKey) + '"]');
        if (focused) {
          try {
            focused.focus();
            if (focused.scrollIntoView) {
              focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
          } catch (err) {
            /* older browsers without scrollIntoView options */
          }
        }
      }
    }

    // -------------------------------------------------------------- product card
    function productCard(product) {
      var stock = stockMeta(product.quantity);
      var catName = categoryName(state, product.category_id);

      var actions = ui.el('div', { class: 'flex items-center gap-1 shrink-0' }, [
        ui.el('button', {
          type: 'button',
          class: cls.btnIconGhost,
          'aria-label': 'Modifier le produit ' + product.name,
          title: 'Modifier',
          html: ui.icon('edit', 'w-4 h-4'),
          onclick: function (event) {
            openProductModal(product, event.currentTarget);
          },
        }),
        ui.el('button', {
          type: 'button',
          class: cls.btnIconDanger,
          'aria-label': 'Supprimer le produit ' + product.name,
          title: 'Supprimer',
          html: ui.icon('trash', 'w-4 h-4'),
          onclick: function (event) {
            confirmDelete(product, event.currentTarget);
          },
        }),
      ]);

      return ui.el('article', { class: cls.cardLift + ' flex flex-col gap-3' }, [
        ui.el('div', { class: 'flex items-start justify-between gap-3' }, [
          ui.el('div', { class: 'min-w-0 space-y-2' }, [
            ui.el('h3', {
              class: cls.cardTitle + ' ' + cls.breakAnywhere + ' leading-snug',
              style: CLAMP_2,
              text: product.name,
            }),
            ui.el('span', {
              class: catName ? cls.badgeAccent : cls.badgeNeutral,
              html:
                ui.icon('tag', 'w-3 h-3') +
                '<span class="max-w-[9rem] truncate">' +
                ui.escapeHtml(catName || 'Sans catégorie') +
                '</span>',
            }),
          ]),
          actions,
        ]),

        product.description
          ? ui.el('p', {
              class: cls.mutedSm + ' leading-relaxed ' + cls.breakAnywhere,
              style: CLAMP_2,
              text: product.description,
            })
          : ui.el('p', {
              class: cls.hint + ' italic',
              text: 'Aucune description.',
            }),

        ui.el(
          'div',
          {
            class:
              'mt-auto flex flex-wrap items-end justify-between gap-3 pt-3 border-t ' +
              'border-stone-200/70 dark:border-stone-800/70',
          },
          [
            ui.el('div', { class: 'min-w-0' }, [
              ui.el('p', { class: cls.eyebrow, text: 'Prix' }),
              ui.el('p', {
                class:
                  'text-lg font-extrabold tracking-tight text-stone-900 dark:text-stone-50 ' +
                  cls.breakAnywhere,
                text: ui.money(product.price),
              }),
            ]),
            ui.el('span', {
              class: cls.badge + ' ' + stock.skin,
              html: ui.icon(stock.icon, 'w-3 h-3') + ui.escapeHtml(stock.label),
            }),
          ]
        ),
      ]);
    }

    // ---------------------------------------------------------------- product list
    function renderList() {
      if (!listWrap) return;
      var rows = visibleProducts();

      if (countLabel) {
        if (!state.products.length) {
          countLabel.textContent = '';
        } else if (rows.length === state.products.length) {
          countLabel.textContent = ui.plural(state.products.length, 'produit');
        } else {
          countLabel.textContent =
            ui.plural(rows.length, 'produit') + ' sur ' + ui.number(state.products.length);
        }
      }

      if (!state.products.length) {
        ui.mount(
          listWrap,
          ui.emptyState({
            icon: 'package',
            title: 'Aucun produit pour le moment',
            message:
              'Ajoutez vos produits pour les afficher dans votre catalogue public et les insérer en un clic dans vos factures.',
            action: {
              label: 'Nouveau produit',
              icon: 'plus',
              onClick: function (event) {
                openProductModal(null, event.currentTarget);
              },
            },
          })
        );
        return;
      }

      if (!rows.length) {
        var message = state.search
          ? 'Aucun produit ne correspond à « ' + state.search + ' » dans cette sélection.'
          : 'Cette catégorie ne contient encore aucun produit.';
        ui.mount(
          listWrap,
          ui.emptyState({
            icon: 'search',
            title: 'Aucun résultat',
            message: message,
            action: [
              {
                label: 'Réinitialiser les filtres',
                icon: 'refresh',
                variant: 'Secondary',
                onClick: resetFilters,
              },
              {
                label: 'Nouveau produit',
                icon: 'plus',
                variant: 'Primary',
                onClick: function (event) {
                  openProductModal(null, event.currentTarget);
                },
              },
            ],
          })
        );
        return;
      }

      var grid = ui.el('div', { class: cls.gridCards + ' animate-fade-in' });
      rows.forEach(function (product) {
        grid.appendChild(productCard(product));
      });
      ui.mount(listWrap, grid);
    }

    // ------------------------------------------------------------ category modal
    function openCategoryModal(opener, onCreated) {
      var input = ui.el('input', {
        type: 'text',
        class: cls.input,
        placeholder: 'Boissons, Accessoires, Services…',
        maxlength: '100',
        autocomplete: 'off',
      });
      var nameField = makeField({
        label: 'Nom de la catégorie',
        required: true,
        control: input,
        hint: 'Entre 2 et 100 caractères.',
      });

      var form = ui.el('form', { class: cls.form, novalidate: true }, [nameField.wrap]);
      var handle = null;
      var submitting = false;

      function submit(button) {
        if (submitting) return;
        nameField.clearError();
        var value = input.value.trim();
        if (!value) {
          nameField.setError('Le nom de la catégorie est obligatoire.');
          input.focus();
          return;
        }
        if (value.length < 2) {
          nameField.setError('Le nom doit contenir au moins 2 caractères.');
          input.focus();
          return;
        }

        submitting = true;
        var restore = button ? ui.setBusy(button, true, 'Création…') : function () {};
        App.api
          .createCategory(business.id, { name: value })
          .then(function (category) {
            state.categories.push(category);
            state.categories.sort(function (a, b) {
              return String(a.name).localeCompare(String(b.name), App.config.LOCALE);
            });
            renderStrip();
            ui.toast({ message: 'Catégorie « ' + category.name + ' » créée.', type: 'success' });
            if (typeof onCreated === 'function') onCreated(category);
            if (handle) handle.close();
          })
          .catch(function (error) {
            submitting = false;
            restore();
            ui.toastError(error);
          });
      }

      handle = ui.modal({
        title: 'Nouvelle catégorie',
        subtitle: 'Les catégories organisent votre catalogue et facilitent la recherche.',
        size: 'sm',
        body: form,
        onClose: restoreFocusTo(opener),
        actions: [
          {
            label: 'Annuler',
            variant: 'Secondary',
            onClick: function (close) {
              close(null);
            },
          },
          {
            label: 'Créer la catégorie',
            variant: 'Primary',
            icon: 'plus',
            onClick: function (close, event) {
              submit(event.currentTarget);
            },
          },
        ],
      });

      submitOnEnter(form, function () {
        submit(submitButtonOf(handle.dialog));
      });
    }

    // ------------------------------------------------------------- product modal
    function openProductModal(product, opener) {
      var isEdit = Boolean(product);

      var nameInput = ui.el('input', {
        type: 'text',
        class: cls.input,
        placeholder: 'Café Touba 1 kg',
        maxlength: String(MAX_NAME),
        autocomplete: 'off',
        value: isEdit ? product.name : '',
      });
      var nameField = makeField({ label: 'Nom du produit', required: true, control: nameInput });

      var descriptionInput = ui.el('textarea', {
        class: cls.textarea,
        rows: '3',
        maxlength: String(MAX_DESCRIPTION),
        placeholder: 'Quelques mots visibles par vos clients dans le catalogue.',
      });
      descriptionInput.value = isEdit && product.description ? product.description : '';
      var descriptionField = makeField({
        label: 'Description',
        control: descriptionInput,
        hint: 'Facultatif, 1000 caractères maximum.',
      });

      var categorySelect = ui.el('select', { class: cls.select });
      function fillCategories(selectedId) {
        categorySelect.innerHTML = '';
        categorySelect.appendChild(ui.el('option', { value: '', text: 'Sans catégorie' }));
        state.categories.forEach(function (category) {
          categorySelect.appendChild(
            ui.el('option', { value: category.id, text: category.name })
          );
        });
        categorySelect.value = selectedId || '';
      }
      fillCategories(isEdit ? product.category_id || '' : '');

      var newCategoryButton = ui.el('button', {
        type: 'button',
        class: cls.btnGhostSm + ' -ml-1 mt-0.5',
        html: ui.icon('plus', 'w-3.5 h-3.5') + 'Nouvelle catégorie',
        onclick: function (event) {
          openCategoryModal(event.currentTarget, function (category) {
            fillCategories(category.id);
          });
        },
      });

      var categoryField = makeField({ label: 'Catégorie', control: categorySelect });
      categoryField.wrap.appendChild(newCategoryButton);

      var priceInput = ui.el('input', {
        type: 'number',
        class: cls.input,
        min: '0',
        step: '1',
        inputmode: 'numeric',
        placeholder: '0',
        value: isEdit ? String(product.price) : '',
      });
      var pricePreview = ui.el('p', { class: cls.hint, text: 'Montant en FCFA.' });
      var priceField = makeField({ label: 'Prix', required: true, control: priceInput });
      priceField.wrap.appendChild(pricePreview);
      function updatePricePreview() {
        var raw = priceInput.value.trim();
        var value = Number(raw);
        pricePreview.textContent =
          raw !== '' && isFinite(value) && value >= 0
            ? 'Affiché : ' + ui.money(value)
            : 'Montant en FCFA.';
      }
      priceInput.addEventListener('input', updatePricePreview);
      updatePricePreview();

      var quantityInput = ui.el('input', {
        type: 'number',
        class: cls.input,
        min: '0',
        step: '1',
        inputmode: 'numeric',
        placeholder: 'Illimité',
        value: isEdit && product.quantity !== null && product.quantity !== undefined
          ? String(product.quantity)
          : '',
      });
      var quantityField = makeField({
        label: 'Quantité en stock',
        control: quantityInput,
        hint: 'Laissez vide pour un stock illimité.',
      });

      var form = ui.el('form', { class: cls.form, novalidate: true }, [
        nameField.wrap,
        descriptionField.wrap,
        categoryField.wrap,
        ui.el('div', { class: cls.formGrid }, [priceField.wrap, quantityField.wrap]),
      ]);

      var fields = [nameField, descriptionField, categoryField, priceField, quantityField];
      var handle = null;
      var submitting = false;

      function readValues() {
        fields.forEach(function (field) {
          field.clearError();
        });

        var errors = [];
        var name = nameInput.value.trim();
        if (!name) {
          nameField.setError('Le nom du produit est obligatoire.');
          errors.push(nameInput);
        } else if (name.length < 2) {
          nameField.setError('Le nom doit contenir au moins 2 caractères.');
          errors.push(nameInput);
        } else if (name.length > MAX_NAME) {
          nameField.setError('Le nom ne doit pas dépasser ' + MAX_NAME + ' caractères.');
          errors.push(nameInput);
        }

        var description = descriptionInput.value.trim();
        if (description.length > MAX_DESCRIPTION) {
          descriptionField.setError(
            'La description ne doit pas dépasser ' + MAX_DESCRIPTION + ' caractères.'
          );
          errors.push(descriptionInput);
        }

        var rawPrice = priceInput.value.trim();
        var price = Number(rawPrice);
        if (rawPrice === '') {
          priceField.setError('Le prix est obligatoire.');
          errors.push(priceInput);
        } else if (!isFinite(price)) {
          priceField.setError('Le prix doit être un nombre valide.');
          errors.push(priceInput);
        } else if (price < 0) {
          priceField.setError('Le prix ne peut pas être négatif.');
          errors.push(priceInput);
        }

        var rawQuantity = quantityInput.value.trim();
        var quantity = null;
        if (rawQuantity !== '') {
          var parsed = Number(rawQuantity);
          if (!isFinite(parsed) || Math.floor(parsed) !== parsed) {
            quantityField.setError('La quantité doit être un nombre entier.');
            errors.push(quantityInput);
          } else if (parsed < 0) {
            quantityField.setError('La quantité ne peut pas être négative.');
            errors.push(quantityInput);
          } else {
            quantity = parsed;
          }
        }

        if (errors.length) {
          try {
            errors[0].focus();
          } catch (err) {
            /* ignore */
          }
          return null;
        }

        return {
          name: name,
          description: description || null,
          category_id: categorySelect.value || null,
          price: price,
          quantity: quantity,
        };
      }

      function submit(button) {
        if (submitting) return;
        var values = readValues();
        if (!values) return;

        var payload = values;
        if (isEdit) {
          payload = {};
          if (values.name !== product.name) payload.name = values.name;
          if (values.description !== (product.description || null)) {
            payload.description = values.description;
          }
          if (values.category_id !== (product.category_id || null)) {
            payload.category_id = values.category_id;
          }
          if (values.price !== product.price) payload.price = values.price;
          var currentQuantity =
            product.quantity === undefined || product.quantity === null ? null : product.quantity;
          if (values.quantity !== currentQuantity) payload.quantity = values.quantity;

          if (!Object.keys(payload).length) {
            ui.toast({ message: 'Aucune modification à enregistrer.', type: 'info' });
            if (handle) handle.close();
            return;
          }
        }

        submitting = true;
        var restore = button ? ui.setBusy(button, true, 'Enregistrement…') : function () {};
        var call = isEdit
          ? App.api.updateProduct(business.id, product.id, payload)
          : App.api.createProduct(business.id, payload);

        call
          .then(function (saved) {
            if (isEdit) {
              for (var index = 0; index < state.products.length; index += 1) {
                if (state.products[index].id === saved.id) {
                  state.products[index] = saved;
                  break;
                }
              }
            } else {
              state.products.unshift(saved);
            }
            ensureVisible(saved);
            renderStrip();
            renderList();
            ui.toast({
              message: isEdit
                ? 'Produit « ' + saved.name + ' » mis à jour.'
                : 'Produit « ' + saved.name + ' » ajouté au catalogue.',
              type: 'success',
            });
            if (handle) handle.close();
          })
          .catch(function (error) {
            submitting = false;
            restore();
            ui.toastError(error);
          });
      }

      handle = ui.modal({
        title: isEdit ? 'Modifier le produit' : 'Nouveau produit',
        subtitle: isEdit
          ? 'Seules les informations modifiées seront enregistrées.'
          : 'Ce produit sera disponible dans vos factures et votre catalogue.',
        size: 'lg',
        body: form,
        onClose: restoreFocusTo(opener),
        actions: [
          {
            label: 'Annuler',
            variant: 'Secondary',
            onClick: function (close) {
              close(null);
            },
          },
          {
            label: isEdit ? 'Enregistrer' : 'Ajouter le produit',
            variant: 'Primary',
            icon: isEdit ? 'check' : 'plus',
            onClick: function (close, event) {
              submit(event.currentTarget);
            },
          },
        ],
      });

      submitOnEnter(form, function () {
        submit(submitButtonOf(handle.dialog));
      });
    }

    // -------------------------------------------------------------------- delete
    function confirmDelete(product, opener) {
      ui.confirmDialog({
        title: 'Supprimer le produit',
        danger: true,
        confirmLabel: 'Supprimer définitivement',
        message:
          '« ' +
          product.name +
          ' » sera retiré de votre catalogue et ne pourra plus être ajouté à une facture. Cette action est irréversible.',
      }).then(function (confirmed) {
        if (!confirmed) {
          if (opener && opener.isConnected) opener.focus();
          return;
        }
        App.api
          .deleteProduct(business.id, product.id)
          .then(function () {
            state.products = state.products.filter(function (item) {
              return item.id !== product.id;
            });
            renderStrip();
            renderList();
            if (addProductButton && addProductButton.isConnected) addProductButton.focus();
            ui.toast({ message: 'Produit « ' + product.name + ' » supprimé.', type: 'success' });
          })
          .catch(ui.toastError);
      });
    }

    // ------------------------------------------------------------------- layout
    function renderLayout() {
      var searchIcon = ui.el('span', {
        class:
          'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500',
        html: ui.icon('search', 'w-4 h-4'),
      });

      searchInput = ui.el('input', {
        type: 'search',
        class: cls.searchInput,
        placeholder: 'Rechercher un produit…',
        'aria-label': 'Rechercher un produit',
        autocomplete: 'off',
        value: state.search,
      });

      var onSearch = ui.debounce(function () {
        state.search = searchInput.value;
        renderList();
      }, 180);
      searchInput.addEventListener('input', onSearch);
      searchInput.addEventListener('search', function () {
        state.search = searchInput.value;
        renderList();
      });

      addProductButton = ui.el('button', {
        type: 'button',
        class: cls.btnPrimary + ' w-full sm:w-auto',
        html: ui.icon('plus', 'w-4 h-4') + 'Nouveau produit',
        onclick: function (event) {
          openProductModal(null, event.currentTarget);
        },
      });

      countLabel = ui.el('p', { class: cls.mutedSm, 'aria-live': 'polite' });
      stripWrap = ui.el('div');
      listWrap = ui.el('div');

      var toolbar = ui.el(
        'div',
        { class: 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between' },
        [
          ui.el('div', { class: 'relative min-w-0 flex-1 sm:max-w-sm' }, [searchIcon, searchInput]),
          addProductButton,
        ]
      );

      ui.mount(
        container,
        ui.el('div', { class: 'space-y-5 animate-fade-in' }, [
          toolbar,
          stripWrap,
          countLabel,
          listWrap,
        ])
      );

      renderStrip();
      renderList();
    }

    // --------------------------------------------------------------------- load
    function renderLoading() {
      ui.mount(
        container,
        ui.el('div', { class: 'space-y-5 animate-fade-in' }, [
          ui.el('div', { class: 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between' }, [
            ui.el('div', { class: 'skeleton h-11 w-full sm:w-72 rounded-xl' }),
            ui.el('div', { class: 'skeleton h-11 w-full sm:w-44 rounded-xl' }),
          ]),
          ui.el('div', { class: 'flex gap-2 overflow-hidden' }, [
            ui.el('div', { class: 'skeleton h-8 w-20 rounded-full shrink-0' }),
            ui.el('div', { class: 'skeleton h-8 w-28 rounded-full shrink-0' }),
            ui.el('div', { class: 'skeleton h-8 w-24 rounded-full shrink-0' }),
          ]),
          ui.skeleton('card', 6),
        ])
      );
    }

    function load() {
      generation += 1;
      var current = generation;
      renderLoading();

      return Promise.all([
        App.api.listCategories(business.id),
        App.api.listProducts(business.id),
      ])
        .then(function (results) {
          if (current !== generation) return;
          state.categories = (results[0] || []).slice().sort(function (a, b) {
            return String(a.name).localeCompare(String(b.name), App.config.LOCALE);
          });
          state.products = results[1] || [];
          renderLayout();
        })
        .catch(function (error) {
          if (current !== generation) return;
          if (error && error.status === 403) {
            ui.mount(
              container,
              ui.emptyState({
                icon: 'lock',
                title: 'Accès restreint',
                message:
                  "Vous n'avez pas accès au catalogue de cette entreprise. Demandez au propriétaire de vous ajouter comme membre.",
              })
            );
            return;
          }
          ui.mount(
            container,
            ui.errorState({
              title: 'Impossible de charger le catalogue',
              message: (error && error.message) || 'Une erreur est survenue. Veuillez réessayer.',
              onRetry: load,
            })
          );
        });
    }

    return load();
  }

  App.views.businessProducts = { renderTab: renderTab };
})();
