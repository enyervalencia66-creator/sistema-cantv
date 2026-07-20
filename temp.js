
// --- INLINE ACTIONS SYSTEM ---
let openRowMenu = null;
function handleRowRightClick(e) {
    e.preventDefault();
    if (openRowMenu) { openRowMenu.classList.remove('open'); openRowMenu = null; }
    const tr = e.target.closest('tr');
    if (!tr) return;
    const menu = tr.querySelector('.row-context-menu');
    if (menu) { menu.classList.add('open'); openRowMenu = menu; }
}
function closeRowMenu(e) {
    e.stopPropagation(); e.preventDefault();
    if (openRowMenu) { openRowMenu.classList.remove('open'); openRowMenu = null; }
}
document.addEventListener('click', (e) => {
    if (openRowMenu && !e.target.closest('.row-context-menu')) {
        openRowMenu.classList.remove('open'); openRowMenu = null;
    }
});
function toggleFavItem(type, id) {
    let item = type === 'solicitud' ? db.solicitudes.find(x => x.id === id) : db.casos.find(x => x.id === id);
    if(!item.favoritos) item.favoritos = [];
    if(item.favoritos.includes(currentUser.username)) item.favoritos = item.favoritos.filter(x => x !== currentUser.username);
    else item.favoritos.push(currentUser.username);
    saveDB();
    if(type === 'solicitud') navigate('solicitud-detail', {id}); else navigate('caso-detail', {id});
}

// --- MODALES DE EDICION (ESTUDIOS/REFERENCIAS) ---
function openEstudioModal(id) {
    document.getElementById('estudioPersonaId').value = id;
    document.getElementById('formEstudio').reset();
    document.getElementById('modal-estudio').classList.remove('hidden');
}

function openReferenciaModal(id) {
    document.getElementById('refPersonaId').value = id;
    document.getElementById('formReferencia').reset();
    document.getElementById('modal-referencia').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    // Formulario de Estudios
    document.getElementById('formEstudio')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSaveEstudio');
        btn.disabled = true; btn.innerText = 'Subiendo al Storage...';
        try {
            const fileInput = document.getElementById('estudioFile');
            let fileBase64 = null; let fileName = null;
            if(fileInput.files.length > 0) {
                fileBase64 = await readFileAsDataURL(fileInput.files[0]);
                fileName = fileInput.files[0].name;
            }
            
            const payload = {
                persona_id: document.getElementById('estudioPersonaId').value,
                titulo: document.getElementById('estudioTitulo').value,
                institucion: document.getElementById('estudioInstitucion').value,
                estado_estudio: document.getElementById('estudioEstado').value,
                fileName, fileBase64
            };
            
            const res = await fetch('/api/expedientes/estudios', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            if(!res.ok) throw new Error('Error al conectar con el servidor.');
            
            document.getElementById('modal-estudio').classList.add('hidden');
            await initDB(); // Refetch DB to show the new data
            const pId = payload.persona_id;
            const currentCedula = db.personas.find(p => p.id == pId)?.cedula;
            if(currentCedula) navigate('expediente-detail', { cedula: currentCedula });
            showToast('Estudio guardado y soporte subido al Storage exitosamente.', 'success');
        } catch (err) {
            alert("Error crítico: " + err.message);
        }
        btn.disabled = false; btn.innerText = 'Subir Archivo y Guardar';
    });

    // Formulario de Referencias
    document.getElementById('formReferencia')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSaveRef');
        btn.disabled = true; btn.innerText = 'Subiendo al Storage...';
        try {
            const fileInput = document.getElementById('refFile');
            let fileBase64 = null; let fileName = null;
            if(fileInput.files.length > 0) {
                fileBase64 = await readFileAsDataURL(fileInput.files[0]);
                fileName = fileInput.files[0].name;
            }
            
            const payload = {
                persona_id: document.getElementById('refPersonaId').value,
                referencia_contacto: document.getElementById('refContacto').value,
                telefono_contacto: document.getElementById('refTelefono').value,
                fecha_inicio: document.getElementById('refInicio').value || null,
                fecha_fin: document.getElementById('refFin').value || null,
                salario: document.getElementById('refSalario').value,
                motivo_egreso: document.getElementById('refMotivo').value,
                fileName, fileBase64
            };
            
            const res = await fetch('/api/expedientes/referencias', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            if(!res.ok) throw new Error('Error al conectar con el servidor.');
            
            document.getElementById('modal-referencia').classList.add('hidden');
            await initDB(); // Refetch DB to show the new data
            const pId = payload.persona_id;
            const currentCedula = db.personas.find(p => p.id == pId)?.cedula;
            if(currentCedula) navigate('expediente-detail', { cedula: currentCedula });
            showToast('Referencia laboral guardada y soporte subido al Storage.', 'success');
        } catch (err) {
            alert("Error crítico: " + err.message);
        }
        btn.disabled = false; btn.innerText = 'Subir Archivo y Guardar';
    });
});
function togglePinItem(type, id) {
    let item = type === 'solicitud' ? db.solicitudes.find(x => x.id === id) : db.casos.find(x => x.id === id);
    if(!item.anclados) item.anclados = [];
    if(item.anclados.includes(currentUser.username)) item.anclados = item.anclados.filter(x => x !== currentUser.username);
    else item.anclados.push(currentUser.username);
    saveDB(); if(type === 'solicitud') navigate('solicitudes'); else navigate('casos');
}
// --- MODAL SYSTEM ---
function createModalUI(contentHTML) {
    return new Promise(resolve => {
        const root = document.getElementById('modalRoot');
        root.innerHTML = `<div style="position:fixed; inset:0; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.65); z-index:9999; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);">
            <div class="glass-card view-enter" style="width:100%; max-width:420px; padding:2rem; box-shadow:0 20px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08);">
                ${contentHTML}
            </div>
        </div>`;
        window.closeModalUI = function(value) { root.innerHTML = ''; resolve(value); };
    });
}
function uiAlert(msg, title='Notificación') {
    return createModalUI(`<h3 class="font-bold text-xl mb-4 text-cantv-fuchsia">${title}</h3><p class="text-secondary mb-6 text-sm">${msg}</p><button class="btn btn-primary w-full" onclick="closeModalUI()">Aceptar</button>`);
}

function showToast(msg, type='success') {
    const existing = document.getElementById('sys-toast');
    if(existing) existing.remove();
    const colors = { success: '#10b981', error: '#ef4444', info: 'var(--cantv-fuchsia)', warning: '#f59e0b' };
    const icons = { success: '<path d="M20 6L9 17l-5-5"/>', error: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/>', warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/>' };
    const toast = document.createElement('div');
    toast.id = 'sys-toast';
    toast.style.cssText = `position:fixed; top:80px; left:50%; transform:translateX(-50%) translateY(-20px); background: rgba(10,15,40,0.97); border:1px solid ${colors[type]}; border-left: 3px solid ${colors[type]}; color:#fff; padding:0.8rem 1.2rem; border-radius:8px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; gap:0.75rem; min-width:280px; max-width:520px; font-family:'Inter',sans-serif; font-size:0.85rem; opacity:0; transition: all 0.35s cubic-bezier(0.175,0.885,0.32,1.275);`;
    toast.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${colors[type]}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[type]}</svg><span style="flex:1; font-weight: 500;">${msg}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1.1rem;padding:0;margin-left:0.5rem">&times;</button>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity='1'; toast.style.transform='translateX(-50%) translateY(0)'; }, 10);
    setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateX(-50%) translateY(-20px)'; setTimeout(()=>toast.remove(),350); }, 4500);
}
async function uiConfirm(msg, title='Confirmación') {
    return await createModalUI(`<h3 class="font-bold text-xl mb-4" style="color: var(--cantv-blue-light);">${title}</h3><p class="text-secondary mb-6 text-sm">${msg}</p><div class="flex gap-2"><button class="btn btn-primary flex-1" onclick="closeModalUI(true)">Sí, continuar</button><button class="btn btn-secondary flex-1" onclick="closeModalUI(false)">Cancelar</button></div>`);
}
async function uiPrompt(msg, title='Entrada requerida', placeholder='') {
    return await createModalUI(`<h3 class="font-bold text-xl mb-4" style="color: var(--cantv-blue-light);">${title}</h3><p class="text-secondary mb-4 text-sm">${msg}</p><input type="text" id="uiPromptInput" class="input-field mb-6" placeholder="${placeholder}"><div class="flex gap-2"><button class="btn btn-primary flex-1" onclick="closeModalUI(document.getElementById('uiPromptInput').value)">Aceptar</button><button class="btn btn-secondary flex-1" onclick="closeModalUI(null)">Cancelar</button></div>`);
}
// --- ROLES & ESTADOS ---
let ROLES = { GERENTE: 'Gerente', COORD: 'Coordinador', SUPER: 'Supervisor', ESP: 'Especialista' };
const CRITICIDAD = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta' };

const ESTADOS_SOLICITUD = {
    REVISION_GERENTE: 'Pendiente de Aprobación Gerencial',
};

const ESTADOS_CASO = {
    PENDIENTE_COORD: 'Planificación (Coordinador)',
    PENDIENTE_SUPER: 'Asignación (Supervisor)',
    PENDIENTE: 'Pendiente (Especialista)',
    SUSTANCIACION: 'Sustanciación',
    REVISION_SUPERVISOR: 'Revisión Supervisor',
    REVISION_COORDINADOR: 'Revisión Coordinador',
    REVISION_GERENCIA: 'Revisión Gerencia',
    CERRADO: 'Cerrado'
};

const MOCK_USERS = [
    { username: 'gerente', password: '123', role: ROLES.GERENTE, name: 'Carlos Pérez', region: 'Nacional' },
    { username: 'coord', password: '123', role: ROLES.COORD, name: 'Ana Gómez', region: 'Capital' },
    { username: 'admin', password: '123', role: ROLES.SUPER, name: 'Luis Martínez', region: 'Capital' },
    { username: 'esp1', password: '123', role: ROLES.ESP, name: 'Especialista 1', region: 'Capital' },
    { username: 'esp2', password: '123', role: ROLES.ESP, name: 'Especialista 2', region: 'Capital' }
];

const CANTV_LOGO_SVG = `<svg viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <polygon id="s" points="0,-3.5 1,-1 3.5,-1 1.4,0.7 2.1,3.5 0,2 -2.1,3.5 -1.4,0.7 -3.5,-1 -1,-1" fill="black" />
    <mask id="star-mask">
      <rect width="100%" height="100%" fill="white" />
      <use href="#s" x="90" y="80" transform="rotate(-15 90 80)" />
      <use href="#s" x="105" y="75" transform="rotate(-10 105 75)" />
      <use href="#s" x="120" y="71" transform="rotate(-5 120 71)" />
      <use href="#s" x="135" y="68" transform="rotate(-2 135 68)" />
      <use href="#s" x="150" y="67" transform="rotate(0 150 67)" />
      <use href="#s" x="165" y="67" transform="rotate(2 165 67)" />
      <use href="#s" x="180" y="69" transform="rotate(5 180 69)" />
      <use href="#s" x="195" y="72" transform="rotate(10 195 72)" />
      <use href="#s" x="210" y="76" transform="rotate(15 210 76)" />
    </mask>
  </defs>
  <text x="150" y="68" font-family="'Arial Black', Impact, sans-serif" font-weight="900" font-size="82" font-style="italic" fill="#ffffff" text-anchor="middle" letter-spacing="-4">cantv</text>
  <g transform="translate(0, 5)">
    <path d="M 40 85 C 100 50, 190 50, 275 75 C 190 60, 100 60, 40 85 Z" fill="#ffffff" />
    <path d="M 35 94 C 100 59, 190 59, 280 84 C 190 69, 100 69, 35 94 Z" fill="#ffffff" mask="url(#star-mask)" />
    <path d="M 30 103 C 100 68, 190 68, 285 93 C 190 78, 100 78, 30 103 Z" fill="#ffffff" />
  </g>
</svg>`;

// --- DB STATE ---
let currentUser = null;
let db = { users: [], solicitudes: [], casos: [], personas: [], notificaciones: [] };
let showNotifModal = false;



