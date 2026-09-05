// Thin typed-ish wrapper around the FastAPI backend.
// One function per endpoint. Every function returns a Promise and throws an
// Error whose .message is already a readable French sentence.
(function () {
  'use strict';

  // Known backend messages mapped to product-grade French copy.
  var MESSAGES = {
    'Sign in is required': 'Vous devez vous connecter pour continuer.',
    'Invalid or expired access token': 'Votre session a expiré. Veuillez vous reconnecter.',
    'User no longer exists': "Ce compte n'existe plus.",
    'Super admin access is required': 'Action réservée au super administrateur.',
    'Incorrect email or password': 'Adresse e-mail ou mot de passe incorrect.',
    'A user with this email already exists': 'Un utilisateur utilise déjà cette adresse e-mail.',
    'Business not found': 'Entreprise introuvable.',
    'Public business not found': "Ce catalogue n'existe pas ou n'est pas public.",
    'You do not have access to this business': "Vous n'avez pas accès à cette entreprise.",
    'Only the owner can manage members': 'Seul le propriétaire peut gérer les membres.',
    'Only the owner can delete a business': 'Seul le propriétaire peut supprimer une entreprise.',
    'Invalid category ID': 'Catégorie invalide.',
    'Invalid business ID': 'Entreprise invalide.',
    'Product not found': 'Produit introuvable.',
    'Invoice not found': 'Facture introuvable.',
    'Each product must belong to this business':
      "Chaque produit doit appartenir à l'entreprise sélectionnée.",
    'PayDunya checkout invoices must total at least 200 FCFA':
      'Le montant total de la facture doit être d’au moins 200 FCFA.',
  };

  // Field names as they appear in FastAPI validation "loc" arrays.
  var FIELD_LABELS = {
    email: 'Adresse e-mail',
    password: 'Mot de passe',
    name: 'Nom',
    role: 'Rôle',
    customer_name: 'Nom du client',
    customer_email: 'E-mail du client',
    customer_phone: 'Téléphone du client',
    currency: 'Devise',
    business_id: 'Entreprise',
    items: 'Articles',
    quantity: 'Quantité',
    unit_price: 'Prix unitaire',
    price: 'Prix',
    description: 'Description',
    visibility: 'Visibilité',
    member_ids: 'Membres',
    category_id: 'Catégorie',
    status: 'Statut',
    slug: 'Identifiant',
  };

  var STATUS_FALLBACK = {
    400: 'Requête invalide.',
    401: 'Votre session a expiré. Veuillez vous reconnecter.',
    403: "Vous n'avez pas les droits nécessaires pour cette action.",
    404: 'Ressource introuvable.',
    409: 'Cet élément existe déjà.',
    422: 'Certaines informations sont invalides.',
    429: 'Trop de requêtes. Réessayez dans un instant.',
    500: 'Une erreur serveur est survenue. Réessayez plus tard.',
    502: "Le service de paiement PayDunya n'a pas répondu correctement.",
    503: 'Service temporairement indisponible.',
  };

  function makeError(message, status, payload) {
    var error = new Error(message);
    error.status = status;
    error.payload = payload || null;
    return error;
  }

  // Pydantic v2 default messages, translated by pattern.
  var VALIDATION_PATTERNS = [
    [/^Field required$/i, 'ce champ est obligatoire.'],
    [/String should have at least (\d+) characters?/i, 'doit contenir au moins $1 caractères.'],
    [/String should have at most (\d+) characters?/i, 'ne doit pas dépasser $1 caractères.'],
    [/Input should be greater than or equal to (\S+)/i, 'doit être supérieur ou égal à $1.'],
    [/Input should be less than or equal to (\S+)/i, 'doit être inférieur ou égal à $1.'],
    [/Input should be greater than (\S+)/i, 'doit être supérieur à $1.'],
    [/Input should be less than (\S+)/i, 'doit être inférieur à $1.'],
    [/value is not a valid email address[\s\S]*/i, "n'est pas une adresse e-mail valide."],
    [/Input should be a valid (integer|number|decimal)/i, 'doit être un nombre valide.'],
    [/Input should be a valid string/i, 'doit être un texte.'],
    [/Input should be a valid list/i, 'doit être une liste.'],
    [/Input should be/i, 'contient une valeur non autorisée.'],
  ];

  function translate(text) {
    if (!text) return '';
    var value = String(text).replace(/^Value error,\s*/i, '');
    if (MESSAGES[value]) return MESSAGES[value];

    for (var index = 0; index < VALIDATION_PATTERNS.length; index += 1) {
      var rule = VALIDATION_PATTERNS[index];
      if (rule[0].test(value)) return value.replace(rule[0], rule[1]);
    }
    return value;
  }

  function fieldLabel(loc) {
    if (!Array.isArray(loc)) return '';
    // Skip the "body" / "query" prefix, keep the last string segment.
    var parts = loc.filter(function (part) {
      return typeof part === 'string' && part !== 'body' && part !== 'query' && part !== 'path';
    });
    var last = parts[parts.length - 1];
    if (!last) return '';
    return FIELD_LABELS[last] || last;
  }

  // FastAPI returns {detail: "..."} or {detail: [{loc, msg, type}, ...]}.
  function readDetail(payload, status) {
    if (!payload) return STATUS_FALLBACK[status] || 'Une erreur inattendue est survenue.';

    var detail = payload.detail;
    if (typeof detail === 'string') {
      // PayDunya SDK failures arrive as raw English text - never show those.
      if (status === 502 && !MESSAGES[detail]) return STATUS_FALLBACK[502];
      return translate(detail);
    }

    if (Array.isArray(detail)) {
      var lines = detail
        .map(function (item) {
          var msg = translate(item && (item.msg || item.message) ? item.msg || item.message : '');
          msg = msg.replace(/^Value error,\s*/i, '');
          var label = fieldLabel(item && item.loc);
          return label ? label + ' : ' + msg : msg;
        })
        .filter(Boolean);
      if (lines.length) return lines.join(' ');
    }

    if (typeof payload.message === 'string') return translate(payload.message);
    return STATUS_FALLBACK[status] || 'Une erreur inattendue est survenue.';
  }

  /**
   * Internal fetch helper.
   * @param {string} path      Path appended to App.config.API_URL (or absolute when opts.absolute).
   * @param {object} [opts]    {method, body, auth, signal, absolute}
   */
  function request(path, opts) {
    opts = opts || {};
    var method = opts.method || 'GET';
    var useAuth = opts.auth !== false;
    var url = opts.absolute ? path : App.config.API_URL + path;

    var headers = { Accept: 'application/json' };
    if (opts.body !== undefined && opts.body !== null) headers['Content-Type'] = 'application/json';
    if (useAuth) {
      var token = App.session.token();
      if (token) headers.Authorization = 'Bearer ' + token;
    }

    return fetch(url, {
      method: method,
      headers: headers,
      signal: opts.signal,
      body: opts.body === undefined || opts.body === null ? undefined : JSON.stringify(opts.body),
    })
      .catch(function (err) {
        if (err && err.name === 'AbortError') throw err;
        throw makeError(
          "Impossible de joindre le serveur. Vérifiez votre connexion et que l'API est démarrée.",
          0
        );
      })
      .then(function (response) {
        if (response.status === 401 && useAuth) {
          App.session.clear();
          throw makeError('Votre session a expiré. Veuillez vous reconnecter.', 401);
        }

        if (response.status === 204 || response.status === 205) return null;

        var isJson = (response.headers.get('content-type') || '').indexOf('application/json') !== -1;
        var parsed = isJson
          ? response.json().catch(function () {
              return null;
            })
          : response.text().catch(function () {
              return null;
            });

        return parsed.then(function (payload) {
          if (response.ok) return payload;
          var message =
            typeof payload === 'string' && payload && !isJson
              ? STATUS_FALLBACK[response.status] || 'Une erreur inattendue est survenue.'
              : readDetail(payload, response.status);
          throw makeError(message, response.status, payload);
        });
      });
  }

  App.api = {
    request: request,

    // ---------------------------------------------------------------- health
    health: function () {
      return request(App.config.API_ROOT + '/health', { auth: false, absolute: true });
    },

    // ------------------------------------------------------------------ auth
    login: function (email, password) {
      return request('/auth/login', {
        method: 'POST',
        auth: false,
        body: { email: email, password: password },
      });
    },

    me: function () {
      return request('/auth/me');
    },

    /** super_admin only. payload = {email, password, name, role} */
    createUser: function (payload) {
      return request('/auth/users', { method: 'POST', body: payload });
    },

    /** super_admin only. */
    listUsers: function () {
      return request('/auth/users');
    },

    // ------------------------------------------------------------ businesses
    /** payload = {name, description, visibility, member_ids} */
    createBusiness: function (payload) {
      return request('/businesses', { method: 'POST', body: payload });
    },

    listBusinesses: function () {
      return request('/businesses');
    },

    getBusiness: function (businessId) {
      return request('/businesses/' + encodeURIComponent(businessId));
    },

    /** Partial update. */
    updateBusiness: function (businessId, payload) {
      return request('/businesses/' + encodeURIComponent(businessId), {
        method: 'PATCH',
        body: payload,
      });
    },

    deleteBusiness: function (businessId) {
      return request('/businesses/' + encodeURIComponent(businessId), { method: 'DELETE' });
    },

    // ------------------------------------------------------------ categories
    createCategory: function (businessId, payload) {
      return request('/businesses/' + encodeURIComponent(businessId) + '/categories', {
        method: 'POST',
        body: payload,
      });
    },

    listCategories: function (businessId) {
      return request('/businesses/' + encodeURIComponent(businessId) + '/categories');
    },

    // -------------------------------------------------------------- products
    /** payload = {name, description, category_id, price, quantity} */
    createProduct: function (businessId, payload) {
      return request('/businesses/' + encodeURIComponent(businessId) + '/products', {
        method: 'POST',
        body: payload,
      });
    },

    listProducts: function (businessId) {
      return request('/businesses/' + encodeURIComponent(businessId) + '/products');
    },

    updateProduct: function (businessId, productId, payload) {
      return request(
        '/businesses/' + encodeURIComponent(businessId) + '/products/' + encodeURIComponent(productId),
        { method: 'PATCH', body: payload }
      );
    },

    deleteProduct: function (businessId, productId) {
      return request(
        '/businesses/' + encodeURIComponent(businessId) + '/products/' + encodeURIComponent(productId),
        { method: 'DELETE' }
      );
    },

    // ------------------------------------------------------- payment history
    listPaymentHistory: function (businessId) {
      return request('/businesses/' + encodeURIComponent(businessId) + '/payment-history');
    },

    // ---------------------------------------------------- public catalog (no auth)
    getPublicBusiness: function (slug) {
      return request('/public/businesses/' + encodeURIComponent(slug), { auth: false });
    },

    listPublicProducts: function (slug) {
      return request('/public/businesses/' + encodeURIComponent(slug) + '/products', { auth: false });
    },

    // -------------------------------------------------------------- invoices
    /**
     * payload = {customer_name, customer_email, customer_phone, currency,
     *            business_id, items:[{name, quantity, unit_price, product_id}]}
     */
    createInvoice: function (payload) {
      return request('/invoices', { method: 'POST', body: payload });
    },

    listInvoices: function () {
      return request('/invoices');
    },

    getInvoice: function (invoiceId) {
      return request('/invoices/' + encodeURIComponent(invoiceId));
    },

    /** status is one of 'pending' | 'paid' | 'canceled'. */
    updateInvoiceStatus: function (invoiceId, status) {
      return request('/invoices/' + encodeURIComponent(invoiceId) + '/status', {
        method: 'PATCH',
        body: { status: status },
      });
    },

    /** Asks PayDunya for a checkout URL. Throws on 502 with a French message. */
    createPaymentLink: function (invoiceId) {
      return request('/invoices/' + encodeURIComponent(invoiceId) + '/payment-link', {
        method: 'POST',
      });
    },
  };
})();
