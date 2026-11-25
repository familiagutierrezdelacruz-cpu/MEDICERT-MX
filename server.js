// MediCert MX — servidor
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { db, hashPassword, verifyPassword, getConfig, setConfig, normCurp, curpBirthDate, fechaFromParts } = require('./db');
const { importLegacy } = require('./importar');

const PORT = parseInt(process.env.PORT || '3047', 10);
const SESSION_DAYS = 30;
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

// ---------- Utilidades ----------
const up = (v) => String(v ?? '').trim().toUpperCase();
const txt = (v) => String(v ?? '').trim();

function parseCookies(req) {
    const out = {};
    (req.headers.cookie || '').split(';').forEach(p => {
        const i = p.indexOf('=');
        if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
    });
    return out;
}

function publicUser(u) {
    return { id: u.id, username: u.username, name: u.name, role: u.role, active: !!u.active, last_doctor_id: u.last_doctor_id, created_at: u.created_at };
}

// ---------- Sesiones ----------
function auth(req, res, next) {
    const token = parseCookies(req).mc_sid;
    if (!token) return res.status(401).json({ error: 'No has iniciado sesión' });
    const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                            WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`).get(token, Date.now());
    if (!row) return res.status(401).json({ error: 'Sesión vencida, vuelve a entrar' });
    req.user = row;
    next();
}
function admin(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
    next();
}

// Límite de intentos de acceso
const attempts = new Map();
function tooMany(ip) {
    const now = Date.now();
    const a = (attempts.get(ip) || []).filter(t => now - t < 15 * 60 * 1000);
    attempts.set(ip, a);
    return a.length >= 10;
}

app.post('/api/login', (req, res) => {
    const ip = req.ip;
    if (tooMany(ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
    const username = txt(req.body.username).toLowerCase();
    const u = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
    if (!u || !verifyPassword(req.body.password || '', u.pass_hash)) {
        attempts.get(ip).push(Date.now());
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(token, u.id, Date.now() + SESSION_DAYS * 864e5);
    res.setHeader('Set-Cookie', `mc_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${req.secure ? '; Secure' : ''}`);
    res.json({ user: publicUser(u) });
});

app.post('/api/logout', (req, res) => {
    const token = parseCookies(req).mc_sid;
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.setHeader('Set-Cookie', 'mc_sid=; Path=/; HttpOnly; Max-Age=0');
    res.json({ ok: true });
});

app.use('/api', auth);

app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));

app.put('/api/me/password', (req, res) => {
    const { current, password } = req.body;
    if (!verifyPassword(current || '', req.user.pass_hash)) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(password), req.user.id);
    res.json({ ok: true });
});

app.put('/api/me/last-doctor', (req, res) => {
    const id = req.body.doctor_id ? parseInt(req.body.doctor_id, 10) : null;
    db.prepare('UPDATE users SET last_doctor_id = ? WHERE id = ?').run(id, req.user.id);
    res.json({ ok: true });
});

// ---------- Usuarios (admin) ----------
app.get('/api/users', admin, (req, res) => {
    res.json(db.prepare('SELECT * FROM users ORDER BY active DESC, name').all().map(publicUser));
});
app.post('/api/users', admin, (req, res) => {
    const username = txt(req.body.username).toLowerCase();
    const name = up(req.body.name);
    const role = req.body.role === 'admin' ? 'admin' : 'capturista';
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Usuario: 3 a 30 letras o números, sin espacios' });
    if (!name) return res.status(400).json({ error: 'Falta el nombre' });
    if (!req.body.password || String(req.body.password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(400).json({ error: 'Ese usuario ya existe' });
    const r = db.prepare('INSERT INTO users(username,name,pass_hash,role) VALUES(?,?,?,?)').run(username, name, hashPassword(req.body.password), role);
    res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)));
});
app.put('/api/users/:id', admin, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!u) return res.status(404).json({ error: 'No existe' });
    const name = req.body.name !== undefined ? up(req.body.name) : u.name;
    const role = req.body.role !== undefined ? (req.body.role === 'admin' ? 'admin' : 'capturista') : u.role;
    const active = req.body.active !== undefined ? (req.body.active ? 1 : 0) : u.active;
    if (u.id === req.user.id && (role !== 'admin' || !active)) return res.status(400).json({ error: 'No puedes quitarte a ti mismo el acceso de administrador' });
    db.prepare('UPDATE users SET name=?, role=?, active=? WHERE id=?').run(name, role, active, u.id);
    if (req.body.password) {
        if (String(req.body.password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(hashPassword(req.body.password), u.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    }
    if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)));
});

// ---------- Configuración ----------
app.get('/api/config', (req, res) => {
    const cfg = getConfig();
    cfg.folioNext = nextFolio();
    res.json(cfg);
});
app.put('/api/config', admin, (req, res) => {
    const b = req.body;
    const data = {};
    ['unitName', 'clues', 'coordinator', 'city', 'state', 'defaultPurpose', 'defaultObservations'].forEach(k => { if (b[k] !== undefined) data[k] = up(b[k]); });
    if (b.folioNext !== undefined) {
        const n = parseInt(b.folioNext, 10);
        const max = db.prepare('SELECT MAX(folio) m FROM certificates').get().m || 0;
        if (!n || n < 1) return res.status(400).json({ error: 'Folio inválido' });
        if (n <= max) return res.status(400).json({ error: `El folio siguiente debe ser mayor a ${max} (último folio usado)` });
        data.folioNext = n;
    }
    setConfig(data);
    const cfg = getConfig(); cfg.folioNext = nextFolio();
    res.json(cfg);
});

function nextFolio() {
    const max = db.prepare('SELECT MAX(folio) m FROM certificates').get().m || 0;
    const cfgNext = parseInt(getConfig().folioNext, 10) || 1;
    return Math.max(max + 1, cfgNext);
}

// ---------- Médicos ----------
app.get('/api/doctors', (req, res) => {
    res.json(db.prepare('SELECT * FROM doctors WHERE active = 1 ORDER BY name').all());
});
app.post('/api/doctors', (req, res) => {
    const name = up(req.body.name), cedula = up(req.body.cedula), area = up(req.body.area);
    if (!name) return res.status(400).json({ error: 'Falta el nombre del médico' });
    let id = req.body.id ? parseInt(req.body.id, 10) : null;
    if (!id && cedula) {
        const ex = db.prepare('SELECT id FROM doctors WHERE cedula = ? AND active = 1').get(cedula);
        if (ex) id = ex.id;
    }
    if (id) db.prepare('UPDATE doctors SET name=?, cedula=?, area=?, active=1 WHERE id=?').run(name, cedula, area, id);
    else id = db.prepare('INSERT INTO doctors(name,cedula,area) VALUES(?,?,?)').run(name, cedula, area).lastInsertRowid;
    res.json(db.prepare('SELECT * FROM doctors WHERE id = ?').get(id));
});
app.delete('/api/doctors/:id', admin, (req, res) => {
    db.prepare('UPDATE doctors SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ---------- Pacientes ----------
app.get('/api/patients', (req, res) => {
    const q = up(req.query.q);
    if (q.length < 2) return res.json([]);
    const rows = db.prepare(`
        SELECT p.*, (SELECT COUNT(*) FROM certificates c WHERE c.patient_curp = p.curp AND c.status='VIGENTE') AS cert_count,
               (SELECT MAX(fecha) FROM certificates c WHERE c.patient_curp = p.curp AND c.status='VIGENTE') AS last_fecha
        FROM patients p
        WHERE p.curp LIKE ? OR p.name LIKE ?
        ORDER BY (p.curp LIKE ?) DESC, p.name LIMIT 15`).all(q + '%', '%' + q + '%', q + '%');
    res.json(rows);
});
app.get('/api/patients/:curp', (req, res) => {
    const p = db.prepare('SELECT * FROM patients WHERE curp = ?').get(normCurp(req.params.curp));
    if (!p) return res.status(404).json({ error: 'Paciente no registrado' });
    p.certificates = db.prepare('SELECT id, folio, fecha, purpose, doctor_name, status FROM certificates WHERE patient_curp = ? ORDER BY fecha DESC, folio DESC').all(p.curp);
    res.json(p);
});

// ---------- Certificados ----------
const CERT_FIELDS = ['unidad_codigo', 'day', 'month', 'year', 'doctor_name', 'cedula', 'doctor_area', 'patient_name', 'sex', 'age',
    'blood_group', 'rh_factor', 'allergies', 'imss_registered', 'purpose', 'observations', 'city', 'state', 'health_center', 'coordinator'];

function certFromBody(b) {
    const c = {};
    CERT_FIELDS.forEach(f => c[f] = up(b[f]));
    c.imss_registered = c.imss_registered === 'SI' ? 'SI' : 'NO';
    c.patient_curp = normCurp(b.curp ?? b.patient_curp);
    c.doctor_id = b.doctor_id ? parseInt(b.doctor_id, 10) : null;
    c.fecha = fechaFromParts(c.day, c.month, c.year);
    return c;
}

function upsertPatient(c) {
    if (!c.patient_curp || c.patient_curp.length < 10) return;
    db.prepare(`INSERT INTO patients(curp,name,sex,birth_date,blood_group,rh_factor,allergies,imss_registered)
                VALUES(@curp,@name,@sex,@birth,@blood,@rh,@allergies,@imss)
                ON CONFLICT(curp) DO UPDATE SET name=excluded.name, sex=excluded.sex, birth_date=excluded.birth_date,
                  blood_group=excluded.blood_group, rh_factor=excluded.rh_factor, allergies=excluded.allergies,
                  imss_registered=excluded.imss_registered, updated_at=datetime('now','localtime')`)
        .run({ curp: c.patient_curp, name: c.patient_name, sex: c.sex, birth: curpBirthDate(c.patient_curp), blood: c.blood_group, rh: c.rh_factor, allergies: c.allergies, imss: c.imss_registered });
}

app.get('/api/certificates', (req, res) => {
    const where = [], params = [];
    const q = up(req.query.q);
    if (q) {
        const n = parseInt(q, 10);
        where.push('(patient_name LIKE ? OR patient_curp LIKE ? OR doctor_name LIKE ?' + (String(n) === q ? ' OR folio = ?' : '') + ')');
        params.push('%' + q + '%', q + '%', '%' + q + '%'); if (String(n) === q) params.push(n);
    }
    if (req.query.from) { where.push('fecha >= ?'); params.push(req.query.from); }
    if (req.query.to) { where.push('fecha <= ?'); params.push(req.query.to); }
    if (req.query.doctor) { where.push('cedula = ?'); params.push(up(req.query.doctor)); }
    if (req.query.status) { where.push('status = ?'); params.push(up(req.query.status)); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 10000);
    const offset = parseInt(req.query.offset, 10) || 0;
    const total = db.prepare(`SELECT COUNT(*) n FROM certificates ${w}`).get(...params).n;
    const items = db.prepare(`SELECT * FROM certificates ${w} ORDER BY folio DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({ total, items });
});

