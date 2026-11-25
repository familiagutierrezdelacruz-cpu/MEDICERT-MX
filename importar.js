// Importa datos de la versión anterior (respaldo JSON o Firebase) o de un respaldo del servidor
const { db, setConfig, normCurp, curpBirthDate, fechaFromParts } = require('./db');

const up = (v) => String(v ?? '').trim().toUpperCase();

function importLegacy(data, userId = null) {
    if (!data || typeof data !== 'object') throw new Error('sin datos');
    const out = { config: false, doctors: 0, certificates: 0, patients: 0, skipped: [], conflicts: [] };

    const cfg = data.config || data.unit_config;
    const doctors = data.doctors || data.saved_doctors || [];
    const certs = data.certificates || data.cert_history || [];
    if (!Array.isArray(doctors) || !Array.isArray(certs)) throw new Error('formato desconocido');

    db.transaction(() => {
        if (cfg && typeof cfg === 'object') {
            const c = {};
            ['unitName', 'clues', 'coordinator', 'city', 'state', 'defaultPurpose', 'defaultObservations'].forEach(k => { if (cfg[k]) c[k] = up(cfg[k]); });
            if (Object.keys(c).length) { setConfig(c); out.config = true; }
        }

        const findDoc = db.prepare('SELECT id FROM doctors WHERE cedula = ? AND active = 1');
        const findDocByName = db.prepare('SELECT id FROM doctors WHERE name = ? AND active = 1');
        const insDoc = db.prepare('INSERT INTO doctors(name,cedula,area) VALUES(?,?,?)');
        for (const d of doctors) {
            const name = up(d.name), cedula = up(d.cedula), area = up(d.area);
            if (!name) continue;
            const ex = cedula ? findDoc.get(cedula) : findDocByName.get(name);
            if (ex) db.prepare('UPDATE doctors SET name=?, area=COALESCE(NULLIF(?,\'\'),area) WHERE id=?').run(name, area, ex.id);
            else { insDoc.run(name, cedula, area); out.doctors++; }
        }

        const byFolio = db.prepare('SELECT id, patient_name FROM certificates WHERE folio = ?');
        const docByCedula = db.prepare('SELECT id FROM doctors WHERE cedula = ? AND active = 1');
        const insPatient = db.prepare(`INSERT INTO patients(curp,name,sex,birth_date,blood_group,rh_factor,allergies,imss_registered)
            VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(curp) DO UPDATE SET name=excluded.name, sex=excluded.sex, birth_date=excluded.birth_date,
            blood_group=excluded.blood_group, rh_factor=excluded.rh_factor, allergies=excluded.allergies, imss_registered=excluded.imss_registered`);
        const patientExists = db.prepare('SELECT 1 FROM patients WHERE curp = ?');

        // Del más antiguo al más reciente, para que el paciente quede con sus datos más nuevos
        const sorted = [...certs].sort((a, b) => (parseInt(a.folio, 10) || 0) - (parseInt(b.folio, 10) || 0));
        for (const c of sorted) {
            const folio = parseInt(String(c.folio ?? '').replace(/\D/g, ''), 10);
            const name = up(c.patient_name);
            if (!folio || !name) { out.skipped.push(`${c.folio || '(sin folio)'} ${name}`.trim()); continue; }
            const ex = byFolio.get(folio);
            if (ex) {
                if (ex.patient_name !== name) out.conflicts.push(`Folio ${folio}: ya existe con ${ex.patient_name}, no se importó ${name}`);
                continue;
            }
            const curp = normCurp(c.curp ?? c.patient_curp);
            const cedula = up(c.cedula);
            const doc = cedula ? docByCedula.get(cedula) : null;
            const row = {
                folio, unidad_codigo: up(c.unidad_codigo), status: up(c.status) === 'CANCELADO' ? 'CANCELADO' : 'VIGENTE',
                fecha: c.fecha || fechaFromParts(c.day, c.month, c.year),
                day: up(c.day), month: up(c.month), year: up(c.year),
                doctor_id: doc ? doc.id : null, doctor_name: up(c.doctor_name), cedula, doctor_area: up(c.doctor_area),
                patient_curp: curp, patient_name: name, sex: up(c.sex), age: up(c.age),
                blood_group: up(c.blood_group), rh_factor: up(c.rh_factor), allergies: up(c.allergies),
                imss_registered: up(c.imss_registered) === 'SI' ? 'SI' : 'NO',
                purpose: up(c.purpose), observations: up(c.observations), city: up(c.city), state: up(c.state),
                health_center: up(c.health_center), coordinator: up(c.coordinator),
                created_by: userId, created_at: c.created_at || legacyTimestamp(c.timestamp) || null,
                cancel_reason: up(c.cancel_reason)
            };
            const cols = Object.keys(row).filter(k => row[k] !== null);
            db.prepare(`INSERT INTO certificates(${cols.join(',')}) VALUES(${cols.map(k => '@' + k).join(',')})`)
                .run(Object.fromEntries(cols.map(k => [k, row[k]])));
            out.certificates++;
            if (curp.length >= 10) {
                if (!patientExists.get(curp)) out.patients++;
                insPatient.run(curp, name, row.sex, curpBirthDate(curp), row.blood_group, row.rh_factor, row.allergies, row.imss_registered);
            }
        }

        // Pacientes sueltos de un respaldo del servidor
        if (Array.isArray(data.patients)) {
            for (const p of data.patients) {
                const curp = normCurp(p.curp);
                if (curp.length < 10 || !p.name) continue;
                if (!patientExists.get(curp)) {
                    insPatient.run(curp, up(p.name), up(p.sex), p.birth_date || curpBirthDate(curp), up(p.blood_group), up(p.rh_factor), up(p.allergies), up(p.imss_registered) === 'SI' ? 'SI' : 'NO');
                    out.patients++;
                }
            }
        }
    })();
    return out;
}

// "18/2/2026, 10:23:11 a.m." -> "2026-02-18 10:23:11"
function legacyTimestamp(ts) {
    if (!ts) return null;
    const m = String(ts).match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})\s*([ap])?/i);
    if (!m) return null;
    let [, d, mo, y, h, mi, s, ap] = m;
    h = parseInt(h, 10);
    if (ap && ap.toLowerCase() === 'p' && h < 12) h += 12;
    if (ap && ap.toLowerCase() === 'a' && h === 12) h = 0;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')} ${String(h).padStart(2, '0')}:${mi}:${s}`;
}

module.exports = { importLegacy };
