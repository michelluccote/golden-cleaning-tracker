// localStorage stand-in for the Google Sheet. transaction() loads, runs fn, and
// saves only on success, so a rejected action never leaves partial writes
// (in Apps Script this is where LockService wraps the sheet writes).
GCT.createLocalStore = function (key) {
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(key); } catch (e) {}
    if (raw) return JSON.parse(raw);
    var db = GCT.seed();
    localStorage.setItem(key, JSON.stringify(db));
    return db;
  }
  return {
    transaction: function (fn) {
      var db = load();
      var result = fn(db);
      localStorage.setItem(key, JSON.stringify(db));
      return result;
    },
    nextId: function (db, table, prefix) {
      var max = 0;
      db[table].forEach(function (r) { max = Math.max(max, parseInt(String(r.id).replace(/\D/g, ''), 10) || 0); });
      return prefix + (max + 1);
    },
    reset: function () { localStorage.setItem(key, JSON.stringify(GCT.seed())); }
  };
};
