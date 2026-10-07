// All business rules live here. The frontend never touches data directly: it calls
// GCT.createApi(store).call(action, args, token). In the prototype `store` is a
// localStorage adapter; in production it becomes the Google Sheet, and call() is
// invoked from doPost(). Keep this file free of DOM / browser APIs.
GCT.createApi = function (store) {
  var D = GCT.dates;
  var HISTORY_DAYS = 27; // cleaners see today + the previous 4 weeks

  function fail(msg) { throw new Error(msg); }
  function find(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return arr[i]; return null; }
  function filter(arr, fn) { return arr.filter(fn); }
  function newToken() { var s = ''; for (var i = 0; i < 4; i++) s += Math.random().toString(36).slice(2); return s; }
  function toMin(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function validTime(t) { return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }
  function mask(email) { var p = email.split('@'); return p[0].charAt(0) + '***@' + p[1]; }

  function statusFor(db, w, date) {
    var r = find(db.dayStatus, function (s) { return s.worker_id === w && s.date === date; });
    return r ? r.status : null;
  }
  function setStatus(db, w, date, status) {
    var r = find(db.dayStatus, function (s) { return s.worker_id === w && s.date === date; });
    if (r) r.status = status; else db.dayStatus.push({ worker_id: w, date: date, status: status });
  }
  function noteFor(table, w, date) {
    var r = find(table, function (n) { return n.worker_id === w && n.date === date; });
    return r ? r.note : null;
  }
  function dayEntries(db, w, date) {
    return filter(db.entries, function (e) { return e.worker_id === w && e.date === date; })
      .sort(function (a, b) { return a.time_in < b.time_in ? -1 : 1; });
  }
  function requireCleaner(session) {
    if (!session) fail('Please sign in again.');
    if (session.role !== 'owner' && session.role !== 'cleaner') fail('Not allowed.');
    if (session.role === 'owner') fail("Use Sandra's dashboard.");
    return session.user_id;
  }
  function checkDateAllowed(date) {
    if (!D.isDate(date)) fail('Pick a valid date.');
    var t = D.today();
    if (date > t) fail("You can't log hours for a future day.");
    if (date < D.addDays(t, -HISTORY_DAYS)) fail('That day is too far back — ask Sandra.');
  }
  function requireEditable(db, w, date) {
    if (statusFor(db, w, date) === 'confirmed') fail('This day is confirmed and locked. Ask Sandra to reopen it.');
  }

  function requireOwner(session) {
    if (!session) fail('Please sign in again.');
    if (session.role !== 'owner') fail('Only Sandra can do that.');
    return session.user_id;
  }
  function cleanerOf(db, a) {
    var w = find(db.workers, function (x) { return x.id === a.worker_id && x.role === 'cleaner'; });
    if (!w) fail('Worker not found.');
    return w;
  }
  function setNote(table, w, date, note) {
    var r = find(table, function (n) { return n.worker_id === w && n.date === date; });
    if (r) r.note = note; else table.push({ worker_id: w, date: date, note: note });
  }
  function dropNote(table, w, date) {
    for (var i = table.length - 1; i >= 0; i--) if (table[i].worker_id === w && table[i].date === date) table.splice(i, 1);
  }
  function ownerNote(a) {
    var n = String(a.note || '').trim();
    if (!n) fail('Please write a short note for the worker.');
    if (n.length > 500) fail('Keep the note under 500 characters.');
    return n;
  }
  function emailWorker(db, w, subject, body) {
    // Production: MailApp.sendEmail(...). Prototype: recorded in the outbox.
    db.outbox.push({ to: w.email || '(no email on file)', subject: subject, body: body, at: Date.now() });
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  // PINs are 5 digits and unique across everyone (active or not), so a PIN always identifies one person.
  function pinOk(pin) { return /^\d{5}$/.test(String(pin || '')); }
  function pinTaken(db, pin, exceptId) {
    return db.workers.some(function (w) { return w.pin === pin && w.id !== exceptId; });
  }

  // Pay rates are append-only dated rows: the rate in force on a date is the latest row starting on or before it.
  function ratesFor(db, wid) {
    return db.workerRates.filter(function (r) { return r.worker_id === wid; })
      .sort(function (x, y) { return x.effective_from < y.effective_from ? 1 : x.effective_from > y.effective_from ? -1 : 0; });
  }
  function rateOn(db, wid, date) {
    var r = ratesFor(db, wid).filter(function (x) { return x.effective_from <= date; })[0];
    return r ? r.rate : null;
  }
  function rateValue(v) {
    var n = Math.round(Number(v) * 100) / 100;
    if (!(n > 0 && n <= 500)) fail('Enter a rate between $1 and $500.');
    return n;
  }
  function rateDateOk(db, wid, date, exceptFrom) {
    if (!D.isDate(date)) fail('Pick a valid start date.');
    var clash = db.workerRates.some(function (r) { return r.worker_id === wid && r.effective_from === date && r.effective_from !== exceptFrom; });
    if (clash) fail('A rate already starts on that date. Pick another date, or correct it under View records.');
  }

  // Shared entry validation and write. owner = Sandra acting for the cleaner (any past day, any status).
  function writeEntry(db, wid, a, owner) {
    var client = find(db.clients, function (c) { return c.id === a.client_id; });
    if (!client) fail('Pick a client.');
    var existing = a.id ? find(db.entries, function (e) { return e.id === a.id && e.worker_id === wid; }) : null;
    if (a.id && !existing) fail('Entry not found.');
    if (!client.active && !(existing && existing.client_id === client.id)) fail('That client is no longer active.');
    var apts = filter(db.apartments, function (x) { return x.client_id === client.id && x.active; });
    var apt = null;
    if (a.apartment_id) {
      apt = find(db.apartments, function (x) { return x.id === a.apartment_id && x.client_id === client.id; });
      if (!apt) fail('That unit does not belong to this client.');
      if (!apt.active && !(existing && existing.apartment_id === apt.id)) fail('That unit is no longer active.');
    } else if (apts.length) fail('Pick an apartment/unit.');
    var jt = find(db.jobTypes, function (j) { return j.name === a.job_type; });
    if (!jt) fail('Pick a service type.');
    if (!jt.active && !(existing && existing.job_type === jt.name)) fail('That service type is retired.');
    if (!validTime(a.time_in) || !validTime(a.time_out)) fail('Enter start and end times.');
    var mins = toMin(a.time_out) - toMin(a.time_in);
    if (mins <= 0) fail('End time must be after start time.');
    var clash = find(dayEntries(db, wid, a.date), function (e) {
      return (!existing || e.id !== existing.id) && toMin(a.time_in) < toMin(e.time_out) && toMin(e.time_in) < toMin(a.time_out);
    });
    if (clash) fail('This overlaps another entry (' + clash.time_in + '–' + clash.time_out + ').');
    var fields = { date: a.date, client_id: client.id, apartment_id: apt ? apt.id : null, job_type: jt.name,
                   time_in: a.time_in, time_out: a.time_out, hours: round2(mins / 60), notes: String(a.notes || '').slice(0, 500) };
    var entry;
    if (existing) {
      if (existing.date !== a.date) fail('To move an entry to another day, delete it and add it there.');
      entry = existing;
      for (var k in fields) entry[k] = fields[k];
    } else {
      entry = { id: store.nextId(db, 'entries', 'e'), worker_id: wid, billed_rate: null, jobber_job_id: null,
                edited_by_sandra: false, edit_reason: '', edit_history: [] };
      for (var k2 in fields) entry[k2] = fields[k2];
      db.entries.push(entry);
    }
    if (!owner && !statusFor(db, wid, a.date)) setStatus(db, wid, a.date, 'logged');
    return entry;
  }
  // Sandra changed a day: it is not confirmed any more. Clear her old confirm note, email the cleaner.
  function sandraTouched(db, w, date, reason, deleted) {
    var why = String(reason || '').trim().slice(0, 300);
    if (!dayEntries(db, w.id, date).length) { // last visit removed: nothing left to confirm
      db.dayStatus = filter(db.dayStatus, function (x) { return !(x.worker_id === w.id && x.date === date); });
      dropNote(db.reopenNotes, w.id, date);
    } else {
      setStatus(db, w.id, date, 'logged');
    }
    dropNote(db.sandraConfirmNotes, w.id, date);
    emailWorker(db, w, (deleted ? 'Sandra removed a visit for ' : 'Sandra changed your hours for ') + date,
                why || 'Please check your hours for this day.');
  }

  function validEmail(e) { return e === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function nextId(db, table, prefix) {
    var max = 0; db[table].forEach(function (r) { max = Math.max(max, parseInt(String(r.id).replace(/\D/g, ''), 10) || 0); });
    return prefix + (max + 1);
  }
  function newPin(db, pin, exceptId) {
    if (!pinOk(pin)) fail('PIN must be exactly 5 digits.');
    if (pinTaken(db, pin, exceptId)) fail('Someone already uses that PIN. Pick another.');
    return String(pin);
  }
  function clientRate(db, cid, service) {
    var r = find(db.clientRates || [], function (x) { return x.client_id === cid && x.service === service; });
    return r ? r.rate : null;
  }
  function ownerOf(db) { return find(db.workers, function (x) { return x.role === 'owner'; }); }

  var handlers = {
    loginUsers: function (db) {
      return filter(db.workers, function (w) { return w.active; })
        .map(function (w) { return { id: w.id, name: w.name, role: w.role }; });
    },
    login: function (db, a) {
      var now = Date.now(), window = 10 * 60 * 1000;
      db.loginFails = (db.loginFails || []).filter(function (t) { return now - t < window; });
      if (db.loginFails.length >= 10) return { __fail: 'Too many wrong PINs. Wait 10 minutes and try again.' };
      var pin = String(a.pin || '');
      var w = pinOk(pin) ? find(db.workers, function (x) { return x.active && x.pin === pin; }) : null;
      if (!w) {
        db.loginFails.push(now); // returned (not thrown) so the failure is saved
        return { __fail: 'Wrong PIN.' };
      }
      db.loginFails = [];
      var token = newToken();
      db.sessions.push({ token: token, user_id: w.id, role: w.role, created: Date.now() });
      if (db.sessions.length > 200) db.sessions = db.sessions.slice(-200);
      return { token: token, user: { id: w.id, name: w.name, role: w.role } };
    },
    logout: function (db, a, s, token) {
      db.sessions = filter(db.sessions, function (x) { return x.token !== token; });
      return {};
    },
    forgotPin: function (db, a) {
      var email = String(a.email || '').trim().toLowerCase();
      var w = email ? find(db.workers, function (x) { return x.active && String(x.email || '').toLowerCase() === email; }) : null;
      var now = Date.now();
      // At most one reset every 15 minutes per person, so the email can't be flooded.
      if (w && (!w.lastPinReset || now - w.lastPinReset > 15 * 60 * 1000)) {
        var pin;
        do { pin = String(10000 + Math.floor(Math.random() * 90000)); } while (pinTaken(db, pin, w.id));
        w.pin = pin; // the old PIN stops working straight away
        w.lastPinReset = now;
        // Production: MailApp.sendEmail(w.email, ...). Prototype: recorded in the outbox.
        db.outbox.push({ to: w.email, subject: 'Your new Golden Cleaning Tracker PIN', body: 'Your new PIN is ' + pin + '. Your old PIN no longer works.', at: now });
      }
      // Same reply either way, so this can't be used to find out who works here.
      return {};
    },
    bootstrap: function (db, a, s) {
      if (!s) fail('Please sign in again.');
      return {
        today: D.today(),
        clients: db.clients, apartments: db.apartments,
        job_types: db.jobTypes.filter(function (j) { return j.active; }).map(function (j) { return j.name; })
      };
    },
    days: function (db, a, s) {
      var w = requireCleaner(s), t = D.today(), out = [];
      for (var i = 0; i <= HISTORY_DAYS; i++) {
        var date = D.addDays(t, -i), es = dayEntries(db, w, date), hours = 0;
        es.forEach(function (e) { hours += e.hours; });
        var st = statusFor(db, w, date);
        out.push({
          date: date, entries: es.length, hours: Math.round(hours * 100) / 100,
          status: st || (es.length ? 'logged' : 'none'),
          reopened_note: st === 'reopened' && !!noteFor(db.reopenNotes, w, date),
          sandra_confirmed: st === 'confirmed' && noteFor(db.sandraConfirmNotes, w, date) !== null
        });
      }
      return out;
    },
    summary: function (db, a, s) {
      // Per-week hours by client for this cleaner, newest week first, plus days still needing confirmation.
      var w = requireCleaner(s), t = D.today(), weeks = {}, order = [];
      for (var i = 0; i <= HISTORY_DAYS; i++) {
        var date = D.addDays(t, -i), es = dayEntries(db, w, date);
        if (!es.length) continue;
        var ws = D.weekStart(date), wk = weeks[ws];
        if (!wk) { wk = weeks[ws] = { start: ws, end: D.addDays(ws, 6), num: D.weekNumber(ws), clients: {}, total: 0, needs: [] }; order.push(ws); }
        es.forEach(function (e) { wk.clients[e.client_id] = (wk.clients[e.client_id] || 0) + e.hours; wk.total += e.hours; });
        if (statusFor(db, w, date) !== 'confirmed') wk.needs.push(date);
      }
      return order.map(function (ws) {
        var wk = weeks[ws];
        var clients = Object.keys(wk.clients).map(function (id) {
          var c = find(db.clients, function (x) { return x.id === id; });
          return { client_id: id, name: c ? c.name : '?', hours: Math.round(wk.clients[id] * 100) / 100 };
        }).sort(function (x, y) { return y.hours - x.hours; });
        return { start: wk.start, end: wk.end, num: wk.num, clients: clients, total: Math.round(wk.total * 100) / 100, needs: wk.needs.sort() };
      });
    },
    clientWeek: function (db, a, s) {
      // Every visit for one client in one Mon-Sun week, with its day's status, so the cleaner can review / fix it.
      var w = requireCleaner(s);
      if (!D.isDate(a.start)) fail('Pick a valid week.');
      var c = find(db.clients, function (x) { return x.id === a.client_id; });
      if (!c) fail('Client not found.');
      var out = [], total = 0;
      for (var i = 0; i < 7; i++) {
        var date = D.addDays(a.start, i), st = statusFor(db, w, date);
        dayEntries(db, w, date).forEach(function (e) {
          if (e.client_id !== c.id) return;
          total += e.hours;
          var row = {}; for (var k in e) row[k] = e[k];
          row.status = st || 'logged'; row.editable = st !== 'confirmed';
          out.push(row);
        });
      }
      return { client_id: c.id, client_name: c.name, start: a.start, end: D.addDays(a.start, 6), num: D.weekNumber(a.start),
               total: Math.round(total * 100) / 100, entries: out };
    },
    activity: function (db, a, s) {
      requireOwner(s);
      var t = D.today(), first = D.weekStart(t), weeks = [];
      var cleaners = db.workers.filter(function (w) { return w.role === 'cleaner'; });
      for (var k = 0; k < 5; k++) { // this week + the 4 before
        var start = D.addDays(first, -7 * k), days = [];
        for (var i = 0; i < 7; i++) days.push(D.addDays(start, i));
        var rows = cleaners.map(function (w) {
          var total = 0, conf = 0;
          var cells = days.map(function (date) {
            var es = dayEntries(db, w.id, date), h = 0;
            es.forEach(function (e) { h += e.hours; });
            var st = statusFor(db, w.id, date) || (es.length ? 'logged' : 'none');
            total += h; if (st === 'confirmed') conf += h;
            return { date: date, hours: round2(h), entries: es.length, status: date > t ? 'future' : st };
          });
          return { worker_id: w.id, name: w.name, active: w.active, cells: cells, total: round2(total), confirmed: round2(conf) };
        });
        weeks.push({ start: start, end: days[6], num: D.weekNumber(start), rows: rows });
      }
      return weeks;
    },
    workerWeek: function (db, a, s) {
      requireOwner(s);
      var w = cleanerOf(db, a);
      if (!D.isDate(a.start)) fail('Pick a valid week.');
      var days = [], total = 0, conf = 0;
      for (var i = 0; i < 7; i++) {
        var date = D.addDays(a.start, i), es = dayEntries(db, w.id, date);
        if (!es.length) continue;
        var h = 0; es.forEach(function (e) { h += e.hours; });
        var st = statusFor(db, w.id, date) || 'logged';
        total += h; if (st === 'confirmed') conf += h;
        days.push({ date: date, status: st, hours: round2(h), entries: es });
      }
      return { worker_id: w.id, worker_name: w.name, start: a.start, end: D.addDays(a.start, 6), num: D.weekNumber(a.start),
               total: round2(total), confirmed: round2(conf), days: days };
    },
    weekAll: function (db, a, s) {
      requireOwner(s);
      if (!D.isDate(a.start)) fail('Pick a valid week.');
      var days = [], total = 0, conf = 0;
      for (var i = 0; i < 7; i++) {
        var date = D.addDays(a.start, i), visits = [], dayTot = 0;
        db.workers.filter(function (w) { return w.role === 'cleaner'; }).forEach(function (w) {
          var st = statusFor(db, w.id, date) || 'logged';
          dayEntries(db, w.id, date).forEach(function (e) {
            var row = {}; for (var k in e) row[k] = e[k];
            row.worker_name = w.name; row.status = st; visits.push(row);
            dayTot += e.hours; total += e.hours; if (st === 'confirmed') conf += e.hours;
          });
        });
        if (!visits.length) continue;
        visits.sort(function (x, y) { return x.time_in < y.time_in ? -1 : x.time_in > y.time_in ? 1 : 0; });
        days.push({ date: date, hours: round2(dayTot), visits: visits });
      }
      return { start: a.start, end: D.addDays(a.start, 6), num: D.weekNumber(a.start), total: round2(total), confirmed: round2(conf), days: days };
    },
    settings: function (db, a, s) {
      requireOwner(s);
      var t = D.today();
      return {
        today: t,
        workers: db.workers.filter(function (w) { return w.role === 'cleaner'; }).map(function (w) {
          var rows = ratesFor(db, w.id), cur = rows.filter(function (x) { return x.effective_from <= t; })[0];
          return { id: w.id, name: w.name, phone: w.phone, email: w.email, pin: w.pin, active: w.active,
                   current: cur ? cur.rate : null, since: cur ? cur.effective_from : null, rows: rows };
        }),
        clients: db.clients.map(function (c) {
          return { id: c.id, name: c.name, phone: c.phone, address: c.address, active: c.active,
            apartments: db.apartments.filter(function (x) { return x.client_id === c.id; }),
            rates: db.jobTypes.map(function (j) { return { service: j.name, rate: clientRate(db, c.id, j.name) }; }) };
        }),
        account: (function () { var o = ownerOf(db); return { name: o.name, email: o.email }; })(),
        services: db.jobTypes.map(function (j) { return { name: j.name, active: j.active }; })
      };
    },
    setRate: function (db, a, s) {
      requireOwner(s);
      var w = cleanerOf(db, a), rate = rateValue(a.rate);
      rateDateOk(db, w.id, a.effective_from, null);
      db.workerRates.push({ worker_id: w.id, rate: rate, effective_from: a.effective_from });
      return {};
    },
    correctRate: function (db, a, s) { // fixes a genuinely wrong past row; only from View records
      requireOwner(s);
      var w = cleanerOf(db, a), row = find(db.workerRates, function (r) { return r.worker_id === w.id && r.effective_from === a.from; });
      if (!row) fail('Rate record not found.');
      var rate = rateValue(a.rate);
      rateDateOk(db, w.id, a.effective_from, a.from);
      row.rate = rate; row.effective_from = a.effective_from;
      return {};
    },
    addService: function (db, a, s) {
      requireOwner(s);
      var name = String(a.name || '').trim();
      if (!name) fail('Type a service name.');
      if (name.length > 40) fail('Keep the name under 40 characters.');
      if (db.jobTypes.some(function (j) { return j.name.toLowerCase() === name.toLowerCase(); })) fail('That service already exists.');
      db.jobTypes.push({ name: name, active: true });
      return {};
    },
    setServiceActive: function (db, a, s) { // retire / restore only: services are never deleted or renamed
      requireOwner(s);
      var j = find(db.jobTypes, function (x) { return x.name === a.name; });
      if (!j) fail('Service not found.');
      j.active = !!a.active;
      return {};
    },
    addWorker: function (db, a, s) {
      requireOwner(s);
      var name = String(a.name || '').trim(), email = String(a.email || '').trim();
      if (!name) fail('Type the worker\'s name.');
      if (!validEmail(email)) fail('That email doesn\'t look right.');
      var pin = newPin(db, a.pin, null), rate = rateValue(a.rate);
      var id = nextId(db, 'workers', 'w');
      db.workers.push({ id: id, name: name, role: 'cleaner', phone: String(a.phone || '').trim(), email: email, pin: pin, active: true });
      db.workerRates.push({ worker_id: id, rate: rate, effective_from: D.today() });
      return {};
    },
    updateWorker: function (db, a, s) {
      requireOwner(s);
      var w = cleanerOf(db, a), name = String(a.name || '').trim(), email = String(a.email || '').trim();
      if (!name) fail('Type the worker\'s name.');
      if (!validEmail(email)) fail('That email doesn\'t look right.');
      var pin = a.pin === undefined || a.pin === w.pin ? w.pin : newPin(db, a.pin, w.id);
      w.name = name; w.phone = String(a.phone || '').trim(); w.email = email; w.pin = pin;
      return {};
    },
    setWorkerActive: function (db, a, s) {
      requireOwner(s);
      cleanerOf(db, a).active = !!a.active;
      return {};
    },
    addClient: function (db, a, s) {
      requireOwner(s);
      var name = String(a.name || '').trim();
      if (!name) fail('Type the client\'s name.');
      db.clients.push({ id: nextId(db, 'clients', 'c'), name: name, phone: String(a.phone || '').trim(), address: String(a.address || '').trim(), active: true });
      return {};
    },
    updateClient: function (db, a, s) {
      requireOwner(s);
      var c = find(db.clients, function (x) { return x.id === a.client_id; });
      if (!c) fail('Client not found.');
      var name = String(a.name || '').trim();
      if (!name) fail('Type the client\'s name.');
      c.name = name; c.phone = String(a.phone || '').trim(); c.address = String(a.address || '').trim();
      return {};
    },
    setClientActive: function (db, a, s) {
      requireOwner(s);
      var c = find(db.clients, function (x) { return x.id === a.client_id; });
      if (!c) fail('Client not found.');
      c.active = !!a.active;
      return {};
    },
    addApartment: function (db, a, s) {
      requireOwner(s);
      var c = find(db.clients, function (x) { return x.id === a.client_id; });
      if (!c) fail('Client not found.');
      var name = String(a.name || '').trim();
      if (!name) fail('Type the unit name.');
      db.apartments.push({ id: nextId(db, 'apartments', 'a'), client_id: c.id, name: name, active: true });
      return {};
    },
    setApartmentActive: function (db, a, s) {
      requireOwner(s);
      var x = find(db.apartments, function (u) { return u.id === a.apartment_id; });
      if (!x) fail('Unit not found.');
      x.active = !!a.active;
      return {};
    },
    setClientRate: function (db, a, s) { // placeholder until Jobber prices come in
      requireOwner(s);
      var c = find(db.clients, function (x) { return x.id === a.client_id; });
      if (!c) fail('Client not found.');
      if (!find(db.jobTypes, function (j) { return j.name === a.service; })) fail('Service not found.');
      var rate = rateValue(a.rate);
      db.clientRates = db.clientRates || [];
      var row = find(db.clientRates, function (x) { return x.client_id === c.id && x.service === a.service; });
      if (row) row.rate = rate; else db.clientRates.push({ client_id: c.id, service: a.service, rate: rate });
      return {};
    },
    updateOwnerEmail: function (db, a, s) {
      requireOwner(s);
      var o = ownerOf(db), email = String(a.email || '').trim();
      if (!email || !validEmail(email)) fail('Type a valid email.');
      o.email = email;
      return {};
    },
    setOwnerPin: function (db, a, s) {
      requireOwner(s);
      var o = ownerOf(db);
      if (String(a.pin) !== String(a.confirm)) fail('The two PINs don\'t match.');
      o.pin = newPin(db, a.pin, o.id);
      return {};
    },
    ownerDay: function (db, a, s) {
      requireOwner(s);
      var w = cleanerOf(db, a);
      if (!D.isDate(a.date)) fail('Pick a valid date.');
      var es = dayEntries(db, w.id, a.date), st = statusFor(db, w.id, a.date);
      return {
        worker_id: w.id, worker_name: w.name, date: a.date, entries: es,
        status: st || (es.length ? 'logged' : 'none'),
        reopen_note: noteFor(db.reopenNotes, w.id, a.date),
        sandra_confirm_note: noteFor(db.sandraConfirmNotes, w.id, a.date)
      };
    },
    reopenDay: function (db, a, s) {
      requireOwner(s);
      var w = cleanerOf(db, a);
      if (!D.isDate(a.date)) fail('Pick a valid date.');
      if (statusFor(db, w.id, a.date) !== 'confirmed') fail('Only a confirmed day can be reopened.');
      var note = ownerNote(a);
      setStatus(db, w.id, a.date, 'reopened');
      setNote(db.reopenNotes, w.id, a.date, note);
      dropNote(db.sandraConfirmNotes, w.id, a.date);
      emailWorker(db, w, 'Please check your hours for ' + a.date, note);
      return {};
    },
    forceConfirmDay: function (db, a, s) {
      requireOwner(s);
      var w = cleanerOf(db, a);
      if (!D.isDate(a.date)) fail('Pick a valid date.');
      if (statusFor(db, w.id, a.date) === 'confirmed') fail('This day is already confirmed.');
      if (!dayEntries(db, w.id, a.date).length) fail('Nothing is logged for that day to confirm.');
      var note = String(a.note || '').trim().slice(0, 500); // optional; an empty note still gives the cleaner a notice
      setStatus(db, w.id, a.date, 'confirmed');
      setNote(db.sandraConfirmNotes, w.id, a.date, note);
      dropNote(db.reopenNotes, w.id, a.date);
      emailWorker(db, w, 'Sandra confirmed your hours for ' + a.date, note || 'Sandra confirmed this day for you. Tell her if anything is wrong.');
      return {};
    },
    day: function (db, a, s) {
      var w = requireCleaner(s);
      if (!D.isDate(a.date)) fail('Pick a valid date.');
      var es = dayEntries(db, w, a.date), st = statusFor(db, w, a.date);
      return {
        date: a.date, entries: es, status: st || (es.length ? 'logged' : 'none'),
        reopen_note: st === 'reopened' ? noteFor(db.reopenNotes, w, a.date) : null,
        sandra_confirm_note: st === 'confirmed' ? noteFor(db.sandraConfirmNotes, w, a.date) : null,
        editable: st !== 'confirmed'
      };
    },
    saveEntry: function (db, a, s) {
      var w = requireCleaner(s);
      checkDateAllowed(a.date);
      requireEditable(db, w, a.date);
      return writeEntry(db, w, a, false);
    },
    deleteEntry: function (db, a, s) {
      var w = requireCleaner(s);
      var e = find(db.entries, function (x) { return x.id === a.id && x.worker_id === w; });
      if (!e) fail('Entry not found.');
      requireEditable(db, w, e.date);
      db.entries = filter(db.entries, function (x) { return x !== e; });
      return {};
    },
    ownerSaveEntry: function (db, a, s) {
      requireOwner(s);
      var w = cleanerOf(db, a);
      if (!D.isDate(a.date)) fail('Pick a valid date.');
      if (a.date > D.today()) fail("You can't log hours for a future day.");
      var why = String(a.reason || '').trim().slice(0, 300);
      var entry = writeEntry(db, w.id, a, true);
      entry.edited_by_sandra = true;
      entry.edit_reason = why;
      entry.edit_history.push({ by: 'sandra', at: Date.now(), reason: why });
      sandraTouched(db, w, entry.date, why, false);
      return entry;
    },
    ownerDeleteEntry: function (db, a, s) {
      requireOwner(s);
      var w = cleanerOf(db, a);
      var e = find(db.entries, function (x) { return x.id === a.id && x.worker_id === w.id; });
      if (!e) fail('Entry not found.');
      db.entries = filter(db.entries, function (x) { return x !== e; });
      sandraTouched(db, w, e.date, '', true);
      return {};
    },
    confirmDay: function (db, a, s) {
      var w = requireCleaner(s);
      if (!D.isDate(a.date)) fail('Pick a valid date.');
      if (a.date > D.today()) fail("You can't confirm a future day.");
      if (statusFor(db, w, a.date) === 'confirmed') fail('This day is already confirmed.');
      if (!dayEntries(db, w, a.date).length) fail('Add at least one entry before confirming.');
      setStatus(db, w, a.date, 'confirmed');
      // Reopen and Sandra-confirm notes are mutually exclusive and self-clearing.
      db.reopenNotes = filter(db.reopenNotes, function (n) { return !(n.worker_id === w && n.date === a.date); });
      db.sandraConfirmNotes = filter(db.sandraConfirmNotes, function (n) { return !(n.worker_id === w && n.date === a.date); });
      return {};
    }
  };

  // Entry point. Returns {ok, data} or {ok:false, error}; never throws.
  function call(action, args, token) {
    try {
      if (!handlers.hasOwnProperty(action)) fail('Unknown action.');
      return store.transaction(function (db) {
        var session = token ? find(db.sessions, function (x) { return x.token === token; }) : null;
        var data = handlers[action](db, args || {}, session, token);
        if (data && data.__fail) return { ok: false, error: data.__fail };
        return { ok: true, data: data };
      });
    } catch (err) { return { ok: false, error: err.message }; }
  }
  return { call: call };
};
