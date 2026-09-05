// User administration screen (#/utilisateurs). Super admin only.
// Lists every account, filters by name/e-mail and role, and creates new users.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;

  var ROLE_OPTIONS = [
    { value: 'super_admin', label: 'Super administrateur' },
    { value: 'manager', label: 'Gestionnaire' },
    { value: 'staff', label: 'Personnel' },
  ];

  var ROLE_HINTS = {
    super_admin: 'Accès total : gestion des utilisateurs, de toutes les entreprises et de toutes les factures.',
    manager: 'Peut créer et gérer ses entreprises, ses produits et ses factures.',
    staff: 'Accès aux entreprises dont il est membre, pour le suivi des ventes et des factures.',
  };

  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Fold accents and lowercase so "Ndiaye" matches "ndiayé". */
  function normalizeText(value) {
    var text = String(value === null || value === undefined ? '' : value).toLowerCase();
    if (text.normalize) {
      text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    return text;
  }

  function sortUsers(users) {
    return users.slice().sort(function (a, b) {
      var left = new Date(a && a.created_at ? a.created_at : 0).getTime() || 0;
      var right = new Date(b && b.created_at ? b.created_at : 0).getTime() || 0;
      if (right !== left) return right - left;
      return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), App.config.LOCALE);
    });
  }

  function filterUsers(users, search, role) {
    var needle = normalizeText(search).trim();
    return users.filter(function (user) {
      if (role !== 'all' && user.role !== role) return false;
      if (!needle) return true;
      var haystack = normalizeText((user.name || '') + ' ' + (user.email || ''));
      return haystack.indexOf(needle) !== -1;
    });
  }

  function avatar(user, sizeClass) {
    return ui.el('div', {
      class:
        (sizeClass || 'h-9 w-9') +
        ' shrink-0 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 ' +
        'flex items-center justify-center text-xs font-bold',
      text: ui.initials(user.name || user.email),
      'aria-hidden': 'true',
    });
  }

  function isCurrentUser(user) {
    var me = App.session.currentUser();
    return Boolean(me && user && me.id === user.id);
  }

  function youChip() {
    return ui.el('span', {
      class: cls.badgeAccent + ' shrink-0',
      text: 'Vous',
    });
  }

  function emailLink(user, extraClass) {
    if (!user.email) {
      return ui.el('span', { class: cls.mutedSm, text: '—' });
    }
    return ui.el('a', {
      href: 'mailto:' + user.email,
      class: cls.link + ' text-sm font-medium ' + (extraClass || ''),
      text: user.email,
    });
  }

  // ---------------------------------------------------------------------------
  // Password strength (indicative only - the backend enforces 8 characters)
  // ---------------------------------------------------------------------------
  function passwordStrength(value) {
    var text = String(value || '');
    if (!text) {
      return { score: 0, label: 'Saisissez un mot de passe', tone: 'bg-stone-300 dark:bg-stone-700', text: cls.hint };
    }
    if (text.length < 8) {
      return {
        score: 1,
        label: 'Trop court : 8 caractères minimum',
        tone: 'bg-rose-500',
        text: 'text-xs font-semibold text-rose-600 dark:text-rose-400',
      };
    }
    var variety = 0;
    if (/[a-z]/.test(text)) variety += 1;
    if (/[A-Z]/.test(text)) variety += 1;
    if (/[0-9]/.test(text)) variety += 1;
    if (/[^A-Za-z0-9]/.test(text)) variety += 1;

    if (text.length >= 12 && variety >= 3) {
      return {
        score: 4,
        label: 'Mot de passe robuste',
        tone: 'bg-emerald-500',
        text: 'text-xs font-semibold text-emerald-600 dark:text-emerald-400',
      };
    }
    if (text.length >= 10 && variety >= 2) {
      return {
        score: 3,
        label: 'Correct : ajoutez un chiffre ou un symbole pour renforcer',
        tone: 'bg-cyan-500',
        text: 'text-xs font-semibold text-cyan-700 dark:text-cyan-400',
      };
    }
    return {
      score: 2,
      label: 'Faible : allongez-le et mélangez lettres, chiffres et symboles',
      tone: 'bg-amber-500',
      text: 'text-xs font-semibold text-amber-600 dark:text-amber-400',
    };
  }

  // ---------------------------------------------------------------------------
  // Form field factory - label + control + hint + inline error
  // ---------------------------------------------------------------------------
  function makeField(options) {
    var id = options.id;
    var input = options.input;
    var baseClass = input.className;

    var errorEl = ui.el('p', {
      id: id + '-error',
      class: cls.errorText + ' hidden',
      role: 'alert',
    });
    var hintEl = options.hint
      ? ui.el('p', { id: id + '-hint', class: cls.hint, text: options.hint })
      : null;

    var labelEl = ui.el('label', { class: cls.label, for: id }, [
      options.label,
      options.required ? ui.el('span', { class: cls.labelRequired, text: '*' }) : null,
    ]);

    var wrap = ui.el('div', { class: cls.field }, [
      labelEl,
      options.control || input,
      hintEl,
      errorEl,
    ]);

    function describedBy(withError) {
      var ids = [];
      if (hintEl) ids.push(hintEl.id);
      if (withError) ids.push(errorEl.id);
      if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
      else input.removeAttribute('aria-describedby');
    }
    describedBy(false);

    var field = {
      input: input,
      wrap: wrap,
      setError: function (message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        input.className = options.invalidClass || cls.inputInvalid;
        input.setAttribute('aria-invalid', 'true');
        describedBy(true);
      },
      clearError: function () {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
        input.className = baseClass;
        input.removeAttribute('aria-invalid');
        describedBy(false);
      },
      focus: function () {
        try {
          input.focus();
        } catch (err) {
          /* ignore */
        }
      },
      value: function () {
        return input.value;
      },
    };

    input.addEventListener('input', field.clearError);
    input.addEventListener('change', field.clearError);
    return field;
  }

  // ---------------------------------------------------------------------------
  // "Nouvel utilisateur" modal
  // ---------------------------------------------------------------------------
  function openCreateModal(onCreated) {
    var nameInput = ui.el('input', {
      id: 'nu-name',
      type: 'text',
      class: cls.input,
      autocomplete: 'off',
      placeholder: 'Awa Ndiaye',
      maxlength: '100',
    });
    var nameField = makeField({
      id: 'nu-name',
      label: 'Nom complet',
      required: true,
      input: nameInput,
    });

    var emailInput = ui.el('input', {
      id: 'nu-email',
      type: 'email',
      class: cls.input,
      autocomplete: 'off',
      inputmode: 'email',
      placeholder: 'awa@entreprise.sn',
      maxlength: '254',
    });
    var emailField = makeField({
      id: 'nu-email',
      label: 'Adresse e-mail',
      required: true,
      hint: 'Elle servira d’identifiant de connexion.',
      input: emailInput,
    });

    var passwordBaseClass = cls.input + ' pr-12';
    var passwordInput = ui.el('input', {
      id: 'nu-password',
      type: 'password',
      class: passwordBaseClass,
      autocomplete: 'new-password',
      placeholder: '8 caractères minimum',
      maxlength: '128',
    });
    var toggleButton = ui.el('button', {
      type: 'button',
      class: cls.btnIconGhost + ' absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8',
      'aria-label': 'Afficher le mot de passe',
      'aria-pressed': 'false',
      html: ui.icon('eye', 'w-4 h-4'),
    });
    var passwordControl = ui.el('div', { class: 'relative' }, [passwordInput, toggleButton]);

    toggleButton.addEventListener('click', function () {
      var reveal = passwordInput.type === 'password';
      passwordInput.type = reveal ? 'text' : 'password';
      toggleButton.innerHTML = ui.icon(reveal ? 'eye-off' : 'eye', 'w-4 h-4');
      toggleButton.setAttribute(
        'aria-label',
        reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
      );
      toggleButton.setAttribute('aria-pressed', reveal ? 'true' : 'false');
      passwordInput.focus();
    });

    var strengthBars = [];
    var strengthRow = ui.el('div', { class: 'flex items-center gap-1' });
    for (var barIndex = 0; barIndex < 4; barIndex += 1) {
      var bar = ui.el('span', {
        class: 'h-1 flex-1 rounded-full bg-stone-200 dark:bg-stone-800 transition-colors duration-200',
      });
      strengthBars.push(bar);
      strengthRow.appendChild(bar);
    }
    var strengthLabel = ui.el('p', { class: cls.hint, text: 'Saisissez un mot de passe' });
    var strengthBlock = ui.el(
      'div',
      { class: 'space-y-1.5 pt-0.5', 'aria-live': 'polite' },
      [strengthRow, strengthLabel]
    );

    function refreshStrength() {
      var strength = passwordStrength(passwordInput.value);
      strengthBars.forEach(function (node, index) {
        var active = index < strength.score;
        node.className =
          'h-1 flex-1 rounded-full transition-colors duration-200 ' +
          (active ? strength.tone : 'bg-stone-200 dark:bg-stone-800');
      });
      strengthLabel.className = strength.text;
      strengthLabel.textContent = strength.label;
    }
    passwordInput.addEventListener('input', refreshStrength);

    var passwordField = makeField({
      id: 'nu-password',
      label: 'Mot de passe',
      required: true,
      input: passwordInput,
      control: passwordControl,
      invalidClass: cls.inputInvalid + ' pr-12',
    });

    var roleSelect = ui.el('select', { id: 'nu-role', class: cls.select });
    ROLE_OPTIONS.forEach(function (option) {
      roleSelect.appendChild(
        ui.el('option', { value: option.value, text: option.label })
      );
    });
    roleSelect.value = 'manager';

    var roleHint = ui.el('p', { class: cls.hint, text: ROLE_HINTS.manager });
    var roleField = makeField({
      id: 'nu-role',
      label: 'Rôle',
      required: true,
      input: roleSelect,
    });
    // The hint changes with the selection, so it is appended after the select.
    roleField.wrap.insertBefore(roleHint, roleField.wrap.lastChild);
    roleSelect.addEventListener('change', function () {
      roleHint.textContent = ROLE_HINTS[roleSelect.value] || '';
    });

    var form = ui.el('form', { class: cls.form, novalidate: true }, [
      nameField.wrap,
      emailField.wrap,
      passwordField.wrap,
      strengthBlock,
      roleField.wrap,
      // Enables implicit submission with the Enter key.
      ui.el('button', { type: 'submit', class: 'hidden', tabindex: '-1', 'aria-hidden': 'true' }),
    ]);

    var fields = { name: nameField, email: emailField, password: passwordField, role: roleField };

    function validate() {
      var errors = [];
      var name = nameField.value().trim();
      var email = emailField.value().trim();
      var password = passwordField.value();

      if (name.length < 2) {
        nameField.setError('Le nom doit contenir au moins 2 caractères.');
        errors.push(nameField);
      } else if (name.length > 100) {
        nameField.setError('Le nom ne peut pas dépasser 100 caractères.');
        errors.push(nameField);
      }
      if (!email) {
        emailField.setError('L’adresse e-mail est obligatoire.');
        errors.push(emailField);
      } else if (!EMAIL_PATTERN.test(email)) {
        emailField.setError('Saisissez une adresse e-mail valide, par exemple awa@entreprise.sn.');
        errors.push(emailField);
      }
      if (password.length < 8) {
        passwordField.setError('Le mot de passe doit contenir au moins 8 caractères.');
        errors.push(passwordField);
      }
      if (
        ROLE_OPTIONS.filter(function (option) {
          return option.value === roleSelect.value;
        }).length === 0
      ) {
        roleField.setError('Sélectionnez un rôle.');
        errors.push(roleField);
      }

      if (errors.length) {
        errors[0].focus();
        return null;
      }
      return { name: name, email: email, password: password, role: roleSelect.value };
    }

    /** Map an API error onto a field when possible. Returns true if handled. */
    function applyServerError(error) {
      if (error && error.status === 409) {
        fields.email.setError('Un utilisateur utilise déjà cette adresse e-mail.');
        fields.email.focus();
        return true;
      }
      var detail = error && error.payload ? error.payload.detail : null;
      if (Array.isArray(detail)) {
        var handled = false;
        detail.forEach(function (item) {
          var loc = Array.isArray(item && item.loc) ? item.loc : [];
          var key = loc[loc.length - 1];
          var field = fields[key];
          if (field && !handled) {
            field.setError(error.message);
            field.focus();
            handled = true;
          }
        });
        if (handled) return true;
      }
      return false;
    }

    var handle = ui.modal({
      title: 'Nouvel utilisateur',
      subtitle: 'Créez un accès à la plateforme et attribuez-lui un rôle.',
      size: 'md',
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
          label: 'Créer l’utilisateur',
          variant: 'Primary',
          icon: 'check',
          onClick: function (close, event) {
            submit(event.currentTarget, close);
          },
        },
      ],
    });

    // The primary action is the last button rendered by the modal footer.
    var footerButtons = handle.dialog.querySelectorAll('button');
    var submitButton = footerButtons[footerButtons.length - 1];

    var pending = false;

    function submit(button, close) {
      if (pending) return;
      var payload = validate();
      if (!payload) return;

      pending = true;
      var restore = ui.setBusy(button, true, 'Création…');
      App.api
        .createUser(payload)
        .then(function (user) {
          pending = false;
          close(user);
          ui.toast({
            type: 'success',
            title: 'Utilisateur créé',
            message:
              (user && user.name ? user.name : payload.name) +
              ' peut désormais se connecter en tant que ' +
              ui.roleLabel(payload.role).toLowerCase() +
              '.',
          });
          if (typeof onCreated === 'function') onCreated(user);
        })
        .catch(function (error) {
          pending = false;
          restore();
          if (!applyServerError(error)) ui.toastError(error);
        });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submit(submitButton, handle.close);
    });

    return handle;
  }

  // ---------------------------------------------------------------------------
  // List rendering
  // ---------------------------------------------------------------------------
  function buildTable(users) {
    var wrap = ui.el('div', { class: cls.tableWrap + ' hidden md:block' });
    var table = ui.el('table', { class: cls.table });

    var head = ui.el('thead', { class: cls.thead }, [
      ui.el('tr', {}, [
        ui.el('th', { class: cls.th, scope: 'col', text: 'Utilisateur' }),
        ui.el('th', { class: cls.th, scope: 'col', text: 'Adresse e-mail' }),
        ui.el('th', { class: cls.th, scope: 'col', text: 'Rôle' }),
        ui.el('th', { class: cls.th, scope: 'col', text: 'Créé le' }),
      ]),
    ]);

    var body = ui.el('tbody');
    users.forEach(function (user) {
      var nameCell = ui.el('td', { class: cls.td }, [
        ui.el('div', { class: 'flex items-center gap-3 min-w-0' }, [
          avatar(user),
          ui.el('div', { class: 'min-w-0' }, [
            ui.el('div', { class: 'flex items-center gap-2 min-w-0' }, [
              ui.el('span', {
                class: 'font-semibold text-stone-800 dark:text-stone-100 ' + cls.truncate,
                text: user.name || 'Sans nom',
              }),
              isCurrentUser(user) ? youChip() : null,
            ]),
          ]),
        ]),
      ]);

      var emailCell = ui.el('td', { class: cls.td + ' max-w-[280px]' }, [
        emailLink(user, cls.breakAnywhere),
      ]);

      var roleCell = ui.el('td', { class: cls.td, html: ui.roleBadge(user.role) });

      var dateCell = ui.el('td', { class: cls.td + ' whitespace-nowrap' }, [
        ui.el('div', {
          class: 'text-stone-700 dark:text-stone-300',
          text: ui.dateOnly(user.created_at),
        }),
        ui.el('div', { class: cls.mutedSm, text: ui.timeAgo(user.created_at) }),
      ]);

      body.appendChild(ui.el('tr', { class: cls.tr }, [nameCell, emailCell, roleCell, dateCell]));
    });

    table.appendChild(head);
    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  function buildCards(users) {
    var list = ui.el('ul', { class: 'md:hidden space-y-3' });
    users.forEach(function (user) {
      var item = ui.el('li', {}, [
        ui.el('div', { class: cls.cardPad + ' space-y-3' }, [
          ui.el('div', { class: 'flex items-start justify-between gap-3' }, [
            ui.el('div', { class: 'flex items-center gap-3 min-w-0' }, [
              avatar(user, 'h-10 w-10'),
              ui.el('div', { class: 'min-w-0' }, [
                ui.el('p', {
                  class: 'font-bold text-stone-800 dark:text-stone-100 ' + cls.breakAnywhere,
                  text: user.name || 'Sans nom',
                }),
                isCurrentUser(user)
                  ? ui.el('span', { class: cls.mutedSm, text: 'Votre compte' })
                  : null,
              ]),
            ]),
            ui.fromHTML(ui.roleBadge(user.role)),
          ]),
          ui.el('div', { class: 'flex items-start gap-2 ' + cls.mutedSm }, [
            ui.el('span', {
              class: 'text-stone-400 dark:text-stone-500 shrink-0 mt-0.5',
              html: ui.icon('mail', 'w-4 h-4'),
            }),
            emailLink(user, cls.breakAnywhere),
          ]),
          ui.el('div', { class: 'flex items-center gap-2 ' + cls.mutedSm }, [
            ui.el('span', {
              class: 'text-stone-400 dark:text-stone-500 shrink-0',
              html: ui.icon('calendar', 'w-4 h-4'),
            }),
            ui.el('span', { text: 'Créé le ' + ui.dateOnly(user.created_at) }),
          ]),
        ]),
      ]);
      list.appendChild(item);
    });
    return list;
  }

  function buildStats(users) {
    var counts = { total: users.length, super_admin: 0, manager: 0, staff: 0 };
    users.forEach(function (user) {
      if (counts[user.role] !== undefined) counts[user.role] += 1;
    });

    var tiles = [
      { label: 'Comptes', value: counts.total, accent: true },
      { label: 'Super administrateurs', value: counts.super_admin },
      { label: 'Gestionnaires', value: counts.manager },
      { label: 'Personnel', value: counts.staff },
    ];

    var grid = ui.el('div', { class: cls.gridStats });
    tiles.forEach(function (tile) {
      grid.appendChild(
        ui.el('div', { class: cls.cardPad }, [
          ui.el('p', { class: cls.eyebrow + ' [overflow-wrap:anywhere]', text: tile.label }),
          ui.el('p', {
            class:
              cls.metric +
              ' mt-2 ' +
              (tile.accent ? 'text-cyan-600 dark:text-cyan-400' : ''),
            text: ui.number(tile.value),
          }),
        ])
      );
    });
    return grid;
  }

  // ---------------------------------------------------------------------------
  // Permission-denied state (the router guards this route too)
  // ---------------------------------------------------------------------------
  function renderDenied(container) {
    ui.mount(
      container,
      ui.el('div', { class: cls.page }, [
        ui.pageHeader({
          title: 'Utilisateurs',
          subtitle: 'Administration des comptes de la plateforme.',
        }),
        ui.emptyState({
          icon: 'lock',
          title: 'Accès réservé',
          message:
            'Seul un super administrateur peut consulter et créer les comptes utilisateurs. ' +
            'Contactez l’administrateur de votre organisation si vous avez besoin de cet accès.',
          action: {
            label: 'Retour au tableau de bord',
            icon: 'dashboard',
            onClick: function () {
              App.router.navigate(App.router.paths.dashboard);
            },
          },
        }),
      ])
    );
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------
  App.views.users = {
    render: function (container) {
      if (!App.session.isSuperAdmin()) {
        renderDenied(container);
        return;
      }

      var state = { users: [], search: '', role: 'all', loaded: false };

      var statsRegion = ui.el('div');
      var listRegion = ui.el('div');

      // --- Toolbar ---------------------------------------------------------
      var searchInput = ui.el('input', {
        id: 'users-search',
        type: 'search',
        class: cls.searchInput,
        placeholder: 'Rechercher par nom ou e-mail…',
        autocomplete: 'off',
        disabled: true,
      });
      var searchWrap = ui.el('div', { class: 'relative flex-1 min-w-0' });
      searchWrap.appendChild(
        ui.el('span', {
          class:
            'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ' +
            'text-stone-400 dark:text-stone-500',
          html: ui.icon('search', 'w-4 h-4'),
        })
      );
      searchWrap.appendChild(searchInput);

      var roleSelect = ui.el('select', {
        id: 'users-role-filter',
        class: cls.select,
        disabled: true,
      });
      roleSelect.appendChild(ui.el('option', { value: 'all', text: 'Tous les rôles' }));
      ROLE_OPTIONS.forEach(function (option) {
        roleSelect.appendChild(ui.el('option', { value: option.value, text: option.label }));
      });

      var resultCount = ui.el('p', {
        class: cls.mutedSm,
        'aria-live': 'polite',
        'aria-atomic': 'true',
      });

      var toolbar = ui.el('div', { class: cls.cardPad + ' space-y-3' }, [
        ui.el('div', { class: 'flex flex-col sm:flex-row sm:items-center gap-3' }, [
          ui.el('div', { class: 'flex-1 min-w-0' }, [
            ui.el('label', { class: 'sr-only', for: 'users-search', text: 'Rechercher un utilisateur' }),
            searchWrap,
          ]),
          ui.el('div', { class: 'w-full sm:w-60 shrink-0' }, [
            ui.el('label', { class: 'sr-only', for: 'users-role-filter', text: 'Filtrer par rôle' }),
            roleSelect,
          ]),
        ]),
        resultCount,
      ]);
      toolbar.hidden = true;

      // --- Page shell ------------------------------------------------------
      var page = ui.el('div', { class: cls.page }, [
        ui.pageHeader({
          title: 'Utilisateurs',
          subtitle:
            'Créez les comptes de votre équipe et attribuez à chacun le rôle qui correspond à ses responsabilités.',
          actions: [
            {
              label: 'Nouvel utilisateur',
              icon: 'plus',
              variant: 'Primary',
              onClick: function () {
                openCreateModal(function () {
                  load();
                });
              },
            },
            {
              label: 'Actualiser',
              icon: 'refresh',
              variant: 'Secondary',
              onClick: function () {
                load();
              },
            },
          ],
        }),
        statsRegion,
        toolbar,
        listRegion,
      ]);
      ui.mount(container, page);

      // --- Rendering -------------------------------------------------------
      function renderList() {
        var visible = filterUsers(state.users, state.search, state.role);
        var filtering = Boolean(state.search.trim()) || state.role !== 'all';

        resultCount.textContent = filtering
          ? ui.plural(visible.length, 'utilisateur') +
            ' sur ' +
            ui.plural(state.users.length, 'utilisateur')
          : ui.plural(state.users.length, 'utilisateur') + ' au total';

        if (!state.users.length) {
          ui.mount(
            listRegion,
            ui.emptyState({
              icon: 'users',
              title: 'Aucun utilisateur pour le moment',
              message:
                'Créez le premier compte pour donner accès à la plateforme à votre équipe.',
              action: {
                label: 'Créer un utilisateur',
                icon: 'plus',
                onClick: function () {
                  openCreateModal(function () {
                    load();
                  });
                },
              },
            })
          );
          return;
        }

        if (!visible.length) {
          ui.mount(
            listRegion,
            ui.emptyState({
              icon: 'search',
              title: 'Aucun résultat',
              message:
                'Aucun utilisateur ne correspond à votre recherche. Modifiez les filtres pour élargir les résultats.',
              action: {
                label: 'Réinitialiser les filtres',
                icon: 'refresh',
                variant: 'Secondary',
                onClick: function () {
                  state.search = '';
                  state.role = 'all';
                  searchInput.value = '';
                  roleSelect.value = 'all';
                  renderList();
                  searchInput.focus();
                },
              },
            })
          );
          return;
        }

        var sorted = sortUsers(visible);
        ui.mount(
          listRegion,
          ui.el('div', { class: 'animate-slide-up' }, [buildTable(sorted), buildCards(sorted)])
        );
      }

      function setControlsEnabled(enabled) {
        searchInput.disabled = !enabled;
        roleSelect.disabled = !enabled;
      }

      // --- Data ------------------------------------------------------------
      var requestId = 0;

      function load() {
        var currentRequest = (requestId += 1);
        toolbar.hidden = !state.loaded;
        setControlsEnabled(false);
        if (!state.loaded) {
          ui.mount(statsRegion, ui.skeleton('tile', 4));
        }
        ui.mount(listRegion, ui.skeleton('row', 5));

        return App.api
          .listUsers()
          .then(function (users) {
            // Ignore a response that arrives after the view was replaced.
            if (currentRequest !== requestId || !container.isConnected) return;
            state.users = Array.isArray(users) ? users : [];
            state.loaded = true;
            ui.mount(statsRegion, buildStats(state.users));
            toolbar.hidden = false;
            setControlsEnabled(true);
            renderList();
          })
          .catch(function (error) {
            if (currentRequest !== requestId || !container.isConnected) return;
            ui.mount(statsRegion, '');
            toolbar.hidden = true;
            ui.mount(
              listRegion,
              ui.errorState({
                title: 'Impossible de charger les utilisateurs',
                message: (error && error.message) || 'Une erreur est survenue.',
                onRetry: function () {
                  load();
                },
              })
            );
          });
      }

      var applySearch = ui.debounce(function () {
        state.search = searchInput.value;
        renderList();
      }, 180);

      searchInput.addEventListener('input', applySearch);
      searchInput.addEventListener('search', function () {
        state.search = searchInput.value;
        renderList();
      });
      roleSelect.addEventListener('change', function () {
        state.role = roleSelect.value;
        renderList();
      });

      return load();
    },
  };
})();