async function initDB() {
    try {
        const res = await fetch('/api/db/init');
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        
        // RBAC Tables
        if(data.roles) {
            db.roles = data.roles;
            const gerenteRole = data.roles.find(r => r.name.toLowerCase().includes('gerente'));
            if(gerenteRole) ROLES.GERENTE = gerenteRole.name;
            const coordRole = data.roles.find(r => r.name.toLowerCase().includes('coordinador'));
            if(coordRole) ROLES.COORD = coordRole.name;
            const superRole = data.roles.find(r => r.name.toLowerCase().includes('supervisor'));
            if(superRole) ROLES.SUPER = superRole.name;
            const espRole = data.roles.find(r => r.name.toLowerCase().includes('especialista'));
            if(espRole) ROLES.ESP = espRole.name;
        }
        if(data.permissions) db.permissions = data.permissions;
        if(data.role_has_permissions) db.role_has_permissions = data.role_has_permissions;

        // Map users
        if (data.users && data.users.length > 0) {
            db.users = data.users.map(u => {
                let userRoleName = 'Invitado';
                let roleObj = null;

                if (u.role && db.roles) {
                    // Check if role is an ID (integer/number)
                    if (!isNaN(u.role) && typeof u.role === 'number' || typeof u.role === 'string' && !isNaN(parseInt(u.role))) {
                        roleObj = db.roles.find(r => r.id == u.role);
                        if (roleObj) userRoleName = roleObj.name;
                    } else {
                        // Role is a string name
                        roleObj = db.roles.find(r => r.name.toLowerCase() === String(u.role).toLowerCase());
                        if (roleObj) userRoleName = roleObj.name;
                    }
                }

                // Calculate permissions for this user
                let userPerms = [];
                if(roleObj && db.permissions && db.role_has_permissions) {
                    const permIds = db.role_has_permissions.filter(rhp => rhp.role_id === roleObj.id).map(rhp => rhp.permissions_id);
                    userPerms = db.permissions.filter(p => permIds.includes(p.id)).map(p => p.name);
                }
                
                return {
                    id: u.id || u.username,
                    username: u.username,
                    email: u.email,
                    password: u.password,
                    role: userRoleName, // Store the string name for backward compatibility with UI
                    role_id: roleObj ? roleObj.id : null,
                    permissions: userPerms,
                    name: u.username,
                    region: 'Nacional'
                };
            });
        }

        // Map solicitudes
        if (data.solicitudes) {
            db.solicitudes = data.solicitudes.map(s => {
                let creator = db.users.find(u => u.id === s.solicitante_id || u.username === s.solicitante_id);
                let casoRef = data.investigaciones?.find(inv => inv.numero_ticket === `INV-${s.id}`);
                return {
                    id: s.id,
                    asunto: s.tipo_solicitud,
                    criticidad: s.criticidad || 'Alta',
                    estado: s.estatus,
                    creadoPor: creator ? creator.username : s.solicitante_id,
                    creadoEl: s.created_at,
                    detalle: s.detalle,
                    adjuntos: [s.documento_1, s.documento_2].filter(Boolean),
                    casoGenerado: casoRef ? casoRef.id : null
                };
            });
        }

        // Map casos
        if (data.investigaciones) {
            db.casos = data.investigaciones.map(c => {
                const logs = data.estadoHistorial?.filter(h => h.investigacion_id == c.id).map(h => ({ estado_anterior: h.estado_anterior, estado_nuevo: h.estado_nuevo, fecha_cambio: h.fecha_cambio, usuario_id: h.usuario_id })) || [];
                
                // Map comments with author names
                const comments = data.comentarios?.filter(h => h.investigacion_id == c.id).map(h => {
                    let author = db.users.find(u => u.id === h.autor_id || u.username === h.autor_id);
                    return { autor: author ? author.name : h.autor_id, texto: h.texto, fecha: new Date(h.fecha).toLocaleString() };
                }) || [];
                
                const involucrados = [];
                const implicacionesMap = {};
                data.invPersona?.filter(p => p.investigacion_id == c.id).forEach(p => {
                    let per = data.personas?.find(x => x.id === p.persona_id);
                    if (per) {
                        involucrados.push(per.cedulas);
                        implicacionesMap[per.cedulas] = p.grado_implicacion;
                    }
                });

                // Helper to resolve user names from IDs
                const resolveUser = (id) => {
                    let u = db.users.find(x => x.id === id || x.username === id);
                    return u ? u.username : id;
                };

                let coordName = resolveUser(c.coordinador_asignado);
                let superName = resolveUser(c.supervisor_asignado);
                let espName = resolveUser(c.especialista_asignado);
                let currentAsignado = null;
                
                if ([ESTADOS_CASO.PENDIENTE_COORD, ESTADOS_CASO.REVISION_COORDINADOR].includes(c.estatus)) currentAsignado = coordName;
                if ([ESTADOS_CASO.PENDIENTE_SUPER, ESTADOS_CASO.REVISION_SUPERVISOR].includes(c.estatus)) currentAsignado = superName;
                if ([ESTADOS_CASO.PENDIENTE, ESTADOS_CASO.SUSTANCIACION].includes(c.estatus)) currentAsignado = espName;
                if (c.estatus === ESTADOS_CASO.REVISION_GERENCIA) currentAsignado = ROLES.GERENTE;

                let sust = null;
                if (c.sustanciacion_detalle || c.sustanciacion_doc1 || c.sustanciacion_doc2) {
                    sust = { detalle: c.sustanciacion_detalle, xls: c.sustanciacion_doc1, ppt: c.sustanciacion_doc2 };
                }

                let refId = null;
                if(c.numero_ticket && c.numero_ticket.startsWith('INV-')) refId = parseInt(c.numero_ticket.replace('INV-', ''));
                
                return {
                    id: c.id,
                    solicitudRef: refId,
                    incidenciaOrigen: c.numero_ticket,
                    asunto: c.descripcion_hechos,
                    estado: c.estatus,
                    creadorOriginal: resolveUser(c.denunciante_id),
                    asignadoA: currentAsignado,
                    coordinadorAsignado: coordName,
                    supervisorAsignado: superName,
                    especialistaAsignado: espName,
                    fechaApertura: c.created_at,
                    fechaLimite: c.fecha_limite,
                    planTrabajo: c.plan_trabajo,
                    sustanciacion: sust,
                    memoFinal: c.soporte_path,
                    personasInvolucradas: involucrados,
                    implicaciones: implicacionesMap,
                    estadoLog: logs,
                    historialMensajes: comments,
                    estadoUpdateMs: logs.length > 0 ? new Date(logs[logs.length-1].fecha_cambio).getTime() : new Date(c.created_at).getTime()
                };
            });
            db.solicitudes.forEach(s => {
                const casoObj = db.casos.find(c => c.incidenciaOrigen == s.id);
                if(casoObj) s.casoGenerado = casoObj.id;
            });
        }
        
        // Map Personas
        if (data.personas) {
            db.personas = data.personas.map(p => {
                const estudios = data.estudios?.filter(e => e.persona_id == p.id) || [];
                const referencias = data.referencias?.filter(r => r.persona_id == p.id) || [];
                return {
                    id: p.id || p.cedulas,
                    cedula: p.cedulas,
                    nacionalidad: p.nacionalidad,
                    nombres: p.nombres,
                    apellidos: p.apellidos,
                    cargo: p.position_id,
                    departamento: p.unit_id,
                    region: p.region_id,
                    estudios: estudios,
                    referencias: referencias
                };
            });
        }
    } catch (err) {
        console.error('Backend init error:', err);
    }
}