app.get('/api/certificates/:id', (req, res) => {
    const c = db.prepare('SELECT * FROM certificates WHERE id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ error: 'No existe' });
    res.json(c);
});

app.post('/api/certificates', (req, res) => {
    const c = certFromBody(req.body);
    if (!c.patient_name) return res.status(400).json({ error: 'Falta el nombre del paciente' });
    if (!c.doctor_name) return res.status(400).json({ error: 'Falta el médico que certifica' });
    const saved = db.transaction(() => {
        const folio = nextFolio();
        const cols = ['folio', 'fecha', 'patient_curp', 'doctor_id', 'created_by', ...CERT_FIELDS];
        const vals = { ...c, folio, created_by: req.user.id };
        const r = db.prepare(`INSERT INTO certificates(${cols.join(',')}) VALUES(${cols.map(k => '@' + k).join(',')})`).run(vals);
        upsertPatient(c);
        if (c.doctor_id) db.prepare('UPDATE users SET last_doctor_id = ? WHERE id = ?').run(c.doctor_id, req.user.id);
        return db.prepare('SELECT * FROM certificates WHERE id = ?').get(r.lastInsertRowid);
    })();
    res.json(saved);
});

app.put('/api/certificates/:id', (req, res) => {
    const old = db.prepare('SELECT * FROM certificates WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: 'No existe' });
    if (old.status === 'CANCELADO') return res.status(400).json({ error: 'Este folio está cancelado' });
    const c = certFromBody(req.body);
    if (!c.patient_name) return res.status(400).json({ error: 'Falta el nombre del paciente' });
    const sets = ['fecha', 'patient_curp', 'doctor_id', ...CERT_FIELDS].map(k => `${k}=@${k}`).join(',');
    db.transaction(() => {
        db.prepare(`UPDATE certificates SET ${sets}, updated_at=datetime('now','localtime') WHERE id=@id`).run({ ...c, id: old.id });
        upsertPatient(c);
    })();
    res.json(db.prepare('SELECT * FROM certificates WHERE id = ?').get(old.id));
});

app.post('/api/certificates/:id/cancel', admin, (req, res) => {
    db.prepare("UPDATE certificates SET status='CANCELADO', cancel_reason=?, updated_at=datetime('now','localtime') WHERE id=?")
        .run(up(req.body.reason) || 'SIN MOTIVO', req.params.id);
    res.json({ ok: true });
});

// ---------- Respaldo e importación ----------
app.get('/api/export', admin, (req, res) => {
    const data = {
        app: 'medicert', version: 2, exported_at: new Date().toISOString(),
        config: getConfig(),
        doctors: db.prepare('SELECT * FROM doctors').all(),
        patients: db.prepare('SELECT * FROM patients').all(),
        certificates: db.prepare('SELECT * FROM certificates ORDER BY folio').all()
    };
    res.setHeader('Content-Disposition', `attachment; filename="respaldo_medicert_${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data);
});

app.post('/api/import', admin, (req, res) => {
    try { res.json(importLegacy(req.body, req.user.id)); }
    catch (e) { res.status(400).json({ error: 'Archivo no válido: ' + e.message }); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ---------- Archivos de la app ----------
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, p) => { if (/\.(html|js|css)$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); }
}));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) {
    app.listen(PORT, '127.0.0.1', () => console.log(`MediCert escuchando en http://127.0.0.1:${PORT}`));
}
module.exports = app;
