// Hash router. Maps a hash to a view module on App.views and renders it into
// the #view outlet. Also keeps the sidebar / bottom-bar navigation in sync.
(function () {
  'use strict';

  var ROUTES = [
    { name: 'dashboard', pattern: '/', nav: 'dashboard' },
    { name: 'businesses', pattern: '/entreprises', nav: 'businesses' },
    {
      name: 'businessProducts',
      pattern: '/entreprises/:id/produits',
      nav: 'businesses',
      fallback: 'businessDetail',
    },
    { name: 'businessDetail', pattern: '/entreprises/:id', nav: 'businesses' },
    { name: 'invoices', pattern: '/factures', nav: 'invoices' },
    { name: 'invoiceDetail', pattern: '/factures/:id', nav: 'invoices' },
    { name: 'users', pattern: '/utilisateurs', nav: 'users', roles: ['super_admin'] },
  ];

  // Views are looked up under several spellings so a view file may export
  // App.views.businessDetail or App.views['business-detail'].
  function resolveView(name) {
    if (!name || !App.views) return null;
    var kebab = name.replace(/[A-Z]/g, function (letter) {
      return '-' + letter.toLowerCase();
    });
    return App.views[name] || App.views[kebab] || null;
  }

  function outlet() {
    return document.getElementById('view');
  }

  function normalize(hash) {
    var value = String(hash || '').replace(/^#/, '');
    if (!value) value = '/';
    if (value.charAt(0) !== '/') value = '/' + value;
    // Drop a trailing slash except for the root path.
    if (value.length > 1) value = value.replace(/\/+$/, '');
    return value;
  }

  function match(path) {
    for (var index = 0; index < ROUTES.length; index += 1) {
      var route = ROUTES[index];
      var routeParts = route.pattern.split('/').filter(Boolean);
      var pathParts = path.split('/').filter(Boolean);
      if (routeParts.length !== pathParts.length) continue;

      var params = {};
      var ok = true;
      for (var part = 0; part < routeParts.length; part += 1) {
        if (routeParts[part].charAt(0) === ':') {
          params[routeParts[part].slice(1)] = decodeURIComponent(pathParts[part]);
        } else if (routeParts[part] !== pathParts[part]) {
          ok = false;
          break;
        }
      }
      if (ok) return { route: route, params: params };
    }
    return null;
  }

  function setActiveNav(navKey) {
    var links = document.querySelectorAll('[data-nav]');
    Array.prototype.forEach.call(links, function (link) {
      var isActive = link.dataset.nav === navKey;
      var activeClasses = (link.dataset.navActive || '').split(' ').filter(Boolean);
      var idleClasses = (link.dataset.navIdle || '').split(' ').filter(Boolean);
      activeClasses.forEach(function (klass) {
        link.classList.toggle(klass, isActive);
      });
      idleClasses.forEach(function (klass) {
        link.classList.toggle(klass, !isActive);
      });
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function renderNotFound(container, path) {
    App.ui.mount(
      container,
      App.ui.emptyState({
        icon: 'search',
        title: 'Page introuvable',
        message:
          'L’adresse « ' + path + ' » ne correspond à aucune page de l’application.',
        action: {
          label: 'Retour au tableau de bord',
          icon: 'dashboard',
          onClick: function () {
            App.router.navigate(App.router.paths.dashboard);
          },
        },
      })
    );
  }

  var current = { name: null, params: {}, path: null };

  function handle(force) {
    var container = outlet();
    if (!container) return;

    // Views are only ever rendered for a signed-in user; the login screen is
    // mounted by the shell bootstrap into its own full-bleed outlet.
    if (!App.session.isAuthenticated()) return;

    var path = normalize(window.location.hash);

    // Guard against rendering the same route twice (a programmatic hash change
    // fires hashchange after we have already rendered).
    if (!force && path === current.path) return;

    var found = match(path);

    if (!found) {
      current = { name: null, params: {}, path: path };
      setActiveNav(null);
      renderNotFound(container, path);
      return;
    }

    var route = found.route;

    // Role guard: send unauthorised users back to the dashboard with an explanation.
    if (route.roles && !App.session.hasRole(route.roles)) {
      App.ui.toast({
        message: 'Cette section est réservée au super administrateur.',
        type: 'warning',
      });
      App.router.navigate(App.router.paths.dashboard, { replace: true });
      return;
    }

    // A route may have a specialised helper module without a top-level
    // `render` method (the products helper is embedded in the business page).
    // In that case, use its declared fallback rather than showing a broken
    // screen just because the helper itself loaded successfully.
    var view = resolveView(route.name);
    if (!view || typeof view.render !== 'function') {
      view = resolveView(route.fallback);
    }
    current = { name: route.name, params: found.params, path: path };
    setActiveNav(route.nav);

    window.scrollTo({ top: 0, behavior: 'auto' });

    if (!view || typeof view.render !== 'function') {
      App.ui.mount(
        container,
        App.ui.errorState({
          title: 'Écran indisponible',
          message: 'Le module « ' + route.name + ' » n’a pas pu être chargé.',
        })
      );
      return;
    }

    container.innerHTML = '';
    try {
      var result = view.render(container, found.params);
      if (result && typeof result.catch === 'function') {
        result.catch(function (error) {
          App.ui.mount(
            container,
            App.ui.errorState({
              message: (error && error.message) || 'Une erreur est survenue.',
              onRetry: function () {
                App.router.refresh();
              },
            })
          );
        });
      }
    } catch (error) {
      App.ui.mount(
        container,
        App.ui.errorState({
          message: (error && error.message) || 'Une erreur est survenue.',
          onRetry: function () {
            App.router.refresh();
          },
        })
      );
    }
  }

  // Wrapped so the hashchange Event is never passed through as the force flag.
  function onHashChange() {
    handle(false);
  }

  App.router = {
    routes: ROUTES,

    // Canonical hashes. Views should build links from these, never hardcode.
    paths: {
      dashboard: '#/',
      businesses: '#/entreprises',
      business: function (id) {
        return '#/entreprises/' + encodeURIComponent(id);
      },
      businessProducts: function (id) {
        return '#/entreprises/' + encodeURIComponent(id) + '/produits';
      },
      invoices: '#/factures',
      invoice: function (id) {
        return '#/factures/' + encodeURIComponent(id);
      },
      users: '#/utilisateurs',
    },

    start: function () {
      if (!App.router._bound) {
        window.addEventListener('hashchange', onHashChange);
        App.router._bound = true;
      }
      if (!window.location.hash) {
        window.location.replace(
          window.location.pathname + window.location.search + App.router.paths.dashboard
        );
      }
      handle(true);
    },

    stop: function () {
      window.removeEventListener('hashchange', onHashChange);
      App.router._bound = false;
    },

    /** navigate('#/factures') or navigate(App.router.paths.business(id)) */
    navigate: function (hash, options) {
      var target = String(hash || '#/');
      if (target.charAt(0) !== '#') target = '#' + (target.charAt(0) === '/' ? '' : '/') + target;
      var samePath = normalize(target) === current.path;
      if (options && options.replace) {
        window.location.replace(window.location.pathname + window.location.search + target);
        if (samePath) handle(true);
      } else if (samePath) {
        handle(true);
      } else {
        window.location.hash = target;
      }
    },

    /** Re-render the current route (after a create/update/delete). */
    refresh: function () {
      handle(true);
    },

    current: function () {
      return { name: current.name, params: current.params, path: current.path };
    },
  };
})();
