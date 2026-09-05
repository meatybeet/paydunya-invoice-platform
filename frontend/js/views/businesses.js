// Businesses list view (#/entreprises).
// Card grid with client-side search + visibility filter, a create/edit modal
// and an owner-only delete flow.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;
  var el = ui.el;

  var NAME_MIN = 2;
  var NAME_MAX = 150;
  var DESCRIPTION_MAX = 1000;

  var VISIBILITY_FILTERS = [
    { value: 'all', label: 'Toutes' },
    { value: 'public', label: 'Publiques' },
    { value: 'private', label: 'Privées' },
  ];

  var VISIBILITY_OPTIONS = [
    {
      value: 'public',
      icon: 'globe',
      title: 'Publique',
      description: 'Le catalogue est accessible à toute personne disposant du lien.',
    },
    {
      value: 'private',
      icon: 'lock',
      title: 'Privée',
      description: 'Seuls vous et les membres de l’entreprise voient ce catalogue.',
    },
  ];

  var SEGMENT_BASE =
    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500';
  var SEGMENT_ACTIVE = 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-50 shadow-sm';
  var SEGMENT_IDLE =
    'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Absolute URL of the public catalog page. Works on file:// and http://. */
  function catalogUrl(slug) {
    var base = window.location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
    return base + App.config.CATALOG_PAGE + '?slug=' + encodeURIComponent(slug || '');
  }

  /** Lowercase and strip accents so "Teranga" matches "téranga". */
  function foldText(value) {
    var text = String(value === null || value === undefined ? '' : value).toLowerCase();
    try {
      return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (err) {
      return text;
    }
  }

  function businessName(business) {
    return (business && business.name) || 'Entreprise sans nom';
  }

  function sameIdList(first, second) {
    if (first.length !== second.length) return false;
    var left = first.slice().sort();
    var right = second.slice().sort();
    for (var index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Create / edit modal
  // ---------------------------------------------------------------------------

  /**
   * @param {object|null} business  null to create, an existing business to edit.
   * @param {function} onSaved      receives the business returned by the API.
   */
  function openBusinessModal(business, onSaved) {
    var isEdit = Boolean(business);
    // Only a super admin can list users, and only an owner/super admin may change
    // members - so the picker is hidden entirely for everyone else.
    var showMembers = App.session.isSuperAdmin() && (!isEdit || App.session.canManageBusiness(business));
    var currentUser = App.session.currentUser() || {};
    var ownerId = isEdit ? business.owner_id : currentUser.id;

    var form = el('form', { class: cls.form, novalidate: 'novalidate' });

    // --- Name ---------------------------------------------------------------
    var nameError = el('p', { class: cls.errorText, id: 'business-name-error', hidden: true });
    var nameInput = el('input', {
      type: 'text',
      id: 'business-name',
      class: cls.input,
      maxlength: String(NAME_MAX),
      autocomplete: 'organization',
      placeholder: 'Ex. Boutique Teranga',
      value: isEdit ? business.name || '' : '',
      'aria-describedby': 'business-name-error',
    });
    form.appendChild(
      el('div', { class: cls.field }, [
        el('label', {
          class: cls.label,
          for: 'business-name',
          html: 'Nom de l’entreprise <span class="' + cls.labelRequired + '">*</span>',
        }),
        nameInput,
        nameError,
      ])
    );

    // --- Description --------------------------------------------------------
    var descriptionInput = el('textarea', {
      id: 'business-description',
      class: cls.textarea,
      rows: '3',
      maxlength: String(DESCRIPTION_MAX),
      placeholder: 'Décrivez en quelques mots l’activité de l’entreprise.',
      'aria-describedby': 'business-description-hint',
    });
    descriptionInput.value = isEdit ? business.description || '' : '';

    var descriptionCounter = el('span', { class: 'tabular-nums' });
    function refreshCounter() {
      descriptionCounter.textContent = descriptionInput.value.length + ' / ' + DESCRIPTION_MAX;
    }
    descriptionInput.addEventListener('input', refreshCounter);
    refreshCounter();

    form.appendChild(
      el('div', { class: cls.field }, [
        el('label', { class: cls.label, for: 'business-description', text: 'Description' }),
        descriptionInput,
        el(
          'p',
          {
            class: cls.hint + ' flex flex-wrap items-center justify-between gap-2',
            id: 'business-description-hint',
          },
          [el('span', { text: 'Affichée sur le catalogue public.' }), descriptionCounter]
        ),
      ])
    );

    // --- Visibility (segmented radio group) ---------------------------------
    var visibilityHint = el('p', { class: cls.hint });
    var visibilityInputs = [];
    var visibilityGrid = el('div', { class: 'grid grid-cols-1 sm:grid-cols-2 gap-2' });
    var initialVisibility = isEdit && business.visibility === 'public' ? 'public' : 'private';

    VISIBILITY_OPTIONS.forEach(function (option) {
      var input = el('input', {
        type: 'radio',
        name: 'business-visibility',
        value: option.value,
        class: 'sr-only peer',
        checked: option.value === initialVisibility,
      });
      visibilityInputs.push(input);
      input.addEventListener('change', function () {
        if (input.checked) visibilityHint.textContent = option.description;
      });

      visibilityGrid.appendChild(
        el('label', { class: 'cursor-pointer block min-w-0' }, [
          input,
          el('span', {
            class:
              'flex items-start gap-3 rounded-xl border border-stone-200 dark:border-stone-800 ' +
              'bg-stone-50 dark:bg-stone-950 px-3.5 py-3 transition text-stone-400 ' +
              'peer-hover:border-stone-300 dark:peer-hover:border-stone-700 ' +
              'peer-checked:border-cyan-500 peer-checked:bg-cyan-50/60 dark:peer-checked:bg-cyan-500/5 ' +
              'peer-checked:text-cyan-600 dark:peer-checked:text-cyan-400 ' +
              'peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-500 peer-focus-visible:ring-offset-2 ' +
              'peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-stone-900',
            html:
              '<span class="shrink-0 mt-0.5">' +
              ui.icon(option.icon, 'w-5 h-5') +
              '</span>' +
              '<span class="min-w-0">' +
              '<span class="block text-sm font-bold text-stone-800 dark:text-stone-100">' +
              ui.escapeHtml(option.title) +
              '</span>' +
              '<span class="block text-xs mt-0.5 ' +
              cls.muted +
              ' leading-relaxed">' +
              ui.escapeHtml(option.description) +
              '</span>' +
              '</span>',
          }),
        ])
      );
    });

    VISIBILITY_OPTIONS.forEach(function (option) {
      if (option.value === initialVisibility) visibilityHint.textContent = option.description;
    });

    form.appendChild(
      el('fieldset', { class: 'space-y-1.5 min-w-0' }, [
        el('legend', { class: cls.label + ' mb-1.5', text: 'Visibilité' }),
        visibilityGrid,
      ])
    );

    // --- Members ------------------------------------------------------------
    var memberState = { available: false, checkboxes: [] };
    var memberBox = null;

    if (showMembers) {
      memberBox = el('div', {
        class: 'rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-2',
      });
      form.appendChild(
        el('div', { class: cls.field }, [
          el('label', { class: cls.label, text: 'Membres de l’équipe' }),
          el('p', {
            class: cls.hint,
            text:
              'Les membres peuvent gérer le catalogue et les factures de cette entreprise. Le propriétaire y a toujours accès.',
          }),
          memberBox,
        ])
      );
      loadMembers();
    }

    function renderMemberSkeleton() {
      ui.mount(memberBox, ui.skeleton('form', 2));
    }

    function renderMemberError(message) {
      memberState.available = false;
      memberState.checkboxes = [];
      var wrap = el('div', { class: 'p-1 space-y-2' });
      wrap.appendChild(
        el('div', {
          class: cls.alertWarning,
          html:
            '<span class="shrink-0 mt-0.5">' +
            ui.icon('warning', 'w-4 h-4') +
            '</span><span class="[overflow-wrap:anywhere]">' +
            ui.escapeHtml(message) +
            ' Les membres actuels seront conservés.</span>',
        })
      );
      wrap.appendChild(
        el('button', {
          type: 'button',
          class: cls.btnSecondarySm,
          html: ui.icon('refresh', 'w-3.5 h-3.5') + 'Réessayer',
          onclick: loadMembers,
        })
      );
      ui.mount(memberBox, wrap);
    }

    function renderMemberList(users) {
      var selected = {};
      if (isEdit) {
        (business.member_ids || []).forEach(function (id) {
          selected[id] = true;
        });
      }
      // The owner always has access, so never offer them as a member.
      var candidates = users.filter(function (user) {
        return user.id !== ownerId;
      });

      memberState.available = true;
      memberState.checkboxes = [];

      if (!candidates.length) {
        ui.mount(
          memberBox,
          el('p', {
            class: cls.hint + ' px-2 py-3 text-center',
            text: 'Aucun autre utilisateur à ajouter pour le moment.',
          })
        );
        return;
      }

      var summary = el('p', { class: cls.hint + ' px-2 pt-1 pb-2', 'aria-live': 'polite' });
      var list = el('div', {
        class: 'max-h-56 overflow-y-auto space-y-1 pr-0.5',
        role: 'group',
        'aria-label': 'Membres de l’entreprise',
      });

      function refreshSummary() {
        var count = memberState.checkboxes.filter(function (box) {
          return box.checked;
        }).length;
        summary.textContent = count
          ? ui.plural(count, 'membre') + ' sélectionné' + (count > 1 ? 's' : '')
          : 'Aucun membre sélectionné.';
      }

      var rows = [];
      candidates.forEach(function (user) {
        var checkbox = el('input', {
          type: 'checkbox',
          class: cls.checkbox + ' mt-0.5',
          value: user.id,
          checked: Boolean(selected[user.id]),
        });
        checkbox.addEventListener('change', refreshSummary);
        memberState.checkboxes.push(checkbox);

        var row = el(
          'label',
          {
            class:
              'flex items-start gap-3 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ' +
              'hover:bg-stone-100 dark:hover:bg-stone-800/60',
          },
          [
            checkbox,
            el('span', { class: 'min-w-0 flex-1' }, [
              el('span', {
                class: 'block text-sm font-semibold text-stone-800 dark:text-stone-100 truncate',
                text: user.name || user.email,
              }),
              el('span', { class: 'block ' + cls.mutedSm + ' truncate', text: user.email }),
            ]),
            ui.fromHTML('<span class="shrink-0 mt-0.5">' + ui.roleBadge(user.role) + '</span>'),
          ]
        );
        rows.push({ row: row, haystack: foldText(user.name + ' ' + user.email) });
        list.appendChild(row);
      });

      var panel = el('div');
      if (candidates.length > 6) {
        var filterInput = el('input', {
          type: 'search',
          class: cls.input + ' text-sm',
          placeholder: 'Rechercher un utilisateur…',
          'aria-label': 'Rechercher un utilisateur',
        });
        filterInput.addEventListener('input', function () {
          var needle = foldText(filterInput.value.trim());
          rows.forEach(function (entry) {
            entry.row.hidden = Boolean(needle) && entry.haystack.indexOf(needle) === -1;
          });
        });
        panel.appendChild(el('div', { class: 'px-1 pt-1 pb-2' }, [filterInput]));
      }
      panel.appendChild(list);
      panel.appendChild(summary);
      ui.mount(memberBox, panel);
      refreshSummary();
    }

    function loadMembers() {
      renderMemberSkeleton();
      App.api.listUsers().then(
        function (users) {
          if (!memberBox.isConnected) return;
          renderMemberList(Array.isArray(users) ? users : []);
        },
        function (error) {
          if (!memberBox.isConnected) return;
          renderMemberError((error && error.message) || 'Liste des utilisateurs indisponible.');
        }
      );
    }

    // --- Validation & submit ------------------------------------------------
    function setNameError(message) {
      if (message) {
        nameError.textContent = message;
        nameError.hidden = false;
        nameInput.className = cls.inputInvalid;
        nameInput.setAttribute('aria-invalid', 'true');
      } else {
        nameError.textContent = '';
        nameError.hidden = true;
        nameInput.className = cls.input;
        nameInput.removeAttribute('aria-invalid');
      }
    }
    nameInput.addEventListener('input', function () {
      if (!nameError.hidden) setNameError('');
    });

    function selectedVisibility() {
      for (var index = 0; index < visibilityInputs.length; index += 1) {
        if (visibilityInputs[index].checked) return visibilityInputs[index].value;
      }
      return 'private';
    }

    function selectedMemberIds() {
      if (!showMembers || !memberState.available) return null;
      return memberState.checkboxes
        .filter(function (box) {
          return box.checked;
        })
        .map(function (box) {
          return box.value;
        });
    }

    function validate() {
      var name = nameInput.value.trim();
      if (!name) {
        setNameError('Le nom de l’entreprise est obligatoire.');
        nameInput.focus();
        return null;
      }
      if (name.length < NAME_MIN) {
        setNameError('Le nom doit contenir au moins ' + NAME_MIN + ' caractères.');
        nameInput.focus();
        return null;
      }
      setNameError('');
      return {
        name: name,
        description: descriptionInput.value.trim(),
        visibility: selectedVisibility(),
        member_ids: selectedMemberIds(),
      };
    }

    var submitting = false;

    function submit(close, submitButton) {
      if (submitting) return;
      var values = validate();
      if (!values) return;

      var payload;
      if (isEdit) {
        payload = {};
        if (values.name !== (business.name || '')) payload.name = values.name;
        if (values.description !== (business.description || '')) {
          payload.description = values.description || null;
        }
        if (values.visibility !== business.visibility) payload.visibility = values.visibility;
        if (values.member_ids && !sameIdList(values.member_ids, business.member_ids || [])) {
          payload.member_ids = values.member_ids;
        }
        if (!Object.keys(payload).length) {
          ui.toast({ message: 'Aucune modification à enregistrer.', type: 'info' });
          close(null);
          return;
        }
      } else {
        payload = {
          name: values.name,
          description: values.description || null,
          visibility: values.visibility,
          member_ids: values.member_ids || [],
        };
      }

      submitting = true;
      var restore = ui.setBusy(submitButton, true, 'Enregistrement…');
      var call = isEdit
        ? App.api.updateBusiness(business.id, payload)
        : App.api.createBusiness(payload);

      call.then(
        function (saved) {
          submitting = false;
          close(null);
          ui.toast({
            message: isEdit
              ? 'L’entreprise « ' + businessName(saved) + ' » a été mise à jour.'
              : 'L’entreprise « ' + businessName(saved) + ' » a été créée.',
            type: 'success',
          });
          if (typeof onSaved === 'function') onSaved(saved, isEdit);
        },
        function (error) {
          submitting = false;
          restore();
          ui.toastError(error);
        }
      );
    }

    // Hidden submit so pressing Enter inside a field saves the form.
    form.appendChild(
      el('button', { type: 'submit', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', text: 'Enregistrer' })
    );

    var handle = ui.modal({
      title: isEdit ? 'Modifier l’entreprise' : 'Nouvelle entreprise',
      subtitle: isEdit
        ? 'Mettez à jour les informations de « ' + businessName(business) + ' ».'
        : 'Créez une entreprise pour publier un catalogue et émettre des factures.',
      size: 'lg',
      body: form,
      actions: [
        {
          label: 'Annuler',
          variant: 'Secondary',
          onClick: function (close) {
            close(null);
          },
        },
        {
          label: isEdit ? 'Enregistrer' : 'Créer l’entreprise',
          variant: 'Primary',
          icon: isEdit ? 'check' : 'plus',
          onClick: function (close, event) {
            submit(close, event && event.currentTarget);
          },
        },
      ],
    });

    // The primary action lives in the modal footer, outside the <form>.
    var footer = handle.dialog.lastElementChild;
    var footerButtons = footer ? footer.querySelectorAll('button') : [];
    var primaryButton = footerButtons.length ? footerButtons[footerButtons.length - 1] : null;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submit(handle.close, primaryButton);
    });
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------
  App.views.businesses = {
    render: function (container) {
      var state = {
        status: 'loading', // loading | ready | error
        businesses: [],
        error: null,
        query: '',
        visibility: 'all',
      };

      var page = el('div', { class: cls.page });
      var results = el('div');

      // Persistent live region: kept out of the re-rendered results so screen
      // readers actually announce the new count when filters change.
      var summaryLine = el('p', {
        class: cls.mutedSm + ' -mt-2',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        hidden: true,
      });

      // --- Toolbar ----------------------------------------------------------
      var searchInput = el('input', {
        type: 'search',
        class: cls.searchInput + ' pr-11',
        placeholder: 'Rechercher par nom ou identifiant…',
        'aria-label': 'Rechercher une entreprise',
        autocomplete: 'off',
      });

      var clearButton = el('button', {
        type: 'button',
        class:
          'absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center ' +
          'h-8 w-8 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 ' +
          'hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
        'aria-label': 'Effacer la recherche',
        html: ui.icon('close', 'w-4 h-4'),
        hidden: true,
      });

      function applyQuery(value) {
        state.query = value;
        clearButton.hidden = !value;
        renderResults();
      }

      var runSearch = ui.debounce(function () {
        applyQuery(searchInput.value.trim());
      }, 200);

      searchInput.addEventListener('input', runSearch);
      searchInput.addEventListener('search', function () {
        applyQuery(searchInput.value.trim());
      });
      searchInput.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && searchInput.value) {
          event.stopPropagation();
          searchInput.value = '';
          applyQuery('');
        }
      });
      clearButton.addEventListener('click', function () {
        searchInput.value = '';
        applyQuery('');
        searchInput.focus();
      });

      var searchWrap = el('div', { class: 'relative w-full lg:max-w-sm' }, [
        el('span', {
          class:
            'pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400 dark:text-stone-500',
          html: ui.icon('search', 'w-4 h-4'),
        }),
        searchInput,
        clearButton,
      ]);

      var segmentButtons = [];
      var segmentWrap = el('div', {
        class:
          'grid grid-cols-3 gap-1 rounded-xl border border-stone-200 dark:border-stone-800 ' +
          'bg-stone-100/70 dark:bg-stone-900 p-1 sm:inline-flex sm:w-auto shrink-0',
        role: 'group',
        'aria-label': 'Filtrer par visibilité',
      });

      function refreshSegments() {
        segmentButtons.forEach(function (entry) {
          var isActive = entry.value === state.visibility;
          entry.button.className = SEGMENT_BASE + ' ' + (isActive ? SEGMENT_ACTIVE : SEGMENT_IDLE);
          entry.button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
      }

      VISIBILITY_FILTERS.forEach(function (filter) {
        var button = el('button', {
          type: 'button',
          class: SEGMENT_BASE + ' ' + SEGMENT_IDLE,
          text: filter.label,
          onclick: function () {
            state.visibility = filter.value;
            refreshSegments();
            renderResults();
          },
        });
        segmentButtons.push({ value: filter.value, button: button });
        segmentWrap.appendChild(button);
      });
      refreshSegments();

      var toolbar = el(
        'div',
        {
          class: 'flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between',
          hidden: true,
        },
        [searchWrap, segmentWrap]
      );

      // --- Actions ----------------------------------------------------------
      function openCreate() {
        openBusinessModal(null, function (saved) {
          state.businesses = [saved].concat(state.businesses);
          renderResults();
        });
      }

      function openEdit(business) {
        openBusinessModal(business, function (saved) {
          state.businesses = state.businesses.map(function (item) {
            return item.id === saved.id ? saved : item;
          });
          renderResults();
        });
      }

      function confirmDelete(business, triggerButton) {
        ui.confirmDialog({
          danger: true,
          title: 'Supprimer « ' + businessName(business) + ' » ?',
          confirmLabel: 'Supprimer définitivement',
          cancelLabel: 'Annuler',
          message:
            'Cette action est définitive. Tous les produits et toutes les catégories de cette entreprise ' +
            'seront également supprimés. Les factures déjà émises seront conservées.',
        }).then(function (confirmed) {
          if (!confirmed) return;
          // A space keeps the busy state icon-sized on this icon-only button.
          var restore = ui.setBusy(triggerButton, true, ' ');
          App.api.deleteBusiness(business.id).then(
            function () {
              ui.toast({
                message: 'L’entreprise « ' + businessName(business) + ' » a été supprimée.',
                type: 'success',
              });
              state.businesses = state.businesses.filter(function (item) {
                return item.id !== business.id;
              });
              renderResults();
            },
            function (error) {
              restore();
              ui.toastError(error);
            }
          );
        });
      }

      // --- Card -------------------------------------------------------------
      function businessCard(business) {
        var isPublic = business.visibility === 'public';
        var canManage = App.session.canManageBusiness(business);
        var memberCount = (business.member_ids || []).length;
        var titleId = 'business-title-' + business.id;

        var card = el('article', {
          class:
            cls.cardLift +
            ' relative flex flex-col gap-4 min-w-0 hover:border-cyan-500/40 dark:hover:border-cyan-500/30',
          'aria-labelledby': titleId,
        });

        // Head: name (stretched link over the whole card) + visibility badge.
        card.appendChild(
          el('div', { class: 'flex items-start justify-between gap-3' }, [
            el('div', { class: 'min-w-0 flex-1' }, [
              el('h2', { class: cls.cardTitle + ' ' + cls.breakAnywhere, id: titleId }, [
                el('a', {
                  href: App.router.paths.business(business.id),
                  class:
                    'after:absolute after:inset-0 after:content-[\'\'] rounded ' +
                    'hover:text-cyan-700 dark:hover:text-cyan-400 transition-colors ' +
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ' +
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-900',
                  text: businessName(business),
                }),
              ]),
              el('p', {
                class: 'mt-1.5 font-mono text-xs text-stone-400 dark:text-stone-500 break-all',
                title: 'Identifiant du catalogue',
                text: '/' + (business.slug || ''),
              }),
            ]),
            ui.fromHTML(
              '<span class="shrink-0 mt-0.5">' + ui.visibilityBadge(business.visibility) + '</span>'
            ),
          ])
        );

        card.appendChild(
          business.description
            ? el('p', {
                class: 'text-sm ' + cls.muted + ' leading-relaxed line-clamp-2 ' + cls.breakAnywhere,
                text: business.description,
              })
            : el('p', {
                class: 'text-sm italic text-stone-400 dark:text-stone-600',
                text: 'Aucune description.',
              })
        );

        var meta = el('div', {
          class: 'flex flex-wrap items-center gap-x-4 gap-y-1 ' + cls.mutedSm,
        });
        meta.appendChild(
          ui.fromHTML(
            '<span class="inline-flex items-center gap-1.5">' +
              ui.icon('users', 'w-3.5 h-3.5') +
              ui.escapeHtml(memberCount ? ui.plural(memberCount, 'membre') : 'Aucun membre') +
              '</span>'
          )
        );
        meta.appendChild(
          ui.fromHTML(
            '<span class="inline-flex items-center gap-1.5">' +
              ui.icon('calendar', 'w-3.5 h-3.5') +
              'Créée le ' +
              ui.escapeHtml(ui.dateOnly(business.created_at)) +
              '</span>'
          )
        );

        // z-10 keeps these controls clickable above the card's stretched link.
        var actions = el('div', { class: 'relative z-10 flex flex-wrap items-center gap-1.5' });

        if (isPublic) {
          actions.appendChild(
            el('a', {
              href: catalogUrl(business.slug),
              target: '_blank',
              rel: 'noopener noreferrer',
              class: cls.btnGhostSm + ' mr-auto',
              html: ui.icon('external', 'w-3.5 h-3.5') + 'Voir le catalogue',
              title: 'Ouvrir le catalogue public dans un nouvel onglet',
            })
          );
          actions.appendChild(
            el('button', {
              type: 'button',
              class: cls.btnIconGhost,
              'aria-label': 'Copier le lien du catalogue de ' + businessName(business),
              title: 'Copier le lien du catalogue',
              html: ui.icon('copy', 'w-4 h-4'),
              onclick: function () {
                ui.copyToClipboard(catalogUrl(business.slug), 'Lien du catalogue copié.');
              },
            })
          );
        }

        actions.appendChild(
          el('button', {
            type: 'button',
            class: cls.btnIconGhost + (isPublic ? '' : ' ml-auto'),
            'aria-label': 'Modifier ' + businessName(business),
            title: 'Modifier',
            html: ui.icon('edit', 'w-4 h-4'),
            onclick: function () {
              openEdit(business);
            },
          })
        );

        if (canManage) {
          actions.appendChild(
            el('button', {
              type: 'button',
              class: cls.btnIconDanger,
              'aria-label': 'Supprimer ' + businessName(business),
              title: 'Supprimer',
              html: ui.icon('trash', 'w-4 h-4'),
              onclick: function (event) {
                confirmDelete(business, event.currentTarget);
              },
            })
          );
        }

        card.appendChild(
          el(
            'div',
            { class: 'mt-auto flex flex-col gap-3 pt-4 ' + cls.divider },
            [meta, actions]
          )
        );

        return card;
      }

      // --- Rendering --------------------------------------------------------
      function filtered() {
        var needle = foldText(state.query);
        return state.businesses.filter(function (business) {
          if (state.visibility !== 'all' && business.visibility !== state.visibility) return false;
          if (!needle) return true;
          return (
            foldText(business.name).indexOf(needle) !== -1 ||
            foldText(business.slug).indexOf(needle) !== -1
          );
        });
      }

      function resetFilters() {
        searchInput.value = '';
        state.query = '';
        state.visibility = 'all';
        clearButton.hidden = true;
        refreshSegments();
        renderResults();
      }

      function renderResults() {
        if (state.status === 'loading') {
          toolbar.hidden = true;
          summaryLine.hidden = true;
          ui.mount(results, ui.skeleton('card', 6));
          return;
        }

        if (state.status === 'error') {
          toolbar.hidden = true;
          summaryLine.hidden = true;
          ui.mount(
            results,
            ui.errorState({
              title: 'Impossible de charger les entreprises',
              message: (state.error && state.error.message) || 'Une erreur est survenue.',
              onRetry: load,
            })
          );
          return;
        }

        if (!state.businesses.length) {
          toolbar.hidden = true;
          summaryLine.hidden = true;
          ui.mount(
            results,
            ui.emptyState({
              icon: 'business',
              title: 'Aucune entreprise pour le moment',
              message:
                'Créez votre première entreprise pour publier un catalogue de produits et émettre des factures PayDunya.',
              action: { label: 'Nouvelle entreprise', icon: 'plus', onClick: openCreate },
            })
          );
          return;
        }

        toolbar.hidden = false;
        var visible = filtered();
        var publicCount = visible.filter(function (business) {
          return business.visibility === 'public';
        }).length;

        summaryLine.hidden = false;
        summaryLine.textContent = visible.length
          ? ui.plural(visible.length, 'entreprise') +
            ' · ' +
            (publicCount ? ui.plural(publicCount, 'publique') : 'aucune publique')
          : 'Aucun résultat';

        if (!visible.length) {
          ui.mount(
            results,
            ui.emptyState({
              icon: 'search',
              title: 'Aucune entreprise ne correspond',
              message: state.query
                ? 'Aucun résultat pour « ' + state.query +' ». Modifiez votre recherche ou changez de filtre.'
                : 'Aucune entreprise ne correspond au filtre sélectionné.',
              action: {
                label: 'Réinitialiser les filtres',
                icon: 'refresh',
                variant: 'Secondary',
                onClick: resetFilters,
              },
            })
          );
          return;
        }

        var grid = el('div', { class: cls.gridCards });
        visible.forEach(function (business) {
          grid.appendChild(businessCard(business));
        });
        ui.mount(results, grid);
      }

      function load() {
        state.status = 'loading';
        state.error = null;
        renderResults();

        return App.api.listBusinesses().then(
          function (list) {
            if (!page.isConnected) return;
            state.businesses = Array.isArray(list) ? list : [];
            state.status = 'ready';
            renderResults();
          },
          function (error) {
            if (!page.isConnected) return;
            state.error = error;
            state.status = 'error';
            renderResults();
          }
        );
      }

      page.appendChild(
        ui.pageHeader({
          title: 'Entreprises',
          subtitle:
            'Gérez vos entreprises, leurs catalogues publics et les membres qui peuvent y accéder.',
          actions: [{ label: 'Nouvelle entreprise', icon: 'plus', onClick: openCreate }],
        })
      );
      page.appendChild(toolbar);
      page.appendChild(summaryLine);
      page.appendChild(results);
      container.appendChild(page);

      return load();
    },
  };
})();
