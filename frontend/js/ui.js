// Shared UI primitives. Every view builds on these so the product stays visually
// consistent: one set of class strings, one toast system, one modal system.
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Class-string design tokens.
  // Views must compose their markup from these instead of inventing new classes.
  // Every button variant is self-contained (base classes already included).
  // ---------------------------------------------------------------------------
  var FOCUS_OFFSET =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
    'focus-visible:ring-offset-[#fafaf9] dark:focus-visible:ring-offset-[#0c0a09]';

  var BTN_BASE =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ' +
    'transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none ' +
    FOCUS_OFFSET;

  var BTN_BASE_SM =
    'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ' +
    'transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none ' +
    FOCUS_OFFSET;

  var PRIMARY_SKIN =
    'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm shadow-cyan-900/10 focus-visible:ring-cyan-500';
  var SECONDARY_SKIN =
    'border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 ' +
    'text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800/60 ' +
    'shadow-sm focus-visible:ring-stone-400';
  var GHOST_SKIN =
    'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800/60 ' +
    'focus-visible:ring-stone-400';
  var NEUTRAL_SKIN =
    'bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 ' +
    'text-white dark:text-stone-900 shadow-sm focus-visible:ring-stone-500';
  var DANGER_SKIN = 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm focus-visible:ring-rose-500';
  var DANGER_SOFT_SKIN =
    'border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 ' +
    'hover:bg-rose-50 dark:hover:bg-rose-950/30 focus-visible:ring-rose-500';

  var CONTROL_BASE =
    'w-full rounded-xl border border-stone-200 dark:border-stone-800 ' +
    'bg-stone-50 dark:bg-stone-950 px-3.5 py-2.5 text-sm ' +
    'text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 ' +
    'shadow-sm transition duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ' +
    'focus:border-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed';

  var CARD_SKIN =
    'bg-white dark:bg-stone-900 border border-stone-200/70 dark:border-stone-800/70 ' +
    'rounded-2xl shadow-sm';

  var BADGE_BASE =
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ' +
    'leading-none whitespace-nowrap';

  var cls = {
    // --- Layout & surfaces -------------------------------------------------
    page: 'animate-fade-in space-y-6',
    stack: 'space-y-4',
    card: CARD_SKIN,
    cardPad: CARD_SKIN + ' p-5 sm:p-6',
    cardLift: CARD_SKIN + ' p-5 sm:p-6 card-lift',
    cardInteractive:
      CARD_SKIN +
      ' p-5 sm:p-6 card-lift cursor-pointer hover:border-cyan-500/40 dark:hover:border-cyan-500/30 ' +
      FOCUS_OFFSET +
      ' focus-visible:ring-cyan-500',
    surface:
      'bg-stone-50 dark:bg-stone-950/60 border border-stone-200/70 dark:border-stone-800/70 rounded-xl',
    divider: 'border-t border-stone-200/70 dark:border-stone-800/70',
    gridCards: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5',
    gridStats: 'grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5',

    // --- Typography --------------------------------------------------------
    pageTitle:
      'text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50',
    pageSubtitle: 'text-sm text-stone-500 dark:text-stone-400 mt-1 max-w-2xl',
    sectionTitle: 'text-lg font-bold tracking-tight text-stone-800 dark:text-stone-100',
    cardTitle: 'text-base font-bold text-stone-800 dark:text-stone-100',
    eyebrow: 'text-[11px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500',
    metric: 'text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50',
    muted: 'text-stone-500 dark:text-stone-400',
    mutedSm: 'text-xs text-stone-500 dark:text-stone-400',
    truncate: 'truncate',
    breakAnywhere: 'break-words [overflow-wrap:anywhere]',
    link:
      'text-cyan-600 dark:text-cyan-400 font-semibold hover:underline underline-offset-2 rounded ' +
      FOCUS_OFFSET +
      ' focus-visible:ring-cyan-500',
    quote: 'font-serif italic text-stone-500 dark:text-stone-400',

    // --- Form controls -----------------------------------------------------
    form: 'space-y-5',
    field: 'space-y-1.5 min-w-0',
    formGrid: 'grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5',
    formActions:
      'flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t ' +
      'border-stone-200/70 dark:border-stone-800/70 mt-2',
    label:
      'block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400',
    labelRequired: 'text-rose-500 dark:text-rose-400 ml-0.5',
    hint: 'text-xs text-stone-400 dark:text-stone-500 leading-relaxed',
    errorText: 'text-xs font-semibold text-rose-600 dark:text-rose-400',
    input: CONTROL_BASE,
    inputInvalid:
      'w-full rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 ' +
      'px-3.5 py-2.5 text-sm text-stone-900 dark:text-stone-100 shadow-sm transition duration-200 ' +
      'focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500',
    select: CONTROL_BASE + ' pr-9 cursor-pointer',
    textarea: CONTROL_BASE + ' min-h-[104px] resize-y leading-relaxed',
    checkbox:
      'h-4 w-4 shrink-0 rounded border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 ' +
      'text-cyan-600 accent-cyan-600 cursor-pointer focus:ring-2 focus:ring-cyan-500/50',
    radio:
      'h-4 w-4 shrink-0 border-stone-300 dark:border-stone-700 text-cyan-600 accent-cyan-600 ' +
      'cursor-pointer focus:ring-2 focus:ring-cyan-500/50',
    checkRow:
      'flex items-start gap-3 rounded-xl border border-stone-200 dark:border-stone-800 ' +
      'bg-stone-50 dark:bg-stone-950 px-3.5 py-3 cursor-pointer transition ' +
      'hover:border-cyan-500/50 hover:bg-white dark:hover:bg-stone-900',
    searchInput: CONTROL_BASE + ' pl-10',

    // --- Buttons -----------------------------------------------------------
    btnPrimary: BTN_BASE + ' ' + PRIMARY_SKIN,
    btnSecondary: BTN_BASE + ' ' + SECONDARY_SKIN,
    btnGhost: BTN_BASE + ' ' + GHOST_SKIN,
    btnNeutral: BTN_BASE + ' ' + NEUTRAL_SKIN,
    btnDanger: BTN_BASE + ' ' + DANGER_SKIN,
    btnDangerSoft: BTN_BASE + ' ' + DANGER_SOFT_SKIN,
    btnPrimarySm: BTN_BASE_SM + ' ' + PRIMARY_SKIN,
    btnSecondarySm: BTN_BASE_SM + ' ' + SECONDARY_SKIN,
    btnGhostSm: BTN_BASE_SM + ' ' + GHOST_SKIN,
    btnNeutralSm: BTN_BASE_SM + ' ' + NEUTRAL_SKIN,
    btnDangerSm: BTN_BASE_SM + ' ' + DANGER_SKIN,
    btnDangerSoftSm: BTN_BASE_SM + ' ' + DANGER_SOFT_SKIN,
    btnBlock: 'w-full',
    btnIcon:
      'inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl border ' +
      'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 ' +
      'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 ' +
      'hover:bg-stone-50 dark:hover:bg-stone-800/60 shadow-sm transition-all active:scale-95 ' +
      FOCUS_OFFSET +
      ' focus-visible:ring-stone-400',
    btnIconGhost:
      'inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl ' +
      'text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 ' +
      'hover:bg-stone-100 dark:hover:bg-stone-800/60 transition-all active:scale-95 ' +
      FOCUS_OFFSET +
      ' focus-visible:ring-stone-400',
    btnIconDanger:
      'inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-xl ' +
      'text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 ' +
      'hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all active:scale-95 ' +
      FOCUS_OFFSET +
      ' focus-visible:ring-rose-500',

    // --- Tables ------------------------------------------------------------
    tableWrap:
      'overflow-x-auto rounded-2xl border border-stone-200/70 dark:border-stone-800/70 ' +
      'bg-white dark:bg-stone-900 shadow-sm',
    table: 'w-full text-sm text-left border-collapse',
    thead:
      'bg-stone-50/80 dark:bg-stone-950/40 border-b border-stone-200/70 dark:border-stone-800/70',
    th: 'px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 whitespace-nowrap',
    td: 'px-4 py-3.5 align-middle text-stone-700 dark:text-stone-300',
    tr:
      'border-b border-stone-100 dark:border-stone-800/60 last:border-0 ' +
      'transition-colors hover:bg-stone-50/70 dark:hover:bg-stone-800/30',

    // --- Badges & pills ----------------------------------------------------
    badge: BADGE_BASE,
    badgeNeutral:
      BADGE_BASE + ' bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
    badgeAccent: BADGE_BASE + ' bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400',
    chip:
      'inline-flex items-center gap-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 ' +
      'px-2 py-1 text-xs font-semibold text-stone-600 dark:text-stone-300',

    // --- Alerts ------------------------------------------------------------
    alertInfo:
      'flex items-start gap-3 rounded-xl border border-cyan-200/70 dark:border-cyan-900/40 ' +
      'bg-cyan-50/70 dark:bg-cyan-500/5 px-4 py-3 text-sm text-cyan-900 dark:text-cyan-200',
    alertWarning:
      'flex items-start gap-3 rounded-xl border border-amber-200/70 dark:border-amber-900/40 ' +
      'bg-amber-50/70 dark:bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-200',
    alertError:
      'flex items-start gap-3 rounded-xl border border-rose-200/70 dark:border-rose-900/40 ' +
      'bg-rose-50/70 dark:bg-rose-500/5 px-4 py-3 text-sm text-rose-900 dark:text-rose-200',
    alertSuccess:
      'flex items-start gap-3 rounded-xl border border-emerald-200/70 dark:border-emerald-900/40 ' +
      'bg-emerald-50/70 dark:bg-emerald-500/5 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200',
  };

  // ---------------------------------------------------------------------------
  // Icons - heroicons-style stroke paths, returned as SVG strings.
  // ---------------------------------------------------------------------------
  var ICON_PATHS = {
    dashboard: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/>',
    business: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/>',
    invoice: '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>',
    users: '<path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>',
    user: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>',
    plus: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>',
    edit: '<path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>',
    trash: '<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>',
    link: '<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/>',
    copy: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/>',
    external: '<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>',
    search: '<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>',
    sun: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"/>',
    moon: '<path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"/>',
    close: '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>',
    chevron: '<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>',
    'chevron-down': '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>',
    'chevron-left': '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>',
    back: '<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>',
    check: '<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>',
    'check-circle': '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    warning: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>',
    error: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>',
    info: '<path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>',
    logout: '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/>',
    package: '<path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/>',
    tag: '<path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"/><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z"/>',
    history: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    menu: '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>',
    refresh: '<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992V4.356m0 4.992l-3.181-3.183a8.25 8.25 0 00-11.667 0L3.5 7.83m.478 7.822H-.014m4.008 0v4.99m0-4.99l3.181 3.183a8.25 8.25 0 0011.667 0l2.667-2.665"/>',
    money: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    card: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/>',
    mail: '<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>',
    phone: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/>',
    calendar: '<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>',
    eye: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',
    'eye-off': '<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/>',
    lock: '<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>',
    globe: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0a8.949 8.949 0 004.951-1.488A3.987 3.987 0 0013 16h-2a3.987 3.987 0 00-3.951 3.512A8.949 8.949 0 0012 21zM3.6 9h16.8M3.6 15h16.8"/>',
    inbox: '<path stroke-linecap="round" stroke-linejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z"/>',
    filter: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"/>',
    shield: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>',
  };

  function icon(name, extraClass) {
    var path = ICON_PATHS[name];
    if (!path) path = ICON_PATHS.info;
    var klass = extraClass || 'w-5 h-5';
    return (
      '<svg class="' +
      klass +
      '" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      path +
      '</svg>'
    );
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function appendChild(node, child) {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) {
      child.forEach(function (item) {
        appendChild(node, item);
      });
      return;
    }
    if (child instanceof Node) {
      node.appendChild(child);
      return;
    }
    node.appendChild(document.createTextNode(String(child)));
  }

  /**
   * el('button', {class: cls.btnPrimary, onclick: fn}, ['Enregistrer'])
   * Special attrs: class/className, text, html, dataset {}, style {}, on<event> functions.
   */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class' || key === 'className') {
          node.className = value;
        } else if (key === 'text') {
          node.textContent = String(value);
        } else if (key === 'html') {
          node.innerHTML = value;
        } else if (key === 'dataset') {
          Object.keys(value).forEach(function (dataKey) {
            node.dataset[dataKey] = value[dataKey];
          });
        } else if (key === 'style' && typeof value === 'object') {
          Object.keys(value).forEach(function (styleKey) {
            node.style[styleKey] = value[styleKey];
          });
        } else if (key.indexOf('on') === 0 && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
          node.setAttribute(key, '');
        } else {
          node.setAttribute(key, value);
        }
      });
    }
    appendChild(node, children);
    return node;
  }

  /** Turn an HTML string into a single element (useful with the icon() strings). */
  function fromHTML(html) {
    var template = document.createElement('template');
    template.innerHTML = String(html).trim();
    return template.content.firstElementChild;
  }

  /** Replace the whole content of a container. Accepts nodes or HTML strings. */
  function mount(container, content) {
    if (!container) return container;
    container.innerHTML = '';
    if (typeof content === 'string') {
      container.innerHTML = content;
    } else {
      appendChild(container, content);
    }
    return container;
  }

  // ---------------------------------------------------------------------------
  // Formatting (fr-SN)
  // ---------------------------------------------------------------------------
  var moneyFormatters = {};

  function money(value, currency) {
    var code = currency || App.config.DEFAULT_CURRENCY;
    var amount = Number(value);
    if (!isFinite(amount)) amount = 0;
    if (!moneyFormatters[code]) {
      try {
        moneyFormatters[code] = new Intl.NumberFormat(App.config.LOCALE, {
          style: 'currency',
          currency: code,
          maximumFractionDigits: 0,
        });
      } catch (err) {
        moneyFormatters[code] = {
          format: function (n) {
            return Math.round(n).toLocaleString(App.config.LOCALE) + ' ' + code;
          },
        };
      }
    }
    return moneyFormatters[code].format(amount);
  }

  function number(value) {
    var amount = Number(value);
    if (!isFinite(amount)) amount = 0;
    return new Intl.NumberFormat(App.config.LOCALE).format(amount);
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    var date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  function dateTime(value) {
    var date = parseDate(value);
    if (!date) return '—';
    return date.toLocaleString(App.config.LOCALE, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function dateOnly(value) {
    var date = parseDate(value);
    if (!date) return '—';
    return date.toLocaleDateString(App.config.LOCALE, {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  /** Short relative label: "il y a 3 h", "hier", "il y a 2 j". */
  function timeAgo(value) {
    var date = parseDate(value);
    if (!date) return '—';
    var seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "à l'instant";
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return 'il y a ' + minutes + ' min';
    var hours = Math.round(minutes / 60);
    if (hours < 24) return 'il y a ' + hours + ' h';
    var days = Math.round(hours / 24);
    if (days === 1) return 'hier';
    if (days < 30) return 'il y a ' + days + ' jours';
    return dateOnly(date);
  }

  function initials(name) {
    var text = String(name || '').trim();
    if (!text) return '?';
    var parts = text.split(/\s+/).slice(0, 2);
    return parts
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join('');
  }

  // ---------------------------------------------------------------------------
  // Badges
  // ---------------------------------------------------------------------------
  var STATUS_META = {
    pending: {
      label: 'En attente',
      skin: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
      dot: 'bg-amber-500',
    },
    paid: {
      label: 'Payée',
      skin: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
      dot: 'bg-emerald-500',
    },
    canceled: {
      label: 'Annulée',
      skin: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
      dot: 'bg-rose-500',
    },
  };

  var ROLE_META = {
    super_admin: {
      label: 'Super administrateur',
      short: 'Super admin',
      skin: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400',
    },
    manager: {
      label: 'Gestionnaire',
      short: 'Gestionnaire',
      skin: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
    },
    staff: {
      label: 'Personnel',
      short: 'Personnel',
      skin: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
    },
  };

  var VISIBILITY_META = {
    public: {
      label: 'Public',
      skin: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
      icon: 'globe',
    },
    private: {
      label: 'Privé',
      skin: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
      icon: 'lock',
    },
  };

  function statusBadge(status) {
    var meta = STATUS_META[status] || {
      label: status || 'Inconnu',
      skin: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
      dot: 'bg-stone-400',
    };
    return (
      '<span class="' +
      cls.badge +
      ' ' +
      meta.skin +
      '"><span class="h-1.5 w-1.5 rounded-full ' +
      meta.dot +
      '"></span>' +
      escapeHtml(meta.label) +
      '</span>'
    );
  }

  function statusLabel(status) {
    return (STATUS_META[status] || {}).label || status || '';
  }

  function roleBadge(role) {
    var meta = ROLE_META[role] || {
      short: role || 'Inconnu',
      skin: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
    };
    return '<span class="' + cls.badge + ' ' + meta.skin + '">' + escapeHtml(meta.short) + '</span>';
  }

  function roleLabel(role) {
    return (ROLE_META[role] || {}).label || role || '';
  }

  function visibilityBadge(visibility) {
    var meta = VISIBILITY_META[visibility] || VISIBILITY_META.private;
    return (
      '<span class="' +
      cls.badge +
      ' ' +
      meta.skin +
      '">' +
      icon(meta.icon, 'w-3 h-3') +
      escapeHtml(meta.label) +
      '</span>'
    );
  }

  function visibilityLabel(visibility) {
    return (VISIBILITY_META[visibility] || VISIBILITY_META.private).label;
  }

  // ---------------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------------
  var TOAST_SKINS = {
    success: {
      icon: 'check-circle',
      accent: 'text-emerald-500',
      ring: 'border-emerald-200/70 dark:border-emerald-900/50',
    },
    error: {
      icon: 'error',
      accent: 'text-rose-500',
      ring: 'border-rose-200/70 dark:border-rose-900/50',
    },
    warning: {
      icon: 'warning',
      accent: 'text-amber-500',
      ring: 'border-amber-200/70 dark:border-amber-900/50',
    },
    info: {
      icon: 'info',
      accent: 'text-cyan-500',
      ring: 'border-stone-200/70 dark:border-stone-800/70',
    },
  };

  function toastContainer() {
    var node = document.getElementById('toast-container');
    if (!node) {
      node = el('div', {
        id: 'toast-container',
        class:
          'fixed z-[60] inset-x-3 bottom-3 flex flex-col-reverse items-stretch gap-2 ' +
          'sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px] sm:items-end pointer-events-none',
        'aria-live': 'polite',
        'aria-atomic': 'false',
      });
      document.body.appendChild(node);
    }
    return node;
  }

  /** toast({message, type: 'success'|'error'|'warning'|'info', title, duration}) */
  function toast(options) {
    var opts = typeof options === 'string' ? { message: options } : options || {};
    var type = TOAST_SKINS[opts.type] ? opts.type : 'info';
    var skin = TOAST_SKINS[type];
    var duration = opts.duration || (type === 'error' ? 7000 : 4000);

    var container = toastContainer();
    // Never let toasts pile up beyond a readable stack.
    while (container.children.length >= 4) {
      container.removeChild(container.firstChild);
    }

    var node = el('div', {
      class:
        'pointer-events-auto w-full sm:max-w-sm bg-white dark:bg-stone-900 border ' +
        skin.ring +
        ' rounded-2xl shadow-lg shadow-stone-900/5 px-4 py-3 flex items-start gap-3 toast-enter',
      role: type === 'error' ? 'alert' : 'status',
    });

    node.innerHTML =
      '<span class="' +
      skin.accent +
      ' shrink-0 mt-0.5">' +
      icon(skin.icon, 'w-5 h-5') +
      '</span>' +
      '<div class="min-w-0 flex-1">' +
      (opts.title
        ? '<p class="text-sm font-bold text-stone-800 dark:text-stone-100">' +
          escapeHtml(opts.title) +
          '</p>'
        : '') +
      '<p class="text-sm text-stone-600 dark:text-stone-300 [overflow-wrap:anywhere]">' +
      escapeHtml(opts.message || '') +
      '</p>' +
      '</div>';

    var closeBtn = el('button', {
      type: 'button',
      class: cls.btnIconGhost + ' h-7 w-7 -mr-1 -mt-0.5',
      'aria-label': 'Fermer la notification',
      html: icon('close', 'w-4 h-4'),
    });
    node.appendChild(closeBtn);

    var timer = null;
    function dismiss() {
      if (timer) window.clearTimeout(timer);
      node.classList.remove('toast-enter');
      node.classList.add('toast-leave');
      window.setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 220);
    }

    closeBtn.addEventListener('click', dismiss);
    container.appendChild(node);
    timer = window.setTimeout(dismiss, duration);

    // Pausing on hover keeps long error messages readable.
    node.addEventListener('mouseenter', function () {
      if (timer) window.clearTimeout(timer);
    });
    node.addEventListener('mouseleave', function () {
      timer = window.setTimeout(dismiss, 2000);
    });

    return dismiss;
  }

  function toastError(error) {
    toast({ message: (error && error.message) || 'Une erreur est survenue.', type: 'error' });
  }

  // ---------------------------------------------------------------------------
  // Modal & confirm dialog
  // ---------------------------------------------------------------------------
  var MODAL_SIZES = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  /**
   * modal({title, subtitle, body, actions, size, dismissible, onClose})
   * body: string HTML or Node. actions: [{label, variant, onClick(close), type, autofocus}]
   * Returns {dialog, close(result), body: <Node>}
   */
  function modal(options) {
    var opts = options || {};
    var size = MODAL_SIZES[opts.size] || MODAL_SIZES.md;
    var dismissible = opts.dismissible !== false;

    var dialog = el('dialog', {
      class:
        'w-[calc(100vw-1.5rem)] ' +
        size +
        ' p-0 rounded-2xl border border-stone-200 dark:border-stone-800 ' +
        'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xl ' +
        'animate-fade-in overflow-visible',
      'aria-label': opts.title || 'Fenêtre',
    });

    var bodyWrap = el('div', { class: 'px-5 sm:px-6 py-5 max-h-[65vh] overflow-y-auto' });
    if (opts.body instanceof Node) {
      bodyWrap.appendChild(opts.body);
    } else if (typeof opts.body === 'string') {
      bodyWrap.innerHTML = opts.body;
    }

    var header = el(
      'div',
      {
        class:
          'flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b ' +
          'border-stone-200/70 dark:border-stone-800/70',
      },
      [
        el('div', { class: 'min-w-0' }, [
          el('h2', {
            class: 'text-lg font-extrabold tracking-tight text-stone-900 dark:text-stone-50',
            text: opts.title || '',
          }),
          opts.subtitle
            ? el('p', { class: 'text-sm ' + cls.muted + ' mt-1', text: opts.subtitle })
            : null,
        ]),
      ]
    );

    function close(result) {
      if (dialog.open) dialog.close();
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
      if (typeof opts.onClose === 'function') opts.onClose(result);
    }

    if (dismissible) {
      header.appendChild(
        el('button', {
          type: 'button',
          class: cls.btnIconGhost,
          'aria-label': 'Fermer',
          html: icon('close', 'w-5 h-5'),
          onclick: function () {
            close(null);
          },
        })
      );
    }

    dialog.appendChild(header);
    dialog.appendChild(bodyWrap);

    var actions = Array.isArray(opts.actions) ? opts.actions : [];
    if (actions.length) {
      var footer = el('div', {
        class:
          'flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 sm:px-6 py-4 ' +
          'border-t border-stone-200/70 dark:border-stone-800/70 bg-stone-50/60 dark:bg-stone-950/30 ' +
          'rounded-b-2xl',
      });
      actions.forEach(function (action) {
        var variantKey =
          'btn' + (action.variant || 'Secondary').charAt(0).toUpperCase() + (action.variant || 'Secondary').slice(1);
        var button = el('button', {
          type: action.type || 'button',
          class: (cls[variantKey] || cls.btnSecondary) + ' w-full sm:w-auto',
          html: (action.icon ? icon(action.icon, 'w-4 h-4') : '') + escapeHtml(action.label || ''),
          onclick: function (event) {
            if (typeof action.onClick === 'function') {
              action.onClick(close, event);
            } else {
              close(action.value !== undefined ? action.value : null);
            }
          },
        });
        if (action.autofocus) button.setAttribute('data-autofocus', 'true');
        footer.appendChild(button);
      });
      dialog.appendChild(footer);
    }

    document.body.appendChild(dialog);
    dialog.showModal();

    // Close on backdrop click (the dialog element itself is the backdrop hit area).
    if (dismissible) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) close(null);
      });
    }
    dialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      if (dismissible) close(null);
    });

    // Focus the most useful control.
    var focusTarget =
      dialog.querySelector('[data-autofocus]') ||
      bodyWrap.querySelector('input:not([type=hidden]), select, textarea') ||
      dialog.querySelector('button');
    if (focusTarget) {
      window.setTimeout(function () {
        try {
          focusTarget.focus();
        } catch (err) {
          /* ignore */
        }
      }, 30);
    }

    return { dialog: dialog, body: bodyWrap, close: close };
  }

  /** confirmDialog({title, message, danger, confirmLabel, cancelLabel}) -> Promise<boolean> */
  function confirmDialog(options) {
    var opts = options || {};
    return new Promise(function (resolve) {
      var settled = false;
      function settle(value) {
        if (settled) return;
        settled = true;
        resolve(Boolean(value));
      }

      var body =
        '<div class="flex items-start gap-3">' +
        '<span class="' +
        (opts.danger ? 'text-rose-500' : 'text-cyan-500') +
        ' shrink-0 mt-0.5">' +
        icon(opts.danger ? 'warning' : 'info', 'w-6 h-6') +
        '</span>' +
        '<p class="text-sm leading-relaxed text-stone-600 dark:text-stone-300 [overflow-wrap:anywhere]">' +
        escapeHtml(opts.message || '') +
        '</p>' +
        '</div>';

      modal({
        title: opts.title || 'Confirmer l’action',
        body: body,
        size: 'sm',
        onClose: function () {
          settle(false);
        },
        actions: [
          {
            label: opts.cancelLabel || 'Annuler',
            variant: 'Secondary',
            onClick: function (close) {
              settle(false);
              close();
            },
          },
          {
            label: opts.confirmLabel || (opts.danger ? 'Supprimer' : 'Confirmer'),
            variant: opts.danger ? 'Danger' : 'Primary',
            autofocus: true,
            onClick: function (close) {
              settle(true);
              close();
            },
          },
        ],
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Loading / empty / error states
  // ---------------------------------------------------------------------------
  var SKELETON_KINDS = {
    card:
      '<div class="' +
      CARD_SKIN +
      ' p-5 sm:p-6 space-y-3">' +
      '<div class="skeleton h-4 w-1/3 rounded"></div>' +
      '<div class="skeleton h-3 w-2/3 rounded"></div>' +
      '<div class="skeleton h-3 w-1/2 rounded"></div>' +
      '<div class="skeleton h-9 w-28 rounded-xl mt-4"></div>' +
      '</div>',
    tile:
      '<div class="' +
      CARD_SKIN +
      ' p-5 space-y-3">' +
      '<div class="skeleton h-3 w-20 rounded"></div>' +
      '<div class="skeleton h-8 w-24 rounded"></div>' +
      '</div>',
    row:
      '<div class="flex items-center gap-4 px-4 py-4 border-b border-stone-100 dark:border-stone-800/60 last:border-0">' +
      '<div class="skeleton h-9 w-9 rounded-xl shrink-0"></div>' +
      '<div class="flex-1 space-y-2 min-w-0">' +
      '<div class="skeleton h-3 w-2/5 rounded"></div>' +
      '<div class="skeleton h-3 w-1/4 rounded"></div>' +
      '</div>' +
      '<div class="skeleton h-6 w-20 rounded-full shrink-0"></div>' +
      '</div>',
    text: '<div class="skeleton h-3 w-full rounded"></div>',
    form:
      '<div class="space-y-2">' +
      '<div class="skeleton h-3 w-24 rounded"></div>' +
      '<div class="skeleton h-11 w-full rounded-xl"></div>' +
      '</div>',
  };

  /**
   * skeleton('card', 3) -> element containing 3 card placeholders.
   * Kinds: 'card' | 'tile' | 'row' | 'text' | 'form'.
   */
  function skeleton(kind, count) {
    var template = SKELETON_KINDS[kind] || SKELETON_KINDS.row;
    var total = Math.max(1, count || 1);
    var wrapperClass = 'animate-fade-in';
    if (kind === 'card') wrapperClass += ' ' + cls.gridCards;
    else if (kind === 'tile') wrapperClass += ' ' + cls.gridStats;
    else if (kind === 'row') wrapperClass += ' ' + cls.card + ' overflow-hidden';
    else wrapperClass += ' space-y-3';

    var wrap = el('div', { class: wrapperClass, 'aria-busy': 'true' });
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-label', 'Chargement en cours');
    var html = '';
    for (var index = 0; index < total; index += 1) html += template;
    wrap.innerHTML = html;
    return wrap;
  }

  /**
   * emptyState({icon, title, message, action}) -> element
   * action = {label, onClick, icon, variant} or an array of those.
   */
  function emptyState(options) {
    var opts = options || {};
    var wrap = el('div', {
      class:
        'flex flex-col items-center justify-center text-center px-6 py-14 sm:py-16 ' +
        CARD_SKIN +
        ' animate-fade-in',
    });

    wrap.appendChild(
      el('div', {
        class:
          'h-14 w-14 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-400 ' +
          'dark:text-stone-500 flex items-center justify-center mb-4 animate-float',
        html: icon(opts.icon || 'inbox', 'w-7 h-7'),
      })
    );
    wrap.appendChild(
      el('h3', {
        class: 'text-base font-bold text-stone-800 dark:text-stone-100',
        text: opts.title || 'Aucun élément',
      })
    );
    if (opts.message) {
      wrap.appendChild(
        el('p', {
          class: 'text-sm ' + cls.muted + ' mt-1.5 max-w-sm leading-relaxed',
          text: opts.message,
        })
      );
    }

    var actions = opts.action ? (Array.isArray(opts.action) ? opts.action : [opts.action]) : [];
    if (actions.length) {
      var row = el('div', { class: 'flex flex-col sm:flex-row gap-2 mt-6 w-full sm:w-auto' });
      actions.forEach(function (action, index) {
        var variantKey = index === 0 ? 'btnPrimary' : 'btnSecondary';
        if (action.variant) {
          variantKey = 'btn' + action.variant.charAt(0).toUpperCase() + action.variant.slice(1);
        }
        row.appendChild(
          el('button', {
            type: 'button',
            class: (cls[variantKey] || cls.btnPrimary) + ' w-full sm:w-auto',
            html: (action.icon ? icon(action.icon, 'w-4 h-4') : '') + escapeHtml(action.label || ''),
            onclick: action.onClick,
          })
        );
      });
      wrap.appendChild(row);
    }
    return wrap;
  }

  /** errorState({title, message, onRetry}) -> element */
  function errorState(options) {
    var opts = options || {};
    var wrap = el('div', {
      class:
        'flex flex-col items-center justify-center text-center px-6 py-14 rounded-2xl ' +
        'border border-rose-200/70 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-500/5 animate-fade-in',
      role: 'alert',
    });

    wrap.appendChild(
      el('div', {
        class:
          'h-14 w-14 rounded-2xl bg-rose-100 dark:bg-rose-500/10 text-rose-500 ' +
          'flex items-center justify-center mb-4',
        html: icon('warning', 'w-7 h-7'),
      })
    );
    wrap.appendChild(
      el('h3', {
        class: 'text-base font-bold text-stone-800 dark:text-stone-100',
        text: opts.title || 'Le chargement a échoué',
      })
    );
    wrap.appendChild(
      el('p', {
        class: 'text-sm ' + cls.muted + ' mt-1.5 max-w-md leading-relaxed [overflow-wrap:anywhere]',
        text: opts.message || 'Une erreur est survenue. Veuillez réessayer.',
      })
    );
    if (typeof opts.onRetry === 'function') {
      wrap.appendChild(
        el('button', {
          type: 'button',
          class: cls.btnSecondary + ' mt-6',
          html: icon('refresh', 'w-4 h-4') + 'Réessayer',
          onclick: opts.onRetry,
        })
      );
    }
    return wrap;
  }

  /** pageHeader({title, subtitle, actions:[{label,onClick,icon,variant}], back:{label,href}}) */
  function pageHeader(options) {
    var opts = options || {};
    var wrap = el('div', { class: 'space-y-3' });

    if (opts.back) {
      wrap.appendChild(
        el('a', {
          href: opts.back.href || '#/',
          class:
            'inline-flex items-center gap-1.5 text-xs font-semibold ' +
            cls.muted +
            ' hover:text-stone-800 dark:hover:text-stone-100 transition-colors',
          html: icon('back', 'w-4 h-4') + escapeHtml(opts.back.label || 'Retour'),
        })
      );
    }

    var row = el('div', {
      class: 'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
    });
    var titleBlock = el('div', { class: 'min-w-0' }, [
      el('h1', { class: cls.pageTitle + ' [overflow-wrap:anywhere]', text: opts.title || '' }),
      opts.subtitle ? el('p', { class: cls.pageSubtitle, text: opts.subtitle }) : null,
    ]);
    row.appendChild(titleBlock);

    var actions = Array.isArray(opts.actions) ? opts.actions : [];
    if (actions.length) {
      var actionRow = el('div', { class: 'flex flex-wrap items-center gap-2 shrink-0' });
      actions.forEach(function (action, index) {
        var variantKey = index === 0 ? 'btnPrimary' : 'btnSecondary';
        if (action.variant) {
          variantKey = 'btn' + action.variant.charAt(0).toUpperCase() + action.variant.slice(1);
        }
        var node = action.href
          ? el('a', {
              href: action.href,
              class: cls[variantKey] || cls.btnSecondary,
              html:
                (action.icon ? icon(action.icon, 'w-4 h-4') : '') + escapeHtml(action.label || ''),
            })
          : el('button', {
              type: 'button',
              class: cls[variantKey] || cls.btnSecondary,
              html:
                (action.icon ? icon(action.icon, 'w-4 h-4') : '') + escapeHtml(action.label || ''),
              onclick: action.onClick,
            });
        actionRow.appendChild(node);
      });
      row.appendChild(actionRow);
    }

    wrap.appendChild(row);
    return wrap;
  }

  // ---------------------------------------------------------------------------
  // Interaction helpers
  // ---------------------------------------------------------------------------
  /** Put a button into a loading state and give back a restore function. */
  function setBusy(button, busy, busyLabel) {
    if (!button) return function () {};
    if (busy) {
      if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML =
        '<span class="inline-block h-4 w-4 rounded-full border-2 border-current border-r-transparent spin"></span>' +
        escapeHtml(busyLabel || 'Veuillez patienter…');
    } else {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (button.dataset.idleHtml) {
        button.innerHTML = button.dataset.idleHtml;
        delete button.dataset.idleHtml;
      }
    }
    return function () {
      setBusy(button, false);
    };
  }

  /** Copy text to the clipboard. Works on file:// through the textarea fallback. */
  function copyToClipboard(text, successMessage) {
    var value = String(text || '');
    function done() {
      toast({ message: successMessage || 'Copié dans le presse-papiers.', type: 'success' });
    }
    function fallback() {
      var area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      document.body.removeChild(area);
      if (ok) done();
      else toast({ message: 'Copie impossible. Sélectionnez le texte manuellement.', type: 'error' });
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(done, fallback);
    } else {
      fallback();
    }
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      var context = this;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        fn.apply(context, args);
      }, delay || 250);
    };
  }

  /** French pluralisation helper: plural(3, 'facture') -> '3 factures'. */
  function plural(count, singular, pluralForm) {
    var value = Number(count) || 0;
    var word = value > 1 ? pluralForm || singular + 's' : singular;
    return number(value) + ' ' + word;
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  var theme = {
    stored: function () {
      try {
        return window.localStorage.getItem(App.config.STORAGE_THEME);
      } catch (err) {
        return null;
      }
    },
    current: function () {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    },
    apply: function (mode) {
      var value = mode;
      if (value !== 'dark' && value !== 'light') {
        var stored = theme.stored();
        if (stored === 'dark' || stored === 'light') {
          value = stored;
        } else {
          value =
            window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light';
        }
      }
      document.documentElement.classList.toggle('dark', value === 'dark');
      return value;
    },
    set: function (mode) {
      var value = theme.apply(mode);
      try {
        window.localStorage.setItem(App.config.STORAGE_THEME, value);
      } catch (err) {
        /* ignore */
      }
      return value;
    },
    toggle: function () {
      return theme.set(theme.current() === 'dark' ? 'light' : 'dark');
    },
  };

  App.ui = {
    cls: cls,
    icon: icon,
    el: el,
    fromHTML: fromHTML,
    mount: mount,
    escapeHtml: escapeHtml,
    money: money,
    number: number,
    dateTime: dateTime,
    dateOnly: dateOnly,
    timeAgo: timeAgo,
    initials: initials,
    plural: plural,
    statusBadge: statusBadge,
    statusLabel: statusLabel,
    roleBadge: roleBadge,
    roleLabel: roleLabel,
    visibilityBadge: visibilityBadge,
    visibilityLabel: visibilityLabel,
    statusMeta: STATUS_META,
    roleMeta: ROLE_META,
    visibilityMeta: VISIBILITY_META,
    toast: toast,
    toastError: toastError,
    modal: modal,
    confirmDialog: confirmDialog,
    skeleton: skeleton,
    emptyState: emptyState,
    errorState: errorState,
    pageHeader: pageHeader,
    setBusy: setBusy,
    copyToClipboard: copyToClipboard,
    debounce: debounce,
    theme: theme,
  };
})();
