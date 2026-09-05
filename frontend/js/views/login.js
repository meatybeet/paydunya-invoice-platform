// Sign-in screen. Rendered full-bleed into #auth-outlet by the bootstrap in
// index.html - there is no sidebar and no topbar here, so this view owns its own
// brand header, theme toggle and server-status footer.
//
// On success it only calls App.session.save(): the shell listens to
// App.session.onChange and takes over from there (hides the auth outlet, shows
// the shell, starts the router). This view must never start the router itself.
(function () {
  'use strict';

  var ui = App.ui;
  var cls = ui.cls;

  // Deliberately permissive: the backend is the authority on what a valid
  // address is. This only catches obvious typos before a pointless round trip.
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // The backend refuses to create an account with a shorter password, so no
  // legitimate account can be locked out by this rule.
  var MIN_PASSWORD_LENGTH = 8;

  // ---------------------------------------------------------------------------
  // Small building blocks
  // ---------------------------------------------------------------------------

  /**
   * Show or hide a node.
   * The `hidden` attribute alone is not enough: our alert boxes carry Tailwind's
   * `flex` utility, and an author-level `display: flex` always beats the browser
   * rule for `[hidden]`. Toggling Tailwind's own `hidden` class wins that fight,
   * while the attribute keeps the node out of the accessibility tree.
   */
  function setVisible(node, visible) {
    node.classList.toggle('hidden', !visible);
    node.hidden = !visible;
  }

  function isVisible(node) {
    return !node.hidden;
  }

  /**
   * Build one labelled form control with its inline error slot.
   * Returns {wrap, input, setError(message), clearError()}.
   */
  function buildField(options) {
    var opts = options || {};
    var errorId = opts.id + '-error';
    var describedBy = [errorId].concat(opts.describedBy || []).join(' ');
    var baseExtra = opts.inputExtra ? ' ' + opts.inputExtra : '';

    var input = ui.el('input', {
      id: opts.id,
      name: opts.name || opts.id,
      type: opts.type || 'text',
      class: cls.input + baseExtra,
      placeholder: opts.placeholder || '',
      autocomplete: opts.autocomplete || 'off',
      autocapitalize: 'none',
      autocorrect: 'off',
      spellcheck: 'false',
      inputmode: opts.inputmode || null,
      required: true,
      'aria-describedby': describedBy,
    });

    // No role="alert" here: focus is moved to the invalid field on submit, and
    // aria-describedby makes the screen reader read this message straight away.
    var error = ui.el('p', { id: errorId, class: cls.errorText + ' hidden', hidden: true });

    var control = opts.control
      ? ui.el('div', { class: 'relative' }, [input, opts.control])
      : input;

    var wrap = ui.el('div', { class: cls.field }, [
      ui.el('label', { class: cls.label, for: opts.id }, [
        opts.label,
        ui.el('span', { class: cls.labelRequired, text: '*', 'aria-hidden': 'true' }),
      ]),
      control,
      error,
    ]);

    function setError(message) {
      error.textContent = message;
      setVisible(error, true);
      input.className = cls.inputInvalid + baseExtra;
      input.setAttribute('aria-invalid', 'true');
    }

    function clearError() {
      if (!isVisible(error)) return;
      error.textContent = '';
      setVisible(error, false);
      input.className = cls.input + baseExtra;
      input.removeAttribute('aria-invalid');
    }

    // Clear the inline error as soon as the user starts fixing the value.
    input.addEventListener('input', clearError);

    return { wrap: wrap, input: input, setError: setError, clearError: clearError };
  }

  /** The floating gradient blobs behind the branded panel. */
  function decorativeBlob(extraClass, delaySeconds) {
    return ui.el('div', {
      class: 'pointer-events-none absolute rounded-full blur-3xl animate-float ' + extraClass,
      style: { animationDelay: delaySeconds + 's' },
      'aria-hidden': 'true',
    });
  }

  function brandMark(sizeClass, iconClass) {
    return ui.el('div', {
      class:
        'rounded-xl bg-cyan-600 text-white flex items-center justify-center shadow-sm shrink-0 ' +
        sizeClass,
      html: ui.icon('card', iconClass),
      'aria-hidden': 'true',
    });
  }

  function promiseRow(iconName, title, text) {
    return ui.el('li', { class: 'flex items-start gap-3.5' }, [
      ui.el('span', {
        class:
          'mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-white/10 text-cyan-300 ring-1 ring-inset ' +
          'ring-white/10 flex items-center justify-center',
        html: ui.icon(iconName, 'w-4 h-4'),
        'aria-hidden': 'true',
      }),
      ui.el('div', { class: 'min-w-0' }, [
        ui.el('p', { class: 'text-sm font-bold text-stone-100', text: title }),
        ui.el('p', {
          class: 'text-sm text-stone-400 leading-relaxed mt-0.5 [overflow-wrap:anywhere]',
          text: text,
        }),
      ]),
    ]);
  }

  /** Branded right-hand panel. Hidden below the lg breakpoint. */
  function buildBrandPanel() {
    var panel = ui.el('aside', {
      class:
        'relative hidden lg:flex flex-col justify-between overflow-hidden ' +
        'bg-gradient-to-br from-stone-950 via-stone-900 to-cyan-950 px-12 xl:px-16 py-12 xl:py-14',
    });

    panel.appendChild(
      decorativeBlob('h-72 w-72 -top-16 -right-10 bg-cyan-500/25 dark:bg-cyan-500/20', 0)
    );
    panel.appendChild(
      decorativeBlob('h-80 w-80 -bottom-24 -left-16 bg-cyan-400/10', 1.5)
    );
    panel.appendChild(
      decorativeBlob('h-40 w-40 top-1/2 right-1/3 bg-teal-400/10', 3)
    );

    var content = ui.el('div', {
      class: 'relative z-10 flex flex-1 flex-col justify-between gap-10',
    });

    content.appendChild(
      ui.el('div', { class: 'flex items-center gap-3' }, [
        brandMark('h-10 w-10', 'w-5 h-5'),
        ui.el('div', {}, [
          ui.el('p', {
            class: 'text-sm font-extrabold tracking-tight text-white leading-tight',
            text: 'PayDunya',
          }),
          ui.el('p', {
            class: 'text-[10px] font-bold uppercase tracking-widest text-cyan-300/80',
            text: 'Facturation',
          }),
        ]),
      ])
    );

    content.appendChild(
      ui.el('div', { class: 'max-w-lg animate-slide-up' }, [
        ui.el('p', {
          class: 'text-[11px] font-bold uppercase tracking-widest text-cyan-300/80',
          text: 'Plateforme de facturation',
        }),
        ui.el('h2', {
          class:
            'font-serif text-4xl xl:text-[2.75rem] leading-[1.15] text-white mt-4 [overflow-wrap:anywhere]',
          text: 'Facturez, encaissez et suivez vos paiements au même endroit.',
        }),
        ui.el('p', {
          class: 'text-base text-stone-400 leading-relaxed mt-5',
          text:
            'Gérez vos entreprises, publiez votre catalogue produits et générez des liens ' +
            'de paiement PayDunya en quelques secondes.',
        }),
        ui.el('ul', { class: 'mt-9 space-y-5' }, [
          promiseRow(
            'business',
            'Catalogue partageable',
            'Un lien public par entreprise, prêt à envoyer à vos clients.'
          ),
          promiseRow(
            'invoice',
            'Factures et liens de paiement',
            'Créez une facture, obtenez un lien de paiement sécurisé.'
          ),
          promiseRow(
            'history',
            'Historique des encaissements',
            'Suivez le statut de chaque facture, entreprise par entreprise.'
          ),
        ]),
      ])
    );

    content.appendChild(
      ui.el('p', {
        class: 'text-xs text-stone-500',
        text: 'Paiements traités par PayDunya.',
      })
    );

    panel.appendChild(content);
    return panel;
  }

  /** Theme switch - the login screen has no topbar to borrow one from. */
  function buildThemeToggle() {
    return ui.el('button', {
      type: 'button',
      class: cls.btnIcon,
      'aria-label': 'Basculer entre le thème clair et sombre',
      title: 'Changer de thème',
      html:
        '<span class="hidden dark:block">' +
        ui.icon('sun', 'w-5 h-5') +
        '</span><span class="block dark:hidden">' +
        ui.icon('moon', 'w-5 h-5') +
        '</span>',
      onclick: function () {
        ui.theme.toggle();
      },
    });
  }

  // ---------------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------------
  App.views.login = {
    render: function (container) {
      var submitting = false;

      // --- Fields ----------------------------------------------------------
      var emailField = buildField({
        id: 'login-email',
        label: 'Adresse e-mail',
        type: 'email',
        inputmode: 'email',
        placeholder: 'vous@entreprise.sn',
        autocomplete: 'username',
      });

      var capsWarning = ui.el('p', {
        id: 'login-password-caps',
        class: 'text-xs font-semibold text-amber-600 dark:text-amber-400 hidden',
        text: 'Le verrouillage des majuscules est activé.',
        hidden: true,
      });

      var passwordToggle = ui.el('button', {
        type: 'button',
        class: cls.btnIconGhost + ' absolute right-1.5 top-1/2 -translate-y-1/2',
        'aria-label': 'Afficher le mot de passe',
        'aria-pressed': 'false',
        title: 'Afficher le mot de passe',
        html: ui.icon('eye', 'w-5 h-5'),
      });

      var passwordField = buildField({
        id: 'login-password',
        label: 'Mot de passe',
        type: 'password',
        placeholder: '••••••••',
        autocomplete: 'current-password',
        inputExtra: 'pr-12',
        describedBy: ['login-password-caps'],
        control: passwordToggle,
      });
      passwordField.wrap.appendChild(capsWarning);

      passwordToggle.addEventListener('click', function () {
        var revealed = passwordField.input.type === 'text';
        passwordField.input.type = revealed ? 'password' : 'text';
        var label = revealed ? 'Afficher le mot de passe' : 'Masquer le mot de passe';
        passwordToggle.setAttribute('aria-label', label);
        passwordToggle.setAttribute('title', label);
        passwordToggle.setAttribute('aria-pressed', revealed ? 'false' : 'true');
        passwordToggle.innerHTML = ui.icon(revealed ? 'eye' : 'eye-off', 'w-5 h-5');
        // Keep the caret where the user left it.
        passwordField.input.focus();
      });

      function updateCapsWarning(event) {
        var active = false;
        try {
          active = Boolean(event.getModifierState && event.getModifierState('CapsLock'));
        } catch (err) {
          active = false;
        }
        setVisible(capsWarning, active);
      }
      passwordField.input.addEventListener('keyup', updateCapsWarning);
      passwordField.input.addEventListener('keydown', updateCapsWarning);
      passwordField.input.addEventListener('blur', function () {
        setVisible(capsWarning, false);
      });

      // --- Alerts ----------------------------------------------------------
      // Both alerts live in one wrapper that is itself hidden when empty, so the
      // form never keeps a stray gap where an invisible alert used to be.
      var formAlert = ui.el('div', {
        class: cls.alertError + ' hidden',
        role: 'alert',
        hidden: true,
      });

      // Persistent banner shown when the API cannot be reached at all.
      var serverBannerText = ui.el('p', { class: 'leading-relaxed [overflow-wrap:anywhere]' });
      var serverBannerRetry = ui.el('button', {
        type: 'button',
        class: cls.btnSecondarySm + ' mt-2.5',
        html: ui.icon('refresh', 'w-3.5 h-3.5') + 'Réessayer',
      });
      var serverBanner = ui.el(
        'div',
        { class: cls.alertWarning + ' hidden', role: 'status', hidden: true },
        [
          ui.el('span', {
            class: 'shrink-0 mt-0.5',
            html: ui.icon('warning', 'w-5 h-5'),
            'aria-hidden': 'true',
          }),
          ui.el('div', { class: 'min-w-0' }, [serverBannerText, serverBannerRetry]),
        ]
      );

      var alertsWrap = ui.el('div', { class: 'space-y-3 mb-5 hidden', hidden: true }, [
        serverBanner,
        formAlert,
      ]);

      function syncAlerts() {
        setVisible(alertsWrap, isVisible(serverBanner) || isVisible(formAlert));
      }

      function showFormAlert(message, iconName) {
        formAlert.innerHTML =
          '<span class="shrink-0 mt-0.5">' +
          ui.icon(iconName || 'error', 'w-5 h-5') +
          '</span><p class="[overflow-wrap:anywhere] leading-relaxed">' +
          ui.escapeHtml(message) +
          '</p>';
        setVisible(formAlert, true);
        syncAlerts();
      }

      function hideFormAlert() {
        setVisible(formAlert, false);
        formAlert.innerHTML = '';
        syncAlerts();
      }

      function setServerOffline(offline) {
        if (offline) serverBannerText.textContent = offlineMessage;
        setVisible(serverBanner, Boolean(offline));
        syncAlerts();
      }

      // --- Server status pill ----------------------------------------------
      var statusPill = ui.el('p', {
        class: 'flex items-center gap-2 text-[11px] font-semibold ' + cls.muted,
        role: 'status',
        html:
          '<span class="h-1.5 w-1.5 rounded-full bg-stone-300 dark:bg-stone-700"></span>' +
          'Vérification du serveur…',
      });

      function setStatus(state) {
        if (state === 'ok') {
          statusPill.className =
            'flex items-center gap-2 text-[11px] font-semibold ' + cls.muted;
          statusPill.innerHTML =
            '<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>Serveur connecté';
        } else if (state === 'down') {
          statusPill.className =
            'flex items-center gap-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400';
          statusPill.innerHTML =
            '<span class="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse-subtle"></span>' +
            'Serveur injoignable';
        } else {
          statusPill.className =
            'flex items-center gap-2 text-[11px] font-semibold ' + cls.muted;
          statusPill.innerHTML =
            '<span class="h-1.5 w-1.5 rounded-full bg-stone-300 dark:bg-stone-700 animate-pulse-subtle"></span>' +
            'Vérification du serveur…';
        }
      }

      var offlineMessage =
        'Le serveur ne répond pas. Démarrez l’API (' +
        App.config.API_ROOT +
        ') puis réessayez.';

      function probeServer(options) {
        var opts = options || {};
        setStatus('checking');
        if (opts.button) ui.setBusy(opts.button, true, 'Vérification…');

        return App.api.health().then(
          function () {
            setStatus('ok');
            setServerOffline(false);
            if (opts.button) ui.setBusy(opts.button, false);
            if (opts.announce) {
              ui.toast({ message: 'Le serveur répond de nouveau.', type: 'success' });
            }
          },
          function () {
            setStatus('down');
            setServerOffline(true);
            if (opts.button) ui.setBusy(opts.button, false);
            if (opts.announce) {
              ui.toast({ message: 'Le serveur est toujours injoignable.', type: 'error' });
            }
          }
        );
      }

      serverBannerRetry.addEventListener('click', function () {
        probeServer({ button: serverBannerRetry, announce: true });
      });

      // --- Submit ----------------------------------------------------------
      var submitButton = ui.el('button', {
        type: 'submit',
        class: cls.btnPrimary + ' ' + cls.btnBlock + ' min-h-[3rem]',
        html: ui.icon('lock', 'w-4 h-4') + 'Se connecter',
      });

      function validate() {
        var email = emailField.input.value.trim();
        var password = passwordField.input.value;
        var firstInvalid = null;

        emailField.clearError();
        passwordField.clearError();

        if (!email) {
          emailField.setError('Veuillez saisir votre adresse e-mail.');
          firstInvalid = firstInvalid || emailField.input;
        } else if (!EMAIL_PATTERN.test(email)) {
          emailField.setError('Cette adresse e-mail n’est pas valide.');
          firstInvalid = firstInvalid || emailField.input;
        }

        if (!password) {
          passwordField.setError('Veuillez saisir votre mot de passe.');
          firstInvalid = firstInvalid || passwordField.input;
        } else if (password.length < MIN_PASSWORD_LENGTH) {
          passwordField.setError(
            'Le mot de passe doit contenir au moins ' + MIN_PASSWORD_LENGTH + ' caractères.'
          );
          firstInvalid = firstInvalid || passwordField.input;
        }

        return { valid: !firstInvalid, firstInvalid: firstInvalid, email: email, password: password };
      }

      var form = ui.el('form', {
        class: cls.form,
        novalidate: true,
        'aria-labelledby': 'login-heading',
      });

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (submitting) return;

        hideFormAlert();
        var result = validate();
        if (!result.valid) {
          if (result.firstInvalid) result.firstInvalid.focus();
          return;
        }

        submitting = true;
        ui.setBusy(submitButton, true, 'Connexion…');

        App.api.login(result.email, result.password).then(
          function (payload) {
            if (!payload || !payload.access_token || !payload.user) {
              submitting = false;
              ui.setBusy(submitButton, false);
              showFormAlert(
                'Réponse inattendue du serveur. Réessayez dans un instant.',
                'warning'
              );
              return;
            }
            setStatus('ok');
            setServerOffline(false);
            ui.toast({
              message: 'Bienvenue, ' + (payload.user.name || payload.user.email) + '.',
              type: 'success',
            });
            // The shell listens to onChange and takes over from here.
            App.session.save(payload.access_token, payload.user);
          },
          function (error) {
            submitting = false;
            ui.setBusy(submitButton, false);
            var status = error && error.status;

            if (status === 0) {
              setStatus('down');
              setServerOffline(true);
              // The banner carries the "start the API" instruction; send the
              // keyboard straight to its retry button instead of repeating it.
              ui.toast({ message: offlineMessage, type: 'error' });
              try {
                serverBannerRetry.focus();
              } catch (err) {
                /* focus is a nice-to-have */
              }
              return;
            }

            if (status === 401 || status === 400) {
              showFormAlert('Adresse e-mail ou mot de passe incorrect.');
              passwordField.input.value = '';
              passwordField.input.focus();
              return;
            }

            if (status === 403) {
              showFormAlert(
                (error && error.message) ||
                  'Ce compte n’est pas autorisé à accéder à la plateforme.'
              );
              return;
            }

            showFormAlert(
              (error && error.message) || 'La connexion a échoué. Réessayez dans un instant.'
            );
          }
        );
      });

      form.appendChild(emailField.wrap);
      form.appendChild(passwordField.wrap);
      form.appendChild(ui.el('div', { class: 'pt-1' }, [submitButton]));

      // --- Card ------------------------------------------------------------
      var card = ui.el('div', { class: cls.cardPad + ' animate-slide-up' }, [
        ui.el('div', { class: 'mb-6' }, [
          ui.el('p', { class: cls.eyebrow, text: 'Espace professionnel' }),
          ui.el('h1', {
            id: 'login-heading',
            class: cls.pageTitle + ' mt-2',
            text: 'Se connecter',
          }),
          ui.el('p', {
            class: cls.pageSubtitle,
            text: 'Accédez à vos entreprises, vos catalogues et vos factures PayDunya.',
          }),
        ]),
        alertsWrap,
        form,
      ]);

      // --- Left column (form) ----------------------------------------------
      var formColumn = ui.el('div', {
        class: 'relative flex min-h-screen flex-col px-5 sm:px-8 lg:px-12 xl:px-16 py-6 sm:py-9',
      });

      formColumn.appendChild(
        ui.el(
          'header',
          { class: 'flex items-center justify-between gap-4 shrink-0' },
          [
            ui.el('div', { class: 'flex items-center gap-2.5 min-w-0' }, [
              brandMark('h-9 w-9', 'w-5 h-5'),
              ui.el('div', { class: 'min-w-0' }, [
                ui.el('p', {
                  class: 'text-sm font-extrabold tracking-tight leading-tight truncate',
                  text: 'PayDunya',
                }),
                ui.el('p', {
                  class:
                    'text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500',
                  text: 'Facturation',
                }),
              ]),
            ]),
            buildThemeToggle(),
          ]
        )
      );

      formColumn.appendChild(
        ui.el('main', { class: 'flex flex-1 items-center justify-center py-8 sm:py-10' }, [
          ui.el('div', { class: 'w-full max-w-[26rem]' }, [card]),
        ])
      );

      formColumn.appendChild(
        ui.el(
          'footer',
          {
            class:
              'shrink-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2',
          },
          [
            ui.el('p', {
              class: cls.mutedSm,
              text: 'Plateforme de facturation PayDunya.',
            }),
            statusPill,
          ]
        )
      );

      // --- Root -------------------------------------------------------------
      var root = ui.el('div', { class: 'min-h-screen w-full lg:grid lg:grid-cols-2' }, [
        formColumn,
        buildBrandPanel(),
      ]);

      ui.mount(container, root);

      probeServer();

      // Autofocus only where a keyboard is almost certainly present; on phones an
      // autofocused field pushes the layout behind the on-screen keyboard.
      var wideScreen =
        window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
      if (wideScreen) {
        window.setTimeout(function () {
          try {
            emailField.input.focus();
          } catch (err) {
            /* focus is a nice-to-have, never a failure */
          }
        }, 60);
      }
    },
  };
})();
