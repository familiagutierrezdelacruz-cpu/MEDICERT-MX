// MediCert MX — versión servidor
document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtFecha = (iso) => { if (!iso) return '-'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    // ---------- Estado ----------
    const state = { me: null, config: null, doctors: [], editing: null, histOffset: 0, histTotal: 0, birthDate: '' };

    // ---------- API ----------
    async function api(method, url, body) {
        const opt = { method, headers: {}, credentials: 'same-origin' };
        if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
        const r = await fetch(url, opt);
        let data = null;
        try { data = await r.json(); } catch { }
        if (r.status === 401 && url !== '/api/login') { showLogin(state.me ? data?.error : null); throw new Error(data?.error || 'Sesión vencida'); }
        if (!r.ok) throw new Error(data?.error || `Error ${r.status}`);
        return data;
    }
    function toast(msg, type = 'ok') {
        const t = document.createElement('div');
        t.className = 'toast ' + type;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('show'), 10);
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
    }

    // ---------- Vista previa ----------
    const fieldMapping = {
        'folio': 'view-folio',
        'unidad_codigo': 'view-unidad-codigo',
        'doctor_name': { 'view-doctor-name': (v) => v, 'view-doctor-footer': (v) => v },
        'cedula': 'view-cedula',
        'doctor_area': 'view-doctor-area',
        'patient_name': 'view-patient-name',
        'curp': 'view-curp',
        'sex': 'view-sex',
        'age': 'view-age',
        'blood_group': 'view-blood-group',
        'rh_factor': 'view-rh-factor',
        'allergies': 'view-allergies',
        'purpose': 'view-purpose',
        'observations': 'view-observations',
        'day': 'view-day',
        'month': 'view-month',
        'year': { 'view-year': (v) => v.toString().slice(-2) },
        'city': 'view-city',
        'state': 'view-state',
        'health_center': 'view-health-center-footer',
        'coordinator': 'view-coordinator-footer'
    };
    const CERT_INPUTS = [...Object.keys(fieldMapping), 'imss_registered'];

    function updatePreview(fieldId, value) {
        const mapping = fieldMapping[fieldId];
        const v = String(value ?? '').toUpperCase();
        if (typeof mapping === 'string') {
            const el = $(mapping); if (el) el.textContent = v || '__________';
        } else if (mapping) {
            for (const [pid, tf] of Object.entries(mapping)) { const el = $(pid); if (el) el.textContent = tf(v) || '__________'; }
        }
        if (fieldId === 'year') { const logo = $('view-official-logo'); if (logo && /^\d{4}$/.test(value)) logo.src = `logo_${value}.png`; }
    }
    function setField(id, value) {
        const el = $(id); if (!el) return;
        el.value = value ?? '';
        if (el.tagName === 'SELECT' && value && el.value !== String(value)) {
            // valor que no está en la lista: agregarlo para no perderlo
            const o = document.createElement('option'); o.value = value; o.textContent = value; el.appendChild(o); el.value = value;
        }
        updatePreview(id, el.value);
    }
    function refreshPreview() { Object.keys(fieldMapping).forEach(id => { const el = $(id); if (el) updatePreview(id, el.value); }); }

    Object.keys(fieldMapping).forEach(id => {
        const input = $(id); if (!input) return;
        input.addEventListener('input', (e) => {
            if (input.tagName !== 'SELECT' && input.type !== 'number' && !input.readOnly) {
                const pos = input.selectionStart; input.value = input.value.toUpperCase();
                try { input.setSelectionRange(pos, pos); } catch { }
            }
            updatePreview(id, input.value);
        });
        input.addEventListener('change', () => updatePreview(id, input.value));
    });

    // ---------- CURP ----------
    const normCurp = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const CURP_RE = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d$/;
    function curpBirth(c) {
        c = normCurp(c); if (c.length < 17) return '';
        const yy = c.slice(4, 6), mm = c.slice(6, 8), dd = c.slice(8, 10);
        if (!/^\d{6}$/.test(yy + mm + dd)) return '';
        return `${/\d/.test(c[16]) ? '19' : '20'}${yy}-${mm}-${dd}`;
    }
    function curpSex(c) { const s = normCurp(c)[10]; return s === 'H' ? 'MASCULINO' : s === 'M' ? 'FEMENINO' : ''; }
    function certDate() {
        const d = parseInt($('day').value, 10), m = MONTHS.indexOf($('month').value) + 1, y = parseInt($('year').value, 10);
        return (d && m && y) ? new Date(y, m - 1, d) : new Date();
    }
    function ageFrom(birthIso) {
        if (!birthIso) return '';
        const [y, m, d] = birthIso.split('-').map(Number);
        const ref = certDate();
        let age = ref.getFullYear() - y;
        if (ref.getMonth() + 1 < m || (ref.getMonth() + 1 === m && ref.getDate() < d)) age--;
        return age >= 0 && age < 130 ? String(age) : '';
    }
    function applyBirth(birthIso) {
        state.birthDate = birthIso || '';
        const a = ageFrom(state.birthDate);
        if (a !== '') setField('age', a);
    }
    ['day', 'month', 'year'].forEach(id => $(id).addEventListener('change', () => { if (state.birthDate) applyBirth(state.birthDate); }));

    // ---------- Login ----------
    function showLogin(msg) {
        $('loginOverlay').style.display = 'flex'; $('loginOverlay').style.opacity = '1';
        if (msg) { $('loginError').textContent = msg; $('loginError').style.display = 'block'; }
        setTimeout(() => $('loginUser').focus(), 50);
    }
    async function doLogin() {
        $('loginError').style.display = 'none';
        try {
            await api('POST', '/api/login', { username: $('loginUser').value, password: $('loginPass').value });
            $('loginPass').value = '';
            $('loginOverlay').style.opacity = '0';
            setTimeout(() => $('loginOverlay').style.display = 'none', 400);
            await boot();
        } catch (e) { $('loginError').textContent = e.message; $('loginError').style.display = 'block'; }
    }
    $('loginBtn').addEventListener('click', doLogin);
    $('loginPass').addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
    $('loginUser').addEventListener('keypress', e => { if (e.key === 'Enter') $('loginPass').focus(); });
    $('logoutBtn').addEventListener('click', async () => { try { await api('POST', '/api/logout'); } catch { } location.reload(); });

    // ---------- Arranque ----------
    async function boot() {
        const { user } = await api('GET', '/api/me');
        state.me = user;
        $('userName').textContent = user.name + (user.role === 'admin' ? ' · Admin' : '');
        $('deleteDoctorBtn').style.display = user.role === 'admin' ? '' : 'none';
        state.config = await api('GET', '/api/config');
        await loadDoctors();
        newCertificate({ keepDoctor: false });
        if (user.last_doctor_id && state.doctors.some(d => d.id === user.last_doctor_id)) selectDoctor(user.last_doctor_id);
        loadHistory(true);
    }

    function applyConfig(cfg) {
        setField('unidad_codigo', cfg.clues);
        setField('health_center', cfg.unitName);
        setField('coordinator', cfg.coordinator);
        setField('city', cfg.city);
        setField('state', cfg.state);
    }
    function showNextFolio() {
        setField('folio', state.config.folioNext);
        $('folioHint').textContent = 'se asigna al imprimir';
    }
    function setCurrentDate() {
        const now = new Date();
        setField('day', now.getDate()); setField('month', MONTHS[now.getMonth()]); setField('year', now.getFullYear());
    }

    // ---------- Nuevo certificado ----------
    function clearPatient() {
        ['patient_name', 'curp', 'age', 'blood_group'].forEach(id => setField(id, ''));
        ['sex', 'rh_factor'].forEach(id => setField(id, ''));
        setField('imss_registered', 'NO');
        setField('allergies', 'NEGADAS');
        state.birthDate = '';
        $('patientInfo').style.display = 'none';
    }
    function newCertificate({ keepDoctor = true, keepPatient = false } = {}) {
        state.editing = null;
        $('editBanner').style.display = 'none';
        if (!keepPatient) clearPatient();
        setField('purpose', state.config.defaultPurpose || 'PERSONALES Y/O LABORALES');
        setField('observations', state.config.defaultObservations || '');
        if (!keepDoctor) { setField('doctor_name', ''); setField('cedula', ''); setField('doctor_area', ''); $('doctor_select').value = ''; }
        setCurrentDate();
        applyConfig(state.config);
        showNextFolio();
        if (keepPatient && state.birthDate) applyBirth(state.birthDate);
        document.querySelectorAll('.history-item.active').forEach(el => el.classList.remove('active'));
    }
    $('newBtn').addEventListener('click', () => { newCertificate(); $('curp').focus(); });
    $('exitEditBtn').addEventListener('click', () => { newCertificate(); $('curp').focus(); });

    // ---------- Médicos ----------
    async function loadDoctors() {
        state.doctors = await api('GET', '/api/doctors');
        renderDoctorSelect();
    }
    function renderDoctorSelect(selectedId) {
        const sel = $('doctor_select');
        const cur = selectedId !== undefined ? String(selectedId ?? '') : sel.value;
        sel.innerHTML = '<option value="">-- Escribir otro médico --</option>' +
            state.doctors.map(d => `<option value="${d.id}">${esc(d.name)}${d.cedula ? ' (' + esc(d.cedula) + ')' : ''}</option>`).join('');
        sel.value = state.doctors.some(d => String(d.id) === cur) ? cur : '';
        $('repDoctor').innerHTML = '<option value="">Todos</option>' +
            state.doctors.filter(d => d.cedula).map(d => `<option value="${esc(d.cedula)}">${esc(d.name)}</option>`).join('');
    }
    function selectDoctor(id, remember = false) {
        const d = state.doctors.find(x => x.id === Number(id));
        $('doctor_select').value = d ? String(d.id) : '';
        if (!d) return;
        setField('doctor_name', d.name); setField('cedula', d.cedula); setField('doctor_area', d.area || '');
        if (remember) api('PUT', '/api/me/last-doctor', { doctor_id: d.id }).catch(() => { });
    }
    $('doctor_select').addEventListener('change', (e) => {
        if (e.target.value) selectDoctor(e.target.value, true);
        else { setField('doctor_name', ''); setField('cedula', ''); setField('doctor_area', ''); $('doctor_name').focus(); }
    });
    // Si escriben a mano otro nombre o cédula, ya no es el médico guardado
    ['doctor_name', 'cedula'].forEach(id => $(id).addEventListener('input', () => {
        const d = state.doctors.find(x => String(x.id) === $('doctor_select').value);
        if (d && ($('doctor_name').value !== d.name || $('cedula').value !== d.cedula)) $('doctor_select').value = '';
    }));
    $('saveDoctorBtn').addEventListener('click', async () => {
        const name = $('doctor_name').value.trim();
        if (!name) return alert('Escribe primero el nombre del médico.');
        try {
            const d = await api('POST', '/api/doctors', { id: $('doctor_select').value || null, name, cedula: $('cedula').value, area: $('doctor_area').value });
            await loadDoctors();
            selectDoctor(d.id, true);
            toast('Médico guardado');
        } catch (e) { alert(e.message); }
    });
    $('deleteDoctorBtn').addEventListener('click', async () => {
        const id = $('doctor_select').value;
        if (!id) return alert('Selecciona primero un médico de la lista.');
        const d = state.doctors.find(x => String(x.id) === id);
        if (!confirm(`¿Quitar a ${d.name} de la lista de médicos? (Sus certificados no se borran)`)) return;
        try { await api('DELETE', '/api/doctors/' + id); await loadDoctors(); setField('doctor_name', ''); setField('cedula', ''); setField('doctor_area', ''); toast('Médico quitado'); }
        catch (e) { alert(e.message); }
    });

    // ---------- Pacientes (buscador por CURP o nombre) ----------
    function fillPatient(p) {
        setField('curp', p.curp);
        setField('patient_name', p.name);
        setField('sex', p.sex || curpSex(p.curp));
        setField('blood_group', p.blood_group || '');
        setField('rh_factor', p.rh_factor || '');
        setField('allergies', p.allergies || 'NEGADAS');
        setField('imss_registered', p.imss_registered || 'NO');
        applyBirth(p.birth_date || curpBirth(p.curp));
        showPatientInfo(p.curp);
    }
    async function showPatientInfo(curp) {
        const box = $('patientInfo');
        try {
            const p = await api('GET', '/api/patients/' + encodeURIComponent(curp));
            const vig = p.certificates.filter(c => c.status === 'VIGENTE');
            const list = vig.slice(0, 4).map(c => `<a href="#" data-cert="${c.id}">Folio ${c.folio} · ${fmtFecha(c.fecha)}${c.purpose ? ' · ' + esc(c.purpose) : ''}</a>`).join('');
            box.innerHTML = `<b>✓ Paciente registrado</b> — ${vig.length} certificado(s) anterior(es)${vig.length > 4 ? ' (se muestran los últimos 4)' : ''}<div class="pi-list">${list}</div>`;
            box.style.display = 'block';
            box.querySelectorAll('[data-cert]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); openCert(a.dataset.cert); }));
        } catch { box.style.display = 'none'; }
    }

    function setupSuggest(inputId, listId, mode) {
        const input = $(inputId), list = $(listId);
        let items = [], idx = -1;
        const hide = () => { list.style.display = 'none'; idx = -1; };
        const render = () => {
            if (!items.length) return hide();
            list.innerHTML = items.map((p, i) => `
                <div class="suggest-item${i === idx ? ' active' : ''}" data-i="${i}">
                    <div class="s-name">${esc(p.name)}</div>
                    <div class="s-meta">${esc(p.curp)} · ${p.cert_count} cert.${p.last_fecha ? ' · último ' + fmtFecha(p.last_fecha) : ''}</div>
                </div>`).join('');
            list.style.display = 'block';
            list.querySelectorAll('.suggest-item').forEach(el => el.addEventListener('mousedown', (e) => { e.preventDefault(); pick(+el.dataset.i); }));
        };
        const pick = (i) => { const p = items[i]; hide(); if (p) { fillPatient(p); toast('Datos del paciente cargados'); } };
        const search = debounce(async () => {
            const q = input.value.trim();
            if (q.length < 3) { items = []; return hide(); }
            try { items = await api('GET', '/api/patients?q=' + encodeURIComponent(q)); } catch { items = []; }
            if (document.activeElement !== input) return;
            // CURP completo y encontrado: cargar directo
            if (mode === 'curp' && normCurp(q).length === 18) {
                const exact = items.find(p => p.curp === normCurp(q));
                if (exact) { hide(); fillPatient(exact); return; }
            }
            idx = -1; render();
        }, 250);
        input.addEventListener('input', () => {
            if (mode === 'curp') {
                const c = normCurp(input.value);
                if (c.length === 18) {
                    if (!$('sex').value) setField('sex', curpSex(c));
                    applyBirth(curpBirth(c));
                }
                $('patientInfo').style.display = 'none';
            }
            search();
        });
        input.addEventListener('keydown', (e) => {
            if (list.style.display === 'none') return;
            if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, items.length - 1); render(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); render(); e.preventDefault(); }
            else if (e.key === 'Enter' && idx >= 0) { pick(idx); e.preventDefault(); }
            else if (e.key === 'Escape') hide();
        });
        input.addEventListener('blur', () => setTimeout(hide, 150));
        input.addEventListener('blur', () => {
            if (mode !== 'curp') return;
            const c = normCurp(input.value);
            input.classList.toggle('invalid', c.length > 0 && !CURP_RE.test(c));
        });
    }
    setupSuggest('curp', 'curpSuggest', 'curp');
    setupSuggest('patient_name', 'nameSuggest', 'name');

    // ---------- Imprimir / guardar ----------
    function collectForm() {
        const o = {};
        CERT_INPUTS.forEach(id => o[id] = $(id).value);
        o.curp = normCurp(o.curp);
        o.doctor_id = $('doctor_select').value || null;
        return o;
    }
    function showEditBanner(cert) {
        const cancelled = cert.status === 'CANCELADO';
        $('editBannerText').innerHTML = cancelled
            ? `<b>Folio ${cert.folio} CANCELADO</b> (${esc(cert.cancel_reason || '')}). Solo consulta.`
            : `Viendo <b>folio ${cert.folio}</b> del ${fmtFecha(cert.fecha)}. Si corriges algo y lo imprimes, se actualiza este mismo folio.`;
        $('editBanner').classList.toggle('cancelled', cancelled);
        $('editBanner').style.display = 'flex';
        $('folioHint').textContent = cancelled ? 'cancelado' : 'ya asignado';
        $('useForNewBtn').style.display = cert.patient_name ? '' : 'none';
    }

    $('printBtn').addEventListener('click', async () => {
        const data = collectForm();
        if (!data.patient_name.trim()) { alert('Falta el nombre del paciente.'); return $('patient_name').focus(); }
        if (!data.doctor_name.trim()) { alert('Falta el médico que certifica.'); return $('doctor_select').focus(); }
        if (data.curp && !CURP_RE.test(data.curp) && !confirm(`El CURP "${data.curp}" no parece válido. ¿Imprimir de todos modos?`)) return $('curp').focus();
        if (!data.curp && !confirm('El paciente no tiene CURP, así que no quedará registrado para la próxima vez. ¿Imprimir de todos modos?')) return $('curp').focus();
        if (state.editing && state.editing.status === 'CANCELADO') return alert('Este folio está cancelado. Usa "Nuevo certificado para este paciente".');
        const btn = $('printBtn'); btn.disabled = true;
        try {
            let cert;
            if (state.editing) cert = await api('PUT', '/api/certificates/' + state.editing.id, data);
            else {
                cert = await api('POST', '/api/certificates', data);
                state.config.folioNext = cert.folio + 1;
            }
            state.editing = cert;
            setField('folio', cert.folio);
            showEditBanner(cert);
            loadHistory(true);
            if (data.curp) showPatientInfo(data.curp);
            setTimeout(() => window.print(), 80);
        } catch (e) { alert('No se pudo guardar: ' + e.message); }
        finally { btn.disabled = false; }
    });

    // ---------- Abrir certificado del historial ----------
    async function openCert(id) {
        try {
            const c = await api('GET', '/api/certificates/' + id);
            state.editing = c;
            setField('folio', c.folio);
            const map = { curp: c.patient_curp };
            CERT_INPUTS.forEach(f => { if (f !== 'folio') setField(f, map[f] ?? c[f] ?? ''); });
            state.birthDate = curpBirth(c.patient_curp);
            // seleccionar al médico en la lista
            let d = state.doctors.find(x => x.id === c.doctor_id) || state.doctors.find(x => x.cedula && x.cedula === c.cedula);
            $('doctor_select').value = d ? String(d.id) : '';
            showEditBanner(c);
            $('patientInfo').style.display = 'none';
            document.querySelectorAll('.history-item').forEach(el => el.classList.toggle('active', el.dataset.id === String(c.id)));
            document.querySelector('.form-section').scrollTo?.({ top: 0, behavior: 'smooth' });
        } catch (e) { alert(e.message); }
    }
    $('useForNewBtn').addEventListener('click', () => {
        const curp = $('curp').value;
        newCertificate({ keepPatient: true });
        if (curp) showPatientInfo(normCurp(curp));
        toast('Nuevo certificado con los datos del paciente');
    });

    // ---------- Historial ----------
    const histSearch = debounce(() => loadHistory(true), 300);
    $('historySearch').addEventListener('input', histSearch);
    $('historyMore').addEventListener('click', () => loadHistory(false));

    async function loadHistory(reset) {
        if (reset) state.histOffset = 0;
        const q = $('historySearch').value.trim();
        try {
            const r = await api('GET', `/api/certificates?limit=20&offset=${state.histOffset}&q=${encodeURIComponent(q)}`);
            state.histTotal = r.total;
            const list = $('historyList');
            const html = r.items.map(c => `
                <div class="history-item${c.status === 'CANCELADO' ? ' cancelled' : ''}${state.editing && state.editing.id === c.id ? ' active' : ''}" data-id="${c.id}">
                    <div class="history-info">
                        <span class="patient-name">
                            ${esc(c.patient_name)}
                            ${c.imss_registered === 'SI' ? '<span class="hist-badge" title="Trámite IMSS-Bienestar realizado">✓ IMSS</span>' : ''}
                            ${c.status === 'CANCELADO' ? '<span class="hist-badge red">CANCELADO</span>' : ''}
                        </span>
                        <span class="date-folio">Folio ${c.folio} · ${fmtFecha(c.fecha)}${c.patient_curp ? ' · ' + esc(c.patient_curp) : ''}</span>
                        <span class="date-folio">${esc(c.doctor_name)}</span>
                    </div>
                    ${state.me.role === 'admin' && c.status !== 'CANCELADO' ? `<button class="btn-delete-hist" data-cancel="${c.id}" title="Cancelar folio">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"></line></svg>
                    </button>` : ''}
                </div>`).join('');
            if (reset) list.innerHTML = html || `<p class="empty-msg">${q ? 'Sin resultados.' : 'No hay certificados guardados aún.'}</p>`;
            else list.insertAdjacentHTML('beforeend', html);
            state.histOffset += r.items.length;
            $('historyCount').textContent = r.total ? `${r.total} certificado(s)${q ? ' encontrados' : ' en total'}` : '';
            $('historyMore').style.display = state.histOffset < r.total ? 'block' : 'none';
            $('historyMore').textContent = `Ver más (${r.total - state.histOffset} restantes)`;
            list.querySelectorAll('.history-item').forEach(el => {
                if (el.dataset.bound) return; el.dataset.bound = 1;
                el.addEventListener('click', (e) => { if (!e.target.closest('[data-cancel]')) openCert(el.dataset.id); });
            });
            list.querySelectorAll('[data-cancel]').forEach(b => {
                if (b.dataset.bound) return; b.dataset.bound = 1;
                b.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const reason = prompt('¿Por qué se cancela este folio? (el folio queda registrado como CANCELADO y no se reutiliza)');
                    if (reason === null) return;
                    try {
                        await api('POST', `/api/certificates/${b.dataset.cancel}/cancel`, { reason });
                        if (state.editing && String(state.editing.id) === b.dataset.cancel) newCertificate();
                        loadHistory(true); toast('Folio cancelado');
                    } catch (err) { alert(err.message); }
                });
            });
        } catch (e) { $('historyList').innerHTML = `<p class="empty-msg">${esc(e.message)}</p>`; }
    }

    // ---------- Reporte ----------
    let reportRows = [];
    $('viewReportBtn').addEventListener('click', () => {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        if (!$('repFrom').value) $('repFrom').value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
        if (!$('repTo').value) $('repTo').value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        $('reportModal').style.display = 'flex';
        loadReport();
    });
    $('closeReportBtn').addEventListener('click', () => $('reportModal').style.display = 'none');
    $('repApply').addEventListener('click', loadReport);
    async function loadReport() {
        const cfg = state.config;
        $('repUnitName').textContent = cfg.unitName || 'UNIDAD DE SALUD';
        $('repClues').textContent = `CLUES: ${cfg.clues || '-'}`;
        $('repLocation').textContent = `Ubicación: ${cfg.city || '-'}, ${cfg.state || '-'}`;
        const from = $('repFrom').value, to = $('repTo').value, doc = $('repDoctor').value, st = $('repStatus').value;
        $('repPeriod').textContent = `Periodo: ${from ? fmtFecha(from) : 'inicio'} al ${to ? fmtFecha(to) : 'hoy'}` +
            (doc ? ` · Médico: ${$('repDoctor').selectedOptions[0].textContent}` : '');
        $('reportTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Cargando...</td></tr>';
        try {
            const r = await api('GET', `/api/certificates?limit=10000&from=${from}&to=${to}&doctor=${encodeURIComponent(doc)}&status=${st}`);
            reportRows = r.items.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.folio - b.folio);
            $('reportTableBody').innerHTML = reportRows.length === 0
                ? '<tr><td colspan="6" style="text-align:center; padding: 20px;">No hay certificados en este periodo</td></tr>'
                : reportRows.map(c => `
                    <tr${c.status === 'CANCELADO' ? ' class="row-cancelled"' : ''}>
                        <td>${fmtFecha(c.fecha)}</td>
                        <td style="font-weight: bold;">${c.folio}${c.status === 'CANCELADO' ? ' (CANC.)' : ''}</td>
                        <td>${esc(c.patient_name)}</td>
                        <td style="font-size:0.8rem;">${esc(c.patient_curp || '-')}</td>
                        <td style="font-size:0.8rem;">${esc(c.purpose || '-')}</td>
                        <td style="font-size: 0.85rem;">${esc(c.doctor_name)}</td>
                    </tr>`).join('');
            const canc = reportRows.filter(c => c.status === 'CANCELADO').length;
            $('repTotal').textContent = `Total: ${reportRows.length} certificado(s)` + (canc ? ` · ${reportRows.length - canc} vigentes, ${canc} cancelados` : '');
        } catch (e) { $('reportTableBody').innerHTML = `<tr><td colspan="6">${esc(e.message)}</td></tr>`; }
    }
    $('printReportBtn').addEventListener('click', () => {
        document.body.classList.add('printing-report');
        window.print();
    });
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'));
    $('repCsv').addEventListener('click', () => {
        const cols = [['fecha', 'Fecha'], ['folio', 'Folio'], ['status', 'Estado'], ['patient_name', 'Paciente'], ['patient_curp', 'CURP'], ['sex', 'Sexo'], ['age', 'Edad'],
        ['purpose', 'Finalidad'], ['imss_registered', 'Trámite IMSS-B'], ['doctor_name', 'Médico'], ['cedula', 'Cédula'], ['doctor_area', 'Área']];
        const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [cols.map(c => q(c[1])).join(',')].concat(reportRows.map(r => cols.map(c => q(c[0] === 'fecha' ? fmtFecha(r.fecha) : r[c[0]])).join(',')));
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `certificados_${$('repFrom').value || 'inicio'}_${$('repTo').value || 'hoy'}.csv`; a.click();
        URL.revokeObjectURL(a.href);
    });

    // ---------- Configuración ----------
    const isAdmin = () => state.me && state.me.role === 'admin';
    function showTab(tab) {
        document.querySelectorAll('.config-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.config-pane').forEach(p => p.style.display = p.dataset.pane === tab ? '' : 'none');
        if (tab === 'tabUsers') loadUsers();
    }
    document.querySelectorAll('.config-tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('editConfigBtn').addEventListener('click', () => {
        const admin = isAdmin();
        document.querySelectorAll('.config-tab').forEach(b => b.style.display = (admin || b.dataset.tab === 'tabMe') ? '' : 'none');
        const c = state.config;
        $('setup_unit_name').value = c.unitName || ''; $('setup_clues').value = c.clues || '';
        $('setup_coordinator').value = c.coordinator || ''; $('setup_city').value = c.city || ''; $('setup_state').value = c.state || '';
        $('setup_purpose').value = c.defaultPurpose || ''; $('setup_observations').value = c.defaultObservations || '';
        $('setup_folio').value = c.folioNext;
        $('importResult').innerHTML = '';
        showTab(admin ? 'tabUnit' : 'tabMe');
        $('setupModal').style.display = 'flex';
    });
    $('closeConfigBtn').addEventListener('click', () => $('setupModal').style.display = 'none');
    $('setupForm').querySelectorAll('input[type=text]').forEach(i => i.addEventListener('input', () => i.value = i.value.toUpperCase()));

    $('setupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {
            unitName: $('setup_unit_name').value, clues: $('setup_clues').value, coordinator: $('setup_coordinator').value,
            city: $('setup_city').value, state: $('setup_state').value,
            defaultPurpose: $('setup_purpose').value, defaultObservations: $('setup_observations').value
        };
        if (String($('setup_folio').value) !== String(state.config.folioNext)) body.folioNext = $('setup_folio').value;
        try {
            state.config = await api('PUT', '/api/config', body);
            applyConfig(state.config);
            if (!state.editing) showNextFolio();
            $('setupModal').style.display = 'none';
            toast('Configuración guardada');
        } catch (err) { alert(err.message); }
    });

    async function loadUsers() {
        try {
            const users = await api('GET', '/api/users');
            $('usersList').innerHTML = users.map(u => `
                <div class="user-row${u.active ? '' : ' inactive'}">
                    <div><b>${esc(u.name)}</b><br><span class="s-meta">${esc(u.username)} · ${u.role === 'admin' ? 'Administrador' : 'Capturista'}${u.active ? '' : ' · DESACTIVADO'}</span></div>
                    <div class="user-actions">
                        <button type="button" class="btn-text-small" data-act="pass" data-id="${u.id}">Contraseña</button>
                        ${u.id !== state.me.id ? `<button type="button" class="btn-text-small" data-act="role" data-id="${u.id}" data-role="${u.role}">${u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>
                        <button type="button" class="btn-text-small" data-act="active" data-id="${u.id}" data-active="${u.active ? 1 : 0}">${u.active ? 'Desactivar' : 'Activar'}</button>` : ''}
                    </div>
                </div>`).join('');
            $('usersList').querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
                const id = b.dataset.id; let body;
                if (b.dataset.act === 'pass') { const p = prompt('Nueva contraseña (mínimo 6 caracteres):'); if (!p) return; body = { password: p }; }
                if (b.dataset.act === 'role') body = { role: b.dataset.role === 'admin' ? 'capturista' : 'admin' };
                if (b.dataset.act === 'active') body = { active: b.dataset.active !== '1' };
                try { await api('PUT', '/api/users/' + id, body); toast('Usuario actualizado'); loadUsers(); } catch (e) { alert(e.message); }
            }));
        } catch (e) { $('usersList').textContent = e.message; }
    }
    $('userForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await api('POST', '/api/users', { name: $('nu_name').value, username: $('nu_user').value, password: $('nu_pass').value, role: $('nu_role').value });
            e.target.reset(); toast('Usuario agregado'); loadUsers();
        } catch (err) { alert(err.message); }
    });
    $('myPassForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if ($('mp_new').value !== $('mp_new2').value) return alert('Las contraseñas nuevas no coinciden.');
        try { await api('PUT', '/api/me/password', { current: $('mp_current').value, password: $('mp_new').value }); e.target.reset(); toast('Contraseña cambiada'); }
        catch (err) { alert(err.message); }
    });

    $('exportDataBtn').addEventListener('click', () => { window.location.href = '/api/export'; });
    $('importDataBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            const r = await api('POST', '/api/import', data);
            $('importResult').innerHTML = `✅ Importado: <b>${r.certificates}</b> certificados, <b>${r.patients}</b> pacientes nuevos, <b>${r.doctors}</b> médicos nuevos.` +
                (r.conflicts.length ? `<br>⚠️ ${r.conflicts.length} folio(s) ya existían con otro paciente:<br>${r.conflicts.map(esc).join('<br>')}` : '') +
                (r.skipped.length ? `<br>⚠️ ${r.skipped.length} registro(s) sin folio o sin nombre no se importaron.` : '');
            state.config = await api('GET', '/api/config');
            await loadDoctors();
            if (!state.editing) { applyConfig(state.config); showNextFolio(); }
            loadHistory(true);
        } catch (err) { $('importResult').textContent = '❌ ' + err.message; }
        e.target.value = '';
    });

    // ---------- Pegado inteligente y escaneo (sin cambios de fondo) ----------
    function processAutoFill(text) {
        if (!text) return 0;
        let data = {};
        try { data = JSON.parse(text); } catch (e) {
            const patterns = {
                doctor_name: /(?:médico|doctor|dr\.?|certificante)[:\s]+([a-z\sÁÉÍÓÚÑ]+)/i,
                patient_name: /(?:nombre|paciente|C\.)[:\s]+([a-z\sÁÉÍÓÚÑ]+)/i,
                curp: /([A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d)/i,
                age: /(?:edad|años)[:\s]+(\d+)/i,
                sex: /(?:sexo|genero)[:\s]+(FEMENINO|MASCULINO|MUJER|HOMBRE|F|M)/i,
                blood_group: /(?:grupo|sanguíneo|tipo)[:\s]+(AB|A|B|O|0)/i,
                rh_factor: /(?:rh|factor)[:\s]+(\+|pos|-|neg)/i,
                allergies: /(?:alergias|alérgico)[:\s]+([a-z\sÁÉÍÓÚÑ]+)/i
            };
            Object.keys(patterns).forEach(key => {
                const m = text.match(patterns[key]);
                if (m && m[1]) {
                    let val = m[1].trim();
                    if (key === 'sex') val = (val.toUpperCase().startsWith('F') || val.toUpperCase() === 'MUJER') ? 'FEMENINO' : 'MASCULINO';
                    if (key === 'rh_factor') val = (val.includes('+') || val.toLowerCase().includes('pos')) ? 'POSITIVO' : 'NEGATIVO';
                    if (key === 'blood_group' && val === '0') val = 'O';
                    data[key] = val;
                }
            });
        }
        const fields = ['doctor_name', 'cedula', 'doctor_area', 'patient_name', 'curp', 'sex', 'age', 'blood_group', 'rh_factor', 'allergies'];
        let n = 0;
        fields.forEach(id => { if (data[id] !== undefined && $(id)) { setField(id, data[id].toString().toUpperCase()); n++; } });
        if (data.curp) {
            const c = normCurp(data.curp);
            if (!data.sex) setField('sex', curpSex(c));
            applyBirth(curpBirth(c));
            api('GET', '/api/patients/' + c).then(p => { fillPatient(p); toast('Este paciente ya estaba registrado'); }).catch(() => { });
        }
        return n;
    }
    $('smartPasteBtn').addEventListener('click', async () => {
        let text = '';
        try { text = await navigator.clipboard.readText(); } catch { }
        if (!text) text = prompt('Pega aquí el texto que copiaste de la foto (Google Lens / OCR):');
        if (!text) return;
        const n = processAutoFill(text);
        alert(n > 0 ? `¡Éxito! Se llenaron ${n} campos.` : 'No se encontraron datos claros en el texto.');
    });
    const uploadImageBtn = $('uploadImageBtn'), imageInput = $('imageInput');
    uploadImageBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const orig = uploadImageBtn.innerHTML;
        uploadImageBtn.disabled = true; uploadImageBtn.innerHTML = '<span class="spinner"></span> Escaneando...';
        try {
            const result = await Tesseract.recognize(file, 'spa');
            const n = processAutoFill(result.data.text);
            alert(n > 0 ? `¡Escaneo completo! Se llenaron ${n} campos.` : 'No logré identificar datos en la foto. Intenta con una imagen más clara.');
        } catch (err) { alert('Hubo un error al procesar la imagen. Intenta con una foto más clara.'); }
        finally { uploadImageBtn.disabled = false; uploadImageBtn.innerHTML = orig; imageInput.value = ''; }
    });

    // ---------- Inicio ----------
    $('loginOverlay').style.display = 'flex';
    api('GET', '/api/me').then(() => { $('loginOverlay').style.display = 'none'; return boot(); }).catch(() => { });
});
