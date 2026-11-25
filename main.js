document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('certForm');
    const printBtn = document.getElementById('printBtn');

    // Mapping of form IDs to preview IDs
    const fieldMapping = {
        'folio': 'view-folio',
        'unidad_codigo': 'view-unidad-codigo',
        'doctor_name': {
            'view-doctor-name': (val) => val.toUpperCase(),
            'view-doctor-footer': (val) => val.toUpperCase()
        },
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
        'year': {
            'view-year': (val) => val.toString().slice(-2)
        },
        'city': 'view-city',
        'state': 'view-state',
        'health_center': 'view-center-footer',
        'coordinator': 'view-coordinator-footer'
    };

    // --- SISTEMA DE CLOUD (FIREBASE) ---
    let db = null;
    let isCloudEnabled = false;

    function initFirebase(config) {
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            db = firebase.firestore();
            isCloudEnabled = true;
            console.log("☁️ Firebase Conectado");

            // Actualizar indicador en UI
            const statusBadge = document.getElementById('cloudStatus');
            if (statusBadge) {
                statusBadge.textContent = "Nube";
                statusBadge.classList.add('connected');
            }
            return true;
        } catch (e) {
            console.error("Error al inicializar Firebase:", e);
            return false;
        }
    }

    const DEFAULT_FB_CONFIG = {
        "apiKey": "AIzaSyCm95iwoazrwuZQD9pPJcR0npXbRonZmgc",
        "authDomain": "certificados-medicos-f7f9d.firebaseapp.com",
        "projectId": "certificados-medicos-f7f9d",
        "storageBucket": "certificados-medicos-f7f9d.firebasestorage.app",
        "messagingSenderId": "894057288473",
        "appId": "1:894057288473:web:dba203a1d9357ce1312b88",
        "measurementId": "G-Y2643D2MJ3"
    };

    const savedFbConfig = localStorage.getItem('fb_config');
    const fbToUse = savedFbConfig ? JSON.parse(savedFbConfig) : DEFAULT_FB_CONFIG;
    initFirebase(fbToUse);

    // --- SISTEMA DE SEGURIDAD ---
    const loginOverlay = document.getElementById('loginOverlay');
    const accessKeyInput = document.getElementById('accessKeyInput');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');

    let systemPassword = localStorage.getItem('system_password') || '1234';

    function checkAccess() {
        if (accessKeyInput.value === systemPassword) {
            loginOverlay.style.opacity = '0';
            setTimeout(() => {
                loginOverlay.style.display = 'none';
                if (isCloudEnabled) syncFromCloud();
            }, 500);
            sessionStorage.setItem('is_logged_in', 'true');
        } else {
            loginError.style.display = 'block';
            accessKeyInput.value = '';
            accessKeyInput.focus();
        }
    }

    if (sessionStorage.getItem('is_logged_in') === 'true') {
        loginOverlay.style.display = 'none';
        if (isCloudEnabled) setTimeout(() => syncFromCloud(), 1000);
    }

    loginBtn.addEventListener('click', checkAccess);
    accessKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') checkAccess();
    });

    // Official Year Titles Mapping
    const officialYears = {
        2019: "EMILIANO ZAPATA",
        2020: "LEONA VICARIO",
        2021: "LA INDEPENDENCIA",
        2022: "RICARDO FLORES MAGÓN",
        2023: "FRANCISCO VILLA",
        2024: "FELIPE CARRILLO PUERTO",
        2025: "LA MUJER INDÍGENA",
        2026: "MARGARITA MAZA PARADA"
    };

    function updateOfficialYear(year) {
        const logoEl = document.getElementById('view-official-logo');
        if (logoEl) {
            // Se asume que existen imágenes con el formato logo_YYYY.png
            // Si no existe, el navegador mostrará el alt o nada
            logoEl.src = `logo_${year}.png`;
        }
    }

    // Update function
    function updatePreview(fieldId, value) {
        const mapping = fieldMapping[fieldId];
        let displayValue = (value || '').toUpperCase();

        // Final guard: if it's the year field, always ensure it's only 2 digits in preview
        if (fieldId === 'year') {
            updateOfficialYear(value);
            if (displayValue.length > 2) {
                displayValue = displayValue.slice(-2);
            }
        }

        if (typeof mapping === 'string') {
            const el = document.getElementById(mapping);
            if (el) el.textContent = displayValue || '__________';
        } else if (typeof mapping === 'object') {
            for (const [previewId, transform] of Object.entries(mapping)) {
                const el = document.getElementById(previewId);
                let transformed = transform(displayValue);
                // Extra safety for year in object mapping
                if (fieldId === 'year' && transformed.length > 2) transformed = transformed.slice(-2);
                if (el) el.textContent = transformed || '__________';
            }
        }
    }

    // Function to set current date
    function setCurrentDate() {
        const now = new Date();
        const months = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

        const dayInput = document.getElementById('day');
        const monthInput = document.getElementById('month');
        const yearInput = document.getElementById('year');

        if (dayInput) {
            dayInput.value = now.getDate();
            updatePreview('day', dayInput.value);
        }
        if (monthInput) {
            monthInput.value = months[now.getMonth()];
            updatePreview('month', monthInput.value);
        }
        if (yearInput) {
            yearInput.value = now.getFullYear();
            updatePreview('year', yearInput.value);
        }
    }

    // Initialize with default values
    Object.keys(fieldMapping).forEach(fieldId => {
        const input = document.getElementById(fieldId);
        if (input) {
            updatePreview(fieldId, input.value);

            // Add event listeners for real-time updates
            input.addEventListener('input', (e) => {
                let val = e.target.value;

                // Capitalize text inputs automatically
                if (input.tagName !== 'SELECT' && input.type !== 'number') {
                    val = val.toUpperCase();
                    e.target.value = val;
                }

                updatePreview(fieldId, val);
            });
        }
    });

    setCurrentDate();

    // Handle Month selection specially if needed (already handled by textContent)

    // History Management
    let certificateHistory = JSON.parse(localStorage.getItem('cert_history') || '[]');

    function saveToHistory() {
        const patientName = document.getElementById('patient_name').value;
        if (!patientName) return;

        const certData = {};
        // Save all mapped fields
        Object.keys(fieldMapping).forEach(fieldId => {
            certData[fieldId] = document.getElementById(fieldId).value;
        });
        // Also save internal fields not in mapping
        certData['imss_registered'] = document.getElementById('imss_registered').value;

        certData.timestamp = new Date().toLocaleString();

        // Avoid duplicates (by folio)
        certificateHistory = certificateHistory.filter(c => c.folio !== certData.folio);
        certificateHistory.unshift(certData); // Add to start

        // Keep only last 10
        if (certificateHistory.length > 10) certificateHistory.pop();

        localStorage.setItem('cert_history', JSON.stringify(certificateHistory));
        if (window.saveHistory) window.saveHistory(); // Disparar Cloud Sync si existe
        renderHistory();
    }

    function renderHistory() {
        const list = document.getElementById('historyList');
        if (certificateHistory.length === 0) {
            list.innerHTML = '<p class="empty-msg">No hay certificados guardados aún.</p>';
            return;
        }

        list.innerHTML = certificateHistory.map((cert, index) => `
            <div class="history-item" data-index="${index}">
                <div class="history-info" onclick="window.loadCert(${index})">
                    <span class="patient-name">
                        ${cert.patient_name || 'Sin nombre'}
                        ${cert.imss_registered === 'SI' ? '<span class="hist-badge" title="IMSS Bienestar Registrado">✓ IMSS</span>' : ''}
                    </span>
                    <span class="date-folio">Folio: ${cert.folio} | ${cert.timestamp}</span>
                </div>
                <button class="btn-delete-hist" onclick="window.deleteCert(${index})" title="Eliminar de historial">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `).join('');

        // Global functions for the inline onclick handlers
        window.loadCert = (index) => {
            loadFromHistory(certificateHistory[index]);
        };

        window.deleteCert = (index) => {
            if (confirm('¿Estás seguro de que deseas eliminar este certificado del historial?')) {
                certificateHistory.splice(index, 1);
                localStorage.setItem('cert_history', JSON.stringify(certificateHistory));
                if (window.saveHistory) window.saveHistory();
                renderHistory();
            }
        };
    }

    function loadFromHistory(cert) {
        Object.keys(cert).forEach(fieldId => {
            const input = document.getElementById(fieldId);
            if (input && fieldId !== 'timestamp') {
                input.value = cert[fieldId];
                updatePreview(fieldId, cert[fieldId]);
            }
        });

        // Ensure the doctor select is reset if the data was changed
        document.getElementById('doctor_select').value = "";
    }

    // Print functionality
    printBtn.addEventListener('click', () => {
        saveToHistory();
        window.print();
    });

    // Initial render
    renderHistory();

    // Doctor Management
    let savedDoctors = JSON.parse(localStorage.getItem('saved_doctors') || '[]');

    function saveDoctor() {
        const name = document.getElementById('doctor_name').value.toUpperCase();
        const cedula = document.getElementById('cedula').value.toUpperCase();
        const area = document.getElementById('doctor_area').value;
        const healthCenter = document.getElementById('health_center').value.toUpperCase();
        const coordinator = document.getElementById('coordinator').value.toUpperCase();

        if (!name) return;

        const doctorData = { name, cedula, area, healthCenter, coordinator };

        // Update if exists (by license/cedula)
        savedDoctors = savedDoctors.filter(d => d.cedula !== cedula);
        savedDoctors.push(doctorData);

        localStorage.setItem('saved_doctors', JSON.stringify(savedDoctors));
        if (window.saveDoctors) window.saveDoctors();
        renderDoctorSelect();
        alert('Datos del médico guardados correctamente.');
    }

    function renderDoctorSelect() {
        const select = document.getElementById('doctor_select');
        const currentValue = select.value;

        select.innerHTML = '<option value="">-- Nuevo Médico --</option>' +
            savedDoctors.map((doc, index) => `
                <option value="${index}">${doc.name} (${doc.cedula})</option>
            `).join('');

        select.value = currentValue;
    }

    // Función para borrar médico actual
    window.deleteCurrentDoctor = () => {
        const select = document.getElementById('doctor_select');
        const index = select.value;
        if (index === "") {
            alert("Selecciona un médico guardado de la lista primero.");
            return;
        }

        if (confirm(`¿Estás seguro de que deseas eliminar al médico ${savedDoctors[index].name} de la lista?`)) {
            savedDoctors.splice(index, 1);
            localStorage.setItem('saved_doctors', JSON.stringify(savedDoctors));
            if (window.saveDoctors) window.saveDoctors();
            renderDoctorSelect();
            select.value = "";

            // Limpiar campos del médico
            document.getElementById('doctor_name').value = "";
            document.getElementById('cedula').value = "";
            document.getElementById('doctor_area').value = "";

            alert('Médico eliminado.');
        }
    };

    document.getElementById('saveDoctorBtn').addEventListener('click', saveDoctor);

    document.getElementById('doctor_select').addEventListener('change', (e) => {
        const index = e.target.value;
        if (index === "") return;

        const doc = savedDoctors[index];
        document.getElementById('doctor_name').value = doc.name;
        document.getElementById('cedula').value = doc.cedula;
        document.getElementById('doctor_area').value = doc.area || "";
        document.getElementById('health_center').value = doc.healthCenter;
        document.getElementById('coordinator').value = doc.coordinator;

        // Trigger updates for preview
        updatePreview('doctor_name', doc.name);
        updatePreview('cedula', doc.cedula);
        updatePreview('doctor_area', doc.area || "");
        updatePreview('health_center', doc.healthCenter);
        updatePreview('coordinator', doc.coordinator);
    });

    renderDoctorSelect();

    // One-time Setup Logic
    const config = JSON.parse(localStorage.getItem('unit_config'));
    const setupModal = document.getElementById('setupModal');
    const setupForm = document.getElementById('setupForm');

    function applyConfig(data) {
        document.getElementById('unidad_codigo').value = data.clues;
        document.getElementById('health_center').value = data.unitName;
        document.getElementById('coordinator').value = data.coordinator;
        document.getElementById('city').value = data.city;
        document.getElementById('state').value = data.state;

        // Update Preview
        updatePreview('unidad_codigo', data.clues);
        updatePreview('health_center', data.unitName);
        updatePreview('coordinator', data.coordinator);
        updatePreview('city', data.city);
        updatePreview('state', data.state);
    }

    if (!config) {
        setupModal.style.display = 'flex';
    } else {
        applyConfig(config);
    }

    setupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = {
            unitName: document.getElementById('setup_unit_name').value.toUpperCase(),
            clues: document.getElementById('setup_clues').value.toUpperCase(),
            coordinator: document.getElementById('setup_coordinator').value.toUpperCase(),
            city: document.getElementById('setup_city').value.toUpperCase(),
            state: document.getElementById('setup_state').value.toUpperCase()
        };
        const newPass = document.getElementById('setup_password').value;
        if (newPass) {
            systemPassword = newPass;
            localStorage.setItem('system_password', newPass);
        }

        // Firebase Config
        const fbConfigText = document.getElementById('fb_config').value;
        if (fbConfigText) {
            try {
                const fbConfig = JSON.parse(fbConfigText);
                localStorage.setItem('fb_config', fbConfigText);
                initFirebase(fbConfig);
            } catch (err) {
                alert("La configuración de Firebase no es un JSON válido.");
            }
        }

        localStorage.setItem('unit_config', JSON.stringify(data));
        applyConfig(data);
        setupModal.style.display = 'none';
        if (isCloudEnabled) saveConfigToCloud(data);
    });

    // Edit Config Button functionality
    document.getElementById('editConfigBtn').addEventListener('click', () => {
        const currentConfig = JSON.parse(localStorage.getItem('unit_config'));
        if (currentConfig) {
            document.getElementById('setup_unit_name').value = currentConfig.unitName;
            document.getElementById('setup_clues').value = currentConfig.clues;
            document.getElementById('setup_coordinator').value = currentConfig.coordinator;
            document.getElementById('setup_city').value = currentConfig.city;
            document.getElementById('setup_state').value = currentConfig.state;
            document.getElementById('setup_password').value = systemPassword;
            document.getElementById('fb_config').value = localStorage.getItem('fb_config') || JSON.stringify(DEFAULT_FB_CONFIG, null, 2);
        }
        setupModal.style.display = 'flex';
    });

    // New Patient functionality (Updated to keep unit config)
    const newBtn = document.getElementById('newBtn');
    newBtn.addEventListener('click', () => {
        // Increment Folio
        const folioInput = document.getElementById('folio');
        const currentFolio = parseInt(folioInput.value) || 0;
        folioInput.value = currentFolio + 1;
        updatePreview('folio', folioInput.value);

        // Clear Patient Fields
        const fieldsToClear = ['patient_name', 'curp', 'sex', 'age', 'blood_group', 'rh_factor', 'allergies', 'observations', 'doctor_area', 'imss_registered'];
        fieldsToClear.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                if (input.tagName === 'SELECT') {
                    input.selectedIndex = 0;
                } else {
                    input.value = '';
                }
                // Only update preview if it exists in mapping
                if (fieldMapping[id]) {
                    updatePreview(id, input.value);
                }
            }
        });

        // Re-apply unit config as safety
        const currentConfig = JSON.parse(localStorage.getItem('unit_config'));
        if (currentConfig) applyConfig(currentConfig);

        document.getElementById('patient_name').focus();
    });

    // Data Export/Import Logic
    document.getElementById('exportDataBtn').addEventListener('click', () => {
        const data = {
            unit_config: JSON.parse(localStorage.getItem('unit_config')),
            saved_doctors: JSON.parse(localStorage.getItem('saved_doctors')),
            cert_history: JSON.parse(localStorage.getItem('cert_history'))
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `respaldo_certificados_${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('importDataBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.unit_config) localStorage.setItem('unit_config', JSON.stringify(data.unit_config));
                if (data.saved_doctors) localStorage.setItem('saved_doctors', JSON.stringify(data.saved_doctors));
                if (data.cert_history) localStorage.setItem('cert_history', JSON.stringify(data.cert_history));

                alert('¡Datos importados con éxito! La aplicación se reiniciará para aplicar los cambios.');
                window.location.reload();
            } catch (err) {
                alert('Error: El archivo no es un respaldo válido.');
            }
        };
        reader.readAsText(file);
    });

    // --- SISTEMA DE PROCESAMIENTO DE TEXTO (REUTILIZABLE) ---
    function processAutoFill(text) {
        if (!text) return 0;

        let data = {};
        // Intentar parsear como JSON primero (formato AI)
        try {
            data = JSON.parse(text);
        } catch (e) {
            // Parseo por RegEx (Texto Natural / OCR)
            const patterns = {
                doctor_name: /(?:médico|doctor|dr\.?|certificante)[:\s]+([a-z\sÁÉÍÓÚÑ]+)/i,
                patient_name: /(?:nombre|paciente|C\.)[:\s]+([a-z\sÁÉÍÓÚÑ]+)/i,
                curp: /CURP[:\s]+([A-Z0-9]{18}|[A-Z0-9]{10,})/i,
                age: /(?:edad|años)[:\s]+(\d+)/i,
                sex: /(?:sexo|genero)[:\s]+(FEMENINO|MASCULINO|MUJER|HOMBRE|F|M)/i,
                blood_group: /(?:grupo|sanguíneo|tipo)[:\s]+(A|B|AB|O|0)/i,
                rh_factor: /(?:rh|factor)[:\s]+(\+|pos|-|neg)/i,
                allergies: /(?:alergias|alérgico)[:\s]+([a-z\sÁÉÍÓÚÑ]+)/i
            };

            Object.keys(patterns).forEach(key => {
                const match = text.match(patterns[key]);
                if (match && match[1]) {
                    let val = match[1].trim();
                    if (key === 'sex') {
                        if (val.startsWith('F') || val.toUpperCase() === 'MUJER') val = 'FEMENINO';
                        if (val.startsWith('M') || val.toUpperCase() === 'HOMBRE') val = 'MASCULINO';
                    }
                    if (key === 'rh_factor') {
                        if (val.includes('+') || val.toLowerCase().includes('pos')) val = 'POSITIVO';
                        if (val.includes('-') || val.toLowerCase().includes('neg')) val = 'NEGATIVO';
                    }
                    if (key === 'blood_group' && val === '0') val = 'O';
                    data[key] = val;
                }
            });
        }

        const fields = ['doctor_name', 'cedula', 'doctor_area', 'patient_name', 'curp', 'sex', 'age', 'blood_group', 'rh_factor', 'allergies'];
        let filledCount = 0;
        fields.forEach(id => {
            if (data[id] !== undefined) {
                const el = document.getElementById(id);
                if (el) {
                    el.value = data[id].toString().toUpperCase();
                    updatePreview(id, el.value);
                    filledCount++;
                }
            }
        });
        return filledCount;
    }

    // --- OPCIÓN 1: PEGADO INTELIGENTE (PORTAPAPELES) ---
    const smartPasteBtn = document.getElementById('smartPasteBtn');
    smartPasteBtn.addEventListener('click', async () => {
        try {
            let text = "";
            try { text = await navigator.clipboard.readText(); } catch (err) { }
            if (!text) text = prompt("Pega aquí el texto que copiaste de la foto (Google Lens / OCR):");
            if (!text) return;

            const filled = processAutoFill(text);
            if (filled > 0) alert(`¡Éxito! Se llenaron ${filled} campos.`);
            else alert('No se encontraron datos claros en el texto.');
        } catch (err) { alert('Error al procesar el texto.'); }
    });

    // --- OPCIÓN 2: ESCANEAR FOTO (OCR DIRECTO) ---
    const uploadImageBtn = document.getElementById('uploadImageBtn');
    const imageInput = document.getElementById('imageInput');

    uploadImageBtn.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const originalBtnText = uploadImageBtn.innerHTML;
        uploadImageBtn.disabled = true;
        uploadImageBtn.innerHTML = '<span class="spinner"></span> Escaneando...';

        try {
            // Usamos Tesseract.js para leer la imagen
            const result = await Tesseract.recognize(file, 'spa', {
                logger: m => console.log(m)
            });

            const text = result.data.text;
            console.log("Texto detectado:", text);

            const filled = processAutoFill(text);

            if (filled > 0) {
                alert(`¡Escaneo completo! Se detectaron y llenaron ${filled} campos automáticamente.`);
            } else {
                alert('No logré identificar datos en la foto. Asegúrate de que la imagen sea clara y tenga buena iluminación.');
            }
        } catch (error) {
            console.error(error);
            alert('Hubo un error al procesar la imagen. Intenta con una foto más clara.');
        } finally {
            uploadImageBtn.disabled = false;
            uploadImageBtn.innerHTML = originalBtnText;
            imageInput.value = ""; // Limpiar para permitir subir la misma foto
        }
    });

    // --- SISTEMA DE REPORTE ---
    const viewReportBtn = document.getElementById('viewReportBtn');
    const reportModal = document.getElementById('reportModal');
    const reportTableBody = document.getElementById('reportTableBody');

    viewReportBtn.addEventListener('click', () => {
        const config = JSON.parse(localStorage.getItem('unit_config')) || {};
        document.getElementById('repUnitName').textContent = config.unitName || 'UNIDAD DE SALUD';
        document.getElementById('repClues').textContent = `CLUES: ${config.clues || '-'}`;
        document.getElementById('repLocation').textContent = `Ubicación: ${config.city || '-'}, ${config.state || '-'}`;

        // Ordenar historial: más reciente primero
        const sortedHistory = [...certificateHistory].reverse();

        reportTableBody.innerHTML = sortedHistory.length === 0
            ? '<tr><td colspan="4" style="text-align:center; padding: 20px;">No hay datos en el historial</td></tr>'
            : sortedHistory.map(cert => `
                <tr>
                    <td>${cert.timestamp || '-'}</td>
                    <td style="font-weight: bold;">${cert.folio || '-'}</td>
                    <td>${cert.patient_name || '-'}</td>
                    <td style="font-size: 0.85rem;">${cert.doctor_name || '-'}</td>
                </tr>
            `).join('');

        reportModal.style.display = 'flex';
    });

    // --- FUNCIONES DE SINCRONIZACIÓN CLOUD ---
    async function saveConfigToCloud(data) {
        if (!isCloudEnabled) return;
        try {
            await db.collection('config').doc('unit').set(data);
        } catch (e) { console.error("Error al guardar config en la nube:", e); }
    }

    async function syncFromCloud() {
        if (!isCloudEnabled) return;
        try {
            // Sincronizar Configuración
            const configDoc = await db.collection('config').doc('unit').get();
            if (configDoc.exists) {
                const cloudConfig = configDoc.data();
                localStorage.setItem('unit_config', JSON.stringify(cloudConfig));
                applyConfig(cloudConfig);
            }

            // Sincronizar Médicos
            const doctorsDoc = await db.collection('doctors').doc('list').get();
            if (doctorsDoc.exists) {
                const cloudDoctors = doctorsDoc.data().items || [];
                localStorage.setItem('saved_doctors', JSON.stringify(cloudDoctors));
                savedDoctors.length = 0;
                savedDoctors.push(...cloudDoctors);
                renderDoctorSelect();
            }

            // Sincronizar Historial
            const historyDoc = await db.collection('history').doc('certificates').get();
            if (historyDoc.exists) {
                const cloudHistory = historyDoc.data().items || [];
                localStorage.setItem('cert_history', JSON.stringify(cloudHistory));
                certificateHistory.length = 0;
                certificateHistory.push(...cloudHistory);
                renderHistory();
            }
            console.log("✅ Datos sincronizados con la nube");
        } catch (e) { console.error("Error al sincronizar desde la nube:", e); }
    }

    async function saveHistoryToCloud() {
        if (!isCloudEnabled) return;
        try {
            await db.collection('history').doc('certificates').set({ items: certificateHistory });
        } catch (e) { console.error("Error al guardar historial en la nube:", e); }
    }

    async function saveDoctorsToCloud() {
        if (!isCloudEnabled) return;
        try {
            await db.collection('doctors').doc('list').set({ items: savedDoctors });
        } catch (e) { console.error("Error al guardar médicos en la nube:", e); }
    }

    // Interceptar guardados locales para disparar cloud
    const originalSaveHistory = () => localStorage.setItem('cert_history', JSON.stringify(certificateHistory));
    const originalSaveDoctors = () => localStorage.setItem('saved_doctors', JSON.stringify(savedDoctors));

    // Refactorizar los puntos de guardado en el código existente
    window.saveHistory = () => {
        originalSaveHistory();
        if (isCloudEnabled) saveHistoryToCloud();
    };

    window.saveDoctors = () => {
        originalSaveDoctors();
        if (isCloudEnabled) saveDoctorsToCloud();
    };
});
