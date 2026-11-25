// Base de datos de MediCert (SQLite)
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.MEDICERT_DATA || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'medicert.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'capturista',   -- admin | capturista
    active INTEGER NOT NULL DEFAULT 1,
    last_doctor_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cedula TEXT NOT NULL DEFAULT '',
    area TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS patients (
    curp TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sex TEXT DEFAULT '',
    birth_date TEXT DEFAULT '',
    blood_group TEXT DEFAULT '',
    rh_factor TEXT DEFAULT '',
    allergies TEXT DEFAULT '',
    imss_registered TEXT DEFAULT 'NO',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);

CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folio INTEGER NOT NULL UNIQUE,
    unidad_codigo TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'VIGENTE',     -- VIGENTE | CANCELADO
    fecha TEXT NOT NULL,                         -- YYYY-MM-DD (fecha del certificado)
    day TEXT, month TEXT, year TEXT,
    doctor_id INTEGER,
    doctor_name TEXT DEFAULT '', cedula TEXT DEFAULT '', doctor_area TEXT DEFAULT '',
    patient_curp TEXT DEFAULT '',
    patient_name TEXT NOT NULL,
    sex TEXT DEFAULT '', age TEXT DEFAULT '',
    blood_group TEXT DEFAULT '', rh_factor TEXT DEFAULT '', allergies TEXT DEFAULT '',
    imss_registered TEXT DEFAULT 'NO',
    purpose TEXT DEFAULT '', observations TEXT DEFAULT '',
    city TEXT DEFAULT '', state TEXT DEFAULT '',
    health_center TEXT DEFAULT '', coordinator TEXT DEFAULT '',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    cancel_reason TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cert_curp ON certificates(patient_curp);
CREATE INDEX IF NOT EXISTS idx_cert_fecha ON certificates(fecha);
CREATE INDEX IF NOT EXISTS idx_cert_name ON certificates(patient_name);
`);

// ---------- Contraseñas ----------
function hashPassword(plain) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
    return `scrypt$${salt}$${hash}`;
}
function verifyPassword(plain, stored) {
    const [alg, salt, hash] = String(stored || '').split('$');
    if (alg !== 'scrypt' || !salt || !hash) return false;
    const test = crypto.scryptSync(String(plain), salt, 64);
    const ref = Buffer.from(hash, 'hex');
    return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

// ---------- Configuración ----------
const DEFAULT_CONFIG = {
    unitName: 'CENTRO DE SALUD URBANO SUCHIAPA',
    clues: 'CM/CSU SUCHIAPA/CS1B002415',
    coordinator: 'DR. WILBER GUTIERREZ LEON',
    city: 'SUCHIAPA',
    state: 'CHIAPAS',
    defaultPurpose: 'PERSONALES Y/O LABORALES',
    defaultObservations: '',
    folioNext: 1
};
function getConfig() {
    const cfg = { ...DEFAULT_CONFIG };
    for (const r of db.prepare('SELECT key, value FROM settings').all()) {
        try { cfg[r.key] = JSON.parse(r.value); } catch { cfg[r.key] = r.value; }
    }
    return cfg;
}
function setConfig(obj) {
    const st = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    db.transaction(() => {
        for (const [k, v] of Object.entries(obj)) {
            if (k in DEFAULT_CONFIG) st.run(k, JSON.stringify(v));
        }
    })();
}

// ---------- CURP ----------
const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
function normCurp(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function curpBirthDate(curp) {
    const c = normCurp(curp);
    if (c.length < 17) return '';
    const yy = c.slice(4, 6), mm = c.slice(6, 8), dd = c.slice(8, 10);
    if (!/^\d{6}$/.test(yy + mm + dd)) return '';
    const century = /\d/.test(c[16]) ? '19' : '20';
    return `${century}${yy}-${mm}-${dd}`;
}
function fechaFromParts(day, month, year) {
    const d = parseInt(day, 10);
    const m = MONTHS.indexOf(String(month || '').toUpperCase()) + 1;
    let y = parseInt(year, 10);
    if (y && y < 100) y += 2000;
    if (!d || !m || !y) return new Date().toISOString().slice(0, 10);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

module.exports = { db, hashPassword, verifyPassword, getConfig, setConfig, normCurp, curpBirthDate, fechaFromParts, MONTHS };
