// Session state: access token + current user, persisted in localStorage.
// Any change notifies subscribers so the shell can re-render.
(function () {
  'use strict';

  var listeners = [];
  var cachedUser = null;
  var cacheLoaded = false;

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      /* storage unavailable (private mode) - session stays in memory only */
    }
  }

  function safeRemove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      /* nothing to do */
    }
  }

  function notify() {
    var user = App.session.currentUser();
    listeners.slice().forEach(function (fn) {
      try {
        fn(user);
      } catch (err) {
        // A broken subscriber must never break the session itself.
        if (window.console) console.error(err);
      }
    });
  }

  App.session = {
    /** Raw access token, or null. */
    token: function () {
      return safeGet(App.config.STORAGE_TOKEN);
    },

    /** Current user object {id, email, name, role, created_at} or null. */
    currentUser: function () {
      if (!cacheLoaded) {
        var raw = safeGet(App.config.STORAGE_USER);
        try {
          cachedUser = raw ? JSON.parse(raw) : null;
        } catch (err) {
          cachedUser = null;
        }
        cacheLoaded = true;
      }
      return cachedUser;
    },

    /** Persist a successful login. Call this from the login view. */
    save: function (token, user) {
      safeSet(App.config.STORAGE_TOKEN, token);
      safeSet(App.config.STORAGE_USER, JSON.stringify(user || null));
      cachedUser = user || null;
      cacheLoaded = true;
      notify();
    },

    /** Refresh only the user object (e.g. after GET /auth/me). */
    setUser: function (user) {
      safeSet(App.config.STORAGE_USER, JSON.stringify(user || null));
      cachedUser = user || null;
      cacheLoaded = true;
      notify();
    },

    /** Drop token + user without any redirect. */
    clear: function () {
      safeRemove(App.config.STORAGE_TOKEN);
      safeRemove(App.config.STORAGE_USER);
      cachedUser = null;
      cacheLoaded = true;
      notify();
    },

    /**
     * Clear the session. The shell listens to onChange and swaps to the login
     * screen; the current hash is kept so the user lands back where they were.
     */
    logout: function () {
      App.session.clear();
    },

    isAuthenticated: function () {
      return Boolean(App.session.token() && App.session.currentUser());
    },

    /** hasRole('manager', 'super_admin') -> boolean */
    hasRole: function () {
      var user = App.session.currentUser();
      if (!user) return false;
      var roles = Array.prototype.slice.call(arguments);
      if (roles.length === 1 && Array.isArray(roles[0])) roles = roles[0];
      return roles.indexOf(user.role) !== -1;
    },

    isSuperAdmin: function () {
      return App.session.hasRole('super_admin');
    },

    /** True when the current user owns the business, or is super admin. */
    canManageBusiness: function (business) {
      var user = App.session.currentUser();
      if (!user || !business) return false;
      if (user.role === 'super_admin') return true;
      return business.owner_id === user.id;
    },

    /** True when the user may view/use the business (owner, member or admin). */
    canAccessBusiness: function (business) {
      var user = App.session.currentUser();
      if (!user || !business) return false;
      if (App.session.canManageBusiness(business)) return true;
      return Array.isArray(business.member_ids) && business.member_ids.indexOf(user.id) !== -1;
    },

    /**
     * Subscribe to session changes. Returns an unsubscribe function.
     * The callback receives the current user (or null).
     */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        var index = listeners.indexOf(fn);
        if (index !== -1) listeners.splice(index, 1);
      };
    },
  };

  // Keep multiple tabs in sync: signing out in one tab signs out everywhere.
  window.addEventListener('storage', function (event) {
    if (!event) return;
    if (event.key === App.config.STORAGE_TOKEN || event.key === App.config.STORAGE_USER) {
      cacheLoaded = false;
      notify();
    }
  });
})();
