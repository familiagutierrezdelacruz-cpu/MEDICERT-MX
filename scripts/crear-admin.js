// Crea (o restablece) un usuario administrador.  Uso:  node scripts/crear-admin.js
const readline = require('readline');
const { db, hashPassword } = require('../db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
if (process.stdin.isTTY) rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); else if (!/[\r\n]/.test(s)) rl.output.write('*'); };
const lines = rl[Symbol.asyncIterator]();
async function ask(q, hidden = false) {
    muted = false; process.stdout.write(q); muted = hidden;
    const { value } = await lines.next();
    muted = false;
    if (hidden && process.stdin.isTTY) process.stdout.write('\n');
    return String(value || '').trim();
}

(async () => {
    const username = (await ask('Usuario (ej. wilber): ')).toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) { console.log('Usuario no válido (3 a 30 letras/números, sin espacios).'); process.exit(1); }
    const name = (await ask('Nombre completo: ')).toUpperCase() || username.toUpperCase();
    const p1 = await ask('Contraseña (mín. 6): ', true);
    const p2 = await ask('Repite la contraseña: ', true);
    rl.close();
    if (p1.length < 6 || p1 !== p2) { console.log('Las contraseñas no coinciden o son muy cortas.'); process.exit(1); }
    const ex = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (ex) {
        db.prepare("UPDATE users SET name=?, pass_hash=?, role='admin', active=1 WHERE id=?").run(name, hashPassword(p1), ex.id);
        console.log(`✅ Usuario "${username}" actualizado como administrador.`);
    } else {
        db.prepare("INSERT INTO users(username,name,pass_hash,role) VALUES(?,?,?,'admin')").run(username, name, hashPassword(p1));
        console.log(`✅ Administrador "${username}" creado.`);
    }
})();