async function registrarCambioEstado(c, nuevoEstado) {
    if (!c.estadoLog) c.estadoLog = [];
    const logEntry = {
        investigacion_id: c.id,
        estado_anterior: c.estado || 'N/A',
        estado_nuevo: nuevoEstado,
        fecha_cambio: new Date().toISOString(),
        usuario_id: currentUser ? currentUser.username : 'sistema'
    };
    await fetch('/api/db/casos_estado_historial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(logEntry) });
    await fetch(`/api/db/investigaciones/id/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estatus: nuevoEstado }) });
    c.estado = nuevoEstado;
    c.estadoLog.push(logEntry);
}

function saveDB() {
    // Deprecated. We will push to Supabase individually in action functions.
}
function generateId(prefix, arr) { return `${prefix}-${new Date().getFullYear()}-${String(arr.length + 1).padStart(3, '0')}`; }

function notifyUser(target, message, linkObj = null) {
    if (target === 'admin') target = ROLES.SUPER;
    if (target === 'coord') target = ROLES.COORD;
    if (target === 'gerente') target = ROLES.GERENTE;

    const isRole = Object.values(ROLES).includes(target);
    const usersToNotify = isRole ? db.users.filter(u => u.role === target) : db.users.filter(u => u.username === target);
    
    usersToNotify.forEach(u => {
        db.notificaciones.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            userId: u.username,
            mensaje: message,
            link: linkObj,
            leido: false,
            fecha: new Date().toISOString()
        });
    });
    saveDB();
    renderTopbar();
}
function handleNotifClick(id) {
    const n = db.notificaciones.find(x => x.id === id);
    if(n) {
        n.leido = true;
        saveDB();
        renderTopbar();
        if(n.link && n.link.view) navigate(n.link.view, n.link.params);
    }
}

// --- ROUTING ---
function hasPermission(perm) {
    return currentUser && currentUser.permissions && currentUser.permissions.includes(perm);
}

function navigate(viewName, params = null) {
    const app = document.getElementById('app');
    if (viewName === 'login') { app.innerHTML = renderLogin(); return; }
    if (viewName === 'forgot-password') { app.innerHTML = renderForgotPassword(); return; }
    if (viewName === 'reset-password') { app.innerHTML = renderResetPassword(params); return; }

    app.innerHTML = `
        <div class="main-layout view-enter">
            <aside class="sidebar">
                <div style="width: 140px; margin-bottom: 0.5rem; color: #ffffff;">${CANTV_LOGO_SVG}</div>
                <p class="text-xs text-secondary mb-8">Investigaciones Relacionales</p>
                <div class="glass-card mb-4" style="padding: 1rem;">
                    <p class="text-xs text-muted uppercase">Usuario</p>
                    <p class="font-bold">${currentUser.name}</p>
                    <p class="text-xs text-fuchsia">${currentUser.role}</p>
                </div>
                <nav class="sidebar-nav">
                    ${hasPermission('dashboard') ? `<a class="nav-item ${viewName === 'dashboard' ? 'active' : ''}" onclick="navigate('dashboard')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg> Dashboard</a>` : ''}
                    <a class="nav-item ${viewName === 'solicitudes' ? 'active' : ''}" onclick="navigate('solicitudes')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> Incidencias</a>
                    <a class="nav-item ${viewName === 'casos' ? 'active' : ''}" onclick="navigate('casos')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> Casos Activos</a>
                    ${hasPermission('expedientes') ? `<a class="nav-item ${viewName === 'expedientes' ? 'active' : ''}" onclick="navigate('expedientes')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> Directorio Expedientes</a>` : ''}
                    ${hasPermission('registrar_usuario') ? `<a class="nav-item ${viewName === 'admin-users' ? 'active' : ''}" onclick="navigate('admin-users')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v2a4 4 0 0 1-4 4H5a4 4 0 0 1-4-4v-2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg> Adm. Usuarios</a>` : ''}
                </nav>
                <div class="mt-auto"><button onclick="logout()" class="btn btn-secondary w-full text-sm">Cerrar Sesión</button></div>
            </aside>
            <div class="content-wrapper">
                <header class="topbar" id="topbar-container"></header>
                <main class="content-area" id="main-content"></main>
            </div>
        </div>
    `;
    renderTopbar();
    const mainContent = document.getElementById('main-content');
    if (viewName === 'dashboard') {
        if (!hasPermission('dashboard')) return navigate('casos');
        mainContent.innerHTML = renderDashboard();
        initDashboard();
    }
    else if (viewName === 'solicitudes') mainContent.innerHTML = renderSolicitudes();
    else if (viewName === 'create-solicitud') mainContent.innerHTML = renderCreateSolicitud();
    else if (viewName === 'solicitud-detail') mainContent.innerHTML = renderSolicitudDetail(params.id);
    else if (viewName === 'casos') mainContent.innerHTML = renderCasos();
    else if (viewName === 'case-detail') mainContent.innerHTML = renderCaseDetail(params.id);
    else if (viewName === 'expedientes') mainContent.innerHTML = renderExpedientes();
    else if (viewName === 'create-persona') mainContent.innerHTML = renderCreatePersona();
    else if (viewName === 'expediente-detail') mainContent.innerHTML = renderExpedienteDetail(params.cedula);
    else if (viewName === 'report-preview') mainContent.innerHTML = renderReportPreview();
    else if (viewName === 'admin-users') mainContent.innerHTML = renderAdminUsers();
}

function renderTopbar() {
    const container = document.getElementById('topbar-container');
    if(!container) return;
    const myNotifs = db.notificaciones.filter(n => n.userId === currentUser.username).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
    const unread = myNotifs.filter(n => !n.leido).length;
    
    let notifHTML = '';
    if(showNotifModal) {
        notifHTML = `<div class="notif-modal view-enter">
            <div class="p-4 border-b border-white/10 font-bold">Notificaciones</div>
            <div class="flex-1 overflow-y-auto">
                ${myNotifs.length === 0 ? '<p class="p-4 text-xs text-muted">No hay notificaciones</p>' : myNotifs.map(n => `
                    <div class="notif-item ${n.leido ? '' : 'unread'}" style="${n.link ? 'cursor:pointer;' : ''}" onclick="handleNotifClick('${n.id}')">
                        <p class="mb-1">${n.mensaje}</p>
                        <p class="text-xs text-muted">${new Date(n.fecha).toLocaleString()}</p>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }

    container.innerHTML = `
        <div class="font-bold text-sm text-secondary">Módulo de ${currentUser.role}</div>
        <div style="position: relative;">
            <div class="bell-icon" onclick="toggleNotifModal()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                ${unread > 0 ? `<div class="bell-badge">${unread}</div>` : ''}
            </div>
            ${notifHTML}
        </div>
    `;
}
function toggleNotifModal() { 
    showNotifModal = !showNotifModal; 
    if(showNotifModal) {
        db.notificaciones.forEach(n => {
            if(n.userId === currentUser.username) n.leido = true;
        });
        saveDB();
        // Close on outside click
        const handler = (e) => {
            const modal = document.querySelector('.notif-modal');
            const bell = document.querySelector('.bell-icon');
            if(modal && !modal.contains(e.target) && bell && !bell.contains(e.target)) {
                showNotifModal = false;
                renderTopbar();
                document.removeEventListener('click', handler);
            }
        };
        setTimeout(() => document.addEventListener('click', handler), 0);
    }
    renderTopbar(); 
}

// --- AUTH ---
async function login(e) {
    e.preventDefault();
    const u = document.getElementById('username').value, p = document.getElementById('password').value;
    const btn = e.target.querySelector('button');
    if(btn) { btn.disabled = true; btn.innerText = 'Verificando...'; }
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('cantv_token', data.token);
            // Re-fetch users if not loaded yet, or just map locally
            let found = db.users.find(x => x.username === u);
            if (!found) { await initDB(); found = db.users.find(x => x.username === u); }
            if (found) { currentUser = found; navigate('casos'); }
            else throw new Error('Credenciales inválidas');
        } else {
            throw new Error('Credenciales inválidas');
        }
    } catch (err) {
        const errorDiv = document.getElementById('loginError');
        errorDiv.classList.remove('hidden');
        errorDiv.innerText = 'Credenciales inválidas. Verifica tu usuario y contraseña.';
        document.getElementById('username').style.borderColor = 'var(--cantv-fuchsia)';
        document.getElementById('password').style.borderColor = 'var(--cantv-fuchsia)';
    }
    if(btn) { btn.disabled = false; btn.innerText = 'Ingresar al Sistema'; }
}
function logout() { currentUser = null; localStorage.removeItem('cantv_token'); navigate('login'); }
function renderLogin() {
    return `<div class="flex items-center justify-center h-screen w-full">
        <div class="glass-card w-full max-w-md text-center view-enter">
            <div style="width: 200px; margin: 0 auto 1rem auto; color: #ffffff;">${CANTV_LOGO_SVG}</div>
            <p class="text-secondary mb-8">Sistema Relacional de Investigaciones</p>
            <form onsubmit="login(event)" class="flex flex-col gap-4 text-left">
                <div style="position: relative;" class="flex items-center">
                    <svg style="position: absolute; left: 12px; color: var(--text-secondary);" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <input type="text" id="username" class="input-field w-full" style="padding-left: 40px;" placeholder="User" required>
                </div>
                <div style="position: relative;" class="flex items-center">
                    <svg style="position: absolute; left: 12px; color: var(--text-secondary);" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <input type="password" id="password" class="input-field w-full" style="padding-left: 40px;" placeholder="Password" required>
                </div>
                <div id="loginError" class="text-xs text-cantv-fuchsia hidden mt-1 text-center font-bold"></div>
                <button class="btn btn-primary w-full mt-4">Ingresar al Sistema</button>
                <div class="text-center mt-3">
                    <a href="#" onclick="navigate('forgot-password')" class="text-sm text-secondary hover:text-white" style="text-decoration: underline;">¿Olvidaste tu contraseña?</a>
                </div>
            </form>
        </div></div>`;
}

// --- PASSWORD RESET ---
function renderForgotPassword() {
    return `<div class="flex items-center justify-center h-screen w-full">
        <div class="glass-card w-full max-w-md text-center view-enter">
            <h2 class="text-2xl font-bold mb-2">Recuperar Contraseña</h2>
            <p class="text-secondary text-sm mb-6">Ingresa tu usuario y enviaremos un token de seguridad a tu correo electrónico asociado.</p>
            <form onsubmit="sendResetEmail(event)" class="flex flex-col gap-4 text-left">
                <div style="position: relative;" class="flex items-center">
                    <svg style="position: absolute; left: 12px; color: var(--text-secondary);" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    <input type="text" id="resetUsername" class="input-field w-full" style="padding-left: 40px;" placeholder="Tu Usuario (ej. gerente)" required>
                </div>
                <div id="resetError" class="text-xs text-cantv-fuchsia hidden mt-1 text-center font-bold"></div>
                <div id="resetSuccess" class="text-xs text-[#34d399] hidden mt-1 text-center font-bold">Token enviado a tu correo.</div>
                <button class="btn btn-primary w-full mt-2" id="btnSendEmail">Enviar Token</button>
                <div class="text-center mt-3 flex justify-between">
                    <a href="#" onclick="navigate('login')" class="text-sm text-secondary hover:text-white">← Volver al login</a>
                    <a href="#" onclick="navigate('reset-password')" class="text-sm text-cantv-blue hover:text-white">Ya tengo un token</a>
                </div>
            </form>
        </div>
    </div>`;
}

async function sendResetEmail(e) {
    e.preventDefault();
    const username = document.getElementById('resetUsername').value.trim();
    const err = document.getElementById('resetError');
    const succ = document.getElementById('resetSuccess');
    const btn = document.getElementById('btnSendEmail');
    
    err.classList.add('hidden'); succ.classList.add('hidden');
    btn.innerText = 'Enviando...'; btn.disabled = true;
    
    try {
        const res = await fetch('/api/auth/reset', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        if (!res.ok) throw new Error('Usuario no encontrado o error del servidor');
        const data = await res.json();
        
        // Send Email via EmailJS
        emailjs.init("Vf4fXqF-mZt12y7B5"); 
        console.log(`[SIMULACIÓN EMAIL] Enviado a ${data.email}. Token: ${data.token}`);
        alert(`¡SIMULACIÓN!\nSe enviaría un correo a: ${data.email}\n\nTu token de seguridad es: ${data.token}\n(Cópialo para el siguiente paso)`);
        
        succ.innerText = `Token enviado exitosamente a ${data.email}`;
        succ.classList.remove('hidden');
        
        setTimeout(() => {
            navigate('reset-password', { email: data.email });
        }, 2000);
    } catch (ex) {
        console.error(ex);
        err.innerText = ex.message;
        err.classList.remove('hidden');
    }
    
    btn.innerText = 'Enviar Token'; btn.disabled = false;
}

function renderResetPassword(params = null) {
    const defaultEmail = params && params.email ? params.email : '';
    return `<div class="flex items-center justify-center h-screen w-full">
        <div class="glass-card w-full max-w-md text-center view-enter">
            <h2 class="text-2xl font-bold mb-2">Ingresar Nueva Contraseña</h2>
            <p class="text-secondary text-sm mb-6">Ingresa el token de 6 dígitos que recibiste en tu correo y tu nueva contraseña.</p>
            <form onsubmit="submitNewPassword(event)" class="flex flex-col gap-4 text-left">
                <input type="email" id="confirmEmail" class="input-field w-full" placeholder="Correo electrónico" value="${defaultEmail}" required ${defaultEmail ? 'readonly' : ''}>
                <input type="text" id="confirmToken" class="input-field w-full" placeholder="Token de 6 dígitos" required maxlength="6">
                <input type="password" id="newPassword" class="input-field w-full" placeholder="Nueva Contraseña" required minlength="4">
                
                <div id="confirmError" class="text-xs text-cantv-fuchsia hidden mt-1 text-center font-bold"></div>
                <button class="btn btn-primary w-full mt-2" id="btnConfirmReset">Cambiar Contraseña</button>
                <div class="text-center mt-3">
                    <a href="#" onclick="navigate('login')" class="text-sm text-secondary hover:text-white">← Cancelar y volver</a>
                </div>
            </form>
        </div>
    </div>`;
}

async function submitNewPassword(e) {
    e.preventDefault();
    const email = document.getElementById('confirmEmail').value.trim();
    const token = document.getElementById('confirmToken').value.trim();
    const newPass = document.getElementById('newPassword').value;
    const err = document.getElementById('confirmError');
    const btn = document.getElementById('btnConfirmReset');
    
    err.classList.add('hidden');
    btn.innerText = 'Verificando...'; btn.disabled = true;
    
    try {
        const res = await fetch('/api/auth/reset/confirm', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token, newPassword: newPass })
        });
        if (!res.ok) throw new Error('Token inválido o error del servidor');
        
        alert("¡Contraseña actualizada exitosamente! Ya puedes iniciar sesión.");
        navigate('login');
    } catch (ex) {
        console.error(ex);
        err.innerText = ex.message;
        err.classList.remove('hidden');
    }
    btn.innerText = 'Cambiar Contraseña'; btn.disabled = false;
}

// --- DASHBOARD ---
function renderDashboard() {
    return `<div class="view-enter max-w-5xl">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-3xl font-bold">Dashboard Analítico</h1>
            <button class="btn btn-primary flex items-center gap-2" onclick="navigate('report-preview')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Generar Reporte Mensual
            </button>
        </div>
        
        <div class="glass-card mb-6 flex flex-wrap gap-4 items-end">
            <div class="flex-1 min-w-[200px]">
                <label class="text-xs text-muted mb-1 block">Rango de Fecha</label>
                <select id="dashPeriod" class="input-field" onchange="initDashboard()">
                    <option value="all">Histórico Completo</option>
                    <option value="30">Últimos 30 días</option>
                    <option value="90">Últimos 3 meses</option>
                </select>
            </div>
            ${hasPermission('cerrar_caso') ? `
            <div class="flex-1 min-w-[200px]">
                <label class="text-xs text-muted mb-1 block">Región</label>
                <select id="dashRegion" class="input-field" onchange="initDashboard()">
                    <option value="all">Todas las Regiones</option>
                    ${[...new Set(db.users.map(u=>u.region))].map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
            </div>` : ''}
            <div class="flex-1 min-w-[200px]">
                <label class="text-xs text-muted mb-1 block">Especialista</label>
                <select id="dashEsp" class="input-field" onchange="initDashboard()">
                    <option value="all">Todos</option>
                </select>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem;" class="mb-6">
            <div class="glass-card text-center py-6">
                <p class="text-secondary text-xs uppercase font-bold">Total Casos</p>
                <p class="text-4xl text-gradient-fuchsia font-black mt-2" id="kpiTotal">0</p>
            </div>
            <div class="glass-card text-center py-6">
                <p class="text-secondary text-xs uppercase font-bold">Tiempo Prom. Resolución</p>
                <p class="text-4xl text-gradient-fuchsia font-black mt-2" id="kpiAvgTime">0 d</p>
            </div>
            <div class="glass-card text-center py-6">
                <p class="text-secondary text-xs uppercase font-bold">Tasa de Cierre</p>
                <p class="text-4xl text-gradient-fuchsia font-black mt-2" id="kpiRate">0%</p>
            </div>
            <div class="glass-card text-center py-6">
                <p class="text-secondary text-xs uppercase font-bold">Cumplimiento (Mensual)</p>
                <p class="text-4xl text-gradient-fuchsia font-black mt-2" id="kpiCompliance">0%</p>
            </div>
        </div>

        <div class="form-grid">
            <div class="glass-card flex flex-col">
                <h3 class="font-bold mb-4">Casos Resueltos por Especialista</h3>
                <div style="position: relative; height: 300px; width: 100%;"><canvas id="chartEspecialistas"></canvas></div>
            </div>
            <div class="glass-card flex flex-col">
                <h3 class="font-bold mb-4">Distribución por Región</h3>
                <div style="position: relative; height: 300px; width: 100%;"><canvas id="chartRegiones"></canvas></div>
            </div>
        </div>
    </div>`;
}

function renderReportPreview() {
    const total = document.getElementById('kpiTotal') ? document.getElementById('kpiTotal').innerText : '0';
    const comp = document.getElementById('kpiCompliance') ? document.getElementById('kpiCompliance').innerText : '0%';
    const rate = document.getElementById('kpiRate') ? document.getElementById('kpiRate').innerText : '0%';
    const avg = document.getElementById('kpiAvgTime') ? document.getElementById('kpiAvgTime').innerText : '0 d';
    
    return `<div class="view-enter max-w-5xl mx-auto" style="background: white; color: black; padding: 3rem; border-radius: 8px;">
        <div class="flex justify-between items-center border-b pb-6 mb-6" style="border-color: #ccc;">
            <div style="width: 180px; color: black;">
                ${CANTV_LOGO_SVG}
            </div>
            <div class="text-right">
                <h2 class="text-2xl font-bold uppercase mb-1">Reporte de Gestión Mensual</h2>
                <p class="text-sm"><strong>Fecha de Generación:</strong> ${new Date().toLocaleDateString()}</p>
                <p class="text-sm"><strong>Generado por:</strong> ${currentUser.name} (${currentUser.role})</p>
            </div>
        </div>
        
        <h3 class="text-xl font-bold mb-4">Resumen Ejecutivo de Rendimiento</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 2rem; font-size: 0.875rem;">
            <tr style="background: #f3f4f6;">
                <th style="padding: 12px; border: 1px solid #ccc; text-align: left;">Total Casos Procesados</th>
                <th style="padding: 12px; border: 1px solid #ccc; text-align: left;">Tasa de Cierre</th>
                <th style="padding: 12px; border: 1px solid #ccc; text-align: left;">Tiempo Promedio Resolución</th>
                <th style="padding: 12px; border: 1px solid #ccc; text-align: left; background: #e5e7eb;">% CUMPLIMIENTO A TIEMPO</th>
            </tr>
            <tr>
                <td style="padding: 12px; border: 1px solid #ccc; font-weight: bold;">${total}</td>
                <td style="padding: 12px; border: 1px solid #ccc;">${rate}</td>
                <td style="padding: 12px; border: 1px solid #ccc;">${avg}</td>
                <td style="padding: 12px; border: 1px solid #ccc; font-weight: bold; background: #f9fafb;">${comp}</td>
            </tr>
        </table>

        <div class="mt-8 text-xs text-center" style="color: #666;">
            <p>Documento oficial generado automáticamente por el Sistema de Investigaciones Relacionales CANTV.</p>
        </div>
        
        <div class="flex justify-center gap-4 mt-8" id="reportButtons">
            <button class="btn btn-secondary" style="background: #e5e7eb; color: black; border-color: #ccc;" onclick="navigate('dashboard')">Volver al Dashboard</button>
            <button class="btn btn-primary" onclick="document.getElementById('reportButtons').style.display='none'; window.print(); setTimeout(()=>document.getElementById('reportButtons').style.display='flex', 1000);">🖨️ Imprimir / Guardar PDF</button>
        </div>
    </div>`;
}

let chartEspInstance = null;
let chartRegInstance = null;

function initDashboard() {
    // Collect Filters
    const period = document.getElementById('dashPeriod').value;
    const regionEl = document.getElementById('dashRegion');
    const region = regionEl ? regionEl.value : currentUser.region;
    
    // Populate Specialists Dropdown based on region
    const espDropdown = document.getElementById('dashEsp');
    const currentEspSelection = espDropdown.value;
    
    let regionUsers = db.users.filter(u => u.role === ROLES.ESP);
    if (region !== 'all') regionUsers = regionUsers.filter(u => u.region === region);
    
    espDropdown.innerHTML = `<option value="all">Todos</option>` + regionUsers.map(u => `<option value="${u.username}" ${u.username===currentEspSelection?'selected':''}>${u.name} (${u.username})</option>`).join('');
    
    const esp = espDropdown.value;

    // Filter Logic
    let filtered = db.casos;
    
    if (region !== 'all') {
        const rUsers = db.users.filter(u => u.region === region).map(u => u.username);
        filtered = filtered.filter(c => rUsers.includes(c.creadorOriginal));
    }
    
    if (esp !== 'all') {
        filtered = filtered.filter(c => c.creadorOriginal === esp);
    }
    
    if (period !== 'all') {
        const days = parseInt(period);
        const limitMs = Date.now() - (days * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(c => new Date(c.fechaApertura).getTime() >= limitMs);
    }

    // Calculate KPIs
    document.getElementById('kpiTotal').innerText = filtered.length;
    
    const closed = filtered.filter(c => c.estado === ESTADOS_CASO.CERRADO);
    if (filtered.length > 0) {
        document.getElementById('kpiRate').innerText = Math.round((closed.length / filtered.length) * 100) + '%';
    } else {
        document.getElementById('kpiRate').innerText = '0%';
    }

    let totalMs = 0;
    closed.forEach(c => {
        const start = new Date(c.fechaApertura).getTime();
        const end = c.estadoUpdateMs;
        totalMs += (end - start);
    });
    
    if (closed.length > 0) {
        const avgDays = totalMs / closed.length / (1000 * 60 * 60 * 24);
        document.getElementById('kpiAvgTime').innerText = (avgDays < 1 ? '< 1' : Math.round(avgDays)) + ' d';
    } else {
        document.getElementById('kpiAvgTime').innerText = '-';
    }

    // Calcular Cumplimiento Mensual (On Time)
    let cumplidos = 0;
    filtered.forEach(c => {
        if (!c.fechaLimite) return;
        const limitDate = new Date(c.fechaLimite);
        limitDate.setHours(23, 59, 59, 999);
        
        if (c.estado === ESTADOS_CASO.CERRADO) {
            if (c.estadoUpdateMs <= limitDate.getTime()) cumplidos++;
        } else {
            if (Date.now() <= limitDate.getTime()) cumplidos++;
        }
    });
    
    if (filtered.length > 0) {
        document.getElementById('kpiCompliance').innerText = Math.round((cumplidos / filtered.length) * 100) + '%';
    } else {
        document.getElementById('kpiCompliance').innerText = '0%';
    }

    // Chart 1: Specialists
    const espData = {};
    closed.forEach(c => {
        espData[c.creadorOriginal] = (espData[c.creadorOriginal] || 0) + 1;
    });

    if (chartEspInstance) chartEspInstance.destroy();
    chartEspInstance = new Chart(document.getElementById('chartEspecialistas'), {
        type: 'bar',
        data: {
            labels: Object.keys(espData).length ? Object.keys(espData) : ['Sin Datos'],
            datasets: [{
                label: 'Casos Resueltos',
                data: Object.keys(espData).length ? Object.values(espData) : [0],
                backgroundColor: '#E5007E',
                borderRadius: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } }, x: { grid: { display: false } } } }
    });

    // Chart 2: Regions
    const regData = {};
    filtered.forEach(c => {
        const creatorUser = db.users.find(u => u.username === c.creadorOriginal);
        if (creatorUser) {
            regData[creatorUser.region] = (regData[creatorUser.region] || 0) + 1;
        }
    });

    if (chartRegInstance) chartRegInstance.destroy();
    chartRegInstance = new Chart(document.getElementById('chartRegiones'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(regData).length ? Object.keys(regData) : ['Sin Datos'],
            datasets: [{
                data: Object.keys(regData).length ? Object.values(regData) : [1],
                backgroundColor: ['#E5007E', '#0033A0', '#10b981', '#f59e0b'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } } }
    });
}

// --- SOLICITUDES ---
function toggleFavSol(id) {
    const s = db.solicitudes.find(x => x.id === id);
    if(!s.favoritos) s.favoritos = [];
    if(s.favoritos.includes(currentUser.username)) s.favoritos = s.favoritos.filter(x => x !== currentUser.username);
    else s.favoritos.push(currentUser.username);
    saveDB(); renderSolicitudes();
}

function renderSolicitudes() {
    let list = db.solicitudes;
    if (!hasPermission('apruebo_incidencias')) {
        list = list.filter(s => s.creadoPor === currentUser.username);
    }
    // Filtrar para ocultar de la vista de Incidencias cualquier solicitud que ya fue aprobada (CASO_ABIERTO)
    // Ya que ahora su ciclo de vida continúa exclusivamente en la bandeja de Casos.
    list = list.filter(s => s.estado !== 'CASO_ABIERTO');
    list.sort((a, b) => {
        const aPinned = (a.anclados || []).includes(currentUser.username) ? 1 : 0;
        const bPinned = (b.anclados || []).includes(currentUser.username) ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        const aFav = (a.favoritos || []).includes(currentUser.username) ? 1 : 0;
        const bFav = (b.favoritos || []).includes(currentUser.username) ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        return new Date(b.creadoEl).getTime() - new Date(a.creadoEl).getTime();
    });
    const titleLabel = hasPermission('apruebo_incidencias') ? 'Bandeja de Incidencias' : 'Mis Incidencias';
    let html = `<div class="view-enter">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-3xl font-bold">${titleLabel}</h1>
            <div class="flex gap-4 items-stretch">
                <input type="text" class="input-field" placeholder="Buscar por ID o Asunto..." onkeyup="filterTable('solTable', this.value)">
                ${hasPermission('registro_incidencias') ? `<button class="btn btn-primary whitespace-nowrap" onclick="navigate('create-solicitud')">+ Nueva Incidencia</button>` : ''}
            </div>
        </div>
        <div class="glass-card p-0"><table id="solTable" class="table-container m-0">
            <thead><tr class="table-header"><th>ID</th><th>Asunto</th><th>Estado</th><th>Enviado Por</th><th>Acción</th></tr></thead><tbody>`;
    if(list.length===0) html += `<tr><td colspan="5" class="text-center p-6 text-muted">No hay incidencias registradas</td></tr>`;
    else list.forEach(s => {
        const isPinned = (s.anclados || []).includes(currentUser.username);
        const isFav = (s.favoritos || []).includes(currentUser.username);
        const unread = !(s.vistasPor || []).includes(currentUser.username);
        const estadoColor = s.estado === 'CASO_ABIERTO' ? 'background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);' :
                           s.estado === 'Rechazada por Gerencia' ? 'background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);' : 'background:rgba(245,158,11,0.15);color:#fcd34d;border:1px solid rgba(245,158,11,0.3);';
        
        let labelDetalle = '';
        if (s.estado === 'CASO_ABIERTO' && s.casoGenerado) {
            const c = db.casos.find(x => x.id === s.casoGenerado);
            if (c) labelDetalle = ` - ${c.estado}`;
        }
        const estadoLabel = s.estado === 'CASO_ABIERTO' ? (labelDetalle ? `Aprobada${labelDetalle}` : 'Aprobada - Caso Creado') :
                            s.estado === 'Rechazada por Gerencia' ? 'Rechazada por Gerencia' : s.estado;
        html += `<tr class="table-row" style="${unread ? 'border-left: 3px solid var(--cantv-fuchsia); background: rgba(229, 0, 126, 0.05);' : ''}" oncontextmenu="handleRowRightClick(event)">
            <td class="font-bold" style="position: relative;">
                <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 190px; overflow: hidden; pointer-events: none; z-index: 20;">
                    <div class="row-context-menu flex items-center gap-3 pr-3">
                        <button class="btn btn-secondary btn-sm flex items-center justify-center" title="Anclar" onclick="togglePinItem('solicitud', '${s.id}')" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 0.4rem; border-radius: 6px; color: ${isPinned ? 'var(--cantv-fuchsia)' : 'inherit'};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
                        </button>
                        <button class="btn btn-secondary btn-sm flex items-center justify-center" title="Favorito" onclick="toggleFavItem('solicitud', '${s.id}')" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 0.4rem; border-radius: 6px; color: ${isFav ? '#fbbf24' : 'inherit'};">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        </button>
                        <button class="btn btn-secondary btn-sm" title="Cerrar" onclick="closeRowMenu(event)" style="padding: 0.4rem; margin-left: auto; background: transparent; border: none; font-size: 1.2rem; color: #fff;">×</button>
                    </div>
                </div>
                ${isPinned ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline mb-0.5 text-cantv-fuchsia"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg> ' : ''}${isFav ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" class="inline mb-0.5" style="color:#fbbf24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> ' : ''}${s.id}${unread ? ' <span style="width:8px;height:8px;background:var(--cantv-fuchsia);border-radius:50%;display:inline-block;margin-left:5px;"></span>' : ''}
            </td>
            <td>${s.asunto}</td>
            <td><span class="badge" style="${estadoColor}">${estadoLabel}</span></td>
            <td><span style="font-size:0.8rem">${(() => { const u = db.users.find(x => x.username === s.creadoPor); return u ? `${u.name} <span class="badge badge-low" style="font-size:0.7rem;padding:0.1rem 0.4rem;">${u.role}</span>` : s.creadoPor; })()}</span></td>
            <td><button class="btn btn-secondary btn-sm" onclick="navigate('solicitud-detail', {id:'${s.id}'})">Ver</button></td>
        </tr>`;
    });
    setTimeout(() => { const input = document.getElementById('searchSol'); if(input && document.activeElement !== input && term) input.focus(); }, 0);
    return html + `</tbody></table></div></div>`;
}


function renderCreateSolicitud() {
    return `<div class="view-enter max-w-3xl">
        <h1 class="text-3xl font-bold mb-6">Registrar Nueva Incidencia</h1>
        <div class="glass-card">
            <form onsubmit="crearSolicitud(event)" class="flex flex-col gap-4">
                <div class="form-group"><label class="form-label">Descripción de la Incidencia</label>
                    <input type="text" id="solAsunto" class="input-field" required></div>
                <div class="form-group"><label class="form-label">Criticidad Percibida</label>
                    <select id="solCrit" class="input-field"><option value="Baja">Baja</option><option value="Media">Media</option><option value="Alta">Alta</option></select></div>
                <div class="form-group"><label class="form-label">Documento Soporte 1 (Cualquier formato)</label>
                    <input type="file" id="solXls" class="input-field" required style="padding-top:10px;"></div>
                <div class="form-group"><label class="form-label">Documento Soporte 2 (Cualquier formato / Evidencias)</label>
                    <input type="file" id="solPpt" class="input-field" required style="padding-top:10px;"></div>
                <button type="submit" class="btn btn-primary w-full mt-4">Enviar Incidencia a Gerencia</button>
            </form>
        </div></div>`;
}
// Helper: read file as base64 data URL
function readFileAsDataURL(file) {
    return new Promise((resolve) => {
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = (e) => resolve({ name: file.name, type: file.type, data: e.target.result });
        reader.readAsDataURL(file);
    });
}

// Helper: download a stored file object
function downloadFile(fileObj) {
    if (!fileObj || !fileObj.data) return showToast('Archivo no disponible.', 'error');
    const a = document.createElement('a');
    a.href = fileObj.data;
    a.download = fileObj.name;
    a.click();
}

// Helper: preview a stored file object (images inline, others download)
function previewFile(fileObj) {
    if (!fileObj || !fileObj.data) return showToast('Archivo no disponible.', 'error');
    if (fileObj.type && fileObj.type.startsWith('image/')) {
        const w = window.open();
        w.document.write(`<style>body{margin:0;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh}</style><img src="${fileObj.data}" style="max-width:100%;max-height:100vh">`);
    } else if (fileObj.type === 'application/pdf') {
        const w = window.open();
        w.document.write(`<iframe src="${fileObj.data}" style="width:100vw;height:100vh;border:none"></iframe>`);
    } else {
        downloadFile(fileObj);
    }
}

function renderFileChip(fileObj, label) {
    if (!fileObj) return '';
    const isStr = typeof fileObj === 'string';
    const name = isStr ? fileObj : fileObj.name;
    const isPreviewable = !isStr; // Allow preview button for all files (it falls back to download in previewFile)
    const encoded = !isStr ? encodeURIComponent(JSON.stringify(fileObj)) : '';
    return `<div style="display:flex;align-items:center;gap:0.5rem;background:rgba(255,255,255,0.06);border-radius:8px;padding:0.5rem 0.85rem;font-size:0.8rem">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <span style="color:var(--text-secondary)">${label || ''}</span>
        <strong>${name}</strong>
        ${isPreviewable ? `<button onclick="previewFile(JSON.parse(decodeURIComponent('${encoded}')))" style="background:rgba(99,102,241,0.2);color:#a5b4fc;border:none;border-radius:5px;padding:0.2rem 0.5rem;font-size:0.7rem;cursor:pointer">👁 Vista previa</button>` : ''}
        ${!isStr ? `<button onclick="downloadFile(JSON.parse(decodeURIComponent('${encoded}')))" style="background:rgba(255,255,255,0.08);color:white;border:none;border-radius:5px;padding:0.2rem 0.5rem;font-size:0.7rem;cursor:pointer">⬇ Descargar</button>` : `<span style="font-size:0.65rem;color:var(--text-muted)">(Antiguo)</span>`}
    </div>`;
}

function renderFileBadge(fileObj) {
    if (!fileObj) return '';
    const isStr = typeof fileObj === 'string';
    const name = isStr ? fileObj : fileObj.name;
    const isPreviewable = !isStr; // Allow preview button for all files
    const encoded = !isStr ? encodeURIComponent(JSON.stringify(fileObj)) : '';
    return `<div style="display:inline-flex;align-items:center;gap:0.5rem;background:rgba(255,255,255,0.06);border-radius:8px;padding:0.4rem 0.75rem;font-size:0.78rem;margin-right:0.5rem;margin-bottom:0.4rem">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <span style="color:var(--text-primary)">${name}</span>
        ${isPreviewable ? `<button onclick="previewFile(JSON.parse(decodeURIComponent('${encoded}')))" style="background:rgba(99,102,241,0.2);color:#a5b4fc;border:none;border-radius:4px;padding:0.15rem 0.45rem;font-size:0.68rem;cursor:pointer">👁 Ver</button>` : ''}
        ${!isStr ? `<button onclick="downloadFile(JSON.parse(decodeURIComponent('${encoded}')))" style="background:rgba(255,255,255,0.08);color:white;border:none;border-radius:4px;padding:0.15rem 0.45rem;font-size:0.68rem;cursor:pointer">⬇ Descargar</button>` : `<span style="font-size:0.65rem;color:var(--text-muted)">(Antiguo)</span>`}
    </div>`;
}

async function crearSolicitud(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if(btn) btn.disabled = true;
    
    const f1 = document.getElementById('solXls').files[0];
    const f2 = document.getElementById('solPpt').files[0];
    const [adj1, adj2] = await Promise.all([readFileAsDataURL(f1), readFileAsDataURL(f2)]);

    let url1 = null;
    let url2 = null;

    if (adj1 && f1) {
        const u1Res = await fetch('/api/upload', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fileBase64: adj1, fileName: f1.name}) });
        if(u1Res.ok) url1 = (await u1Res.json()).url;
    }
    if (adj2 && f2) {
        const u2Res = await fetch('/api/upload', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fileBase64: adj2, fileName: f2.name}) });
        if(u2Res.ok) url2 = (await u2Res.json()).url;
    }
    
    const payload = {
        tipo_solicitud: document.getElementById('solAsunto').value,
        criticidad: document.getElementById('solCrit').value,
        estatus: ESTADOS_SOLICITUD.REVISION_GERENTE,
        solicitante_id: currentUser.id,
        detalle: 'Nueva solicitud registrada.',
        documento_1: url1,
        documento_2: url2,
        created_at: new Date().toISOString()
    };

    const res = await fetch('/api/db/solicitudes_especialistas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        if(btn) btn.disabled = false;
        return alert("Error al conectar con la base de datos.");
    }

    const json = await res.json();
    const solId = json.data[0].id; // Auto-generated ID from Supabase

    await initDB(); // Refetch state
    
    notifyUser(ROLES.GERENTE, `Nueva Solicitud ${solId} requiere tu aprobación.`, { view: 'solicitud-detail', params: { id: solId } }, true);
    navigate('solicitudes');
    showToast(`Solicitud ${solId} creada exitosamente y enviada a Gerencia para aprobación.`, 'success');
}

function renderSolicitudDetail(id) {
    const s = db.solicitudes.find(x => x.id === id);
    if(!s.vistasPor) s.vistasPor = [];
    if(!s.vistasPor.includes(currentUser.username)) {
        s.vistasPor.push(currentUser.username);
        saveDB();
    }

    // Determine if current user is the creator (they can't approve their own)
    const isCreator = s.creadoPor === currentUser.username;
    const showActions = !isCreator || hasPermission('apruebo_incidencias');

    // Build action panel
    let actions = `<p class="text-muted text-sm">Sin acciones disponibles para tu rol en el estado actual.</p>`;
    
    if ((s.estado === 'CASO_ABIERTO' || s.estado === 'APROBADO') && s.casoGenerado) {
        if (hasPermission('sustanciar_caso')) {
            actions = `<div class="p-4 bg-green-900/30 border border-green-500 rounded-lg">
                <p class="mb-3 text-green-300 font-medium">Esta incidencia fue aprobada. Puedes sustanciarla o verla en el Caso #${s.casoGenerado}.</p>
                <button class="btn btn-primary" onclick="navigate('case-detail', { id: ${s.casoGenerado} })">Sustanciar / Ver Caso</button>
            </div>`;
        } else {
             actions = `<div class="p-4 bg-green-900/30 border border-green-500 rounded-lg">
                <p class="mb-3 text-green-300 font-medium">Incidencia aprobada. Puedes darle seguimiento en el Caso #${s.casoGenerado}.</p>
                <button class="btn btn-secondary" onclick="navigate('case-detail', { id: ${s.casoGenerado} })">Ir al Caso</button>
            </div>`;
        }
    }
    
    // GERENTE: can approve or reject
    if (s.estado === ESTADOS_SOLICITUD.REVISION_GERENTE && hasPermission('apruebo_incidencias')) {
        const creador = db.users.find(u => u.username === s.creadoPor);
        const creadorInfo = creador ? `${creador.name} (${creador.role})` : s.creadoPor;
        actions = `<div class="p-3 rounded mb-4 text-sm" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc">
            <strong>Incidencia enviada por:</strong> ${creadorInfo}
        </div>
        <textarea id="solObs" class="input-field mb-4" rows="2" placeholder="Observaciones (opcional si aprueba, obligatorio si rechaza)..."></textarea>
        <div class="flex gap-3">
            <button class="btn btn-primary flex-1" onclick="aprobarSolicitudGerente('${id}')">Aprobar y Abrir Caso</button>
            <button class="btn btn-secondary flex-1" style="background:rgba(239,68,68,0.15);color:white;" onclick="rechazarSolicitudGerente('${id}')">Rechazar Incidencia</button>
        </div>`;
    } else if (s.estado === 'CASO_ABIERTO' || s.estado === 'Rechazada por Gerencia') {
        const isRejected = s.estado === 'Rechazada por Gerencia';
        actions = `<div class="p-4 rounded text-sm" style="background: ${isRejected ? 'rgba(239,68,68,0.1)' : 'rgba(16, 185, 129, 0.15)'}; color: ${isRejected ? '#f87171' : '#34d399'}; border: 1px solid ${isRejected ? 'rgba(239,68,68,0.3)' : 'rgba(16, 185, 129, 0.3)'}">
            ${isRejected ? '<strong>Incidencia Rechazada.</strong> Revisa las observaciones del Gerente.' : '<strong>¡Incidencia Aprobada!</strong> El Caso fue creado. Dirígete a <strong>Casos Activos</strong> para verlo.'}
        </div>`;
    } else {
        actions = `<p class="text-muted text-sm">Esta incidencia está pendiente de revisión por el Gerente.</p>`;
    }

    let involucradosHtml = '';
    if (!s.personasInvolucradas) s.personasInvolucradas = [];
    if (s.personasInvolucradas.length === 0) {
        involucradosHtml = `<p class="text-sm text-muted mb-4">Nadie vinculado aún en esta nota.</p>`;
    } else {
        involucradosHtml = `<div class="flex flex-wrap gap-2 mb-4">` + 
            s.personasInvolucradas.map(ced => {
                const p = db.personas.find(x => x.cedula === ced);
                const name = p ? p.nombre : ced;
                const deleteBtn = `<svg onclick="eliminarPersonaSol('${s.id}', '${ced}')" style="cursor:pointer; margin-left: 4px; color: #ef4444;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
                return `<span class="badge badge-low flex items-center gap-1" style="background: rgba(255,255,255,0.05); color: var(--text-primary); border-color: rgba(255,255,255,0.1);">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--cantv-fuchsia)" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    ${name} (${ced}) ${deleteBtn}
                </span>`;
            }).join('') + `</div>`;
    }
    const agregarHtml = `<div class="flex gap-2">
        <input type="text" id="addCedulaSol" class="input-field" placeholder="Ej. 12345678" onkeypress="if(event.key==='Enter') { checkAutoAddPersonaSol(this.value, '${id}'); this.value=''; }">
        <button class="btn btn-secondary whitespace-nowrap" onclick="const i=document.getElementById('addCedulaSol'); checkAutoAddPersonaSol(i.value, '${id}'); i.value='';">Añadir Involucrado</button>
    </div>`;

    return `<div class="view-enter max-w-3xl">
        <div class="flex items-center gap-3 mb-6">
            <button onclick="navigate('solicitudes')" class="btn btn-secondary btn-sm" style="padding:0.4rem 0.8rem">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div>
                <h1 class="text-3xl font-bold" style="margin:0">Incidencia ${s.id}</h1>
                <p style="color:var(--text-secondary);font-size:0.85rem;margin-top:0.1rem">Proceso de validación gerencial de incidencia.</p>
            </div>
        </div>
        <div class="glass-card mb-4" style="border-left:3px solid ${s.estado === 'Rechazada por Gerencia' ? '#ef4444' : s.estado === 'CASO_ABIERTO' ? '#10b981' : 'var(--cantv-fuchsia)'}">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                <div>
                    <p style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Asunto</p>
                    <p style="font-weight:600;margin-top:0.2rem">${s.asunto}</p>
                </div>
                <div>
                    <p style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Estado</p>
                    <span class="badge badge-med" style="margin-top:0.3rem;display:inline-block">${s.estado === 'CASO_ABIERTO' ? 'Aprobada — Caso Creado' : s.estado}</span>
                </div>
                <div>
                    <p style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Criticidad</p>
                    <span class="badge badge-high" style="margin-top:0.3rem;display:inline-block">${s.criticidad}</span>
                </div>
                <div>
                    <p style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em">Enviado por</p>
                    <p style="margin-top:0.2rem">${(() => { const u = db.users.find(x => x.username === s.creadoPor); return u ? `${u.name} <em style="color:var(--text-secondary);font-size:0.8rem">(${u.role})</em>` : s.creadoPor; })()} &mdash; <span style="color:var(--text-muted);font-size:0.8rem">${new Date(s.creadoEl).toLocaleDateString('es-VE', {day:'2-digit',month:'short',year:'numeric'})}</span></p>
                </div>
            </div>
            ${s.adjuntos ? `
            <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.08)">
                <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.6rem">Documentos Adjuntos</p>
                ${s.adjuntos.xls ? renderFileBadge(s.adjuntos.xls) : ''}
                ${s.adjuntos.ppt ? renderFileBadge(s.adjuntos.ppt) : ''}
            </div>` : ''}
            ${s.observaciones && s.observaciones.length > 0 ? `
            <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.08)">
                <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem">Historial de Observaciones</p>
                ${s.observaciones.map(o => `<div style="background:rgba(0,0,0,0.2);border-radius:6px;padding:0.5rem 0.75rem;font-size:0.8rem;margin-bottom:0.4rem"><strong style="color:var(--cantv-fuchsia)">${o.autor}</strong>: ${o.texto}</div>`).join('')}
            </div>` : ''}
        </div>
        ${s.casoGenerado ? `<div class="glass-card mb-4" style="border-left:3px solid #10b981">
            <p style="font-size:0.85rem;color:#34d399">Caso generado: <strong>${s.casoGenerado}</strong></p>
            <button class="btn btn-secondary btn-sm mt-2" onclick="navigate('case-detail', {id:'${s.casoGenerado}'})">Ir al Caso →</button>
        </div>` : ''}
        <div class="glass-card">
            <h3 style="font-size:0.875rem;font-weight:600;margin-bottom:1rem">Acciones</h3>
            ${actions}
        </div>
    </div>`;
}

