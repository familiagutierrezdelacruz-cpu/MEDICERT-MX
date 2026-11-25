// Trae los datos que la versión anterior guardó en Firebase y los pasa a la base del servidor.
// Uso:  node scripts/migrar-firebase.js
const fs = require('fs');
const path = require('path');
const { importLegacy } = require('../importar');

const PROJECT = process.env.FB_PROJECT || 'certificados-medicos-f7f9d';
const KEY = process.env.FB_KEY || 'AIzaSyCm95iwoazrwuZQD9pPJcR0npXbRonZmgc';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function val(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
    if ('mapValue' in v) return fields(v.mapValue.fields || {});
    return null;
}
function fields(f) { const o = {}; for (const [k, v] of Object.entries(f || {})) o[k] = val(v); return o; }

async function getDoc(p) {
    const r = await fetch(`${BASE}/${p}?key=${KEY}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status} ${await r.text()}`);
    return fields((await r.json()).fields);
}

(async () => {
    console.log('Leyendo Firebase...');
    const config = await getDoc('config/unit');
    const doctors = await getDoc('doctors/list');
    const history = await getDoc('history/certificates');
    const data = { unit_config: config, saved_doctors: doctors?.items || [], cert_history: history?.items || [] };
    console.log(`Encontrado: ${data.saved_doctors.length} médicos, ${data.cert_history.length} certificados.`);

    const dir = path.join(__dirname, '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `firebase_respaldo_${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`Copia guardada en ${file}`);

    const r = importLegacy(data);
    console.log(`✅ Importado: ${r.certificates} certificados, ${r.patients} pacientes nuevos, ${r.doctors} médicos nuevos.`);
    if (r.conflicts.length) console.log('⚠️ Conflictos:\n  ' + r.conflicts.join('\n  '));
    if (r.skipped.length) console.log('⚠️ Omitidos (sin folio o sin nombre):\n  ' + r.skipped.join('\n  '));
})().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
