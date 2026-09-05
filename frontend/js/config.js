// Global namespace bootstrap. Every other script attaches to window.App.
window.App = window.App || {};
App.views = App.views || {};

function resolveApiUrl() {
  // A tunnel serves the frontend and API from one origin. Local static-server
  // development still talks to the FastAPI server on port 8000. An explicit
  // value is useful if someone later hosts the static files separately.
  if (window.PAYDUNYA_API_URL) return String(window.PAYDUNYA_API_URL).replace(/\/$/, '');
  if (window.location.protocol === 'file:') return 'http://localhost:8000/api';

  var localHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (localHost && window.location.port && window.location.port !== '8000') {
    return 'http://localhost:8000/api';
  }
  return window.location.origin + '/api';
}

App.config = {
  // Base URL of the FastAPI application, including the /api prefix.
  API_URL: resolveApiUrl(),

  // Server root without the /api prefix (used by the /health probe).
  get API_ROOT() {
    return this.API_URL.replace(/\/api\/?$/, '');
  },

  // Public catalog page, used when sharing a business catalog link.
  CATALOG_PAGE: 'catalog.html',

  // localStorage keys.
  STORAGE_TOKEN: 'pd_token',
  STORAGE_USER: 'pd_user',
  STORAGE_THEME: 'theme',

  // PayDunya rejects any checkout below this amount.
  MIN_INVOICE_AMOUNT: 200,

  DEFAULT_CURRENCY: 'XOF',
  LOCALE: 'fr-SN',
};