function checkAutoAddPersonaSol(val, solId) {
    const cedula = val.trim();
    if(!cedula) return;
    const p = db.personas.find(x => x.cedula === cedula);
    const s = db.solicitudes.find(x => x.id === solId);
    if(!s.personasInvolucradas) s.personasInvolucradas = [];

    if(!p) {
        showToast(`Cédula ${cedula} no encontrada en el Directorio de Trabajadores.`, 'error');
        return;
    }
    if(s.personasInvolucradas.includes(cedula)) {
        showToast(`${p.nombre} ya está vinculado a esta solicitud.`, 'warning');
        return;
    }
    s.personasInvolucradas.push(cedula);
    saveDB();
    showToast(`${p.nombre} vinculado correctamente.`, 'success');
    navigate('solicitud-detail', {id: solId});
}

function eliminarPersonaSol(solId, cedula) {
    const s = db.solicitudes.find(x => x.id === solId);
    if(s && s.personasInvolucradas) {
        s.personasInvolucradas = s.personasInvolucradas.filter(x => x !== cedula);
        saveDB();
        navigate('solicitud-detail', {id: solId});
    }
}
function escalarSolicitud(id, nextState, nextUser, msjNotif) {
    const s = db.solicitudes.find(x => x.id === id);
    const obsVal = document.getElementById('solObs') ? document.getElementById('solObs').value.trim() : '';
    if (obsVal) {
        if (!s.observaciones) s.observaciones = [];
        s.observaciones.push({ autor: currentUser.name, texto: obsVal });
    }
    s.estado = nextState; s.asignadoA = nextUser;
    saveDB();
    notifyUser(nextUser, `Escalamiento Solicitud ${id}: ${msjNotif}`, { view: 'solicitud-detail', params: { id } });
    showToast(`Acción registrada: ${msjNotif}`, 'success');
    navigate('solicitudes');
}

