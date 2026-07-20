// CANTV Investigation System App Logic

// --- Constants & Config ---
const ROLES = {
    GERENTE: 'Gerente',
    COORD: 'Coordinador',
    SUPER: 'Supervisor',
    ESP: 'Especialista'
};

const ESTADOS = {
    RECEPCION: 'Recepción e Ingesta',
    APERTURA: 'Apertura y Codificación',
    ASIGNACION: 'Asignación y Distribución',
    SUSTANCIACION: 'Sustanciación y Recolección',
    REVISION: 'Revisión Legal y Aprobación',
    ARCHIVO: 'Archivo y Custodia Final'
};

const CRITICIDAD = {
    BAJA: 'Baja',
    MEDIA: 'Media',
    ALTA: 'Alta'
};

// Mock Users
const MOCK_USERS = [
    { username: 'gerente', password: '123', role: ROLES.GERENTE, name: 'Carlos Pérez', isActive: true },
    { username: 'coord', password: '123', role: ROLES.COORD, name: 'Ana Gómez', isActive: true },
    { username: 'admin', password: '123', role: ROLES.SUPER, name: 'Luis Martínez', isActive: true },
    { username: 'esp1', password: '123', role: ROLES.ESP, name: 'Especialista 1', isActive: true },
    { username: 'esp2', password: '123', role: ROLES.ESP, name: 'Especialista 2', isActive: true }
];

// --- State Management ---
let currentUser = null;
let systemUsers = [];
let cases = [];

function initDB() {
    try {
        const storedUsers = localStorage.getItem('cantv_users');
        if (!storedUsers) {
            systemUsers = JSON.parse(JSON.stringify(MOCK_USERS));
            localStorage.setItem('cantv_users', JSON.stringify(systemUsers));
        } else {
            systemUsers = JSON.parse(storedUsers);
            // Ensure isActive exists on older records
            systemUsers.forEach(u => {
                if (u.isActive === undefined) u.isActive = true;
            });
        }

        const storedCases = localStorage.getItem('cantv_cases');
        if (storedCases) {
            cases = JSON.parse(storedCases);
            if (!Array.isArray(cases)) throw new Error('Cases is not an array');
        } else {
            cases = [];
            saveCases();
        }
    } catch (e) {
        console.error('Error loading DB, resetting data:', e);
        systemUsers = JSON.parse(JSON.stringify(MOCK_USERS));
        localStorage.setItem('cantv_users', JSON.stringify(systemUsers));
        cases = [];
        saveCases();
    }
}

function saveCases() {
    localStorage.setItem('cantv_cases', JSON.stringify(cases));
}

function saveUsers() {
    localStorage.setItem('cantv_users', JSON.stringify(systemUsers));
}

