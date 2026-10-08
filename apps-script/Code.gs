/**
 * tabsmith song sync, bound to the Google Sheet that stores the songs.
 *
 * POST takes { token, records: [{ id, at, title, song, active }], setlists:
 * [{ id, at, name, songs, active }] }, where song is the document a tabsmith
 * file holds, packed by the app, songs is a setlist's song ids in order, and
 * active is false for a deleted one. Songs and setlists each live in their own tab. The sheet keeps
 * the newest of each id and answers { ok: true, records, setlists } with all of
 * them, so one round trip both pushes and pulls.
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
const HEADER = ['id', 'at', 'title', 'song', 'active']
const SETLIST_HEADER = ['id', 'at', 'name', 'songs', 'active']

function tab(name, header) {
  const book = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = book.getSheetByName(name) || book.insertSheet(name)
  // Rewritten every time, so a sheet made before a column existed gains it.
  sheet.getRange(1, 1, 1, header.length).setValues([header])
  return sheet
}

/** Newest wins per id; `keep` decides what a winning record carries over. */
function newestOf(stored, incoming, keep) {
  const newest = new Map(stored.map((record) => [record.id, record]))
  incoming.forEach((record) => {
    const before = newest.get(record.id)
    if (before && record.at <= before.at) return
    newest.set(record.id, keep(record, before))
  })
  return Array.from(newest.values())
}

/**
 * A song only gets a row once it has a title: until then it is one just
 * started, and the sheet would fill with untitled rows nobody can tell apart.
 * One that already has a row keeps syncing if its title is cleared, deleted or
 * not, since the row is what other devices go by.
 */
function mergeSongs(stored, incoming) {
  const known = new Set(stored.map((record) => record.id))
  const worthARow = incoming.filter(
    (record) => record.title !== '' || known.has(record.id),
  )
  return newestOf(stored, worthARow, (record, before) => ({
    id: record.id,
    at: record.at,
    title: record.title || (before ? before.title : ''),
    song: record.song === null && before ? before.song : record.song,
    active: record.active,
  }))
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
    const sheet = tab('songs', HEADER)
    const all = mergeSongs(readRecords(sheet), body.records)
    writeRecords(sheet, all)

    // An app from before setlists sends none, which changes nothing here.
    const lists = tab('setlists', SETLIST_HEADER)
    const setlists = newestOf(readSetlists(lists), body.setlists, (setlist) => setlist)
    writeSetlists(lists, setlists)

    return json({
      ok: true,
      records: all.map((record) => ({
        id: record.id,
        at: record.at,
        song: record.song,
        active: record.active,
      })),
      setlists,
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

function readSetlists(sheet) {
  return sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .flatMap((row) => {
      let songs
      try {
        songs = JSON.parse(String(row[3]))
      } catch (error) {
        return []
      }
      if (!Array.isArray(songs)) return []
      const setlist = {
        id: String(row[0]),
        at: Number(row[1]),
        name: String(row[2]),
        songs: songs.map(String),
        active: row[4] === true,
      }
      return setlist.id !== '' && Number.isFinite(setlist.at) ? [setlist] : []
    })
}

function writeSetlists(sheet, setlists) {
  if (setlists.length > 0) {
    sheet
      .getRange(2, 1, setlists.length, SETLIST_HEADER.length)
      .setValues(
        setlists.map((setlist) => [
          setlist.id,
          setlist.at,
          setlist.name,
          JSON.stringify(setlist.songs),
          setlist.active,
        ]),
      )
  }
  const stale = sheet.getLastRow() - setlists.length - 1
  if (stale > 0) {
    sheet.getRange(setlists.length + 2, 1, stale, SETLIST_HEADER.length).clearContent()
  }
}

// A cell starting with = + - or @ is read as a formula, and a name is free text.
function plain(text) {
  return String(text || '').replace(/^[\s=+\-@]+/, '')
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
      title: plain(record.title),
      song: record.song,
      active: record.active === undefined ? record.song !== null : record.active,
    }))
  const setlists = (Array.isArray(body.setlists) ? body.setlists : [])
    .filter(
      (setlist) =>
        setlist &&
        typeof setlist.id === 'string' &&
        setlist.id !== '' &&
        Number.isFinite(setlist.at) &&
        typeof setlist.name === 'string' &&
        Array.isArray(setlist.songs) &&
        setlist.songs.every((song) => typeof song === 'string') &&
        typeof setlist.active === 'boolean',
    )
    .map((setlist) => ({
      id: setlist.id,
      at: setlist.at,
      name: plain(setlist.name),
      songs: setlist.songs,
      active: setlist.active,
    }))
  return { token: String(body.token || ''), records, setlists }
}