async function aprobarSolicitudGerente(id) {
    const s = db.solicitudes.find(x => x.id === id);
    const obsVal = document.getElementById('solObs') ? document.getElementById('solObs').value.trim() : '';
    
    // Create the case
    let creadorId = currentUser.id;
    let originalUser = db.users.find(u => u.username === s.creadoPor);
    if (originalUser) creadorId = originalUser.id;
    
    const casoPayload = {
        numero_ticket: `INV-${id}`,
        denunciante_id: creadorId,
        descripcion_hechos: s.asunto,
        fecha_incidente: s.creadoEl,
        estatus: ESTADOS_CASO.PENDIENTE_COORD
    };
    
    // Post new case
    const res = await fetch('/api/db/investigaciones', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(casoPayload)
    });
    if(!res.ok) return showToast('Error al crear el caso.', 'error');
    const newCaso = (await res.json()).data[0];
    
    // Update solicitud
    await fetch(`/api/db/solicitudes_especialistas/id/${id}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ estatus: 'APROBADO' })
    });
    
    if (obsVal) {
        await fetch('/api/db/comentarios', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ investigacion_id: newCaso.id, autor_id: currentUser.id, texto: obsVal })
        });
    }
    
    await fetch('/api/db/casos_estado_historial', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ investigacion_id: newCaso.id, estado_anterior: 'N/A', estado_nuevo: ESTADOS_CASO.PENDIENTE_COORD, fecha_cambio: new Date().toISOString(), usuario_id: currentUser.id })
    });
    
    await initDB();
    showToast(`Incidencia aprobada. Caso ${newCaso.id} asignado al Coordinador.`, 'success');
    navigate('solicitudes');
}

async function rechazarSolicitudGerente(id) {
    const obs = document.getElementById('solObs') ? document.getElementById('solObs').value.trim() : '';
    if (!obs) return uiAlert('Debe escribir el motivo del rechazo antes de rechazar.');
    
    await fetch(`/api/db/solicitudes_especialistas/id/${id}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ estatus: 'RECHAZADO' })
    });
    // For storing observations on the solicitud itself, we would ideally have a comments table for solicitudes, but since it's just one rejection reason we can put it in 'detalle' or similar.
    // However, the current DB schema doesn't have a comments table for Solicitudes. We'll append it to 'detalle'.
    const s = db.solicitudes.find(x => x.id === id);
    await fetch(`/api/db/solicitudes_especialistas/id/${id}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ detalle: s.detalle + `\n\n[RECHAZO]: ${obs}` })
    });

    await initDB();
    showToast(`Incidencia ${id} rechazada. Se notificó al solicitante.`, 'error');
    navigate('solicitudes');
}


// --- CASOS (EXPEDIENTES OFICIALES) ---


function getTimeInState(updateMs) {
    if (!updateMs) return 'Recién llegado';
    const diff = Date.now() - updateMs;
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days} días`;
    if (hrs > 0) return `${hrs} hrs`;
    if (mins > 0) return `${mins} min`;
    return 'Recién llegado';
}

function renderCasos() {
    let list = db.casos;

    // Filter out closed cases older than 3 days (only for Kanban or general visibility)
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    list = list.filter(c => {
        if (c.estado === ESTADOS_CASO.CERRADO) {
            return (Date.now() - c.estadoUpdateMs) <= THREE_DAYS_MS;
        }
        return true;
    });
    
    list.sort((a, b) => new Date(b.fechaApertura).getTime() - new Date(a.fechaApertura).getTime());

    if (hasPermission('cerrar_caso')) {
        // GERENTE: KANBAN BOARD
        const columns = Object.values(ESTADOS_CASO);
        let html = `<div class="view-enter flex flex-col h-full w-full">
            <h1 class="text-3xl font-bold mb-6">Tablero Kanban de Casos (Visión Nacional)</h1>
            <div class="kanban-board">`;
            
        columns.forEach(colName => {
            const colCases = list.filter(c => c.estado === colName);
            html += `<div class="kanban-col">
                <div class="kanban-header">${colName} <span class="badge badge-neutral">${colCases.length}</span></div>
                <div class="kanban-cards">`;
                
            colCases.forEach(c => {
                html += `<div class="kanban-card glass-card">
                    <div class="flex justify-between items-start mb-2">
                        <span class="font-bold text-gradient-fuchsia">${c.id}</span>
                        <span class="badge badge-low" style="font-size:0.6rem; padding: 2px 6px; display:flex; align-items:center; gap:0.25rem;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            ${getTimeInState(c.estadoUpdateMs)}
                        </span>
                    </div>
                    <p class="text-xs mb-3 text-secondary" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${c.asunto}</p>
                    <div class="flex justify-between items-center text-xs">
                        <span class="text-muted flex items-center gap-2">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            ${c.asignadoA}
                        </span>
                        <button class="btn btn-secondary" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="navigate('case-detail', {id:'${c.id}'})">Ver</button>
                    </div>
                </div>`;
            });
            html += `</div></div>`;
        });
        return html + `</div></div>`;
    } else {
        // OTROS ROLES: BANDEJA DE TRABAJO
        let myCases = [];
        let trackedCases = [];
        
        if (currentUser.role === ROLES.ESP) {
            myCases = list.filter(c => c.asignadoA === currentUser.username);
            trackedCases = [];
        } else if (currentUser.role === ROLES.SUPER) {
            // SUPER: casos asignados a él + casos PENDIENTE_SUPER de su región + REVISION_SUPERVISOR donde es supervisorAsignado
            myCases = list.filter(c =>
                c.asignadoA === currentUser.username ||
                c.asignadoA === currentUser.role ||
                c.asignadoA === 'admin' ||
                (c.supervisorAsignado === currentUser.username && c.estado === ESTADOS_CASO.REVISION_SUPERVISOR)
            );
            const myEsps = db.users.filter(u => u.role === ROLES.ESP && u.region === currentUser.region).map(u => u.username);
            trackedCases = list.filter(c =>
                myEsps.includes(c.especialistaAsignado || c.creadorOriginal) && !myCases.includes(c)
            );
        } else if (currentUser.role === ROLES.COORD) {
            // COORD: casos PENDIENTE_COORD + REVISION_SUPERVISOR (puede revisar sin esperar al super) + REVISION_COORDINADOR
            myCases = list.filter(c =>
                c.asignadoA === currentUser.username ||
                c.asignadoA === currentUser.role ||
                c.asignadoA === 'coord' ||
                (c.coordinadorAsignado === currentUser.username &&
                 [ESTADOS_CASO.REVISION_SUPERVISOR, ESTADOS_CASO.REVISION_COORDINADOR].includes(c.estado))
            );
            const myRegionUsers = db.users.filter(u => u.region === currentUser.region).map(u => u.username);
            trackedCases = list.filter(c =>
                myRegionUsers.includes(c.especialistaAsignado || c.creadorOriginal) && !myCases.includes(c)
            );
        }

        const renderTable = (cases, showAction, tableId) => {
            if (cases.length === 0) return `<p class="p-6 text-center text-muted">No hay casos en esta bandeja.</p>`;
            
            cases.sort((a, b) => {
                const aPinned = (a.anclados || []).includes(currentUser.username) ? 1 : 0;
                const bPinned = (b.anclados || []).includes(currentUser.username) ? 1 : 0;
                if (aPinned !== bPinned) return bPinned - aPinned;
                const aFav = (a.favoritos || []).includes(currentUser.username) ? 1 : 0;
                const bFav = (b.favoritos || []).includes(currentUser.username) ? 1 : 0;
                if (aFav !== bFav) return bFav - aFav;
                return new Date(b.estadoUpdateMs || 0).getTime() - new Date(a.estadoUpdateMs || 0).getTime();
            });

            let html = `<table id="${tableId}" class="table-container m-0">
                <thead><tr class="table-header"><th>ID</th><th>Asunto</th><th>Estado Actual</th><th>Responsable</th><th>Acción</th></tr></thead><tbody>`;
            cases.forEach(c => {
                const isPinned = (c.anclados || []).includes(currentUser.username);
                const isFav = (c.favoritos || []).includes(currentUser.username);
                html += `<tr class="table-row" oncontextmenu="handleRowRightClick(event)">
                    <td class="font-bold" style="position: relative;">
                        <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 190px; overflow: hidden; pointer-events: none; z-index: 20;">
                            <div class="row-context-menu flex items-center gap-3 pr-3">
                                <button class="btn btn-secondary btn-sm flex items-center justify-center" title="Anclar" onclick="togglePinItem('caso', '${c.id}')" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 0.4rem; border-radius: 6px; color: ${isPinned ? 'var(--cantv-fuchsia)' : 'inherit'};">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
                                </button>
                                <button class="btn btn-secondary btn-sm flex items-center justify-center" title="Favorito" onclick="toggleFavItem('caso', '${c.id}')" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 0.4rem; border-radius: 6px; color: ${isFav ? '#fbbf24' : 'inherit'};">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                </button>
                                <button class="btn btn-secondary btn-sm" title="Cerrar" onclick="closeRowMenu(event)" style="padding: 0.4rem; margin-left: auto; background: transparent; border: none; font-size: 1.2rem; color: #fff;">×</button>
                            </div>
                        </div>
                        ${isPinned ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline mb-0.5 text-cantv-fuchsia"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg> ' : ''}${isFav ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" class="inline mb-0.5" style="color:#fbbf24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> ' : ''}<span class="text-gradient-fuchsia">${c.id}</span>
                    </td>
                    <td>${c.asunto}</td>
                    <td><span class="badge badge-low">${c.estado}</span> <span class="text-xs text-muted ml-2">(${getTimeInState(c.estadoUpdateMs)})</span></td>
                    <td>${c.asignadoA}</td>
                    <td><button class="btn btn-secondary btn-sm" onclick="navigate('case-detail', {id:'${c.id}'})">${showAction ? 'Procesar' : 'Ver'}</button></td>
                </tr>`;
            });
            return html + `</tbody></table>`;
        };

        return `<div class="view-enter max-w-5xl">
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold">Bandeja de Trabajo de Casos</h1>
            </div>
            
            <div class="flex justify-between items-center mb-4 mt-4">
                <h3 class="text-xl font-bold text-cantv-fuchsia flex items-center gap-2"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Requieren mi Acción</h3>
                <input type="text" class="input-field" style="width: 250px;" placeholder="Buscar caso..." onkeyup="filterTable('misCasosTable', this.value)">
            </div>
            <div class="glass-card p-0">${renderTable(myCases, true, 'misCasosTable')}</div>
            
            ${hasPermission('asignar_caso') || hasPermission('rechazar_sustantacion') ? `
            <div class="flex justify-between items-center mt-10 mb-4">
                <h3 class="text-xl font-bold flex items-center gap-2"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> En Seguimiento (Mi Región)</h3>
                <input type="text" class="input-field" style="width: 250px;" placeholder="Buscar caso..." onkeyup="filterTable('segCasosTable', this.value)">
            </div>
            <div class="glass-card p-0">${renderTable(trackedCases, false, 'segCasosTable')}</div>
            ` : ''}
        </div>`;
    }
}

