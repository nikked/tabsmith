/**
 * tabsmith song sync, bound to the Google Sheet that stores the songs.
 *
 * POST takes { token, records: [{ id, at, title, song, active, baseAt? }], setlists:
 * [{ id, at, name, songs, active, position? }], todos: [{ id, at, text, done, indented?, active, position? }],
 * band: [{ id, at, text }] }, where song is the document a tabsmith file holds,
 * packed by the app, songs is a setlist's song ids in order, todos are the
 * band's list, band holds the band's own fields by name (ideas), and active is
 * false for a deleted or cleared one. Each kind lives in its own tab. The sheet
 * checks baseAt before replacing an active song, keeps the newest of each id,
 * and answers { ok: true, records, setlists, todos,
 * band } with all of them, so one round trip both pushes and pulls.
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
const SETLIST_HEADER = ['id', 'at', 'name', 'songs', 'active', 'position']
const TODO_HEADER = ['id', 'at', 'text', 'done', 'active', 'indented', 'position']
const BAND_HEADER = ['id', 'at', 'text']

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
  const known = new Map(stored.map((record) => [record.id, record]))
  const worthARow = incoming.filter((record) => {
    const before = known.get(record.id)
    if (record.title === '' && !before) return false
    // Preserve unseen edits for the client's three-way merge. Deletions
    // retain their timestamp-based behavior, as do legacy clients.
    return !(
      record.active &&
      before &&
      before.active &&
      Number.isFinite(record.baseAt) &&
      record.baseAt !== before.at
    )
  })
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
    // An app from before setlists had an order sends none; the order it had stays.
    const setlists = newestOf(readSetlists(lists), body.setlists, (setlist, before) =>
      setlist.position === undefined && before && before.position !== undefined
        ? { ...setlist, position: before.position }
        : setlist,
    )
    writeSetlists(lists, setlists)

    // An app from before the band's todos sends none, which changes nothing here.
    const todoTab = tab('todos', TODO_HEADER)
    // An app from before todos could be indented sends none; the indent it had
    // stays. Nor, from before they could be put between others, a position;
    // the one it had stays.
    const todos = newestOf(readTodos(todoTab), body.todos, (todo, before) => ({
      ...todo,
      indented: todo.indented ?? (before ? before.indented : false),
      ...(todo.position === undefined && before && before.position !== undefined
        ? { position: before.position }
        : {}),
    }))
    writeTodos(todoTab, todos)

    // The band's own fields, by name; an app from before them sends none.
    const bandTab = tab('band', BAND_HEADER)
    const band = newestOf(readBand(bandTab), body.band, (field) => field)
    writeBand(bandTab, band)

    return json({
      ok: true,
      records: all.map((record) => ({
        id: record.id,
        at: record.at,
        song: record.song,
        active: record.active,
      })),
      setlists,
      todos,
      band,
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

// A rejected write must leave the stored rows intact, so trim only after it succeeds.
function writeRows(sheet, width, rows) {
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, width).setValues(rows)
  const stale = sheet.getLastRow() - rows.length - 1
  if (stale > 0) sheet.getRange(rows.length + 2, 1, stale, width).clearContent()
}

function writeRecords(sheet, records) {
  writeRows(
    sheet,
    HEADER.length,
    records.map((record) => [
      record.id,
      record.at,
      record.title,
      record.song ?? '',
      record.active,
    ]),
  )
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
        // A row from before setlists had an order has an empty cell here.
        ...(row[5] === '' || !Number.isFinite(Number(row[5]))
          ? {}
          : { position: Number(row[5]) }),
      }
      return setlist.id !== '' && Number.isFinite(setlist.at) ? [setlist] : []
    })
}

function writeSetlists(sheet, setlists) {
  writeRows(
    sheet,
    SETLIST_HEADER.length,
    setlists.map((setlist) => [
      setlist.id,
      setlist.at,
      setlist.name,
      JSON.stringify(setlist.songs),
      setlist.active,
      setlist.position ?? '',
    ]),
  )
}

function readTodos(sheet) {
  return sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .map((row) => ({
      id: String(row[0]),
      at: Number(row[1]),
      text: textOf(row[2]),
      done: row[3] === true,
      active: row[4] === true,
      // A row written before todos could be indented has no such cell.
      indented: row[5] === true,
      // Nor one written before they could be put between others.
      ...(row[6] === '' || !Number.isFinite(Number(row[6]))
        ? {}
        : { position: Number(row[6]) }),
    }))
    .filter((todo) => todo.id !== '' && Number.isFinite(todo.at))
}

function writeTodos(sheet, todos) {
  writeRows(
    sheet,
    TODO_HEADER.length,
    todos.map((todo) => [
      todo.id,
      todo.at,
      textCell(todo.text),
      todo.done,
      todo.active,
      todo.indented === true,
      todo.position ?? '',
    ]),
  )
}

function readBand(sheet) {
  return sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .map((row) => ({ id: String(row[0]), at: Number(row[1]), text: textOf(row[2]) }))
    .filter((field) => field.id !== '' && Number.isFinite(field.at))
}

function writeBand(sheet, band) {
  writeRows(
    sheet,
    BAND_HEADER.length,
    band.map((field) => [field.id, field.at, textCell(field.text)]),
  )
}

// A cell starting with = + - or @ is read as a formula, and a name is free text.
function plain(text) {
  return String(text || '').replace(/^[\s=+\-@]+/, '')
}

// Text written as typed goes in as a JSON string instead: it starts with a
// quote, so it is never read as a formula, and a leading dash or indent the
// writer meant survives. A cell written before this holds the text itself.
function textCell(text) {
  return JSON.stringify(String(text))
}

function textOf(cell) {
  const value = String(cell)
  if (!value.startsWith('"')) return value
  try {
    return String(JSON.parse(value))
  } catch (error) {
    return value
  }
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
      ...(Number.isFinite(record.baseAt) ? { baseAt: record.baseAt } : {}),
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
        typeof setlist.active === 'boolean' &&
        (setlist.position === undefined || Number.isFinite(setlist.position)),
    )
    .map((setlist) => ({
      id: setlist.id,
      at: setlist.at,
      name: plain(setlist.name),
      songs: setlist.songs,
      active: setlist.active,
      ...(setlist.position === undefined ? {} : { position: setlist.position }),
    }))
  const todos = (Array.isArray(body.todos) ? body.todos : [])
    .filter(
      (todo) =>
        todo &&
        typeof todo.id === 'string' &&
        todo.id !== '' &&
        Number.isFinite(todo.at) &&
        typeof todo.text === 'string' &&
        typeof todo.done === 'boolean' &&
        typeof todo.active === 'boolean' &&
        (todo.indented === undefined || typeof todo.indented === 'boolean') &&
        (todo.position === undefined || Number.isFinite(todo.position)),
    )
    .map((todo) => ({
      id: todo.id,
      at: todo.at,
      text: todo.text,
      done: todo.done,
      active: todo.active,
      ...(todo.indented === undefined ? {} : { indented: todo.indented }),
      ...(todo.position === undefined ? {} : { position: todo.position }),
    }))
  const band = (Array.isArray(body.band) ? body.band : [])
    .filter(
      (field) =>
        field &&
        typeof field.id === 'string' &&
        field.id !== '' &&
        Number.isFinite(field.at) &&
        typeof field.text === 'string',
    )
    .map((field) => ({ id: field.id, at: field.at, text: field.text }))
  return { token: String(body.token || ''), records, setlists, todos, band }
}
