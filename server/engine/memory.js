// Memoria persistente sobre SQLite (módulo nativo node:sqlite, sin dependencias).
//
// Una sola base de datos para todo el hub, separada por "ámbitos" (scope):
//   - "meridiano"        → estado del mundo de un escenario
//   - "meridiano/main"   → memoria de un agente concreto en ese escenario
//
// Cada ámbito tiene notas, registro de acciones y un almacén clave-valor (JSON).
// La tabla runs guarda el historial de partidas de los escenarios con final.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS kv (
    scope  TEXT NOT NULL,
    key    TEXT NOT NULL,
    value  TEXT NOT NULL,
    PRIMARY KEY (scope, key)
  );

  CREATE TABLE IF NOT EXISTS agent_notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scope       TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    tick        INTEGER NOT NULL,
    text        TEXT    NOT NULL,
    tags        TEXT    NOT NULL DEFAULT ''   -- ids mencionados, separados por comas
  );
  CREATE INDEX IF NOT EXISTS idx_notes_scope ON agent_notes (scope, id);

  CREATE TABLE IF NOT EXISTS agent_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scope       TEXT    NOT NULL,
    created_at  TEXT    NOT NULL,
    tick        INTEGER NOT NULL,
    type        TEXT    NOT NULL,
    args        TEXT    NOT NULL,
    ok          INTEGER NOT NULL,
    summary     TEXT    NOT NULL,
    result      TEXT    NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_events_scope ON agent_events (scope, id);

  CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario    TEXT    NOT NULL,
    started_at  TEXT    NOT NULL,
    ended_at    TEXT,
    outcome     TEXT,
    summary     TEXT,
    ticks       INTEGER,
    models      TEXT    NOT NULL DEFAULT '',
    helped      INTEGER NOT NULL DEFAULT 0
  );