function renderCaseDetail(id) {
    const c = db.casos.find(x => x.id === id);
    
    let involucradosHtml = '';
    if (c.personasInvolucradas.length === 0) {
        involucradosHtml = `<p class="text-sm text-muted mb-4">Nadie vinculado aún.</p>`;
    } else {
        involucradosHtml = `<div class="flex flex-wrap gap-2 mb-4">` + 
            c.personasInvolucradas.map(ced => {
                const p = db.personas.find(x => x.cedula === ced);
                const name = p ? p.nombre : ced;
                const grado = (c.implicaciones && c.implicaciones[ced]) || 'No Definido';
                const deleteBtn = c.estado === ESTADOS_CASO.SUSTANCIACION ? 
                    `<svg onclick="eliminarPersona('${c.id}', '${ced}')" style="cursor:pointer; margin-left: 4px; color: #ef4444;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>` : '';
                return `<span class="badge badge-low flex items-center gap-1" style="background: rgba(255,255,255,0.05); color: var(--text-primary); border-color: rgba(255,255,255,0.1);">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--cantv-fuchsia)" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    ${name} (${ced}) <span class="text-gradient-fuchsia ml-1 font-bold">[${grado}]</span> ${deleteBtn}
                </span>`;
            }).join('') + `</div>`;
    }

    // Build Timeline (Línea de Tiempo)
    let timelineHtml = `<div style="margin-top:2rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.08)">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Línea de Tiempo del Caso</h3>
        <div class="timeline-container relative" style="border-left: 2px solid rgba(255,255,255,0.1); padding-left: 1rem; margin-left: 0.5rem; display: flex; flex-direction: column; gap: 1rem;">`;
    
    if (c.estadoLog && c.estadoLog.length > 0) {
        c.estadoLog.forEach((log, index) => {
            const dateStr = new Date(log.fecha_cambio).toLocaleString('es-VE', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
            let durationStr = '';
            
            // Calculate time spent in this state until the next transition or 'now'
            let endTimeMs = Date.now();
            if (index < c.estadoLog.length - 1) {
                endTimeMs = new Date(c.estadoLog[index + 1].fecha_cambio).getTime();
            }
            
            // Only calculate duration if it's not closed and it's the current state, OR if it's a past state
            if (index < c.estadoLog.length - 1 || c.estado !== ESTADOS_CASO.CERRADO) {
                const diffMs = endTimeMs - new Date(log.fecha_cambio).getTime();
                const diffMins = Math.floor(diffMs / 60000);
                if (diffMins < 60) {
                    durationStr = `${diffMins} min`;
                } else if (diffMins < 1440) {
                    durationStr = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
                } else {
                    durationStr = `${Math.floor(diffMins / 1440)}d ${Math.floor((diffMins % 1440) / 60)}h`;
                }
            } else {
                durationStr = `Finalizado`;
            }

            const actorUser = db.users.find(u => u.username === log.usuario_id);
            const actorName = actorUser ? actorUser.name : log.usuario_id;
            
            timelineHtml += `<div class="timeline-item relative" style="background: rgba(255,255,255,0.03); border-radius: 6px; padding: 0.75rem 1rem;">
                <div style="position: absolute; left: -1.45rem; top: 1.25rem; width: 10px; height: 10px; border-radius: 50%; background: var(--cantv-fuchsia); border: 2px solid var(--bg-card);"></div>
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-sm text-gradient-fuchsia">${log.estado_nuevo}</p>
                        <p class="text-xs text-muted mt-1">Por: <span class="text-white">${actorName}</span></p>
                    </div>
                    <div class="text-right">
                        <p class="text-xs text-muted">${dateStr}</p>
                        <p class="text-xs font-semibold mt-1" style="color:#fbbf24">Duración: ${durationStr}</p>
                    </div>
                </div>
            </div>`;
        });
    } else {
        timelineHtml += `<p class="text-xs text-muted">No hay registros de tiempo para este caso antiguo.</p>`;
    }
    timelineHtml += `</div></div>`;

    let actions = '<p class="text-muted text-sm">Sin acciones disponibles para tu rol en este estado.</p>';
    
    // COORD: Elaborar plan de trabajo
    if (c.estado === ESTADOS_CASO.PENDIENTE_COORD && hasPermission('Plan_trabajo')) {
        actions = `<textarea id="planTrabajo" class="input-field mb-4" rows="4" placeholder="Escriba aquí el Plan de Trabajo para la investigación...">${c.planTrabajo || ''}</textarea>
                   <button class="btn btn-primary" onclick="coordElaborarPlan('${id}')">Guardar Plan y Enviar al Supervisor</button>`;
    }
    // SUPERVISOR: Asignar especialista
    else if (c.estado === ESTADOS_CASO.PENDIENTE_SUPER && hasPermission('asignar_caso')) {
        const espUsers = db.users.filter(u => u.role === ROLES.ESP && u.region === currentUser.region);
        const options = espUsers.map(u => `<option value="${u.username}">${u.name} (${u.username})</option>`).join('');
        const limitDefault = new Date(); limitDefault.setDate(limitDefault.getDate() + 30);
        actions = `<div class="form-grid mb-4">
            <div><label class="form-label mb-2 block">Especialista a Asignar:</label>
            <select id="asignarEsp" class="input-field">${options}</select></div>
            <div><label class="form-label mb-2 block">Fecha Límite:</label>
            <input type="date" id="fechaLimite" class="input-field" value="${limitDefault.toISOString().split('T')[0]}"></div>
        </div>
        <button class="btn btn-primary" onclick="superAsignarEsp('${id}')">Asignar Especialista al Caso</button>`;
    }
    // ESP: Iniciar sustanciación
    else if (c.estado === ESTADOS_CASO.PENDIENTE && currentUser.username === c.asignadoA) {
        actions = `<button class="btn btn-primary mt-4" onclick="iniciarSustanciacion('${id}')">Iniciar Sustanciación</button>`;
    }
    // ESP: Trabajar en sustanciación (nueva o editada tras rechazo)
    else if (c.estado === ESTADOS_CASO.SUSTANCIACION && currentUser.username === c.asignadoA) {
        const hasExisting = c.sustanciacion;
        const rejMsgs = (c.historialMensajes || []).filter(m => m.texto.startsWith('RECHAZADO'));
        const rejHtml = rejMsgs.length > 0 ? `<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:1rem;margin-bottom:1rem">
            <p style="color:#f87171;font-size:0.8rem;font-weight:600;margin-bottom:0.4rem">Correcciones requeridas:</p>
            ${rejMsgs.slice(-3).map(m => `<p style="color:#fca5a5;font-size:0.8rem;margin-bottom:0.2rem">→ <em>${m.autor}</em>: ${m.texto.replace('RECHAZADO: ', '')}</p>`).join('')}
        </div>` : '';
        actions = `${rejHtml}<form onsubmit="submitSust(event, '${id}')" class="flex flex-col gap-4 mt-2">
            <textarea id="sustText" class="input-field" rows="4" required placeholder="Hallazgos y Sustanciación...">${hasExisting ? hasExisting.detalle : ''}</textarea>
            <div class="form-group"><label class="form-label" style="font-size:0.8rem">Documento 1 (cualquier formato)</label>
            <input type="file" id="sustXls" class="input-field" style="padding-top:10px;"></div>
            <div class="form-group"><label class="form-label" style="font-size:0.8rem">Documento 2 (cualquier formato)</label>
            <input type="file" id="sustPpt" class="input-field" style="padding-top:10px;"></div>
            <button class="btn btn-primary">${hasExisting ? 'Actualizar y Reenviar Sustanciación' : 'Enviar Sustanciación a Revisión'}</button>
        </form>`;
    }
    // SUPER: Revisar sustanciación (REVISION_SUPERVISOR)
    else if (c.estado === ESTADOS_CASO.REVISION_SUPERVISOR && hasPermission('rechazar_sustantacion') &&
             (c.supervisorAsignado === currentUser.username || c.asignadoA === currentUser.username || c.asignadoA === 'admin')) {
        actions = `<div class="flex flex-col gap-4 mt-4">
            <textarea id="superObs" class="input-field" rows="2" placeholder="Observaciones / Motivo de Rechazo (Obligatorio si rechaza)"></textarea>
            <div class="flex gap-2">
                <button class="btn btn-primary flex-1" onclick="aprobarSupervisor('${id}')">Aprobar y Enviar al Coordinador</button>
                <button class="btn btn-secondary flex-1" style="background:rgba(239,68,68,0.15);color:white;" onclick="rechazarCasoSupervisor('${id}')">Rechazar y Devolver al Especialista</button>
            </div>
        </div>`;
    }
    // COORD: Puede revisar en REVISION_SUPERVISOR o REVISION_COORDINADOR
    else if ([ESTADOS_CASO.REVISION_SUPERVISOR, ESTADOS_CASO.REVISION_COORDINADOR].includes(c.estado) && hasPermission('rechazar_sustantacion') &&
             (c.coordinadorAsignado === currentUser.username || c.asignadoA === currentUser.username || c.asignadoA === 'coord' || c.asignadoA === ROLES.COORD)) {
        const notice = c.estado === ESTADOS_CASO.REVISION_SUPERVISOR
            ? '<p class="text-xs" style="color:#fcd34d;margin-bottom:0.75rem">El Supervisor aún no ha revisado. Puedes evaluar y aprobar/rechazar directamente.</p>'
            : '<p class="text-xs" style="color:#34d399;margin-bottom:0.75rem">El Supervisor ya aprobó. Procede con tu revisión final.</p>';
        actions = `<div class="flex flex-col gap-4 mt-4">
            ${notice}
            <textarea id="coordObs" class="input-field" rows="2" placeholder="Observaciones / Motivo de Rechazo (Obligatorio si rechaza)"></textarea>
            <div class="flex gap-2">
                <button class="btn btn-primary flex-1" onclick="aprobarCoordinador('${id}')">Aprobar y Enviar a Gerencia</button>
                <button class="btn btn-secondary flex-1" style="background:rgba(239,68,68,0.15);color:white;" onclick="rechazarCasoCoordinador('${id}')">Rechazar y Devolver al Especialista</button>
            </div>
        </div>`;
    }
    // GERENTE: Cerrar caso
    else if (c.estado === ESTADOS_CASO.REVISION_GERENCIA && hasPermission('cerrar_caso')) {
        actions = `<form onsubmit="cerrarCasoGerencia(event, '${id}')" class="flex flex-col gap-4 mt-4">
            <p class="text-sm text-muted">Cargar Memorándum Final para cerrar el expediente.</p>
            <input type="file" id="memoPdf" class="input-field" required style="padding-top:10px;">
            <button class="btn btn-primary">Aprobar Final, Cerrar Caso y Emitir Memo</button>
        </form>`;
    }

    return `<div class="view-enter max-w-4xl mx-auto">
        <div class="flex items-center gap-3 mb-6">
            <button onclick="navigate('casos')" class="btn btn-secondary btn-sm" style="padding:0.4rem 0.8rem">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div>
                <h1 class="text-3xl font-bold" style="margin:0">Caso ${c.id}</h1>
                <p style="color:var(--text-secondary);font-size:0.85rem;margin-top:0.1rem">Detalle completo de la investigación y soportes.</p>
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 2rem; align-items: start;">
            <div style="min-width: 0;">
            ${c.planTrabajo && c.planTrabajo !== 'Sin plan de trabajo especificado.' ? `<div class="glass-card mb-6" style="border-left:4px solid var(--cantv-blue-base); word-break: break-word; overflow-wrap: break-word;">
                <h3 class="font-bold mb-2">Plan de Trabajo (Coordinación)</h3>
                <p class="text-sm text-secondary" style="white-space: pre-wrap; word-wrap: break-word;">${c.planTrabajo}</p>
            </div>` : ''}

            ${c.sustanciacion ? `<div class="glass-card mb-6" style="border-left:4px solid var(--cantv-fuchsia);">
                <h3 class="font-bold mb-3">Sustanciación Completada</h3>
                <p class="text-sm mb-4" style="color:var(--text-secondary);white-space:pre-wrap">${c.sustanciacion.detalle}</p>
                <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
                    ${c.sustanciacion.xls ? renderFileBadge(c.sustanciacion.xls) : ''}
                    ${c.sustanciacion.ppt ? renderFileBadge(c.sustanciacion.ppt) : ''}
                </div>
            </div>` : ''}
            
            ${c.memoFinal ? `<div class="glass-card mb-6" style="border-left:4px solid #10b981;">
                <h3 class="font-bold mb-3">Cierre Gerencial (Memorándum Final)</h3>
                ${renderFileBadge(c.memoFinal)}
            </div>` : ''}

            ${c.historialMensajes && c.historialMensajes.length > 0 ? `
            <div class="glass-card mb-6">
                <h3 class="font-bold mb-2 text-sm">Historial de Revisiones</h3>
                <div class="flex flex-col gap-2">
                    ${c.historialMensajes.map(m => `<div class="p-2 bg-black/20 rounded text-xs">
                        <strong class="text-cantv-fuchsia">${m.autor}</strong> <span class="text-muted">(${m.fecha})</span><br>
                        ${m.texto}
                    </div>`).join('')}
                </div>
            </div>` : ''}
            
            ${timelineHtml}
            </div>
            
            <div>
            <div class="glass-card mb-4">
                <h3 class="font-bold mb-4">Personas Involucradas</h3>
                ${involucradosHtml}
                ${c.estado === ESTADOS_CASO.SUSTANCIACION ? `
                <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.06)">
                    <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem">Vincular persona por Cédula:</p>
                    <div class="flex flex-col gap-2">
                        <input type="text" id="linkCedula" class="input-field" placeholder="Ej. V-12345678" style="font-size:0.85rem;padding:0.6rem 0.8rem">
                        <select id="linkGrado" class="input-field" style="font-size:0.85rem;padding:0.6rem 0.8rem">
                            <option value="">Seleccione el Grado de Implicación...</option>
                            <option value="Culpable">Culpable</option>
                            <option value="Implicado Principal">Implicado Principal</option>
                            <option value="Cómplice">Cómplice</option>
                            <option value="Testigo">Testigo</option>
                            <option value="Víctima">Víctima</option>
                            <option value="Inocente">Inocente</option>
                        </select>
                        <button class="btn btn-secondary whitespace-nowrap mt-2" style="font-size:0.8rem" onclick="vincularPersona('${id}')">Vincular al Caso</button>
                    </div>
                </div>` : ''}
            </div>
            <div class="glass-card">
                <h3 style="font-size:0.875rem;font-weight:600;margin-bottom:1rem">Panel de Acciones</h3>
                ${actions}
            </div>
            </div>
        </div>
    </div>`;
}
async function vincularPersona(casoId) {
    const cedula = document.getElementById('linkCedula').value.trim();
    const grado = document.getElementById('linkGrado').value;
    
    if(!cedula) return showToast('Ingrese una cédula.', 'warning');
    if(!grado) return showToast('Debe seleccionar el grado de implicación.', 'warning');

    const p = db.personas.find(x => x.cedula === cedula);
    if(!p) {
        showToast(`La cédula ${cedula} no existe. Por favor, registre a esta persona en el Directorio de Expedientes primero.`, 'error');
        return;
    }

    const c = db.casos.find(x => x.id === casoId);
    if(c.personasInvolucradas && c.personasInvolucradas.includes(cedula)) {
        showToast(`Esta persona ya está vinculada. La actualización de grado aún no está disponible.`, 'info');
        return;
    }
    
    // Insert new relation
    const res = await fetch('/api/db/investigacion_persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            investigacion_id: casoId,
            persona_id: p.id,
            grado_implicacion: grado
        })
    });

    if(res.ok) {
        await initDB();
        showToast(`${p.nombre} vinculado correctamente al caso como ${grado}.`, 'success');
        navigate('case-detail', {id: casoId});
    } else {
        showToast('Error al vincular persona en la base de datos.', 'error');
    }
}

