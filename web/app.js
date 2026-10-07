(function () {
  var D = GCT.dates;
  var store = GCT.createLocalStore('gct-db-v5');
  var api = GCT.createApi(store);
  var $app = document.getElementById('app'), $phone = document.getElementById('phone');
  var state = { token: null, user: null, boot: null, tab: 'week', days: null, day: null, sheet: null };
  try { var saved = JSON.parse(sessionStorage.getItem('gct-session')); if (saved) { state.token = saved.token; state.user = saved.user; } } catch (e) {}

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function call(action, args) { return api.call(action, args, state.token); }
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.className = 'show'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ''; }, 2200); }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function label(date) { var dt = new Date(date + 'T00:00:00Z'); return DOW[dt.getUTCDay()] + ', ' + MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCDate(); }
  function short(date) { var dt = new Date(date + 'T00:00:00Z'); return MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCDate(); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function hrs(h) { return (Math.round(h * 100) / 100) + 'h'; }
  function t12(t) { var p = t.split(':'), h = +p[0]; return ((h + 11) % 12 + 1) + ':' + p[1] + (h < 12 ? 'a' : 'p'); }
  var STATUS = { none: 'No data', logged: 'Not confirmed', confirmed: 'Confirmed', reopened: 'Reopened' };
  function pill(s) { return '<span class="pill ' + s + '">' + STATUS[s] + '</span>'; }
  var WK = ['var(--wk1)', 'var(--wk2)', 'var(--wk3)', 'var(--wk4)'];
  function wkColor(num) { return WK[(((40 - num) % 4) + 4) % 4]; }
  function chip(date) { return label(date).replace(',', ''); }

  function signOut() { call('logout'); state.token = state.user = null; sessionStorage.removeItem('gct-session'); stopPad(); route('login'); }
  function expired(res) { if (res.error === 'Please sign in again.') { signOut(); return true; } return false; }

  // ---------- login ----------
  // Touch-first: tap your name, then a big number pad. 4th digit signs in automatically.
  var padHandler = null;
  function stopPad() { if (padHandler) { document.removeEventListener('keydown', padHandler); padHandler = null; } }
  function initials(n) { return n.split(' ').map(function (p) { return p.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  // PIN only: type your 5 digits and you are in. No names are shown.
  function viewLogin(msg) {
    stopPad();
    var dev = '<p class="dev">Prototype · sample data only · <button class="link" id="reset" style="font-size:12px;min-height:0">Reset sample data</button></p>';
    $app.innerHTML = '<div class="screen"><div class="scroll"><div class="hdr"><div class="logo">GC</div><div><h1>Golden Cleaning Tracker</h1><p>Enter your PIN</p></div></div>' +
      (msg ? '<p class="note">' + esc(msg) + '</p>' : '') +
      '<div class="dots" id="dots" aria-label="PIN entered"><i></i><i></i><i></i><i></i><i></i></div><p class="err" id="err" role="alert"></p>' +
      '<div class="keypad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (k) { return '<button class="key" data-k="' + k + '">' + k + '</button>'; }).join('') +
      '<span></span><button class="key" data-k="0">0</button><button class="key" data-k="back" aria-label="Delete last digit">⌫</button></div>' +
      '<p style="text-align:center"><button class="link big" id="forgot">Forgot your PIN?</button></p>' + dev + '</div></div>';
    var entered = '', dots = document.querySelectorAll('#dots i'), err = document.getElementById('err');
    function paint() { Array.prototype.forEach.call(dots, function (d, i) { d.className = i < entered.length ? 'on' : ''; }); }
    function press(k) {
      err.textContent = '';
      if (k === 'back') entered = entered.slice(0, -1);
      else if (entered.length < 5) entered += k;
      paint();
      if (entered.length === 5) {
        var r = call('login', { pin: entered });
        if (!r.ok) {
          err.textContent = r.error; entered = '';
          var d = document.getElementById('dots'); d.classList.add('shake');
          setTimeout(function () { paint(); d.classList.remove('shake'); }, 350);
          return;
        }
        stopPad(); state.token = r.data.token; state.user = r.data.user;
        sessionStorage.setItem('gct-session', JSON.stringify({ token: state.token, user: state.user }));
        route('home');
      }
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-k]'), function (el) { el.onclick = function () { press(el.dataset.k); }; });
    padHandler = function (ev) { if (/^\d$/.test(ev.key)) press(ev.key); else if (ev.key === 'Backspace') press('back'); };
    document.addEventListener('keydown', padHandler);
    document.getElementById('forgot').onclick = function () { stopPad(); viewForgot(); };
    document.getElementById('reset').onclick = function () { if (confirm('Erase everything and restore the sample data?')) { store.reset(); toast('Sample data restored'); viewLogin(); } };
  }
  // Forgot PIN: type the email on your account. The reply is the same whether or not it is on file.
  function viewForgot() {
    $app.innerHTML = '<div class="screen"><div class="scroll"><div class="hdr"><div class="logo">GC</div><div><h1>Forgot your PIN?</h1><p>We\'ll email you a new PIN</p></div></div>' +
      '<form id="ff" autocomplete="off"><label class="field"><span>Email on your account</span><input name="email" type="email" inputmode="email" autocapitalize="off" required></label>' +
      '<p class="note" id="fmsg" hidden></p>' +
      '<div class="formacts"><button type="button" class="btn cancel" id="fback">Back</button><button class="btn">Send my PIN</button></div></form>' +
      '<p style="color:var(--muted);font-size:14px">No email on file? Ask Sandra to reset your PIN.</p></div></div>';
    var f = document.getElementById('ff');
    f.onsubmit = function (e) {
      e.preventDefault();
      call('forgotPin', { email: f.email.value });
      var m = document.getElementById('fmsg'); m.hidden = false;
      m.textContent = 'If that email is on your account, we\'ve sent you a new PIN. Your old PIN no longer works.';
    };
    document.getElementById('fback').onclick = function () { viewLogin(); };
  }

  // ---------- shell ----------
  function shell(title, sub, body, opts) {
    opts = opts || {};
    $app.innerHTML = '<div class="screen"><div class="scroll"><div class="hdr">' +
      (opts.back ? '<button class="link" id="back" aria-label="Back">‹ Back</button>' : '') +
      '<div class="grow"><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' +
      (opts.back ? '' : '<button class="link" id="out">Sign out</button>') + '</div>' + body + '</div>' +
      (opts.foot || (opts.back ? '' : '<nav class="tabs"><div><button data-tab="week"' + (state.tab === 'week' ? ' aria-current="page"' : '') + '><i>📅</i>Week</button>' +
        '<button data-tab="summary"' + (state.tab === 'summary' ? ' aria-current="page"' : '') + '><i>Σ</i>Summary</button></div></nav>')) + '</div>';
    var o = document.getElementById('out'); if (o) o.onclick = signOut;
    var b = document.getElementById('back'); if (b) b.onclick = opts.back;
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (el) { el.onclick = function () { state.tab = el.dataset.tab; route('home'); }; });
  }

  // ---------- home / summary ----------
  function groupWeeks(days) {
    var weeks = [];
    days.forEach(function (d) {
      var ws = D.weekStart(d.date), w = weeks[weeks.length - 1];
      if (!w || w.start !== ws) { w = { start: ws, num: D.weekNumber(ws), days: [] }; weeks.push(w); }
      w.days.push(d);
    });
    return weeks;
  }
  function viewHome() {
    if (state.user.role === 'owner') return viewOwner();
    var r = call('days'); if (!r.ok) { if (!expired(r)) toast(r.error); return; }
    var weeks = groupWeeks(r.data);
    if (state.tab === 'summary') return viewSummary();
    var today = D.today();
    var sentBack = r.data.filter(function (x) { return x.status === 'reopened'; });
    var banner = sentBack.length ? '<button class="sentback" data-jump="' + sentBack[0].date + '"><b>⚑ Sandra sent ' + (sentBack.length === 1 ? '1 day' : sentBack.length + ' days') + ' back to you.</b> Tap to see ' + (sentBack.length === 1 ? 'it' : 'the first one') + '.</button>' : '';
    shell('Hi, ' + state.user.name.split(' ')[0], 'Tap a day to add or review hours', banner + weeks.map(function (w, i) {
      return '<div class="week"><div class="bar" style="background:' + wkColor(w.num) + '">Week ' + w.num + '</div><div class="days">' +
        w.days.map(function (d) {
          return '<button class="day" data-date="' + d.date + '"><div class="t"><b>' + (d.date === today ? 'Today <span style="color:var(--muted);font-size:14px">· ' + short(d.date) + '</span>' : label(d.date)) + '</b>' +
            '<small>' + (d.entries ? '<span class="hrs">' + hrs(d.hours) + '</span> · ' + d.entries + (d.entries > 1 ? ' entries' : ' entry') : 'No entries') + '</small>' +
            (d.reopened_note ? '<span class="flag">⚑ Sent back by Sandra — see note</span>' : d.sandra_confirmed ? '<span class="mini" style="color:var(--warn)">Sandra confirmed this for you</span>' : '') +
            '</div>' + pill(d.status) + '</button>';
        }).join('') + '</div></div>';
    }).join(''));
    Array.prototype.forEach.call(document.querySelectorAll('.day'), function (el) { el.onclick = function () { openDay(el.dataset.date); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-jump]'), function (el) { el.onclick = function () { openDay(el.dataset.jump); }; });
  }
  function viewSummary() {
    var r = call('summary'); if (!r.ok) { if (!expired(r)) toast(r.error); return; }
    var body = r.data.length ? r.data.map(function (w) {
      var n = w.needs.length;
      return '<section class="wcard"><div class="wtop"><span class="wpill" style="background:' + wkColor(w.num) + '">Week ' + w.num + '</span><span class="wrange">' + short(w.start) + ' – ' + short(w.end) + '</span></div>' +
        (n ? '<div class="wwarn"><b>⚠ ' + n + ' day' + (n > 1 ? 's' : '') + ' still ' + (n > 1 ? 'need' : 'needs') + ' confirming — tap a day to jump to it</b><div class="chips">' +
          w.needs.map(function (d) { return '<button class="chip" data-jump="' + d + '">' + esc(chip(d)) + '</button>'; }).join('') + '</div></div>' : '') +
        w.clients.map(function (c) { return '<button class="wrow tap" data-wc="' + esc(c.client_id) + '" data-ws="' + w.start + '" aria-label="' + esc(c.name) + ', ' + hrs(c.hours) + '. See visits"><span>' + esc(c.name) + '</span><span class="mono">' + hrs(c.hours) + ' <i>›</i></span></button>'; }).join('') +
        '<div class="wrow total"><span>Total</span><span class="mono">' + hrs(w.total) + '</span></div></section>';
    }).join('') : '<div class="empty">No hours logged yet.</div>';
    shell('Your weeks', '', body);
    Array.prototype.forEach.call(document.querySelectorAll('[data-jump]'), function (el) { el.onclick = function () { openDay(el.dataset.jump); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-wc]'), function (el) { el.onclick = function () { openClientWeek(el.dataset.ws, el.dataset.wc); }; });
  }
  // ---------- Sandra: navigation shared by every page ----------
  var OWNER_PAGES = [['Activity', 'activity'], ['Billing', null], ['Payroll', null], ['Profit', null], ['Entries', null], ['Settings', 'settings']];
  function railNav(active) {
    return OWNER_PAGES.map(function (n) {
      var on = n[1] === active, live = !!n[1];
      return '<button data-page="' + (n[1] || '') + '"' + (on ? ' aria-current="page"' : '') + (live ? '' : ' disabled title="Coming in a later phase"') + '>' + n[0] + '</button>';
    }).join('');
  }
  function phoneTabs(active) { return railNav(active); }
  function bindRail() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-page]'), function (el) {
      if (el.disabled) return;
      el.onclick = function () { if (el.dataset.page === 'settings') renderSettings(); else viewOwner(); };
    });
  }
  function setLayout(phone) { $phone.classList.toggle('phoneview', phone); document.body.classList.toggle('owner-mode', !phone); }

  // ---------- Sandra: Settings (workers, clients, services, account) ----------
  function money(x) { return x == null ? '—' : '$' + x.toFixed(2); }
  var SETTINGS_TABS = [['workers', 'Workers'], ['clients', 'Clients'], ['services', 'Services'], ['account', 'Account']];
  function settingsContent(d, tab) {
    var tabs = '<div class="stabs">' + SETTINGS_TABS.map(function (t) { return '<button class="stab' + (tab === t[0] ? ' on' : '') + '" data-st="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    if (tab === 'services') {
      return tabs + '<form id="addsvc" class="addrow" autocomplete="off"><input name="name" placeholder="New service, e.g. Windows" maxlength="40" required><button class="btn sm">Add service</button></form>' +
        d.services.map(function (x) {
          return '<div class="scard' + (x.active ? '' : ' off') + '"><div class="sname"><b>' + esc(x.name) + '</b>' + (x.active ? '' : ' <span class="tag">Retired</span>') + '</div>' +
            '<div class="sbtns"><button class="btn cancel sm" data-svc="' + esc(x.name) + '" data-on="' + (x.active ? 0 : 1) + '">' + (x.active ? 'Retire' : 'Restore') + '</button></div></div>';
        }).join('') +
        '<p class="hint2">Services are never deleted or renamed, so past visits keep their meaning. Retired services can\'t be picked for new visits.</p>';
    }
    if (tab === 'clients') {
      return tabs + '<button class="btn secondary sm wide" data-addclient>+ Add client</button>' + d.clients.map(clientCard).join('') +
        '<p class="hint2">Prices are typed in by hand here for now. Once Jobber is connected, each visit will use its Jobber price instead.</p>';
    }
    if (tab === 'account') {
      return tabs + '<div class="scard"><div class="sname"><b>Sign-in email</b></div><div class="smeta">Where Sandra\'s PIN is sent if she forgets it.</div>' +
        '<div class="smeta"><b>' + esc(d.account.email) + '</b></div><div class="sbtns"><button class="btn secondary sm" data-email>Edit email</button></div></div>' +
        '<div class="scard"><div class="sname"><b>Change PIN</b></div><div class="smeta">Enter the new 5-digit PIN twice, so a typo doesn\'t lock you out. No one else can use it.</div>' +
        '<div class="sbtns"><button class="btn secondary sm" data-pin>Change PIN</button></div></div>' +
        '<div class="sbtns"><button class="btn cancel" id="logout">Log out</button></div>';
    }
    return tabs + '<button class="btn secondary sm wide" data-addworker>+ Add worker</button>' + d.workers.map(workerCard).join('') +
      '<p class="hint2">A rate change starts on the date you pick. Work done before that date keeps the rate it was earned at.</p>';
  }
  function workerCard(w) {
    return '<div class="scard' + (w.active ? '' : ' off') + '"><div class="sname"><b>' + esc(w.name) + '</b>' + (w.active ? '' : ' <span class="tag">Inactive</span>') + '</div>' +
      '<div class="smeta">' + esc(w.phone || 'no phone') + ' · ' + (w.email ? esc(w.email) : '<span class="warn">no email, so they can\'t reset their own PIN</span>') + '</div>' +
      '<div class="smeta">PIN <b class="mono">' + esc(w.pin) + '</b></div>' +
      '<div class="sval2"><b>' + money(w.current) + '/hr</b><small>' + (w.since ? 'since ' + esc(label(w.since)) : 'no rate yet') + '</small></div>' +
      '<div class="sbtns"><button class="btn secondary sm" data-rate="' + w.id + '">Change rate</button>' + (w.rows.length > 1 ? '<button class="btn cancel sm" data-recs="' + w.id + '">View records</button>' : '') +
      '<button class="btn cancel sm" data-editw="' + w.id + '">Edit</button><button class="btn cancel sm" data-actw="' + w.id + '" data-on="' + (w.active ? 0 : 1) + '">' + (w.active ? 'Deactivate' : 'Reactivate') + '</button></div></div>';
  }
  function clientCard(c) {
    return '<div class="scard' + (c.active ? '' : ' off') + '"><div class="sname"><b>' + esc(c.name) + '</b>' + (c.active ? '' : ' <span class="tag">Inactive</span>') + '</div>' +
      '<div class="smeta">' + esc(c.address || 'no address') + ' · ' + esc(c.phone || 'no phone') + '</div>' +
      '<div class="subh">Price by service</div>' +
      c.rates.map(function (r) { return '<div class="prow"><span>' + esc(r.service) + '</span><span class="mono">' + (r.rate == null ? '—' : money(r.rate)) + '/hr</span><button class="btn cancel sm" data-crate="' + c.id + '" data-svc2="' + esc(r.service) + '">Set</button></div>'; }).join('') +
      '<div class="subh">Units</div>' +
      c.apartments.map(function (a) { return '<div class="prow"><span>' + esc(a.name) + (a.active ? '' : ' <span class="tag">Inactive</span>') + '</span><button class="btn cancel sm" data-actapt="' + a.id + '" data-on="' + (a.active ? 0 : 1) + '">' + (a.active ? 'Deactivate' : 'Reactivate') + '</button></div>'; }).join('') +
      '<div class="sbtns"><button class="btn secondary sm" data-addapt="' + c.id + '">+ Add unit</button><button class="btn cancel sm" data-editc="' + c.id + '">Edit client</button><button class="btn cancel sm" data-actc="' + c.id + '" data-on="' + (c.active ? 0 : 1) + '">' + (c.active ? 'Deactivate' : 'Reactivate') + '</button></div></div>';
  }
  function renderSettings(tab) {
    if (tab) state.settingsTab = tab;
    tab = state.settingsTab || 'workers';
    var r = call('settings'); if (!r.ok) { if (!expired(r)) toast(r.error); return; }
    var d = r.data, phone = ownerIsPhone(), body = settingsContent(d, tab);
    setLayout(phone);
    if (phone) {
      $app.innerHTML = '<div class="ophone"><header class="ohdr"><h1>Settings</h1><div class="ohlinks"><button class="link" id="todesk">Desktop view</button><button class="link" id="out">Sign out</button></div></header>' +
        '<main class="oscroll" id="ownermain">' + body + '</main><nav class="otabs">' + phoneTabs('settings') + '</nav></div>';
      document.getElementById('todesk').onclick = function () { setOwnerView('desktop'); };
    } else {
      $app.innerHTML = '<div class="owner-wrap"><aside class="rail"><div class="brand"><div class="logo">GC</div><div><b>Golden Cleaning Tracker</b><small>Sandra</small></div></div>' +
        '<nav>' + railNav('settings') + '</nav><div class="railfoot"><button class="link" id="tophone">Phone view</button><button class="link" id="out">Sign out</button></div></aside>' +
        '<main class="main" id="ownermain"><div class="mhdr"><div><h1>Settings</h1><p>Workers, clients, services and your account</p></div></div>' + body + '</main></div>';
      document.getElementById('tophone').onclick = function () { setOwnerView('phone'); };
    }
    document.getElementById('out').onclick = signOut;
    bindRail();
    var logout = document.getElementById('logout'); if (logout) logout.onclick = signOut;
    Array.prototype.forEach.call(document.querySelectorAll('[data-st]'), function (el) { el.onclick = function () { renderSettings(el.dataset.st); }; });
    var byId = function (list, id) { return list.filter(function (x) { return x.id === id; })[0]; };
    var done = function (msg) { toast(msg); renderSettings(); return ''; };
    var act = function (action, args, msg) { return function () { var c = call(action, args); if (!c.ok) return toast(c.error); done(msg); }; };

    // workers
    var addW = document.querySelector('[data-addworker]');
    if (addW) addW.onclick = function () { openForm({ title: 'Add worker', hint: 'They sign in with the PIN you set. Use a PIN nobody else has.', ok: 'Add worker', fields: [
      { name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Phone', inputmode: 'tel' },
      { name: 'email', label: 'Email (so they can reset their PIN)', type: 'email' },
      { name: 'pin', label: 'PIN (5 digits)', inputmode: 'numeric', maxlength: 5, required: true },
      { name: 'rate', label: 'Starting pay ($ per hour)', inputmode: 'decimal', required: true } ],
      save: function (v) { var c = call('addWorker', v); if (!c.ok) return c.error; return done('Worker added'); } }); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-editw]'), function (el) { el.onclick = function () {
      var w = byId(d.workers, el.dataset.editw);
      openForm({ title: 'Edit ' + w.name, hint: 'Change the PIN only if the worker needs a new one.', ok: 'Save', fields: [
        { name: 'name', label: 'Name', value: w.name, required: true }, { name: 'phone', label: 'Phone', value: w.phone, inputmode: 'tel' },
        { name: 'email', label: 'Email', type: 'email', value: w.email }, { name: 'pin', label: 'PIN (5 digits)', value: w.pin, inputmode: 'numeric', maxlength: 5, required: true } ],
        save: function (v) { v.worker_id = w.id; var c = call('updateWorker', v); if (!c.ok) return c.error; return done('Saved'); } }); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-actw]'), function (el) { el.onclick = act('setWorkerActive', { worker_id: el.dataset.actw, active: el.dataset.on === '1' }, 'Updated'); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-rate]'), function (el) { el.onclick = function () {
      var w = byId(d.workers, el.dataset.rate);
      openRateForm({ title: 'Change rate · ' + w.name, hint: 'Current: ' + money(w.current) + '/hr. The new rate starts on the date you pick.', rate: w.current, date: d.today, ok: 'Save rate',
        save: function (rate, date) { var c = call('setRate', { worker_id: w.id, rate: rate, effective_from: date }); if (!c.ok) return c.error; toast('Rate saved for ' + w.name.split(' ')[0]); renderSettings(); return ''; } }); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-recs]'), function (el) { el.onclick = function () { openRecords(el.dataset.recs); }; });

    // clients
    var addC = document.querySelector('[data-addclient]');
    if (addC) addC.onclick = function () { openForm({ title: 'Add client', ok: 'Add client', fields: [
      { name: 'name', label: 'Client name', required: true }, { name: 'phone', label: 'Phone', inputmode: 'tel' }, { name: 'address', label: 'Address' } ],
      save: function (v) { var c = call('addClient', v); if (!c.ok) return c.error; return done('Client added'); } }); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-editc]'), function (el) { el.onclick = function () {
      var c = byId(d.clients, el.dataset.editc);
      openForm({ title: 'Edit ' + c.name, ok: 'Save', fields: [
        { name: 'name', label: 'Client name', value: c.name, required: true }, { name: 'phone', label: 'Phone', value: c.phone, inputmode: 'tel' }, { name: 'address', label: 'Address', value: c.address } ],
        save: function (v) { v.client_id = c.id; var r2 = call('updateClient', v); if (!r2.ok) return r2.error; return done('Saved'); } }); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-actc]'), function (el) { el.onclick = act('setClientActive', { client_id: el.dataset.actc, active: el.dataset.on === '1' }, 'Updated'); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-addapt]'), function (el) { el.onclick = function () {
      openForm({ title: 'Add unit', ok: 'Add unit', fields: [{ name: 'name', label: 'Unit name, e.g. Unit 512', required: true }],
        save: function (v) { v.client_id = el.dataset.addapt; var c = call('addApartment', v); if (!c.ok) return c.error; return done('Unit added'); } }); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-actapt]'), function (el) { el.onclick = act('setApartmentActive', { apartment_id: el.dataset.actapt, active: el.dataset.on === '1' }, 'Updated'); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-crate]'), function (el) { el.onclick = function () {
      var c = byId(d.clients, el.dataset.crate), svc = el.dataset.svc2, cur = c.rates.filter(function (x) { return x.service === svc; })[0].rate;
      openForm({ title: c.name + ' · ' + svc, hint: 'Typed in by hand until Jobber is connected.', ok: 'Save price', fields: [
        { name: 'rate', label: 'Price ($ per hour)', value: cur == null ? '' : cur, inputmode: 'decimal', required: true } ],
        save: function (v) { var c2 = call('setClientRate', { client_id: c.id, service: svc, rate: v.rate }); if (!c2.ok) return c2.error; return done('Price saved'); } }); }; });

    // services
    var add = document.getElementById('addsvc');
    if (add) add.onsubmit = function (e) { e.preventDefault(); var c = call('addService', { name: add.name.value }); if (!c.ok) return toast(c.error); done('Service added'); };
    Array.prototype.forEach.call(document.querySelectorAll('[data-svc]'), function (el) { el.onclick = act('setServiceActive', { name: el.dataset.svc, active: el.dataset.on === '1' }, el.dataset.on === '1' ? 'Service restored' : 'Service retired'); });

    // account
    var em = document.querySelector('[data-email]');
    if (em) em.onclick = function () { openForm({ title: 'Sign-in email', hint: 'Sandra\'s PIN reset is sent here.', ok: 'Save email', fields: [{ name: 'email', label: 'Email', type: 'email', value: d.account.email, required: true }],
      save: function (v) { var c = call('updateOwnerEmail', v); if (!c.ok) return c.error; return done('Email saved'); } }); };
    var pn = document.querySelector('[data-pin]');
    if (pn) pn.onclick = function () { openForm({ title: 'Change your PIN', hint: 'Enter the new 5-digit PIN twice.', ok: 'Save new PIN', fields: [
      { name: 'pin', label: 'New PIN (5 digits)', inputmode: 'numeric', maxlength: 5, required: true, type: 'password' },
      { name: 'confirm', label: 'Confirm new PIN', inputmode: 'numeric', maxlength: 5, required: true, type: 'password' } ],
      save: function (v) { var c = call('setOwnerPin', v); if (!c.ok) return c.error; return done('PIN changed'); } }); };

    var sf = document.getElementById('addsvc');
  }
  // A simple form popup. save(values) returns an error message, or '' when it worked.
  function openForm(o) {
    var bg = document.createElement('div'); bg.className = 'sheet-bg stacked2';
    bg.innerHTML = '<form class="sheet" role="dialog" aria-label="' + esc(o.title) + '"><h2>' + esc(o.title) + '</h2>' + (o.hint ? '<p class="cbody">' + esc(o.hint) + '</p>' : '') +
      o.fields.map(function (f) {
        return '<label class="field"><span>' + esc(f.label) + '</span><input name="' + f.name + '" type="' + (f.type || 'text') + '"' + (f.inputmode ? ' inputmode="' + f.inputmode + '"' : '') +
          (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') + (f.required ? ' required' : '') + ' value="' + esc(f.value == null ? '' : f.value) + '" autocomplete="off"></label>';
      }).join('') + '<p class="err" id="ferr" role="alert"></p><div class="formacts"><button type="button" class="btn cancel" id="fcancel">Cancel</button><button class="btn">' + esc(o.ok) + '</button></div></form>';
    $phone.appendChild(bg);
    var f = bg.querySelector('form');
    bg.querySelector('#fcancel').onclick = function () { bg.remove(); };
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
    f.onsubmit = function (e) {
      e.preventDefault();
      var v = {}; o.fields.forEach(function (x) { v[x.name] = f[x.name].value.trim(); });
      var err = o.save(v);
      if (err) { bg.querySelector('#ferr').textContent = err; return; }
      bg.remove();
    };
  }
  // One dated rate. save(rate, date) returns an error message, or '' when it worked.
  function openRateForm(o) {
    var bg = document.createElement('div'); bg.className = 'sheet-bg stacked2'; bg.id = 'ratebg';
    bg.innerHTML = '<form class="sheet" role="dialog" aria-label="' + esc(o.title) + '"><h2>' + esc(o.title) + '</h2><p class="cbody">' + esc(o.hint) + '</p>' +
      '<label class="field"><span>Rate ($ per hour)</span><input name="rate" type="number" inputmode="decimal" step="0.25" min="1" max="500" required value="' + (o.rate == null ? '' : o.rate) + '"></label>' +
      '<label class="field"><span>Starts on</span><input name="date" type="date" required value="' + esc(o.date) + '"></label>' +
      '<p class="err" id="rerr" role="alert"></p><div class="formacts"><button type="button" class="btn cancel" id="rcancel">Cancel</button><button class="btn">' + esc(o.ok) + '</button></div></form>';
    $phone.appendChild(bg);
    var f = bg.querySelector('form');
    bg.querySelector('#rcancel').onclick = function () { bg.remove(); };
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
    f.onsubmit = function (e) {
      e.preventDefault();
      var err = o.save(Number(f.rate.value), f.date.value);
      if (err) { bg.querySelector('#rerr').textContent = err; return; }
      bg.remove();
    };
  }
  // View records: every dated rate for one cleaner. Only a mistake gets corrected here.
  function openRecords(wid) {
    var old = document.getElementById('recbg'); if (old) old.remove();
    var r = call('settings'); if (!r.ok) return toast(r.error);
    var w = r.data.workers.filter(function (x) { return x.id === wid; })[0], today = r.data.today;
    var bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'recbg';
    var current = w.rows.filter(function (x) { return x.effective_from <= today; })[0];
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Rate records"><div class="sheet-hdr"><div><h2>Rate records · ' + esc(w.name) + '</h2><p class="subline">Every rate, with the date it started. Edit only to fix a mistake.</p></div></div>' +
      w.rows.map(function (x) {
        return '<div class="srow"><div class="sname"><b>' + money(x.rate) + '/hr</b><small> from ' + esc(label(x.effective_from)) + '</small>' + (x === current ? ' <span class="tag">current</span>' : '') + '</div>' +
          '<div class="sbtns"><button class="btn secondary sm" data-edit="' + x.effective_from + '">Edit</button></div></div>';
      }).join('') + '<div class="sheet-actions"><button class="btn cancel" id="rclose">Close</button></div></div>';
    $phone.appendChild(bg);
    bg.querySelector('#rclose').onclick = function () { bg.remove(); };
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
    Array.prototype.forEach.call(bg.querySelectorAll('[data-edit]'), function (el) {
      el.onclick = function () {
        var row = w.rows.filter(function (x) { return x.effective_from === el.dataset.edit; })[0];
        openRateForm({ title: 'Correct a rate record', hint: 'Use this only to fix a wrong rate or start date.', rate: row.rate, date: row.effective_from, ok: 'Save correction',
          save: function (rate, date) {
            var c = call('correctRate', { worker_id: wid, from: row.effective_from, rate: rate, effective_from: date }); if (!c.ok) return c.error;
            toast('Record corrected'); renderSettings(); openRecords(wid); return '';
          } });
      };
    });
  }

  // ---------- Sandra: weekly activity ----------
  function gridWeek(w) {
    var head = '<tr><th class="gname">Cleaner</th><th class="gtot">Total<small>confirmed</small></th>' +
      w.rows[0].cells.map(function (c) { return '<th>' + DOW[new Date(c.date + 'T00:00:00Z').getUTCDay()] + '<small>' + short(c.date) + '</small></th>'; }).join('') + '</tr>';
    var body = w.rows.map(function (r) {
      return '<tr class="' + (r.active ? '' : 'inactive') + '"><td class="gname"><b>' + esc(r.name) + '</b>' + (r.active ? '' : '<span class="tag">Inactive</span>') + '</td>' +
        '<td class="gtot"><button class="gtotbtn" data-wt="' + r.worker_id + '" data-ws="' + w.start + '" aria-label="' + esc(r.name) + ' week total ' + hrs(r.total) + '. See all work"><b>' + (r.total ? hrs(r.total) : '—') + '</b><small class="sub-ok">' + (r.confirmed ? hrs(r.confirmed) : '—') + '</small></button></td>' +
        r.cells.map(function (c) {
          if (c.status === 'future') return '<td></td>';
          var txt = c.entries ? hrs(c.hours) : '•';
          return '<td><button class="cell ' + c.status + '" data-ow="' + r.worker_id + '" data-od="' + c.date + '" aria-label="' + esc(r.name) + ', ' + txt + ', ' + c.status + '">' + txt + '</button></td>';
        }).join('') + '</tr>';
    }).join('');
    // Totals row: each day across all cleaners, plus the week's overall hours (confirmed underneath).
    var unusedDayTot = w.rows[0].cells.map(function (c, i) {
      var sum = 0, future = c.status === 'future';
      w.rows.forEach(function (r) { sum += r.cells[i].hours; });
      return future ? '<td></td>' : '<td class="sumcell">' + (sum ? hrs(sum) : '—') + '</td>';
    }).join('');
    var wkTotal = 0, wkConf = 0;
    w.rows.forEach(function (r) { wkTotal += r.total; wkConf += r.confirmed; });
    var foot = '<tr class="gfoot"><td class="gname"><button class="gtotbtn" data-wa="' + w.start + '" data-wd="" aria-label="All cleaners, see every visit this week"><b>All cleaners</b> ›</button></td><td class="gtot"><button class="gtotbtn" data-wa="' + w.start + '" data-wd=""><b>' + (wkTotal ? hrs(wkTotal) : '—') + '</b><small class="sub-ok">' + (wkConf ? hrs(wkConf) : '—') + '</small></button></td>' +
      w.rows[0].cells.map(function (c, i) {
        if (c.status === 'future') return '<td></td>';
        var sum = 0, conf = 0;
        w.rows.forEach(function (r) { sum += r.cells[i].hours; if (r.cells[i].status === 'confirmed') conf += r.cells[i].hours; });
        var open = round2(sum - conf); // hours on this day that are not confirmed yet
        return '<td class="sumcell' + (open > 0 ? ' open' : '') + '"><button class="gtotbtn" data-wa="' + w.start + '" data-wd="' + c.date + '" aria-label="' + short(c.date) + ', ' + hrs(sum) + ' total, ' + hrs(conf) + ' confirmed' + (open > 0 ? ', ' + hrs(open) + ' not confirmed' : '') + '">' +
          '<b>' + (sum ? hrs(sum) : '—') + '</b>' + (sum ? '<small class="sub-ok' + (open > 0 ? ' warnline' : '') + '">' + (open > 0 ? hrs(open) + ' open' : hrs(conf) + ' ✓') + '</small>' : '') + '</button></td>';
      }).join('') + '</tr>';
    return '<section class="wgrid"><div class="wband" style="background:' + wkColor(w.num) + '">Week ' + w.num + '<span class="wsub">' + short(w.start) + ' – ' + short(w.end) + '</span></div>' +
      '<div class="gscroll"><table class="gtable"><thead>' + head + '</thead><tbody>' + body + foot + '</tbody></table></div></section>';
  }
  function viewOwner() {
    if (ownerIsPhone()) return viewOwnerPhone();
    $phone.classList.remove('phoneview'); document.body.classList.add('owner-mode'); // full-width desktop layout
    var prev = document.getElementById('ownermain'), keep = prev ? prev.scrollTop : 0;
    var r = call('activity'); if (!r.ok) { if (!expired(r)) toast(r.error); return; }
    var nav = railNav('activity');
    var legend = '<div class="legend"><span class="pill none">No data</span><span class="pill logged">Not confirmed</span><span class="pill confirmed">Confirmed</span><span class="pill reopened">Reopened</span></div>';
    $app.innerHTML = '<div class="owner-wrap"><aside class="rail"><div class="brand"><div class="logo">GC</div><div><b>Golden Cleaning Tracker</b><small>Sandra</small></div></div>' +
      '<nav>' + nav + '</nav><div class="railfoot"><button class="link" id="tophone">Phone view</button><button class="link" id="out">Sign out</button></div></aside>' +
      '<main class="main" id="ownermain"><div class="mhdr"><div><h1>Weekly activity</h1><p>Click a cell to see that day</p></div></div>' + legend + r.data.map(gridWeek).join('') + '</main></div>';
    document.getElementById('out').onclick = signOut;
    document.getElementById('tophone').onclick = function () { setOwnerView('phone'); };
    bindRail();
    Array.prototype.forEach.call(document.querySelectorAll('[data-ow]'), function (el) { el.onclick = function () { openOwnerDay(el.dataset.ow, el.dataset.od); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-wt]'), function (el) { el.onclick = function () { openWorkerWeek(el.dataset.wt, el.dataset.ws); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-wa]'), function (el) { el.onclick = function () { openWeekAll(el.dataset.wa, el.dataset.wd); }; });
    document.getElementById('ownermain').scrollTop = keep;
  }
  // Every visit for the whole team in one week, grouped by day. A day total jumps to that day in the list.
  function openWeekAll(start, date) {
    var bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'wabg';
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="All cleaners this week"></div>';
    $phone.appendChild(bg);
    bg.onclick = function (ev) { if (ev.target === bg) closeWeekAll(); };
    renderWeekAll(start, date || null);
  }
  function closeWeekAll() { var bg = document.getElementById('wabg'); if (bg) bg.remove(); viewOwner(); }
  // onlyDate: when set (a day total was tapped), show just that day.
  function renderWeekAll(start, onlyDate) {
    var box = document.querySelector('#wabg .sheet'); if (!box) return;
    var r = call('weekAll', { start: start });
    if (!r.ok) { closeWeekAll(); if (!expired(r)) toast(r.error); return; }
    var d = r.data, boot = state.boot;
    if (onlyDate) {
      d.days = d.days.filter(function (day) { return day.date === onlyDate; });
      d.total = d.days.length ? d.days[0].hours : 0;
      d.confirmed = d.days.length ? round2(d.days[0].visits.reduce(function (t, v) { return t + (v.status === 'confirmed' ? v.hours : 0); }, 0)) : 0;
    }
    var cname = function (id) { var c = boot.clients.filter(function (x) { return x.id === id; })[0]; return c ? c.name : '?'; };
    var aname = function (id) { var a = boot.apartments.filter(function (x) { return x.id === id; })[0]; return a ? a.name : ''; };
    var h = '<div class="sheet-hdr"><div><h2>All cleaners · ' + (onlyDate ? esc(label(onlyDate)) : 'Week ' + d.num) + '</h2><p class="subline">' +
      (onlyDate ? 'Week ' + d.num + ' · ' : short(d.start) + ' – ' + short(d.end) + ' · ') +
      '<b>' + hrs(d.total) + '</b> total, ' + hrs(d.confirmed) + ' confirmed</p></div></div>';
    if (!d.days.length) h += '<div class="empty">Nothing logged this week.</div>';
    h += d.days.map(function (day) {
      return '<div class="dayblock" id="wad-' + day.date + '"><div class="dayhead"><b>' + esc(label(day.date)) + '</b><span class="dayhrs">' + hrs(day.hours) + '</span></div>' +
        day.visits.map(function (e) {
          return '<div class="visit tapv" data-vw="' + e.worker_id + '" data-vd="' + e.date + '"><div class="top"><span>' + esc(e.worker_name) + ' · ' + esc(cname(e.client_id)) + (e.apartment_id ? ' · ' + esc(aname(e.apartment_id)) : '') + '</span><b>' + hrs(e.hours) + '</b></div>' +
            '<div class="sub">' + esc(e.job_type) + ' · ' + t12(e.time_in) + '–' + t12(e.time_out) + ' · ' + pill(e.status) + '</div>' + (e.notes ? '<div class="sub">“' + esc(e.notes) + '”</div>' : '') + '</div>';
        }).join('') + '</div>';
    }).join('');
    h += '<div class="sticky-foot"><div class="sumrow"><span>' + (onlyDate ? 'Total for ' + esc(short(onlyDate)) : 'Total, all cleaners') + '</span><b>' + hrs(d.total) + '</b></div>' +
      '<div class="sheet-actions"><button class="btn cancel" id="waclose">Cancel</button></div></div>';
    box.innerHTML = h;
    box.querySelector('#waclose').onclick = closeWeekAll;
    Array.prototype.forEach.call(box.querySelectorAll('.tapv'), function (el) {
      el.onclick = function () { var bg = document.getElementById('wabg'); if (bg) bg.remove(); openOwnerDay(el.dataset.vw, el.dataset.vd, function () { openWeekAll(start, onlyDate || null); }); };
    });
  }

  // All of one cleaner's work for a week, grouped by day. Tap "Open day" to go to that day.
  function openWorkerWeek(wid, start) {
    var bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'wwbg';
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Week work"></div>';
    $phone.appendChild(bg);
    bg.onclick = function (ev) { if (ev.target === bg) closeWorkerWeek(); };
    renderWorkerWeek(wid, start);
  }
  function closeWorkerWeek() { var bg = document.getElementById('wwbg'); if (bg) bg.remove(); viewOwner(); }
  function renderWorkerWeek(wid, start) {
    var box = document.querySelector('#wwbg .sheet'); if (!box) return;
    var r = call('workerWeek', { worker_id: wid, start: start });
    if (!r.ok) { closeWorkerWeek(); if (!expired(r)) toast(r.error); return; }
    var d = r.data, boot = state.boot, first = d.worker_name.split(' ')[0];
    var cname = function (id) { var c = boot.clients.filter(function (x) { return x.id === id; })[0]; return c ? c.name : '?'; };
    var aname = function (id) { var a = boot.apartments.filter(function (x) { return x.id === id; })[0]; return a ? a.name : ''; };
    var h = '<div class="sheet-hdr"><div><h2>' + esc(d.worker_name) + ' · Week ' + d.num + '</h2><p class="subline">' + short(d.start) + ' – ' + short(d.end) +
      ' · <b>' + hrs(d.total) + '</b> total, ' + hrs(d.confirmed) + ' confirmed</p></div></div>';
    if (!d.days.length) h += '<div class="empty">' + esc(first) + ' has nothing logged this week.</div>';
    h += d.days.map(function (day) {
      return '<div class="dayblock"><div class="dayhead"><b>' + esc(label(day.date)) + '</b>' + pill(day.status) + '<span class="dayhrs">' + hrs(day.hours) + '</span>' +
        '<button class="linkbtn" data-od="' + day.date + '">Open day ›</button></div>' +
        day.entries.map(function (e) {
          return '<div class="visit tapv" data-vw="' + e.worker_id + '" data-vd="' + e.date + '"><div class="top"><span>' + esc(cname(e.client_id)) + (e.apartment_id ? ' · ' + esc(aname(e.apartment_id)) : '') + '</span><b>' + hrs(e.hours) + '</b></div>' +
            '<div class="sub">' + esc(e.job_type) + ' · ' + t12(e.time_in) + '–' + t12(e.time_out) + '</div>' + (e.notes ? '<div class="sub">“' + esc(e.notes) + '”</div>' : '') + '</div>';
        }).join('') + '</div>';
    }).join('');
    h += '<div class="sticky-foot"><div class="sheet-actions"><button class="btn cancel" id="wwclose">Cancel</button></div></div>';
    box.innerHTML = h;
    box.querySelector('#wwclose').onclick = closeWorkerWeek;
    Array.prototype.forEach.call(box.querySelectorAll('.tapv'), function (el) {
      el.onclick = function () { var bg = document.getElementById('wwbg'); if (bg) bg.remove(); openOwnerDay(el.dataset.vw, el.dataset.vd, function () { openWorkerWeek(wid, start); }); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-od]'), function (el) {
      el.onclick = function () { var bg = document.getElementById('wwbg'); if (bg) bg.remove(); openOwnerDay(wid, el.dataset.od, function () { openWorkerWeek(wid, start); }); };
    });
  }
  // Opens one cleaner's day. back (optional) reopens the list it came from when the day closes.
  // ---------- Sandra: phone layout (days down, cleaners across, tab bar at the bottom) ----------
  function ownerIsPhone() {
    var v = null; try { v = sessionStorage.getItem('gct-owner-view'); } catch (e) {}
    if (v) return v === 'phone';
    return $phone.clientWidth < 700;
  }
  function setOwnerView(v) { try { sessionStorage.setItem('gct-owner-view', v); } catch (e) {} viewOwner(); }
  function cellTd(r, c) {
    if (c.status === 'future') return '<td></td>';
    var txt = c.entries ? hrs(c.hours) : '•';
    return '<td><button class="cell ' + c.status + '" data-ow="' + r.worker_id + '" data-od="' + c.date + '" aria-label="' + esc(r.name) + ', ' + txt + ', ' + c.status + '">' + txt + '</button></td>';
  }
  function viewOwnerPhone() {
    $phone.classList.add('phoneview'); document.body.classList.remove('owner-mode'); // shown inside the phone frame
    var prev = document.getElementById('ownermain'), keep = prev ? prev.scrollTop : 0;
    var r = call('activity'); if (!r.ok) { if (!expired(r)) toast(r.error); return; }
    var legend = '<div class="legend"><span class="pill none">No data</span><span class="pill logged">Not confirmed</span><span class="pill confirmed">Confirmed</span><span class="pill reopened">Reopened</span></div>';
    var weeks = r.data.map(function (w) {
      var names = w.rows.map(function (x) { return '<th>' + esc(x.name.split(' ')[0]) + (x.active ? '' : '<small>off</small>') + '</th>'; }).join('');
      var tot = '<tr class="ptot"><td class="pday"><b>Total</b></td>' + w.rows.map(function (x) {
        return '<td><button class="gtotbtn" data-wt="' + x.worker_id + '" data-ws="' + w.start + '"><b>' + (x.total ? hrs(x.total) : '—') + '</b><small class="sub-ok">' + (x.confirmed ? hrs(x.confirmed) : '—') + '</small></button></td>';
      }).join('') + '</tr>';
      var days = [6, 5, 4, 3, 2, 1, 0].map(function (i) {
        var date = w.rows[0].cells[i].date;
        return '<tr><td class="pday"><b>' + DOW[new Date(date + 'T00:00:00Z').getUTCDay()] + '</b><small>' + short(date) + '</small></td>' +
          w.rows.map(function (x) { return cellTd(x, x.cells[i]); }).join('') + '</tr>';
      }).join('');
      return '<section class="pweek"><div class="pbar" style="background:' + wkColor(w.num) + '">Week ' + w.num + '</div><div class="ptable"><table class="ptab"><thead><tr><th class="pday">Day</th>' + names + '</tr></thead><tbody>' + tot + days + '</tbody></table>' +
        '<button class="pallbtn" data-wa="' + w.start + '" data-wd="">All cleaners, every visit ›</button></div></section>';
    }).join('');
    var tabs = phoneTabs('activity');
    $app.innerHTML = '<div class="ophone"><header class="ohdr"><h1>Sandra\'s Dashboard</h1><div class="ohlinks"><button class="link" id="todesk">Desktop view</button><button class="link" id="out">Sign out</button></div></header>' +
      '<main class="oscroll" id="ownermain"><div class="pstick"><h2 class="ptitle">Weekly activity</h2>' + legend + '</div>' + weeks + '</main>' +
      '<nav class="otabs">' + tabs + '</nav></div>';
    document.getElementById('out').onclick = signOut;
    document.getElementById('todesk').onclick = function () { setOwnerView('desktop'); };
    bindRail();
    Array.prototype.forEach.call(document.querySelectorAll('[data-ow]'), function (el) { el.onclick = function () { openOwnerDay(el.dataset.ow, el.dataset.od); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-wt]'), function (el) { el.onclick = function () { openWorkerWeek(el.dataset.wt, el.dataset.ws); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-wa]'), function (el) { el.onclick = function () { openWeekAll(el.dataset.wa, el.dataset.wd || null); }; });
    document.getElementById('ownermain').scrollTop = keep;
  }
  // Opens one cleaner's day. back (optional) reopens the list it came from when the day closes.
  function openOwnerDay(wid, date, back) {
    var bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'ownerbg';
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Day"></div>';
    bg.back = back || null;
    $phone.appendChild(bg);
    bg.onclick = function (ev) { if (ev.target === bg) closeOwnerDay(); };
    renderOwnerDay(wid, date);
  }
  function closeOwnerDay() {
    var bg = document.getElementById('ownerbg'), back = bg ? bg.back : null;
    if (bg) bg.remove();
    viewOwner();
    if (back) back();
  }
  function renderOwnerDay(wid, date) {
    var box = document.querySelector('#ownerbg .sheet'); if (!box) return;
    var r = call('ownerDay', { worker_id: wid, date: date });
    if (!r.ok) { closeOwnerDay(); if (!expired(r)) toast(r.error); return; }
    var d = r.data, first = d.worker_name.split(' ')[0], boot = state.boot;
    var cname = function (id) { var c = boot.clients.filter(function (x) { return x.id === id; })[0]; return c ? c.name : '?'; };
    var aname = function (id) { var a = boot.apartments.filter(function (x) { return x.id === id; })[0]; return a ? a.name : ''; };
    var total = 0; d.entries.forEach(function (e) { total += e.hours; });
    var ctx = { worker_id: wid, date: date, name: first };
    var again = function () { renderOwnerDay(wid, date); };
    var h = '<div class="sheet-hdr"><div><h2>' + esc(d.worker_name) + ' · ' + esc(label(d.date)) + '</h2><p class="subline">' + (total ? hrs(total) + ' logged' : 'Nothing logged') + '</p></div></div>' + pill(d.status) + '<div style="height:12px"></div>';
    if (d.status === 'reopened' && d.reopen_note) h += '<div class="banner reopen"><b>Sent back to ' + esc(first) + '</b>' + esc(d.reopen_note) + '</div>';
    if (d.status === 'confirmed' && d.sandra_confirm_note !== null) h += '<div class="banner sandra"><b>You confirmed this day for ' + esc(first) + '</b>' + (d.sandra_confirm_note ? esc(d.sandra_confirm_note) : 'No note added.') + '</div>';
    h += d.entries.length ? d.entries.map(function (e) {
      return '<div class="entry"><div class="top"><b>' + esc(cname(e.client_id)) + (e.apartment_id ? ' · ' + esc(aname(e.apartment_id)) : '') + '</b><b>' + hrs(e.hours) + '</b></div>' +
        '<div class="sub">' + esc(e.job_type) + ' · ' + t12(e.time_in) + '–' + t12(e.time_out) + '</div>' + (e.notes ? '<div class="sub">“' + esc(e.notes) + '”</div>' : '') +
        (e.edited_by_sandra ? '<div class="mini">Changed by Sandra' + (e.edit_reason ? ': ' + esc(e.edit_reason) : '') + '</div>' : '') +
        '<div class="acts"><button class="abtn" data-oedit="' + e.id + '">Edit</button><button class="abtn del" data-odel="' + e.id + '">Delete</button></div></div>';
    }).join('') : '<div class="empty">Nothing logged for this day.</div>';
    var canRe = d.status === 'confirmed', canFc = d.status !== 'confirmed' && d.entries.length > 0;
    h += '<div class="sheet-actions"><button class="btn secondary" id="oadd">+ Add visit</button>' +
      (canFc ? '<button class="btn secondary" id="ofc">Confirm for ' + esc(first) + '</button>' : '') +
      (canRe ? '<button class="btn secondary" id="ore">Reopen for ' + esc(first) + '</button>' : '') +
      '<button class="btn cancel" id="ocl">Cancel</button></div>';
    box.innerHTML = h;
    box.querySelector('#ocl').onclick = function () { closeOwnerDay(); };
    box.querySelector('#oadd').onclick = function () { openSheet(null, again, ctx); };
    Array.prototype.forEach.call(box.querySelectorAll('[data-oedit]'), function (el) {
      el.onclick = function () { var e = d.entries.filter(function (x) { return x.id === el.dataset.oedit; })[0]; openSheet(e, again, ctx); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-odel]'), function (el) {
      el.onclick = function () {
        var e = d.entries.filter(function (x) { return x.id === el.dataset.odel; })[0];
        askConfirm({ title: 'Delete this visit?', ok: 'Yes, delete', danger: true,
          body: '<p><b>' + esc(cname(e.client_id)) + (e.apartment_id ? ' · ' + esc(aname(e.apartment_id)) : '') + '</b><br>' + esc(e.job_type) + ' · ' + hrs(e.hours) + '</p><p>' + esc(first) + ' gets an email that this visit was removed.</p>' },
          function () { var c = call('ownerDeleteEntry', { worker_id: wid, id: e.id }); if (!c.ok) return toast(c.error); toast('Visit deleted'); again(); });
      };
    });
    var re = box.querySelector('#ore');
    if (re) re.onclick = function () {
      openNote({ title: 'Reopen ' + label(d.date), hint: 'Tell ' + first + ' what to check. They get an email with your note.', ok: 'Reopen and send',
        placeholder: 'e.g. Hours look off for the Springline job, please double check.' }, function (note) {
        var c = call('reopenDay', { worker_id: wid, date: date, note: note }); if (!c.ok) return c.error;
        toast('Sent back to ' + first); again(); return '';
      });
    };
    var fc = box.querySelector('#ofc');
    if (fc) fc.onclick = function () {
      openNote({ title: 'Confirm for ' + first, hint: 'This locks the day so payroll can run. ' + first + ' gets a notice that you confirmed it. A note is optional.', ok: 'Confirm', optional: true,
        placeholder: 'e.g. Closing out payroll, confirming this for you. Flag anything wrong fast.' }, function (note) {
        var c = call('forceConfirmDay', { worker_id: wid, date: date, note: note }); if (!c.ok) return c.error;
        toast('Confirmed for ' + first); again(); return '';
      });
    };
  }
  // A note is required for every reopen and force-confirm. save() returns an error message, or '' when it worked.
  function openNote(o, save) {
    var bg = document.createElement('div'); bg.className = 'sheet-bg stacked2';
    bg.innerHTML = '<div class="sheet" role="dialog" aria-label="' + esc(o.title) + '"><h2>' + esc(o.title) + '</h2><p class="cbody">' + esc(o.hint) + '</p>' +
      '<textarea id="nnote" rows="4" maxlength="500" placeholder="' + esc(o.placeholder) + '"></textarea><p class="err" id="nerr" role="alert"></p>' +
      '<div class="formacts"><button type="button" class="btn cancel" id="ncancel">Cancel</button><button type="button" class="btn" id="nok"' + (o.optional ? '' : ' disabled') + '>' + esc(o.ok) + '</button></div></div>';
    $phone.appendChild(bg);
    var ta = bg.querySelector('#nnote'), ok = bg.querySelector('#nok');
    ta.oninput = function () { ok.disabled = !o.optional && !ta.value.trim(); };
    ok.onclick = function () { var err = save(ta.value.trim()); if (err) { bg.querySelector('#nerr').textContent = err; return; } bg.remove(); };
    bg.querySelector('#ncancel').onclick = function () { bg.remove(); };
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
    ta.focus();
  }

  // ---------- client-week popup (from Summary) ----------
  function openClientWeek(start, cid) {
    var bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'cwbg';
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Visits" id="cwsheet"></div>';
    $phone.appendChild(bg); $app.style.overflowY = 'hidden';
    bg.onclick = function (ev) { if (ev.target === bg) closeCW(); };
    renderClientWeek(start, cid);
  }
  function closeCW() { var bg = document.getElementById('cwbg'); if (bg) bg.remove(); $app.style.overflowY = ''; refreshHome(); } // refresh so Summary numbers update
  function renderClientWeek(start, cid) {
    var box = document.getElementById('cwsheet'); if (!box) return;
    var r = call('clientWeek', { start: start, client_id: cid }); if (!r.ok) { closeCW(); if (!expired(r)) toast(r.error); return; }
    var d = r.data, apt = function (id) { var a = state.boot.apartments.filter(function (x) { return x.id === id; })[0]; return a ? a.name : ''; };
    var body = '<div class="sheet-hdr"><div><h2>' + esc(d.client_name) + '</h2><p class="subline">Week ' + d.num + ' · ' + short(d.start) + ' – ' + short(d.end) + ' · <b>' + hrs(d.total) + '</b></p></div></div>';
    body += d.entries.length ? d.entries.map(function (e) {
      return '<div class="entry"><div class="top"><b>' + esc(label(e.date)) + '</b><b>' + hrs(e.hours) + '</b></div>' +
        '<div class="sub">' + t12(e.time_in) + '–' + t12(e.time_out) + (e.apartment_id ? ' · ' + esc(apt(e.apartment_id)) : '') + ' · ' + esc(e.job_type) + '</div>' +
        (e.notes ? '<div class="sub">“' + esc(e.notes) + '”</div>' : '') +
        '<div class="rowline">' + pill(e.status) + (e.editable ? '<button class="abtn" data-ce="' + e.id + '">Edit</button>' : '<span class="sub">Locked</span>') + '</div></div>';
    }).join('') : '<div class="empty">No visits left for this client this week.</div>';
    body += '<div class="sheet-actions"><button class="btn cancel" id="cwclose">Close</button></div>';
    box.innerHTML = body;
    document.getElementById('cwclose').onclick = closeCW;
    Array.prototype.forEach.call(box.querySelectorAll('[data-ce]'), function (el) {
      el.onclick = function () {
        var e = d.entries.filter(function (x) { return x.id === el.dataset.ce; })[0];
        state.day = e.date; openSheet(e, function () { renderClientWeek(start, cid); });
      };
    });
  }

  // ---------- day popup ----------
  // The day opens as a popup over the week list, so closing it leaves the list (and scroll position) untouched.
  function openDay(date) {
    state.day = date;
    var bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'daybg';
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="Day details" id="daysheet"></div>';
    $phone.appendChild(bg); $app.style.overflowY = 'hidden';
    bg.onclick = function (ev) { if (ev.target === bg) closeTop(); };
    renderDay();
  }
  function refreshHome() { var y = $app.scrollTop; viewHome(); $app.scrollTop = y; }
  function closeDay() {
    var bg = document.getElementById('daybg'); if (bg) bg.remove();
    $app.style.overflowY = ''; refreshHome();
  }
  function closeTop() { // topmost popup: the entry form if open, else the day
    var all = document.querySelectorAll('.sheet-bg'); if (!all.length) return;
    var top = all[all.length - 1];
    if (top.id === 'daybg') closeDay(); else if (top.id === 'cwbg') closeCW(); else top.remove();
  }
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeTop(); });

  // In-app confirmation popup (big buttons) instead of the browser's small native dialog.
  function askConfirm(o, yes) {
    var bg = document.createElement('div'); bg.className = 'sheet-bg stacked2';
    bg.innerHTML = '<div class="sheet" role="alertdialog" aria-modal="true" aria-label="' + esc(o.title) + '"><h2>' + esc(o.title) + '</h2><div class="cbody">' + o.body + '</div>' +
      '<div class="pickacts one"><button type="button" class="btn' + (o.danger ? ' dangerfill' : '') + '" id="cyes">' + esc(o.ok) + '</button><button type="button" class="btn cancel" id="cno">Cancel</button></div></div>';
    $phone.appendChild(bg);
    bg.querySelector('#cno').onclick = function () { bg.remove(); };
    bg.querySelector('#cyes').onclick = function () { bg.remove(); yes(); };
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
  }

  function renderDay() {
    var box = document.getElementById('daysheet'); if (!box) return;
    var r = call('day', { date: state.day }); if (!r.ok) { closeDay(); if (!expired(r)) toast(r.error); return; }
    var d = r.data, boot = state.boot;
    var cname = function (id) { var c = boot.clients.filter(function (x) { return x.id === id; })[0]; return c ? c.name : '?'; };
    var aname = function (id) { var a = boot.apartments.filter(function (x) { return x.id === id; })[0]; return a ? a.name : ''; };
    var total = d.entries.reduce(function (s, e) { return s + e.hours; }, 0);
    var body = '<div class="sheet-hdr"><div><h2>' + label(d.date) + '</h2>' + pill(d.status) + '</div></div>';
    if (d.reopen_note) body += '<div class="banner reopen"><b>Sandra sent this day back</b>' + esc(d.reopen_note) + '</div>';
    if (d.sandra_confirm_note !== null) body += '<div class="banner sandra"><b>Sandra confirmed this day for you</b>' + (d.sandra_confirm_note ? esc(d.sandra_confirm_note) : 'No note from Sandra.') + '<br>Your pay is based on these hours unless you tell her something is wrong.</div>';
    body += d.entries.length ? d.entries.map(function (e) {
      return '<div class="entry"><div class="top"><b>' + esc(cname(e.client_id)) + (e.apartment_id ? ' · ' + esc(aname(e.apartment_id)) : '') + '</b><b>' + hrs(e.hours) + '</b></div>' +
        '<div class="sub">' + esc(e.job_type) + ' · ' + t12(e.time_in) + '–' + t12(e.time_out) + '</div>' + (e.notes ? '<div class="sub">“' + esc(e.notes) + '”</div>' : '') +
        (e.edited_by_sandra ? '<div class="mini">Edited by Sandra: ' + esc(e.edit_reason) + '</div>' : '') +
        (d.editable ? '<div class="acts"><button class="abtn" data-edit="' + e.id + '">Edit</button><button class="abtn del" data-del="' + e.id + '">Delete</button></div>' : '') + '</div>';
    }).join('') : '<div class="empty">No entries yet.</div>';
    if (d.entries.length) body += '<div class="sum"><b>Total</b><span class="big">' + hrs(total) + '</span></div>';
    if (d.status === 'confirmed') body += '<p style="color:var(--muted);font-size:14px;text-align:center">Confirmed and locked. Spotted a mistake? Ask Sandra to reopen this day.</p>';
    body += '<div class="sheet-actions">' + (d.editable ?
      '<button class="btn secondary" id="add">+ Add entry</button><button class="btn" id="confirm"' + (d.entries.length ? '' : ' disabled') + '>Confirm day</button><button class="btn cancel" id="closeday2">Cancel</button>' :
      '<button class="btn cancel" id="closeday2">Close</button>') + '</div>';
    box.innerHTML = body;
    var c2 = document.getElementById('closeday2'); if (c2) c2.onclick = closeDay;
    if (!d.editable) return;
    document.getElementById('add').onclick = function () { openSheet(null); };
    document.getElementById('confirm').onclick = function () {
      askConfirm({
        title: 'Confirm this day?', ok: 'Yes, confirm day',
        body: '<p><b>' + esc(label(d.date)) + ' · ' + hrs(total) + '</b></p><p>Once confirmed you can\'t add, change or delete anything for this day. If you spot a mistake later, only Sandra can reopen it.</p>'
      }, function () {
        var c = call('confirmDay', { date: d.date }); if (!c.ok) return toast(c.error);
        toast('Day confirmed'); renderDay();
      });
    };
    Array.prototype.forEach.call(box.querySelectorAll('[data-edit]'), function (el) { el.onclick = function () { openSheet(d.entries.filter(function (e) { return e.id === el.dataset.edit; })[0]); }; });
    Array.prototype.forEach.call(box.querySelectorAll('[data-del]'), function (el) {
      el.onclick = function () {
        var e = d.entries.filter(function (x) { return x.id === el.dataset.del; })[0];
        askConfirm({
          title: 'Delete this entry?', ok: 'Yes, delete', danger: true,
          body: '<p><b>' + esc(cname(e.client_id)) + (e.apartment_id ? ' · ' + esc(aname(e.apartment_id)) : '') + '</b><br>' + esc(e.job_type) + ' · ' + hrs(e.hours) + '</p>'
        }, function () { var c = call('deleteEntry', { id: e.id }); if (!c.ok) return toast(c.error); toast('Entry deleted'); renderDay(); });
      };
    });
  }

  // ---------- add / edit sheet ----------
  // Finger-sized: big option buttons instead of dropdowns, a tap time picker, quick "how long" buttons.
  function toMin(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function from24(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
  function t12long(t) { var p = t.split(':'), h = +p[0]; return ((h + 11) % 12 + 1) + ':' + p[1] + ' ' + (h < 12 ? 'AM' : 'PM'); }

  function pickTime(title, initial, done) {
    var m0 = toMin(initial), p = { h: ((Math.floor(m0 / 60) + 11) % 12) + 1, ap: m0 < 720 ? 'AM' : 'PM', m: m0 % 60 };
    var bg = document.createElement('div'); bg.className = 'sheet-bg stacked2';
    $phone.appendChild(bg);
    function value() { return from24(((p.h % 12) + (p.ap === 'PM' ? 12 : 0)) * 60 + p.m); }
    function render() {
      var hours = [], mins = [];
      for (var h = 1; h <= 12; h++) hours.push('<button type="button" class="opt sm' + (p.h === h ? ' on' : '') + '" data-h="' + h + '">' + h + '</button>');
      for (var m = 0; m < 60; m += 5) mins.push('<button type="button" class="opt sm' + (p.m === m ? ' on' : '') + '" data-m="' + m + '">' + ('0' + m).slice(-2) + '</button>');
      bg.innerHTML = '<div class="sheet" role="dialog" aria-label="' + esc(title) + '"><h2>' + esc(title) + '</h2><div class="bigtime">' + esc(t12long(value())) + '</div>' +
        '<div class="opts two"><button type="button" class="opt' + (p.ap === 'AM' ? ' on' : '') + '" data-ap="AM">AM</button><button type="button" class="opt' + (p.ap === 'PM' ? ' on' : '') + '" data-ap="PM">PM</button></div>' +
        '<div class="gl">Hour</div><div class="grid4">' + hours.join('') + '</div><div class="gl">Minutes</div><div class="grid4">' + mins.join('') + '</div>' +
        '<div class="pickacts"><button type="button" class="btn cancel" id="pcancel">Cancel</button><button type="button" class="btn" id="pdone">Done</button></div></div>';
      Array.prototype.forEach.call(bg.querySelectorAll('[data-h]'), function (el) { el.onclick = function () { p.h = +el.dataset.h; render(); }; });
      Array.prototype.forEach.call(bg.querySelectorAll('[data-m]'), function (el) { el.onclick = function () { p.m = +el.dataset.m; render(); }; });
      Array.prototype.forEach.call(bg.querySelectorAll('[data-ap]'), function (el) { el.onclick = function () { p.ap = el.dataset.ap; render(); }; });
      document.getElementById('pcancel').onclick = function () { bg.remove(); };
      document.getElementById('pdone').onclick = function () { var v = value(); bg.remove(); done(v); };
    }
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
    render();
  }

  // Full-height scrollable list with a search box (for long client / unit / service lists).
  function pickFromList(title, items, selected, done) {
    var bg = document.createElement('div'); bg.className = 'sheet-bg stacked2';
    bg.innerHTML = '<div class="sheet tall" role="dialog" aria-label="' + esc(title) + '"><h2>' + esc(title) + '</h2>' +
      (items.length > 8 ? '<input type="search" id="psearch" placeholder="Search…" autocomplete="off" aria-label="Search">' : '') +
      '<div class="plist" id="plist"></div><div class="pickacts one"><button type="button" class="btn cancel" id="pcancel">Cancel</button></div></div>';
    $phone.appendChild(bg);
    var list = bg.querySelector('#plist');
    function paint(q) {
      q = (q || '').toLowerCase();
      var shown = items.filter(function (i) { return i.t.toLowerCase().indexOf(q) >= 0; });
      list.innerHTML = shown.length ? shown.map(function (i) { return '<button type="button" class="opt row' + (i.v === selected ? ' on' : '') + '" data-v="' + esc(i.v) + '">' + esc(i.t) + '</button>'; }).join('') : '<p class="empty">Nothing matches.</p>';
      Array.prototype.forEach.call(list.querySelectorAll('[data-v]'), function (el) { el.onclick = function () { var v = el.dataset.v; bg.remove(); done(v); }; });
    }
    paint('');
    var se = bg.querySelector('#psearch'); if (se) se.oninput = function () { paint(se.value); };
    bg.querySelector('#pcancel').onclick = function () { bg.remove(); };
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
    var cur = list.querySelector('.on'); if (cur) cur.scrollIntoView({ block: 'center' });
  }

  function openSheet(entry, onSaved, ctx) {
    var boot = state.boot, e = entry || {};
    var st = { client: e.client_id || '', apt: e.apartment_id || '', job: e.job_type || '', tin: e.time_in || '', tout: e.time_out || '', notes: e.notes || '', reason: '', err: '' };
    var bg = document.createElement('div'); bg.className = 'sheet-bg stacked';
    $phone.appendChild(bg);
    function close() { bg.remove(); }
    function render() {
      var keep = bg.firstChild ? bg.firstChild.scrollTop : 0;
      var clients = boot.clients.filter(function (c) { return c.active || c.id === e.client_id; });
      var apts = boot.apartments.filter(function (a) { return a.client_id === st.client && (a.active || a.id === e.apartment_id); });
      var jobs = boot.job_types.concat(e.job_type && boot.job_types.indexOf(e.job_type) < 0 ? [e.job_type] : []);
      var mins = st.tin && st.tout ? toMin(st.tout) - toMin(st.tin) : 0;
      // Short lists show big buttons inline; long ones collapse to one row that opens a searchable full list.
      var G = {
        c: { label: 'Client', cls: 'wide', max: 0, items: clients.map(function (c) { return { v: c.id, t: c.name }; }), val: st.client, set: function (v) { if (st.client !== v) { st.client = v; st.apt = ''; } } },
        a: { label: 'Apartment / unit', items: apts.map(function (a) { return { v: a.id, t: a.name }; }), val: st.apt, set: function (v) { st.apt = v; } },
        j: { label: 'Service', max: 0, items: jobs.map(function (j) { return { v: j, t: j }; }), val: st.job, set: function (v) { st.job = v; } }
      };
      function group(k) {
        var g = G[k], cur = g.items.filter(function (i) { return i.v === g.val; })[0];
        var off = k === 'a' && !st.client;
        return '<div class="gl">' + g.label + '</div><button type="button" class="fieldrow' + (cur ? '' : ' empty') + '" data-pick="' + k + '"' + (off ? ' disabled' : '') + '><span>' +
          esc(cur ? cur.t : off ? 'Pick a client first' : 'Choose…') + '</span><i>›</i></button>';
      }
      var h = '<form class="sheet entryform" role="dialog" aria-label="Entry"><h2>' + (entry ? 'Edit entry' : 'Add entry') + '</h2>' + group('c');
      if (!st.client || apts.length) h += group('a');
      h += group('j');
      h += '<div class="gl">Time</div><div class="times">' +
        '<button type="button" class="tbtn' + (st.tin ? '' : ' empty') + '" data-t="in"><small>Start</small><b>' + (st.tin ? esc(t12long(st.tin)) : 'Set time') + '</b></button>' +
        '<button type="button" class="tbtn' + (st.tout ? '' : ' empty') + '" data-t="out"><small>End</small><b>' + (st.tout ? esc(t12long(st.tout)) : 'Set time') + '</b></button></div>';
      if (mins > 0) h += '<p class="tot">Total: <b>' + (Math.round(mins / 60 * 100) / 100) + 'h</b></p>';
      h += (ctx ? '<div class="gl">Note for ' + esc(ctx.name) + ' (optional)</div><textarea name="reason" rows="2" maxlength="300" placeholder="Why you changed this. They see it.">' + esc(st.reason) + '</textarea>' : '') + '<div class="gl">Notes (optional)</div><textarea name="notes" rows="2" placeholder="Anything Sandra should know?" maxlength="500">' + esc(st.notes) + '</textarea>' +
        '<p class="err" id="serr" role="alert">' + esc(st.err) + '</p><div class="formacts"><button type="button" class="btn cancel" id="cancel">Cancel</button><button class="btn">Save</button></div></form>';
      bg.innerHTML = h;
      var f = bg.firstChild; f.scrollTop = keep;
      f.notes.oninput = function () { st.notes = f.notes.value; };
      if (f.reason) f.reason.oninput = function () { st.reason = f.reason.value; };
      Array.prototype.forEach.call(f.querySelectorAll('[data-pick]'), function (el) {
        el.onclick = function () {
          var g = G[el.dataset.pick];
          pickFromList(g.label, g.items, g.val, function (v) { st.err = ''; g.set(v); render(); });
        };
      });
      Array.prototype.forEach.call(f.querySelectorAll('[data-t]'), function (el) {
        el.onclick = function () {
          var which = el.dataset.t, init = which === 'in' ? (st.tin || '08:00') : (st.tout || (st.tin ? from24(Math.min(toMin(st.tin) + 120, 1439)) : '10:00'));
          pickTime(which === 'in' ? 'Start time' : 'End time', init, function (v) { if (which === 'in') st.tin = v; else st.tout = v; st.err = ''; render(); });
        };
      });
      document.getElementById('cancel').onclick = close;
      f.onsubmit = function (ev) {
        ev.preventDefault();
        var fields = { id: entry && entry.id, client_id: st.client, apartment_id: st.apt || null, job_type: st.job, time_in: st.tin, time_out: st.tout, notes: st.notes };
        var r = ctx ? call('ownerSaveEntry', Object.assign({ worker_id: ctx.worker_id, date: ctx.date, reason: st.reason }, fields))
                    : call('saveEntry', Object.assign({ date: state.day }, fields));
        if (!r.ok) { st.err = r.error; render(); var er = document.getElementById('serr'); if (er) er.scrollIntoView({ block: 'center' }); return; }
        close(); toast('Saved'); (onSaved || renderDay)();
      };
    }
    bg.onclick = function (ev) { if (ev.target === bg) close(); };
    render();
  }

  // ---------- router ----------
  function route(name) {
    if (name !== 'login' && !state.token) name = 'login';
    if (name === 'login') { $phone.classList.remove('owner'); document.body.classList.remove('owner-mode'); return viewLogin(); }
    var b = call('bootstrap'); if (!b.ok) { signOut(); return; }
    state.boot = b.data;
    var owner = state.user.role === 'owner';
    $phone.classList.toggle('owner', owner);
    document.body.classList.toggle('owner-mode', owner);
    viewHome();
  }
  route(state.token ? 'home' : 'login');
})();