`;

const now = () => new Date().toISOString();

export class MemoryStore {
  constructor(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(SCHEMA);
    // Bases de datos anteriores: la columna «helped» (partida con ayuda humana) se añade si falta
    const runColumns = this.db.prepare('PRAGMA table_info(runs)').all();
    if (!runColumns.some((c) => c.name === 'helped')) this.db.exec('ALTER TABLE runs ADD COLUMN helped INTEGER NOT NULL DEFAULT 0');

    const q = (sql) => this.db.prepare(sql);
    this.sql = {
      kvGet: q('SELECT value FROM kv WHERE scope = ? AND key = ?'),
      kvSet: q('INSERT INTO kv (scope, key, value) VALUES (?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value'),

      findNote: q('SELECT id FROM agent_notes WHERE scope = ? AND text = ?'),
      addNote: q('INSERT INTO agent_notes (scope, created_at, tick, text, tags) VALUES (?, ?, ?, ?, ?)'),
      recentNotes: q('SELECT id, created_at, tick, text, tags FROM agent_notes WHERE scope = ? ORDER BY id DESC LIMIT ?'),
      notesAbout: q("SELECT id, created_at, tick, text, tags FROM agent_notes WHERE scope = ? AND ',' || tags || ',' LIKE ? ORDER BY id DESC LIMIT ?"),
      countNotes: q('SELECT COUNT(*) AS n FROM agent_notes WHERE scope = ?'),

      addEvent: q('INSERT INTO agent_events (scope, created_at, tick, type, args, ok, summary, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
      recentEvents: q('SELECT tick, type, args, ok, summary, result FROM agent_events WHERE scope = ? ORDER BY id DESC LIMIT ?'),

      startRun: q('INSERT INTO runs (scenario, started_at, models) VALUES (?, ?, ?)'),
      endRun: q('UPDATE runs SET ended_at = ?, outcome = ?, summary = ?, ticks = ? WHERE id = ?'),
      markHelped: q('UPDATE runs SET helped = 1 WHERE id = ?'),
      recentRuns: q('SELECT id, scenario, started_at, ended_at, outcome, summary, ticks, models, helped FROM runs WHERE scenario = ? ORDER BY id DESC LIMIT ?'),
    };

    this.#migrateV1();
  }

  /** Devuelve la memoria de un ámbito. */
  scope(name, knownIds = []) {
    return new ScopedMemory(this, name, knownIds);
  }

  /** Borra todo lo guardado en los ámbitos que empiezan por un prefijo (p. ej. "meridiano"). */
  clearPrefix(prefix) {
    for (const table of ['kv', 'agent_notes', 'agent_events']) {
      this.db.prepare(`DELETE FROM ${table} WHERE scope = ? OR scope LIKE ?`).run(prefix, `${prefix}/%`);
    }
  }

  // --- Historial de partidas ------------------------------------------------

  startRun(scenario, models) {
    return Number(this.sql.startRun.run(scenario, now(), models.join(', ')).lastInsertRowid);
  }

  endRun(id, { outcome, summary, ticks }) {
    this.sql.endRun.run(now(), outcome, summary, ticks, id);
  }

  /** Marca una partida como «con ayuda humana» (un visitante habló con la IA). */
  markHelped(id) {
    this.sql.markHelped.run(id);
  }

  recentRuns(scenario, limit = 10) {
    return this.sql.recentRuns.all(scenario, limit).map((r) => ({ ...r, helped: Boolean(r.helped) }));
  }

  close() {
    this.db.close();
  }

  /**
   * Migra la memoria de la primera versión (una sola sala, tablas notes/events/inspected/
   * connections/meta) al formato por ámbitos. Solo se ejecuta una vez.
   */
  #migrateV1() {
    const hasOld = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inspected'").get();
    if (!hasOld || this.sql.kvGet.get('_sistema', 'migrado_v1')) return;

    const W = 'meridiano';
    const A = 'meridiano/main';
    this.db.exec('BEGIN');
    try {
      this.db.exec(`
        INSERT INTO agent_notes (scope, created_at, tick, text, tags)
          SELECT '${A}', created_at, tick, text, object_ids FROM notes ORDER BY id;
        INSERT INTO agent_events (scope, created_at, tick, type, args, ok, summary, result)
          SELECT '${A}', created_at, tick, type, args, ok, summary, result FROM events ORDER BY id;
      `);
      const inspected = this.db.prepare('SELECT object_id FROM inspected ORDER BY first_tick').all().map((r) => r.object_id);
      const connections = this.db.prepare('SELECT a, b, reason, tick FROM connections ORDER BY id').all().map((r) => ({ ...r }));
      const meta = Object.fromEntries(this.db.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, JSON.parse(r.value)]));
      const pos = meta.agentPos ?? null;

      this.sql.kvSet.run(W, 'state', JSON.stringify({ inspected, connections, agents: pos ? { main: pos } : {} }));
      if (meta.tick) this.sql.kvSet.run(A, 'tick', JSON.stringify(meta.tick));
      if (meta.lastThought) this.sql.kvSet.run(A, 'lastThought', JSON.stringify(meta.lastThought));
      this.sql.kvSet.run('_sistema', 'migrado_v1', JSON.stringify(now()));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

/** Memoria de un ámbito concreto (un agente o el estado de un mundo). */
export class ScopedMemory {
  constructor(store, scope, knownIds) {
    this.store = store;
    this.scope = scope;
    this.knownIds = knownIds;
  }

  get sql() {
    return this.store.sql;
  }

  // --- Clave-valor -----------------------------------------------------------

  get(key, fallback = null) {
    const row = this.sql.kvGet.get(this.scope, key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return fallback;
    }
  }

  set(key, value) {
    this.sql.kvSet.run(this.scope, key, JSON.stringify(value));
  }

  /** Incrementa y devuelve el contador de ticks del ámbito. */
  nextTick() {
    const tick = this.get('tick', 0) + 1;
    this.set('tick', tick);
    return tick;
  }

  get tick() {
    return this.get('tick', 0);
  }

  // --- Notas -------------------------------------------------------------------

  /** Guarda una nota. Devuelve false si ya existía exactamente la misma. */
  addNote(text, tick) {
    if (this.sql.findNote.get(this.scope, text)) return false;
    // Se ignoran tildes, mayúsculas y guiones bajos: «cajón» → cajon, «caja fuerte» → caja_fuerte
    const plain = normalize(text);
    const tags = this.knownIds.filter((id) => plain.includes(normalize(id)));
    this.sql.addNote.run(this.scope, now(), tick, text, tags.join(','));
    return true;
  }

  recentNotes(limit) {
    return this.sql.recentNotes.all(this.scope, limit).reverse().map(toNote);
  }

  /** Las N notas más recientes más algunas antiguas que mencionen los ids en foco. */
  relevantNotes(limit, focusIds = []) {
    const byId = new Map();
    for (const n of this.sql.recentNotes.all(this.scope, limit)) byId.set(n.id, n);
    for (const id of focusIds) {
      for (const n of this.sql.notesAbout.all(this.scope, `%,${id},%`, 3)) byId.set(n.id, n);
    }
    return [...byId.values()].sort((a, b) => a.id - b.id).map(toNote);
  }

  get noteCount() {
    return this.sql.countNotes.get(this.scope).n;
  }

  // --- Registro de acciones ------------------------------------------------------

  logEvent({ tick, type, args, ok, summary, result = '' }) {
    this.sql.addEvent.run(this.scope, now(), tick, type, JSON.stringify(args ?? {}), ok ? 1 : 0, summary, result);
  }

  /** Últimos eventos en orden cronológico. */
  recentEvents(limit) {
    return this.sql.recentEvents
      .all(this.scope, limit)
      .reverse()
      .map((e) => ({ ...e, ok: e.ok === 1, args: safeParse(e.args) }));
  }
}

function toNote(row) {
  return { id: row.id, at: row.created_at, tick: row.tick, text: row.text, tags: row.tags ? row.tags.split(',') : [] };
}

function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/_/g, ' ').toLowerCase();
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