async function checkAutoAddPersona(val, casoId) {
    // Legacy auto-add code. Removing for now since it needs API.
}

async function eliminarPersona(casoId, cedula) {
    const p = db.personas.find(x => x.cedula === cedula);
    if (!p) return;
    
    const res = await fetch(`/api/db/investigacion_persona?investigacion_id=eq.${casoId}&persona_id=eq.${p.id}`, {
        method: 'DELETE'
    });
    
    await initDB();
    navigate('case-detail', {id: casoId});
}
async function iniciarSustanciacion(id) {
    const c = db.casos.find(x => x.id === id);
    
    await fetch(`/api/db/investigaciones/id/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ estatus: ESTADOS_CASO.SUSTANCIACION }) });
    await fetch('/api/db/casos_estado_historial', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, estado_anterior: c.estado, estado_nuevo: ESTADOS_CASO.SUSTANCIACION, fecha_cambio: new Date().toISOString(), usuario_id: currentUser.id }) });
    
    await initDB();
    navigate('case-detail', {id});
}
async function submitSust(e, id) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    if(btn) btn.disabled = true;

    const c = db.casos.find(x => x.id === id);
    const hasExisting = c.sustanciacion;
    const f1 = document.getElementById('sustXls').files[0];
    const f2 = document.getElementById('sustPpt').files[0];
    const [adj1, adj2] = await Promise.all([readFileAsDataURL(f1), readFileAsDataURL(f2)]);

    let url1 = hasExisting ? hasExisting.xls : null;
    let url2 = hasExisting ? hasExisting.ppt : null;

    if (adj1 && f1) {
        const u1Res = await fetch('/api/upload', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fileBase64: adj1, fileName: f1.name}) });
        if(u1Res.ok) url1 = (await u1Res.json()).url;
    }
    if (adj2 && f2) {
        const u2Res = await fetch('/api/upload', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fileBase64: adj2, fileName: f2.name}) });
        if(u2Res.ok) url2 = (await u2Res.json()).url;
    }

    const payload = {
        sustanciacion_detalle: document.getElementById('sustText').value,
        sustanciacion_doc1: url1,
        sustanciacion_doc2: url2,
        estatus: ESTADOS_CASO.REVISION_SUPERVISOR
    };

    const res = await fetch(`/api/db/investigaciones/id/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        if(btn) btn.disabled = false;
        return alert("Error al guardar sustanciación.");
    }

    // Registrar historial de estado
    await fetch('/api/db/casos_estado_historial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            investigacion_id: id,
            estado_anterior: c.estado,
            estado_nuevo: ESTADOS_CASO.REVISION_SUPERVISOR,
            fecha_cambio: new Date().toISOString(),
            usuario_id: currentUser.id
        })
    });

    // Registrar mensaje
    await fetch('/api/db/casos_comentarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            investigacion_id: id,
            autor_id: currentUser.id,
            texto: 'Sustanciación enviada a revisión.',
            fecha: new Date().toISOString()
        })
    });

    await initDB(); // Refetch data
    const supervisor = c.supervisorAsignado || ROLES.SUPER;
    notifyUser(supervisor, `Sustanciación lista para el Caso ${id}. Requiere tu revisión.`, { view: 'case-detail', params: { id } });
    const coord = c.coordinadorAsignado || ROLES.COORD;
    notifyUser(coord, `El Especialista envió sustanciación del Caso ${id}. Puedes revisarla directamente.`, { view: 'case-detail', params: { id } });
    showToast('Sustanciación enviada a revisión.', 'success');
    navigate('casos');
}
async function aprobarSupervisor(id) {
    const c = db.casos.find(x => x.id === id);
    const obs = document.getElementById('superObs').value.trim();
    
    await fetch(`/api/db/investigaciones/id/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ estatus: ESTADOS_CASO.REVISION_COORDINADOR }) });
    await fetch('/api/db/casos_estado_historial', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, estado_anterior: c.estado, estado_nuevo: ESTADOS_CASO.REVISION_COORDINADOR, fecha_cambio: new Date().toISOString(), usuario_id: currentUser.id }) });
    
    if(obs) {
        await fetch('/api/db/casos_comentarios', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, autor_id: currentUser.id, texto: `Aprobó con observación: ${obs}`, fecha: new Date().toISOString() }) });
    }
    await fetch('/api/db/casos_comentarios', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, autor_id: currentUser.id, texto: 'Sustanciación aprobada por Supervisor. Enviado a Coordinador.', fecha: new Date().toISOString() }) });

    await initDB();
    const coord = c.coordinadorAsignado || ROLES.COORD;
    notifyUser(coord, `El Supervisor aprobó el Caso ${id}. Requiere tu revisión final.`, { view: 'case-detail', params: { id } });
    showToast('Caso enviado al Coordinador para revisión.', 'success');
    navigate('casos');
}

async function rechazarCasoSupervisor(id) {
    const c = db.casos.find(x => x.id === id);
    const obs = document.getElementById('superObs').value.trim();
    if(!obs) return uiAlert('Debe incluir un motivo de rechazo.');
    
    await fetch(`/api/db/investigaciones/id/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ estatus: ESTADOS_CASO.SUSTANCIACION }) });
    await fetch('/api/db/casos_estado_historial', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, estado_anterior: c.estado, estado_nuevo: ESTADOS_CASO.SUSTANCIACION, fecha_cambio: new Date().toISOString(), usuario_id: currentUser.id }) });
    await fetch('/api/db/casos_comentarios', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, autor_id: currentUser.id, texto: `RECHAZADO: ${obs}`, fecha: new Date().toISOString() }) });

    await initDB();
    const esp = c.especialistaAsignado || c.creadorOriginal;
    notifyUser(esp, `Tu Caso ${id} fue RECHAZADO por el Supervisor. Revisa las correcciones y reenvía.`, { view: 'case-detail', params: { id } });
    showToast('Caso devuelto al Especialista con correcciones.', 'info');
    navigate('casos');
}

async function aprobarCoordinador(id) {
    const c = db.casos.find(x => x.id === id);
    const obs = document.getElementById('coordObs') ? document.getElementById('coordObs').value.trim() : '';
    
    await fetch(`/api/db/investigaciones/id/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ estatus: ESTADOS_CASO.REVISION_GERENCIA }) });
    await fetch('/api/db/casos_estado_historial', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, estado_anterior: c.estado, estado_nuevo: ESTADOS_CASO.REVISION_GERENCIA, fecha_cambio: new Date().toISOString(), usuario_id: currentUser.id }) });
    
    if (obs) {
        await fetch('/api/db/casos_comentarios', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, autor_id: currentUser.id, texto: `Aprobó con observación: ${obs}`, fecha: new Date().toISOString() }) });
    }
    await fetch('/api/db/casos_comentarios', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, autor_id: currentUser.id, texto: 'Caso aprobado por Coordinador. Enviado a Gerencia.', fecha: new Date().toISOString() }) });

    await initDB();
    notifyUser(ROLES.GERENTE, `El Coordinador aprobó el Caso ${id}. Requiere Revisión Final por Gerencia.`, { view: 'case-detail', params: { id } });
    showToast('Caso enviado a Gerencia para cierre final.', 'success');
    navigate('casos');
}

async function rechazarCasoCoordinador(id) {
    const c = db.casos.find(x => x.id === id);
    const obs = document.getElementById('coordObs') ? document.getElementById('coordObs').value.trim() : '';
    if (!obs) return uiAlert('Debe incluir el motivo de rechazo.');
    
    await fetch(`/api/db/investigaciones/id/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ estatus: ESTADOS_CASO.SUSTANCIACION }) });
    await fetch('/api/db/casos_estado_historial', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, estado_anterior: c.estado, estado_nuevo: ESTADOS_CASO.SUSTANCIACION, fecha_cambio: new Date().toISOString(), usuario_id: currentUser.id }) });
    await fetch('/api/db/casos_comentarios', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, autor_id: currentUser.id, texto: `RECHAZADO: ${obs}`, fecha: new Date().toISOString() }) });

    await initDB();
    const esp = c.especialistaAsignado || c.creadorOriginal;
    notifyUser(esp, `Tu Caso ${id} fue RECHAZADO por el Coordinador. Revisa las correcciones y reenvía.`, { view: 'case-detail', params: { id } });
    showToast('Caso devuelto al Especialista con correcciones del Coordinador.', 'info');
    navigate('casos');
}

