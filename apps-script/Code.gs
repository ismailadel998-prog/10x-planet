/**
 * Escape the 10X Planet! — results storage for the solo game.
 *
 * SETUP (one time):
 * 1. Create a new Google Sheet (any name, e.g. "10X Planet Results").
 * 2. Extensions → Apps Script. Delete what's there and paste this whole file.
 * 3. Change TEACHER_PIN below if you like, then click Save.
 * 4. Deploy → New deployment → type "Web app".
 *      Execute as: Me      Who has access: Anyone
 *    Click Deploy, allow the permissions, and copy the Web app URL.
 * 5. Send that URL to Claude so it can be connected to the game.
 */

const TEACHER_PIN = '4110'; // PIN for the teacher dashboard — change it if you like
const SHEET_NAME = 'Results';
const HEADERS = [
  'Started', 'Class', 'Student', 'Status', 'Score',
  'Missions (of 8)', 'Boss (of 5)', 'Total correct (of 13)', 'Hints used',
  'Finished', 'Time (min)', 'Details',
];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#1A1E4E').setFontColor('#ffffff');
    sh.setColumnWidth(3, 180);
    sh.setColumnWidth(12, 300);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function findRow_(sh, cls, name) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const vals = sh.getRange(2, 2, last - 1, 2).getValues(); // Class, Student
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === cls && String(vals[i][1]) === name) return i + 2;
  }
  return -1;
}

function clean_(s, max) {
  return String(s || '').replace(/[\r\n\t]/g, ' ').slice(0, max || 60);
}

/** Student actions: start / finish (sent as JSON in a POST body) */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const body = JSON.parse(e.postData.contents);
    const cls = clean_(body.cls, 10);
    const name = clean_(body.name, 60);
    if (!cls || !name) return json_({ ok: false, error: 'missing' });
    const sh = sheet_();
    let row = findRow_(sh, cls, name);

    if (body.action === 'start') {
      if (row > 0) return json_({ ok: false, reason: 'already', status: sh.getRange(row, 4).getValue() });
      sh.appendRow([new Date(), cls, name, 'Playing', '', '', '', '', '', '', '', '']);
      return json_({ ok: true });
    }

    if (body.action === 'finish') {
      const r = body.result || {};
      if (row < 0) {
        sh.appendRow([new Date(r.startedAt || Date.now()), cls, name, 'Playing', '', '', '', '', '', '', '', '']);
        row = sh.getLastRow();
      } else if (sh.getRange(row, 4).getValue() === 'Finished') {
        return json_({ ok: true, duplicate: true });
      }
      const started = new Date(sh.getRange(row, 1).getValue());
      const minutes = Math.round(((Date.now() - started.getTime()) / 60000) * 10) / 10;
      sh.getRange(row, 4, 1, 9).setValues([[
        'Finished',
        Number(r.score) || 0,
        Number(r.missions) || 0,
        Number(r.boss) || 0,
        (Number(r.missions) || 0) + (Number(r.boss) || 0),
        Number(r.hints) || 0,
        new Date(),
        minutes,
        JSON.stringify(r.details || []).slice(0, 45000),
      ]]);
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** check (students) · results / reset (teacher, needs PIN) */
function doGet(e) {
  const p = e.parameter || {};
  const sh = sheet_();

  if (p.action === 'check') {
    const row = findRow_(sh, clean_(p.cls, 10), clean_(p.name, 60));
    return json_({ ok: true, played: row > 0, status: row > 0 ? sh.getRange(row, 4).getValue() : '' });
  }

  if (p.pin !== TEACHER_PIN) return json_({ ok: false, error: 'pin' });

  if (p.action === 'results') {
    const last = sh.getLastRow();
    const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    const out = rows.map(function (v) {
      let details = [];
      try { details = JSON.parse(v[11] || '[]'); } catch (x) {}
      return {
        started: v[0] ? new Date(v[0]).toISOString() : '',
        cls: String(v[1]), name: String(v[2]), status: String(v[3]),
        score: v[4], missions: v[5], boss: v[6], total: v[7], hints: v[8],
        finished: v[9] ? new Date(v[9]).toISOString() : '', minutes: v[10], details: details,
      };
    });
    return json_({ ok: true, rows: out, sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() });
  }

  if (p.action === 'reset') {
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const row = findRow_(sh, clean_(p.cls, 10), clean_(p.name, 60));
      if (row > 0) sh.deleteRow(row);
      return json_({ ok: true });
    } finally {
      lock.releaseLock();
    }
  }

  return json_({ ok: false, error: 'unknown action' });
}
