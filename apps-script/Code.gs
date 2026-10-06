/**
 * tabsmith song sync, bound to the Google Sheet that stores the songs.
 *
 * POST takes { token, records: [{ id, at, title, song, active }] }, where song
 * is the document a tabsmith file holds, packed by the app, and active is false
 * for a deleted song. The sheet keeps the newest record of each id and answers
 * { ok: true, records } with all of them, so one round trip both pushes and pulls.
 *
 * Nothing is ever deleted here. A deleted song stays in its row, marked
 * inactive, and a record that arrives without a song (from an app older than
 * this) never blanks the song a row already holds.
 *
 * The token is the script property TOKEN. Deploy as a web app that executes as
 * you and is open to anyone: the token, not Google sign-in, is what stops a
 * stranger with the URL. The app sends the body as plain text because Apps
 * Script cannot answer the CORS preflight a JSON content type would trigger.
 */
const SHEET_NAME = 'songs'
const HEADER = ['id', 'at', 'title', 'song', 'active']

function songsSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME)
  // Rewritten every time, so a sheet made before a column existed gains it.
  sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER])
  return sheet
}

function json(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

function doPost(e) {
  const body = parseBody(e.postData ? e.postData.contents : '')
  if (!body) return json({ ok: false, error: 'malformed request' })
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN')
  if (!token || body.token !== token) return json({ ok: false, error: 'wrong token' })

  // Two devices syncing at once must not each write back a sheet missing the other's songs.
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    const sheet = songsSheet()
    const newest = new Map(readRecords(sheet).map((record) => [record.id, record]))
    body.records.forEach((record) => {
      const stored = newest.get(record.id)
      if (stored && record.at <= stored.at) return
      newest.set(record.id, {
        id: record.id,
        at: record.at,
        title: record.title || (stored ? stored.title : ''),
        song: record.song === null && stored ? stored.song : record.song,
        active: record.active,
      })
    })
    const all = Array.from(newest.values())
    writeRecords(sheet, all)
    return json({
      ok: true,
      records: all.map((record) => ({
        id: record.id,
        at: record.at,
        song: record.song,
        active: record.active,
      })),
    })
  } finally {
    lock.releaseLock()
  }
}

function readRecords(sheet) {
  return sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .map((row) => {
      const song = row[3] === '' ? null : String(row[3])
      // A row written before the column existed has no flag; there, a row with
      // no song was the deletion.
      const flag = row[4]
      const active = flag === '' || flag === undefined ? song !== null : flag === true
      return {
        id: String(row[0]),
        at: Number(row[1]),
        title: String(row[2]),
        song,
        active,
      }
    })
    .filter((record) => record.id !== '' && Number.isFinite(record.at))
}

function writeRecords(sheet, records) {
  // A rejected write must leave the stored songs intact, so trim only after it succeeds.
  if (records.length > 0) {
    sheet
      .getRange(2, 1, records.length, HEADER.length)
      .setValues(
        records.map((record) => [
          record.id,
          record.at,
          record.title,
          record.song ?? '',
          record.active,
        ]),
      )
  }
  const stale = sheet.getLastRow() - records.length - 1
  if (stale > 0)
    sheet.getRange(records.length + 2, 1, stale, HEADER.length).clearContent()
}

function parseBody(text) {
  let body
  try {
    body = JSON.parse(text)
  } catch (error) {
    return null
  }
  if (!body || typeof body !== 'object' || !Array.isArray(body.records)) return null
  const records = body.records
    .filter(
      (record) =>
        record &&
        typeof record.id === 'string' &&
        record.id !== '' &&
        Number.isFinite(record.at) &&
        (record.song === null || typeof record.song === 'string') &&
        (record.active === undefined || typeof record.active === 'boolean'),
    )
    .map((record) => ({
      id: record.id,
      at: record.at,
      // A cell starting with = + - or @ is read as a formula, and a title is free text.
      title: String(record.title || '').replace(/^[\s=+\-@]+/, ''),
      song: record.song,
      active: record.active === undefined ? record.song !== null : record.active,
    }))
  return { token: String(body.token || ''), records }
}