async function coordElaborarPlan(id) {
    const c = db.casos.find(x => x.id === id);
    const pt = document.getElementById('planTrabajo') ? document.getElementById('planTrabajo').value.trim() : '';
    if (!pt) return uiAlert('Debe redactar el Plan de Trabajo antes de enviar.');
    
    const payload = {
        plan_trabajo: pt,
        coordinador_asignado: currentUser.id,
        estatus: ESTADOS_CASO.PENDIENTE_SUPER
    };
    
    await fetch(`/api/db/investigaciones/id/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    await fetch('/api/db/casos_estado_historial', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, estado_anterior: c.estado, estado_nuevo: ESTADOS_CASO.PENDIENTE_SUPER, fecha_cambio: new Date().toISOString(), usuario_id: currentUser.id }) });
    await fetch('/api/db/casos_comentarios', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, autor_id: currentUser.id, texto: 'Plan de Trabajo elaborado. Enviado al Supervisor para asignación de especialista.', fecha: new Date().toISOString() }) });
    
    await initDB();
    notifyUser(ROLES.SUPER, `Coordinador elaboró el Plan de Trabajo del Caso ${id}. Asigna un especialista.`, { view: 'case-detail', params: { id } });
    showToast('Plan de Trabajo registrado. Caso enviado al Supervisor.', 'success');
    navigate('casos');
}

async function superAsignarEsp(id) {
    const c = db.casos.find(x => x.id === id);
    const espUsername = document.getElementById('asignarEsp').value;
    const limit = document.getElementById('fechaLimite').value;
    if (!espUsername) return uiAlert('Debe seleccionar un especialista.');
    if (!limit) return uiAlert('Debe establecer una fecha límite.');
    
    const espUser = db.users.find(u => u.username === espUsername);
    if (!espUser) return uiAlert('Especialista no encontrado.');

    const payload = {
        especialista_asignado: espUser.id,
        supervisor_asignado: currentUser.id,
        fecha_limite: limit,
        estatus: ESTADOS_CASO.PENDIENTE
    };

    await fetch(`/api/db/investigaciones/id/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    await fetch('/api/db/casos_estado_historial', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, estado_anterior: c.estado, estado_nuevo: ESTADOS_CASO.PENDIENTE, fecha_cambio: new Date().toISOString(), usuario_id: currentUser.id }) });
    await fetch('/api/db/casos_comentarios', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, autor_id: currentUser.id, texto: `Caso asignado al especialista ${espUsername}. Fecha límite: ${limit}.`, fecha: new Date().toISOString() }) });
    
    await initDB();
    notifyUser(espUsername, `Se te ha asignado el Caso ${id} para sustanciación. Fecha límite: ${limit}.`, { view: 'case-detail', params: { id } });
    showToast(`Caso asignado al Especialista ${espUser.name}.`, 'success');
    navigate('casos');
}
async function cerrarCasoGerencia(e, id) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    if(btn) btn.disabled = true;

    const c = db.casos.find(x => x.id === id);
    const memo = document.getElementById('memoPdf').files[0];
    const memoBase64 = memo ? await readFileAsDataURL(memo) : null;
    
    let memoUrl = null;
    if (memoBase64 && memo) {
        const resUpload = await fetch('/api/upload', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({fileBase64: memoBase64, fileName: memo.name}) });
        if(resUpload.ok) memoUrl = (await resUpload.json()).url;
    }

    const payload = {
        estatus: ESTADOS_CASO.CERRADO,
        conclusion: 'Caso cerrado por Gerencia. Memorándum emitido.',
        soporte_path: memoUrl
    };

    await fetch(`/api/db/investigaciones/id/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    await fetch('/api/db/casos_estado_historial', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, estado_anterior: c.estado, estado_nuevo: ESTADOS_CASO.CERRADO, fecha_cambio: new Date().toISOString(), usuario_id: currentUser.id }) });
    await fetch('/api/db/casos_comentarios', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ investigacion_id: id, autor_id: currentUser.id, texto: 'Caso cerrado por Gerencia. Memorándum emitido.', fecha: new Date().toISOString() }) });

    await initDB();
    
    const chain = new Set([ROLES.SUPER, ROLES.COORD, c.creadorOriginal, c.especialistaAsignado, c.supervisorAsignado, c.coordinadorAsignado].filter(Boolean));
    chain.forEach(u => notifyUser(u, `Gerencia ha CERRADO el Caso ${id}. Memo adjunto.`, { view: 'case-detail', params: { id } }));
    showToast(`Caso ${id} cerrado exitosamente.`, 'success');
    navigate('casos');
}

// --- DIRECTORIO DE EXPEDIENTES (PERSONAS) ---
function renderExpedientes() {
    let list = [...db.personas].reverse();
    
    let html = `<div class="view-enter">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-3xl font-bold">Directorio de Expedientes</h1>
            <button class="btn btn-primary flex items-center gap-2" onclick="navigate('create-persona')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Registrar Nueva Persona
            </button>
        </div>
        <div class="glass-card p-0"><table class="table-container m-0">
            <thead><tr class="table-header"><th>Cédula</th><th>Nombre Persona</th><th>Casos Vinculados</th><th>Acción</th></tr></thead><tbody>`;
    if(list.length===0) html += `<tr><td colspan="4" class="text-center p-6 text-muted">No hay personas registradas en su bandeja.</td></tr>`;
    else list.forEach(p => {
        let personCasos = db.casos.filter(c => c.personasInvolucradas.includes(p.cedula));
        const count = personCasos.length;
        html += `<tr class="table-row">
            <td class="font-bold">${p.cedula}</td><td>${p.nombre}</td><td><span class="badge badge-med">${count} Casos</span></td>
            <td><button class="btn btn-secondary btn-sm" onclick="navigate('expediente-detail', {cedula:'${p.cedula}'})">Ver Expediente Completo</button></td>
        </tr>`;
    });
    return html + `</tbody></table></div></div>`;
}

function renderExpedienteDetail(cedula) {
    const p = db.personas.find(x => x.cedula === cedula || x.id == cedula);
    if(!p) return '<div class="view-enter">Persona no encontrada en el sistema.</div>';
    
    let personCasos = db.casos.filter(c => c.personasInvolucradas.includes(p.id));
    
    return `<div class="view-enter max-w-3xl">
        <h1 class="text-3xl font-bold mb-2">Expediente Histórico</h1>
        <p class="text-secondary mb-6">Perfil y trazabilidad del individuo investigado.</p>
        
        <div class="glass-card mb-6 flex justify-between items-center">
            <div>
                <p class="text-sm text-muted">Nombre Completo</p><p class="text-2xl font-bold text-gradient-fuchsia">${p.nombres} ${p.apellidos}</p>
                <p class="text-sm text-muted mt-2">Documento de Identidad (Cédula)</p><p class="font-bold">${p.cedula}</p>
            </div>
            ${hasPermission('editar_expediente') ? `
            <div class="flex flex-col gap-2">
                <button class="btn bg-white bg-opacity-10 text-white text-xs hover:bg-opacity-20" onclick="openEstudioModal('${p.id}')">
                    + Agregar Estudio
                </button>
                <button class="btn bg-white bg-opacity-10 text-white text-xs hover:bg-opacity-20" onclick="openReferenciaModal('${p.id}')">
                    + Agregar Referencia Laboral
                </button>
            </div>
            ` : ''}
        </div>

        <div class="glass-card mb-6">
            <h3 class="text-xl font-bold mb-4">Estudios y Titulaciones</h3>
            <div class="flex flex-col gap-2 text-sm">
                ${p.estudios && p.estudios.length > 0 
                    ? p.estudios.map(e => `<div class="p-3 bg-white bg-opacity-5 rounded border border-white border-opacity-10 flex justify-between items-center">
                        <div>
                            <p class="font-bold">${e.titulo}</p>
                            <p class="text-xs text-muted">${e.institucion} - ${e.estado_estudio}</p>
                        </div>
                        ${e.soporte_path ? `<a href="${e.soporte_path}" target="_blank" class="text-fuchsia text-xs hover:underline flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Ver Soporte</a>` : ''}
                    </div>`).join('') 
                    : '<p class="text-muted text-xs">No hay estudios registrados.</p>'}
            </div>
        </div>

        <div class="glass-card mb-6">
            <h3 class="text-xl font-bold mb-4">Referencias Laborales</h3>
            <div class="flex flex-col gap-2 text-sm">
                ${p.referencias && p.referencias.length > 0 
                    ? p.referencias.map(r => `<div class="p-3 bg-white bg-opacity-5 rounded border border-white border-opacity-10 flex justify-between items-center">
                        <div>
                            <p class="font-bold">${r.referencia_contacto}</p>
                            <p class="text-xs text-muted">${r.telefono_contacto || 'Sin Tlf'} | ${r.fecha_inicio || '-'} a ${r.fecha_fin || 'Actualidad'}</p>
                            <p class="text-xs text-muted mt-1">Salario: ${r.salario || 'N/A'} - Egreso: ${r.motivo_egreso || 'N/A'}</p>
                        </div>
                        ${r.soporte_path ? `<a href="${r.soporte_path}" target="_blank" class="text-fuchsia text-xs hover:underline flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Ver Soporte</a>` : ''}
                    </div>`).join('') 
                    : '<p class="text-muted text-xs">No hay referencias laborales registradas.</p>'}
            </div>
        </div>
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold">Casos Asociados a este Expediente</h3>
            <input type="text" class="input-field" style="width: 250px;" placeholder="Buscar caso..." onkeyup="filterTable('casosTable', this.value)">
        </div>
        <div class="glass-card p-0"><table id="casosTable" class="table-container m-0">
            <thead><tr class="table-header"><th>ID Caso</th><th>Asunto</th><th>Grado de Implicación</th><th>Estado del Caso</th></tr></thead><tbody>
            ${personCasos.map(c => {
                const grado = (c.implicaciones && c.implicaciones[p.cedula]) || 'No Definido';
                return `<tr class="table-row"><td>${c.id}</td><td>${c.asunto}</td><td><span class="text-gradient-fuchsia text-sm font-bold">${grado}</span></td><td><span class="badge badge-low">${c.estado}</span></td></tr>`;
            }).join('')}
            </tbody>
        </table></div>
    </div>`;
}

function renderCreatePersona() {
    return `<div class="view-enter max-w-3xl">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-3xl font-bold">Registrar Nuevo Expediente de Persona</h1>
            <button class="btn btn-secondary flex items-center gap-2" onclick="navigate('expedientes')">Volver</button>
        </div>
        <div class="glass-card">
            <form onsubmit="submitPersona(event)" class="flex flex-col gap-4">
                <div class="form-grid">
                    <div class="form-group"><label class="form-label">Cédula de Identidad</label>
                        <input type="text" id="perCedula" class="input-field" placeholder="V-12345678" required></div>
                    <div class="form-group"><label class="form-label">Nombre Completo</label>
                        <input type="text" id="perNombre" class="input-field" required></div>
                    <div class="form-group"><label class="form-label">Teléfono</label>
                        <input type="text" id="perTelefono" class="input-field"></div>
                    <div class="form-group"><label class="form-label">Correo Electrónico</label>
                        <input type="email" id="perEmail" class="input-field"></div>
                </div>
                
                <h3 class="font-bold text-lg mt-4 border-b border-white/10 pb-2">Documentos de Soporte (Opcionales)</h3>
                
                <div class="form-group"><label class="form-label">Documento de Identidad (PDF/IMG)</label>
                    <input type="file" id="docIdentidad" class="input-field" style="padding-top:10px;"></div>
                
                <div class="form-group"><label class="form-label">Estudios / Título Académico</label>
                    <input type="file" id="docEstudios" class="input-field" style="padding-top:10px;"></div>
                
                <div class="form-group"><label class="form-label">Referencias Laborales</label>
                    <input type="file" id="docReferencias" class="input-field" style="padding-top:10px;"></div>
                
                <div class="form-group"><label class="form-label">Resumen Curricular (CV)</label>
                    <input type="file" id="docCv" class="input-field" style="padding-top:10px;"></div>
                
                <button type="submit" class="btn btn-primary w-full mt-6 text-lg py-3">Guardar Registro en Directorio</button>
            </form>
        </div>
    </div>`;
}

async function submitPersona(e) {
    e.preventDefault();
    const ced = document.getElementById('perCedula').value.trim();
    if(db.personas.find(p => p.cedula === ced)) {
        return showToast('Esta cédula ya existe en el directorio.', 'error');
    }
    
    // Read files
    const [dId, dEst, dRef, dCv] = await Promise.all([
        readFileAsDataURL(document.getElementById('docIdentidad').files[0]),
        readFileAsDataURL(document.getElementById('docEstudios').files[0]),
        readFileAsDataURL(document.getElementById('docReferencias').files[0]),
        readFileAsDataURL(document.getElementById('docCv').files[0])
    ]);
    
    const docs = [];
    if(dId) docs.push(dId);
    if(dEst) docs.push(dEst);
    if(dRef) docs.push(dRef);
    if(dCv) docs.push(dCv);
    
    const p = {
        cedula: ced,
        nombre: document.getElementById('perNombre').value.trim(),
        telefono: document.getElementById('perTelefono').value,
        email: document.getElementById('perEmail').value,
        documentos: docs
    };
    
    db.personas.push(p);
    saveDB();
    showToast('Persona registrada exitosamente en el directorio.', 'success');
    navigate('expediente-detail', { cedula: p.cedula });
}

// --- ADMIN USERS ---
function renderAdminUsers() {
    if(!hasPermission('registrar_usuario')) return '<div class="view-enter p-8 text-center text-red-400">Acceso Denegado</div>';
    
    let html = `<div class="view-enter max-w-6xl mx-auto">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-3xl font-bold">Administración de Usuarios</h1>
            <button class="btn btn-primary" onclick="adminModalCrearUsuario()">+ Añadir Usuario</button>
        </div>
        <div class="glass-card p-0"><table class="table-container m-0 w-full">
            <thead><tr class="table-header">
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol Actual</th>
                <th class="text-right">Acciones</th>
            </tr></thead>
            <tbody>
    `;
    
    db.users.forEach(u => {
        html += `<tr class="table-row">
            <td>${u.username}</td>
            <td>${u.name || u.username}</td>
            <td>${u.email || '-'}</td>
            <td><span class="badge" style="background:var(--glass-bg-strong)">${u.role}</span></td>
            <td class="text-right flex gap-2 justify-end">
                <button class="btn btn-secondary btn-sm" onclick="adminModalRol('${u.id}', '${u.role_id}')">Cambiar Rol</button>
                ${hasPermission('reestablecer_contra') ? `<button class="btn btn-secondary btn-sm" onclick="adminResetearClave('${u.id}')">Resetear Clave</button>` : ''}
            </td>
        </tr>`;
    });
    
    html += `</tbody></table></div></div>`;
    return html;
}

async function adminModalCrearUsuario() {
    const rolesOpts = db.roles.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    const form = `
        <h3 class="font-bold text-xl mb-4" style="color: var(--cantv-blue-light);">Añadir Nuevo Usuario</h3>
        <div class="flex flex-col gap-4">
            <input type="text" id="nuUser" class="input-field" placeholder="Username (ej. jdoe)" required>
            <input type="text" id="nuName" class="input-field" placeholder="Nombre completo" required>
            <input type="email" id="nuEmail" class="input-field" placeholder="Correo electrónico" required>
            <input type="password" id="nuPass" class="input-field" placeholder="Contraseña inicial" required>
            <select id="nuRole" class="input-field" required>
                <option value="">Seleccione un Rol...</option>
                ${rolesOpts}
            </select>
            <div class="flex gap-2 mt-4">
                <button class="btn btn-primary flex-1" onclick="adminCrearUsuario()">Crear Usuario</button>
                <button class="btn btn-secondary flex-1" onclick="closeModalUI(false)">Cancelar</button>
            </div>
        </div>
    `;
    createModalUI(form);
}

async function adminCrearUsuario() {
    const username = document.getElementById('nuUser').value.trim();
    const email = document.getElementById('nuEmail').value.trim();
    const pass = document.getElementById('nuPass').value;
    const roleId = document.getElementById('nuRole').value;
    
    if(!username || !pass || !roleId) return showToast('Complete los campos obligatorios', 'warning');
    
    const payload = {
        username,
        email,
        password: pass,
        role: roleId
    };
    
    const res = await fetch('/api/db/users', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    });
    
    if(res.ok) {
        closeModalUI(true);
        await initDB();
        showToast('Usuario creado con éxito', 'success');
        navigate('admin-users');
    } else {
        try {
            const errJson = await res.json();
            showToast('Error: ' + (errJson.error || JSON.stringify(errJson)), 'error');
        } catch(e) {
            showToast('Error al crear usuario', 'error');
        }
    }
}

async function adminModalRol(userId, currentRoleId) {
    const rolesOpts = db.roles.map(r => `<option value="${r.id}" ${r.id == currentRoleId ? 'selected' : ''}>${r.name}</option>`).join('');
    const form = `
        <h3 class="font-bold text-xl mb-4" style="color: var(--cantv-blue-light);">Cambiar Rol de Usuario</h3>
        <p class="text-sm text-secondary mb-4">Seleccione el nuevo rol para este usuario en el sistema.</p>
        <select id="newRole" class="input-field mb-6">
            ${rolesOpts}
        </select>
        <div class="flex gap-2">
            <button class="btn btn-primary flex-1" onclick="adminEjecutarCambioRol('${userId}')">Guardar Cambio</button>
            <button class="btn btn-secondary flex-1" onclick="closeModalUI()">Cancelar</button>
        </div>
    `;
    createModalUI(form);
}

async function adminEjecutarCambioRol(userId) {
    const roleId = document.getElementById('newRole').value;
    const res = await fetch(`/api/db/users/id/${userId}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ role: roleId })
    });
    if(res.ok) {
        closeModalUI(true);
        await initDB();
        showToast('Rol actualizado', 'success');
        navigate('admin-users');
    } else {
        showToast('Error al actualizar rol', 'error');
    }
}

async function adminResetearClave(userId) {
    const ok = await uiConfirm('¿Seguro que desea reestablecer la contraseña de este usuario a "CANTV123"?', 'Reestablecer Contraseña');
    if(!ok) return;
    
    const res = await fetch(`/api/db/users/id/${userId}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ password: 'CANTV123' })
    });
    if(res.ok) {
        showToast('Contraseña reestablecida exitosamente', 'success');
    } else {
        showToast('Error al reestablecer contraseña', 'error');
    }
}

// Boot
function filterTable(tableId, term) {
    const rows = document.getElementById(tableId).getElementsByTagName('tbody')[0].getElementsByTagName('tr');
    term = term.toLowerCase();
    for (let i = 0; i < rows.length; i++) {
        rows[i].style.display = rows[i].innerText.toLowerCase().includes(term) ? '' : 'none';
    }
}

initDB();
navigate('login');
    