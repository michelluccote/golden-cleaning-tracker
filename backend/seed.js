// Sample data = the prototype's own demo data (see seed-data.json), expressed relative to
// "today" so the current week always looks alive. Rebuilt from scratch on reset.
GCT.seed = function () {
  var D = GCT.dates, mon = D.weekStart(D.today()), t0 = D.today();
  var d = function (weeksBack, dow) { return D.addDays(mon, -7 * weeksBack + dow); };
  var db = {
    workers: [{"id": "w0", "name": "Sandra", "role": "owner", "phone": "", "email": "sandra@goldencleaning.com", "pin": "99999", "active": true}, {"id": "w1", "name": "Maria Silva", "role": "cleaner", "phone": "(415) 555-0142", "email": "maria.silva@example.com", "pin": "11111", "active": true}, {"id": "w2", "name": "Ana Costa", "role": "cleaner", "phone": "(415) 555-0187", "email": "ana.costa@example.com", "pin": "22222", "active": true}, {"id": "w3", "name": "Julia Santos", "role": "cleaner", "phone": "(415) 555-0119", "email": "", "pin": "33333", "active": true}, {"id": "w4", "name": "Carla Reyes", "role": "cleaner", "phone": "(415) 555-0164", "email": "carla.reyes@example.com", "pin": "44444", "active": false}],
    workerRates: [], // append-only: {worker_id, rate, effective_from}
    clients: [{"id": "c1", "name": "Locale", "phone": "(415) 555-2001", "address": "88 Bryant St, San Francisco", "active": true}, {"id": "c2", "name": "Springline VIP", "phone": "(415) 555-2044", "address": "510 Folsom St, San Francisco", "active": true}, {"id": "c3", "name": "Extras", "phone": "(415) 555-2099", "address": "Various addresses", "active": true}, {"id": "c4", "name": "Harbor Row", "phone": "(415) 555-2255", "address": "12 Harbor Way, San Francisco", "active": false}],
    apartments: [{"id": "a1", "client_id": "c1", "name": "Unit 204", "active": true}, {"id": "a2", "client_id": "c1", "name": "Unit 310", "active": true}, {"id": "a3", "client_id": "c1", "name": "Unit 512", "active": true}, {"id": "a4", "client_id": "c2", "name": "Penthouse A", "active": true}, {"id": "a5", "client_id": "c2", "name": "Penthouse B", "active": true}, {"id": "a6", "client_id": "c3", "name": "One-Time Job", "active": true}, {"id": "a7", "client_id": "c4", "name": "Suite 2", "active": false}],
    jobTypes: [{"name": "Standard Clean", "active": true}, {"name": "Deep Clean", "active": true}, {"name": "Move-Out", "active": true}, {"name": "Touch-Up", "active": true}],
    entries: [], dayStatus: [], reopenNotes: [], sandraConfirmNotes: [], sessions: [], outbox: []
  };
  var rates = [{"worker_id": "w1", "rate": 24, "from": "2000-01-01"}, {"worker_id": "w1", "rate": 26, "from": "<previous-week Thursday>"}, {"worker_id": "w2", "rate": 20, "from": "2000-01-01"}, {"worker_id": "w3", "rate": 26, "from": "2000-01-01"}, {"worker_id": "w4", "rate": 19, "from": "2000-01-01"}];
  rates.forEach(function (r) {
    // The prototype's "previous-week Thursday" raise is placed on last week's Thursday.
    db.workerRates.push({ worker_id: r.worker_id, rate: r.rate, effective_from: r.from.charAt(0) === '<' ? d(1, 3) : r.from });
  });
  function mins(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function add(date, w, client, apt, job, tin, tout, notes) {
    db.entries.push({
      id: 'e' + (db.entries.length + 1), worker_id: w, client_id: client, apartment_id: apt, job_type: job,
      date: date, time_in: tin, time_out: tout, hours: (mins(tout) - mins(tin)) / 60, billed_rate: null, jobber_job_id: null,
      notes: notes || '', edited_by_sandra: false, edit_reason: '', edit_history: []
    });
  }
  // Earlier weeks: the pattern from the prototype's Entries screen; all confirmed.
  // [weekday, worker, client, apartment, service, in, out]
  var history = [
    [0, 'w1', 'c1', 'a1', 'Standard Clean', '08:00', '10:00'], [0, 'w2', 'c2', 'a5', 'Standard Clean', '08:00', '11:00'],
    [1, 'w2', 'c1', 'a2', 'Touch-Up', '11:30', '13:00'], [1, 'w3', 'c3', 'a6', 'Move-Out', '09:00', '12:00'],
    [2, 'w1', 'c1', 'a3', 'Touch-Up', '10:30', '12:00'],
    [3, 'w2', 'c2', 'a5', 'Standard Clean', '08:00', '11:00'], [3, 'w3', 'c1', 'a1', 'Standard Clean', '13:00', '15:00'],
    [4, 'w1', 'c2', 'a4', 'Deep Clean', '13:00', '16:00']
  ];
  for (var wk = 4; wk >= 1; wk--) {
    history.forEach(function (p) {
      add(d(wk, p[0]), p[1], p[2], p[3], p[4], p[5], p[6]);
      db.dayStatus.push({ worker_id: p[1], date: d(wk, p[0]), status: 'confirmed' });
    });
  }
  // Current week: exactly the prototype's demo entries, statuses and Sandra notes (key = worker_dayOffset).
  var cur = [[0, "w1", "c1", "a1", "Standard Clean", "08:00", "10:30", ""], [0, "w1", "c1", "a2", "Touch-Up", "11:00", "12:30", ""], [1, "w1", "c2", "a4", "Deep Clean", "09:00", "12:00", "New tenant move-in prep"], [2, "w1", "c1", "a3", "Standard Clean", "08:30", "10:00", ""], [4, "w1", "c3", "a6", "Move-Out", "13:00", "15:00", ""], [0, "w2", "c2", "a5", "Standard Clean", "08:00", "11:00", ""], [1, "w2", "c1", "a1", "Standard Clean", "09:00", "11:30", ""], [2, "w2", "c1", "a2", "Touch-Up", "08:00", "09:30", ""], [3, "w2", "c2", "a4", "Deep Clean", "10:00", "13:00", ""], [4, "w2", "c1", "a3", "Standard Clean", "08:00", "10:00", ""], [1, "w3", "c1", "a1", "Standard Clean", "12:00", "14:00", ""], [2, "w3", "c2", "a5", "Deep Clean", "09:00", "12:30", ""], [3, "w3", "c3", "a6", "Move-Out", "14:00", "16:00", "Client requested extra oven cleaning"], [4, "w3", "c1", "a2", "Standard Clean", "08:00", "10:30", ""], [5, "w3", "c2", "a4", "Touch-Up", "10:00", "12:00", ""]];
  var status = {"w1_0": "confirmed", "w1_1": "confirmed", "w1_4": "confirmed", "w2_0": "confirmed", "w2_1": "reopened", "w2_2": "confirmed", "w2_3": "confirmed", "w3_1": "confirmed", "w3_2": "confirmed", "w3_3": "reopened", "w3_4": "confirmed", "w3_5": "confirmed"};
  var notes = {"w2_1": "Hours looked off for the Springline job - can you double check the time out and resubmit?", "w3_3": "Looks like the Extras job entry is missing - please add it and re-confirm."};
  cur.forEach(function (p) {
    var date = d(0, p[0]); if (date > t0) return;
    add(date, p[1], p[2], p[3], p[4], p[5], p[6], p[7]);
  });
  Object.keys(status).forEach(function (k) {
    var w = k.split('_')[0], date = d(0, +k.split('_')[1]); if (date > t0) return;
    db.dayStatus.push({ worker_id: w, date: date, status: status[k] });
  });
  Object.keys(notes).forEach(function (k) {
    db.reopenNotes.push({ worker_id: k.split('_')[0], date: d(0, +k.split('_')[1]), note: notes[k] });
  });
  // Any current-week day with entries but no recorded status is "logged" (Not confirmed): no row needed.
  // Example states for review (current week):
  // Julia, Thu: reopened by Sandra with a note; she fixes it and confirms again.
  // Ana, Wed: Sandra closed it for her with a note (she did not confirm it herself).
  // Maria, Fri: Sandra changed a visit, so the day is not confirmed until Maria confirms it.
  db.sandraConfirmNotes.push({ worker_id: 'w2', date: d(0, 2), note: 'Closing out payroll, confirming this for you. Flag anything wrong fast.' });
  db.entries.forEach(function (e) {
    if (e.worker_id === 'w1' && e.date === d(0, 4)) {
      e.time_out = '15:30'; e.hours = (mins(e.time_out) - mins(e.time_in)) / 60;
      e.edited_by_sandra = true; e.edit_reason = 'Fixed the end time, it was logged as 4pm.';
      e.edit_history.push({ by: 'sandra', at: Date.now(), reason: e.edit_reason });
    }
  });
  db.dayStatus.forEach(function (s) { if (s.worker_id === 'w1' && s.date === d(0, 4)) s.status = 'logged'; });
  // Client prices by service (manual until Jobber): Locale 34 on all, Springline 32 / 42 for Standard / Deep, Extras 25.
  db.clientRates = [
    { client_id: 'c1', service: 'Standard Clean', rate: 34 }, { client_id: 'c1', service: 'Deep Clean', rate: 34 },
    { client_id: 'c1', service: 'Move-Out', rate: 34 }, { client_id: 'c1', service: 'Touch-Up', rate: 34 },
    { client_id: 'c2', service: 'Standard Clean', rate: 32 }, { client_id: 'c2', service: 'Deep Clean', rate: 42 },
    { client_id: 'c2', service: 'Move-Out', rate: 30 }, { client_id: 'c2', service: 'Touch-Up', rate: 30 },
    { client_id: 'c3', service: 'Standard Clean', rate: 25 }, { client_id: 'c3', service: 'Deep Clean', rate: 25 },
    { client_id: 'c3', service: 'Move-Out', rate: 25 }, { client_id: 'c3', service: 'Touch-Up', rate: 25 }
  ];
  return db;
};
