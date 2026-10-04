// Date helpers. Dates are 'YYYY-MM-DD' strings throughout (no timezones).
// Plain ES5-style JS so this file can be pasted into Apps Script unchanged.
var GCT = (typeof GCT === 'undefined') ? {} : GCT;
GCT.dates = (function () {
  function parse(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function fmt(dt) { return dt.toISOString().slice(0, 10); }
  function addDays(s, n) { var dt = parse(s); dt.setUTCDate(dt.getUTCDate() + n); return fmt(dt); }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s; }
  function today() { var n = new Date(); return fmt(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))); }
  // Weeks run Monday-Sunday.
  function weekStart(s) { return addDays(s, -((parse(s).getUTCDay() + 6) % 7)); }
  function weekNumber(s) { // ISO week number
    var dt = parse(s);
    dt.setUTCDate(dt.getUTCDate() + 3 - ((dt.getUTCDay() + 6) % 7));
    var jan4 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((dt - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  }
  return { addDays: addDays, isDate: isDate, today: today, weekStart: weekStart, weekNumber: weekNumber };
})();