function generateCaseId() {
    const count = cases.length + 1;
    return `INV-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;
}

// --- Utilities ---
function showToast(title, message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-title">${title}</div>
        <div class="toast-msg">${message}</div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentElement) toast.remove();
    }, 5000);
}

function renderBadge(text) {
    let type = 'neutral';
    if(text === CRITICIDAD.BAJA) type = 'low';
    if(text === CRITICIDAD.MEDIA) type = 'med';
    if(text === CRITICIDAD.ALTA) type = 'high';
    return `<span class="badge badge-${type}">${text}</span>`;
}

// --- Navigation & Routing ---
function navigate(viewName, params = null) {
    const app = document.getElementById('app');
    
    if (viewName === 'login') {
        app.innerHTML = renderLoginView();
        return;
    }

    // Main layout with Sidebar
    app.innerHTML = `
        <div class="main-layout view-enter">
            <aside class="sidebar">
                <h2 class="text-2xl font-black mb-2 text-gradient-fuchsia">CANTV</h2>
                <p class="text-sm text-secondary mb-8">Sistema de Investigaciones</p>
                
                <div class="glass-card mb-4" style="padding: 1rem;">
                    <p class="text-xs text-muted uppercase">Usuario actual</p>
                    <p class="font-bold text-lg">${currentUser.name}</p>
                    <p class="text-xs text-fuchsia">${currentUser.role}</p>
                </div>

                <nav class="sidebar-nav">
                    <a class="nav-item ${viewName === 'dashboard' ? 'active' : ''}" onclick="navigate('dashboard')">
                        Dashboard
                    </a>
                    <a class="nav-item ${viewName === 'cases' || viewName === 'case-detail' ? 'active' : ''}" onclick="navigate('cases')">
                        Expedientes
                    </a>
                    ${[ROLES.GERENTE, ROLES.COORD, ROLES.SUPER].includes(currentUser.role) ? `
                    <a class="nav-item ${viewName === 'create' ? 'active' : ''}" onclick="navigate('create')">
                        Nuevo Caso
                    </a>
                    ` : ''}
                    ${[ROLES.GERENTE, ROLES.SUPER].includes(currentUser.role) ? `
                    <a class="nav-item ${viewName === 'users' ? 'active' : ''}" onclick="navigate('users')">
                        Usuarios
                    </a>
                    ` : ''}
                </nav>

                <div class="mt-auto">
                    <button onclick="logout()" class="btn btn-secondary w-full">Cerrar Sesión</button>
                </div>
            </aside>
            
            <main class="content-area" id="main-content"></main>
        </div>
    `;

    const mainContent = document.getElementById('main-content');
    
    if (viewName === 'dashboard') mainContent.innerHTML = renderDashboard();
    else if (viewName === 'cases') mainContent.innerHTML = renderCaseList();
    else if (viewName === 'create') mainContent.innerHTML = renderCreateCase();
    else if (viewName === 'case-detail') mainContent.innerHTML = renderCaseDetail(params.id);
    else if (viewName === 'users') mainContent.innerHTML = renderUserList();
}

// --- Auth ---
function login(e) {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value; // In a real app this is hashed/encrypted
    
    const found = systemUsers.find(u => u.username === user && u.password === pass);
    
    if (found) {
        if (found.isActive === false) {
            alert('Usuario inactivo. Contacte al administrador.');
            return;
        }
        currentUser = found;
        navigate('dashboard');
        showToast('Acceso Concedido', `Bienvenido, ${found.name}`);
    } else {
        alert('Credenciales incorrectas');
    }
}

function logout() {
    currentUser = null;
    navigate('login');
}

// --- Views ---
function renderLoginView() {
    return `
        <div class="flex items-center justify-center h-screen w-full">
            <div class="glass-card w-full max-w-md p-10 text-center view-enter">
                <h1 class="text-4xl font-black mb-2 text-gradient-fuchsia">CANTV</h1>
                <p class="text-secondary mb-8">Portal de Investigaciones</p>
                
                <form onsubmit="login(event)" class="space-y-4">
                    <input type="text" id="username" placeholder="Usuario" class="input-field" required>
                    <input type="password" id="password" placeholder="Contraseña" class="input-field" required>
                    <button type="submit" class="btn btn-primary w-full mt-4 py-3 text-lg">Acceder al Sistema</button>
                </form>
                
                <div class="mt-8 text-xs text-muted">
                    Usuarios demo: gerente, coord, admin, esp1 (Pass: 123)
                </div>
            </div>
        </div>
    `;
}

function renderDashboard() {
    const totalCases = cases.length;
    const openCases = cases.filter(c => c.estado !== ESTADOS.ARCHIVO).length;
    const closedCases = cases.filter(c => c.estado === ESTADOS.ARCHIVO).length;
    const myCases = cases.filter(c => c.asignadoA === currentUser.username).length;

    return `
        <div class="view-enter">
            <h1 class="text-3xl font-bold mb-2">Dashboard Estadístico</h1>
            <p class="text-secondary mb-8">Resumen mensual de operaciones e indicadores.</p>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Total Casos Registrados</div>
                    <div class="stat-value">${totalCases}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Casos Activos</div>
                    <div class="stat-value">${openCases}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Casos Archivados</div>
                    <div class="stat-value">${closedCases}</div>
                </div>
                ${currentUser.role === ROLES.ESP ? `
                <div class="stat-card">
                    <div class="stat-label">Mis Casos Asignados</div>
                    <div class="stat-value text-gradient-fuchsia">${myCases}</div>
                </div>
                ` : ''}
            </div>

            <h2 class="text-xl font-bold mb-4">Reporte de Tiempos (Simulado)</h2>
            <div class="glass-card">
                <p class="text-secondary text-sm">Este panel genera reportes estadísticos mensuales sobre el tiempo de resolución de casos por especialista, tal como lo exige el requerimiento funcional 5.</p>
                <div style="height: 200px; display: flex; align-items: flex-end; gap: 2rem; margin-top: 2rem; padding-bottom: 1rem; border-bottom: 1px solid var(--glass-border);">
                    <div style="flex:1; background: var(--cantv-blue-light); height: 60%; border-radius: 4px 4px 0 0; position:relative;">
                        <span style="position:absolute; top:-25px; left:50%; transform:translateX(-50%); font-size:12px;">esp1 (4 días)</span>
                    </div>
                    <div style="flex:1; background: var(--cantv-fuchsia); height: 85%; border-radius: 4px 4px 0 0; position:relative;">
                        <span style="position:absolute; top:-25px; left:50%; transform:translateX(-50%); font-size:12px;">esp2 (6 días)</span>
                    </div>
                    <div style="flex:1; background: var(--status-high); height: 40%; border-radius: 4px 4px 0 0; position:relative;">
                        <span style="position:absolute; top:-25px; left:50%; transform:translateX(-50%); font-size:12px;">Promedio (3 días)</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderCaseList() {
    let html = `
        <div class="view-enter">
            <div class="flex justify-between items-center mb-8">
                <div>
                    <h1 class="text-3xl font-bold mb-2">Expedientes</h1>
                    <p class="text-secondary">Consulta y Trazabilidad de los casos activos e inactivos.</p>
                </div>
                ${[ROLES.GERENTE, ROLES.COORD, ROLES.SUPER].includes(currentUser.role) ? 
                `<button onclick="navigate('create')" class="btn btn-primary">Crear Expediente</button>` : ''}
            </div>
            
            <div class="glass-card p-0 overflow-hidden">
                <table class="table-container m-0">
                    <thead>
                        <tr class="table-header">
                            <th>Ticket</th>
                            <th>Criticidad</th>
                            <th>Estado Actual</th>
                            <th>Asignado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    if (cases.length === 0) {
        html += `<tr><td colspan="5" class="text-center text-secondary py-8">No hay casos registrados en el sistema.</td></tr>`;
    } else {
        cases.forEach(c => {
            html += `
                <tr class="table-row">
                    <td class="font-bold text-gradient-fuchsia">${c.id}</td>
                    <td>${renderBadge(c.criticidad)}</td>
                    <td class="text-sm">${c.estado}</td>
                    <td class="text-sm">${c.asignadoA ? c.asignadoA : '<span class="text-muted italic">Sin asignar</span>'}</td>
                    <td>
                        <button onclick="navigate('case-detail', {id: '${c.id}'})" class="btn btn-secondary text-xs py-1 px-3">Ver Detalle</button>
                    </td>
                </tr>
            `;
        });
    }

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    return html;
}

function renderCreateCase() {
    return `
        <div class="view-enter">
            <h1 class="text-3xl font-bold mb-2">Recepción e Ingesta</h1>
            <p class="text-secondary mb-8">Registro de nueva denuncia o solicitud.</p>

            <div class="glass-card max-w-3xl">
                <form id="createForm" onsubmit="createCase(event)" class="form-grid">
                    <div class="form-group full-width">
                        <label class="form-label">Asunto / Resumen</label>
                        <input type="text" id="asunto" class="input-field" required placeholder="Ej: Reporte de fraude en oficina principal">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Criticidad (Obligatorio)</label>
                        <select id="criticidad" class="input-field" required>
                            <option value="">Seleccione criticidad...</option>
                            <option value="${CRITICIDAD.BAJA}">Baja</option>
                            <option value="${CRITICIDAD.MEDIA}">Media</option>
                            <option value="${CRITICIDAD.ALTA}">Alta</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Origen</label>
                        <select id="origen" class="input-field" required>
                            <option value="Interno">Dependencia Interna</option>
                            <option value="Externo">Ente Externo</option>
                        </select>
                    </div>

                    <div class="form-group full-width mt-4">
                        <button type="submit" class="btn btn-primary py-3">Registrar Caso</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function createCase(e) {
    e.preventDefault();
    const asunto = document.getElementById('asunto').value;
    const criticidad = document.getElementById('criticidad').value;
    const origen = document.getElementById('origen').value;

    const newCase = {
        id: generateCaseId(),
        asunto,
        criticidad,
        origen,
        estado: ESTADOS.RECEPCION,
        asignadoA: null,
        creadoEl: new Date().toISOString(),
        historial: [
            { fecha: new Date().toISOString(), estado: ESTADOS.RECEPCION, user: currentUser.name, notas: 'Ingesta inicial del caso.' }
        ]
    };

    cases.push(newCase);
    saveCases();
    showToast('Caso Creado', `El ticket ${newCase.id} fue registrado en Recepción.`);
    navigate('cases');
}

function renderCaseDetail(id) {
    const c = cases.find(x => x.id === id);
    if(!c) return '<p>Caso no encontrado</p>';

    const steps = Object.values(ESTADOS);
    const currentIndex = steps.indexOf(c.estado);

    let html = `
        <div class="view-enter flex gap-8">
            <div class="flex-1">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <h1 class="text-3xl font-bold text-gradient-fuchsia">${c.id}</h1>
                        <p class="text-secondary mt-1">${c.asunto}</p>
                    </div>
                    ${renderBadge(c.criticidad)}
                </div>

                <div class="glass-card mb-6">
                    <h3 class="text-lg font-bold mb-4">Información General</h3>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div><span class="text-muted">Origen:</span> ${c.origen}</div>
                        <div><span class="text-muted">Especialista Asignado:</span> ${c.asignadoA ? c.asignadoA : 'Ninguno'}</div>
                        <div><span class="text-muted">Fecha Creación:</span> ${new Date(c.creadoEl).toLocaleString()}</div>
                    </div>
                </div>

                <div class="glass-card">
                    <h3 class="text-lg font-bold mb-4">Acciones de Procedimiento</h3>
                    ${renderActionPanel(c)}
                </div>
            </div>

            <div class="w-80">
                <h3 class="text-lg font-bold mb-4 px-2">Trazabilidad del Expediente</h3>
                <div class="timeline">
                    ${steps.map((step, index) => {
                        const isCompleted = index <= currentIndex;
                        return `
                            <div class="timeline-item ${isCompleted ? 'completed' : ''}">
                                <div class="timeline-content" style="opacity: ${isCompleted ? '1' : '0.5'};">
                                    <h4 class="font-bold text-sm">${step}</h4>
                                    ${isCompleted && index === currentIndex ? '<p class="text-xs text-fuchsia mt-1">Estado Actual</p>' : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;

    return html;
}

function renderActionPanel(c) {
    if (c.estado === ESTADOS.RECEPCION) {
        if ([ROLES.COORD, ROLES.SUPER, ROLES.GERENTE].includes(currentUser.role)) {
            return `
                <p class="text-sm text-secondary mb-4">El expediente físico debe ser aperturado y recibir codificación.</p>
                <button onclick="advanceState('${c.id}', '${ESTADOS.APERTURA}', 'Apertura y organización inicial de folios.')" class="btn btn-primary">Aperturar y Codificar</button>
            `;
        }
        return `<p class="text-sm text-muted">Esperando Apertura por Coordinación/Supervisión.</p>`;
    }
    
    if (c.estado === ESTADOS.APERTURA) {
        if ([ROLES.COORD].includes(currentUser.role)) {
            return `
                <p class="text-sm text-secondary mb-4">Requiere asignación a un Especialista (máx 4 pasos UI).</p>
                <div class="flex gap-4">
                    <select id="assignUser" class="input-field" style="width:200px;">
                        <option value="esp1">Especialista 1 (esp1)</option>
                        <option value="esp2">Especialista 2 (esp2)</option>
                    </select>
                    <button onclick="assignCase('${c.id}')" class="btn btn-primary">Asignar Especialista</button>
                </div>
            `;
        }
        return `<p class="text-sm text-muted">Esperando asignación por el Coordinador.</p>`;
    }

    if (c.estado === ESTADOS.ASIGNACION) {
        if (currentUser.username === c.asignadoA || currentUser.role === ROLES.SUPER) {
            return `
                <p class="text-sm text-secondary mb-4">El especialista debe iniciar la recolección de evidencias.</p>
                <button onclick="advanceState('${c.id}', '${ESTADOS.SUSTANCIACION}', 'Inicia recolección de pruebas y trabajo de campo.')" class="btn btn-primary">Iniciar Sustanciación</button>
            `;
        }
        return `<p class="text-sm text-muted">Asignado a ${c.asignadoA}. Esperando que inicie sustanciación.</p>`;
    }

    if (c.estado === ESTADOS.SUSTANCIACION) {
        if (currentUser.username === c.asignadoA || currentUser.role === ROLES.SUPER) {
            return `
                <p class="text-sm text-secondary mb-4">Incorporar pruebas, análisis e informe. Enviar a revisión.</p>
                <button onclick="advanceState('${c.id}', '${ESTADOS.REVISION}', 'Evidencias recolectadas. Se remite para revisión legal.')" class="btn btn-primary">Enviar a Revisión Legal</button>
            `;
        }
        return `<p class="text-sm text-muted">Especialista recolectando evidencias.</p>`;
    }

    if (c.estado === ESTADOS.REVISION) {
        if ([ROLES.GERENTE, ROLES.SUPER].includes(currentUser.role)) {
            return `
                <p class="text-sm text-secondary mb-4">Validación de hallazgos y firma de informes conclusivos.</p>
                <button onclick="advanceState('${c.id}', '${ESTADOS.ARCHIVO}', 'Aprobado. Remitido para custodia final.')" class="btn btn-primary">Aprobar y Enviar a Archivo</button>
            `;
        }
        return `<p class="text-sm text-muted">En revisión legal y gerencial.</p>`;
    }

    if (c.estado === ESTADOS.ARCHIVO) {
        return `<p class="text-green-400 font-bold">✓ Expediente en Archivo y Custodia Final.</p>`;
    }
}

function assignCase(id) {
    const c = cases.find(x => x.id === id);
    const userSelect = document.getElementById('assignUser').value;
    
    c.asignadoA = userSelect;
    c.estado = ESTADOS.ASIGNACION;
    c.historial.push({
        fecha: new Date().toISOString(),
        estado: c.estado,
        user: currentUser.name,
        notas: `Asignado a ${userSelect}`
    });
    
    saveCases();
    
    // Simulate Email Alert 
    showToast('Alerta de Correo (Simulada)', `Se ha enviado un email a ${userSelect} notificando la asignación del caso ${id}.`);
    
    navigate('case-detail', {id});
}

function advanceState(id, newState, nota) {
    const c = cases.find(x => x.id === id);
    c.estado = newState;
    c.historial.push({
        fecha: new Date().toISOString(),
        estado: c.estado,
        user: currentUser.name,
        notas: nota
    });

    saveCases();

    // Simulate Email Alert
    showToast('Alerta de Correo (Simulada)', `Notificando cambio de estado a '${newState}' para el caso ${id}.`);

    navigate('case-detail', {id});
}

function renderUserList() {
    let html = `
        <div class="view-enter">
            <div class="flex justify-between items-center mb-8">
                <div>
                    <h1 class="text-3xl font-bold mb-2">Gestión de Usuarios</h1>
                    <p class="text-secondary">Administración, edición y activación de cuentas.</p>
                </div>
            </div>
            
            <div class="glass-card p-0 overflow-hidden">
                <table class="table-container m-0">
                    <thead>
                        <tr class="table-header">
                            <th>Usuario</th>
                            <th>Nombre</th>
                            <th>Rol</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    systemUsers.forEach(u => {
        const statusBadge = u.isActive !== false ? '<span class="badge badge-low">Activo</span>' : '<span class="badge badge-high">Inactivo</span>';
        const statusText = u.isActive !== false ? 'Desactivar' : 'Activar';
        
        html += `
            <tr class="table-row">
                <td class="font-bold text-gradient-fuchsia">${u.username}</td>
                <td>${u.name}</td>
                <td class="text-sm">${u.role}</td>
                <td>${statusBadge}</td>
                <td>
                    <button onclick="renderEditUserModal('${u.username}')" class="btn btn-secondary text-xs py-1 px-3">Editar</button>
                    <button onclick="toggleUserStatus('${u.username}')" class="btn ${u.isActive !== false ? 'btn-secondary text-xs' : 'btn-primary text-xs'} py-1 px-3 ml-2">${statusText}</button>
                </td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
            <div id="userModalContainer"></div>
        </div>
    `;
    return html;
}

function toggleUserStatus(username) {
    if (currentUser.username === username) {
        alert('No puedes desactivar tu propio usuario.');
        return;
    }
    const user = systemUsers.find(u => u.username === username);
    if (user) {
        user.isActive = user.isActive === false ? true : false;
        saveUsers();
        navigate('users'); // Refresh view
        showToast('Usuario Actualizado', `El usuario ${username} ahora está ${user.isActive ? 'Activo' : 'Inactivo'}`);
    }
}

function renderEditUserModal(username) {
    const user = systemUsers.find(u => u.username === username);
    if (!user) return;
    
    const container = document.getElementById('userModalContainer');
    container.innerHTML = `
        <div class="fixed inset-0 flex items-center justify-center" style="background: rgba(0,0,0,0.6); backdrop-filter: blur(5px); z-index: 1000; position: fixed; top: 0; left: 0; right: 0; bottom: 0;">
            <div class="glass-card max-w-md w-full view-enter relative">
                <button onclick="document.getElementById('userModalContainer').innerHTML=''" class="text-secondary hover:text-white" style="position: absolute; top: 1rem; right: 1rem; background: transparent; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
                <h2 class="text-xl font-bold mb-4">Editar Usuario: ${user.username}</h2>
                <form onsubmit="updateUser(event, '${user.username}')" class="space-y-4">
                    <div class="form-group">
                        <label class="form-label">Nombre Completo</label>
                        <input type="text" id="editName" class="input-field" value="${user.name}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Rol</label>
                        <select id="editRole" class="input-field" required>
                            <option value="${ROLES.GERENTE}" ${user.role === ROLES.GERENTE ? 'selected' : ''}>Gerente</option>
                            <option value="${ROLES.COORD}" ${user.role === ROLES.COORD ? 'selected' : ''}>Coordinador</option>
                            <option value="${ROLES.SUPER}" ${user.role === ROLES.SUPER ? 'selected' : ''}>Supervisor</option>
                            <option value="${ROLES.ESP}" ${user.role === ROLES.ESP ? 'selected' : ''}>Especialista</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Nueva Contraseña</label>
                        <input type="password" id="editPassword" class="input-field" placeholder="(dejar en blanco para no cambiar)">
                    </div>
                    <div class="form-group full-width mt-4 flex gap-4" style="flex-direction: row;">
                        <button type="submit" class="btn btn-primary" style="flex: 1;">Guardar Cambios</button>
                        <button type="button" onclick="document.getElementById('userModalContainer').innerHTML=''" class="btn btn-secondary" style="flex: 1;">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function updateUser(e, username) {
    e.preventDefault();
    const user = systemUsers.find(u => u.username === username);
    if (!user) return;
    
    const newName = document.getElementById('editName').value;
    const newRole = document.getElementById('editRole').value;
    const newPass = document.getElementById('editPassword').value;
    
    user.name = newName;
    user.role = newRole;
    if (newPass.trim() !== '') {
        user.password = newPass;
    }
    
    saveUsers();
    document.getElementById('userModalContainer').innerHTML='';
    navigate('users'); // Refresh view
    showToast('Usuario Actualizado', `Los datos de ${username} se guardaron exitosamente.`);
}

// --- Initialization ---
initDB();
navigate('login');
