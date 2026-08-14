require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const path = require('path');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 10;
const isBcryptHash = (pw) => typeof pw === 'string' && /^\$2[aby]\$\d{2}\$/.test(pw);

const app = express();
// Render termina el TLS en su proxy y reenvía la petición como HTTP simple; sin esto,
// req.protocol siempre daría 'http' y el link del correo de notificación quedaría mal armado.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname)); // Serve Index.html statically

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Using Service Role Key bypasses RLS and allows backend full control.
const supabase = createClient(supabaseUrl, supabaseKey);

// Envío de correo vía la API HTTPS de Gmail (no SMTP): Render bloquea las conexiones SMTP
// salientes en su plan gratuito, así que un transporte SMTP tradicional nunca llega a conectar
// ahí. La API REST de Gmail es una petición HTTPS normal, indistinguible de cualquier otra
// llamada que ya hace este servidor, así que no la bloquea. Se autentica con OAuth2 (refresh
// token de la cuenta de Gmail que envía los correos) en vez de una contraseña de aplicación.
// El código nunca se devuelve al navegador: se genera y se envía por email desde el backend únicamente.
function buildResetEmailHtml(token) {
    // Estilos inline porque los clientes de correo (Outlook, Gmail, etc.) ignoran <style>
    // externos o etiquetas <style> en muchos casos; se evita flexbox/grid por compatibilidad.
    return `
<div style="background:#eef2f7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(90deg,#2563eb,#E5007E);padding:28px 32px;text-align:center;">
      <span style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-1px;font-style:italic;">cantv</span>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 12px;font-size:18px;color:#1e293b;">Código de recuperación de contraseña</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.5;">
        Recibimos una solicitud para restablecer tu contraseña en el <strong>Sistema Relacional de Investigaciones</strong>. Usa el siguiente código para continuar:
      </p>
      <div style="background:#ffffff;border:2px solid #E5007E;border-radius:8px;padding:18px;text-align:center;margin-bottom:20px;">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#2563eb;">${token}</span>
      </div>
      <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
        Este código expira en 2 minutos. Si tú no solicitaste este cambio, puedes ignorar este correo con seguridad — tu contraseña actual seguirá siendo válida.
      </p>
    </div>
    <div style="background:#ffffff;padding:16px 32px;text-align:center;border-top:1px solid #f1f5f9;">
      <span style="font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} CANTV — Sistema Relacional de Investigaciones</span>
    </div>
  </div>
</div>`;
}

// Intercambia el refresh token (de larga duración) por un access token (de una hora) — es el
// paso estándar de OAuth2 antes de poder llamar a la API de Gmail.
async function getGmailAccessToken() {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GMAIL_OAUTH_CLIENT_ID,
            client_secret: process.env.GMAIL_OAUTH_CLIENT_SECRET,
            refresh_token: process.env.GMAIL_OAUTH_REFRESH_TOKEN,
            grant_type: 'refresh_token'
        })
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`No se pudo renovar el token de Gmail: ${res.status} ${body}`);
    }
    const data = await res.json();
    return data.access_token;
}

// La API de Gmail espera el mensaje como un correo MIME crudo, codificado en base64url —
// no como campos sueltos (asunto, cuerpo, etc.) como haría un cliente HTTP típico.
function buildRawGmailMessage({ from, to, subject, html }) {
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
    const message = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${encodedSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        '',
        html
    ].join('\r\n');
    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Función genérica de envío: tanto el correo de recuperación como las notificaciones de
// acciones del sistema pasan por aquí, solo cambia el asunto y el HTML.
async function sendEmail(toEmail, subject, html) {
    const senderEmail = process.env.GMAIL_USER;
    if (!process.env.GMAIL_OAUTH_CLIENT_ID || !process.env.GMAIL_OAUTH_CLIENT_SECRET || !process.env.GMAIL_OAUTH_REFRESH_TOKEN || !senderEmail) {
        throw new Error('Credenciales OAuth de Gmail no configuradas en el servidor.');
    }

    const accessToken = await getGmailAccessToken();
    const raw = buildRawGmailMessage({
        from: `"Sistema CANTV" <${senderEmail}>`,
        to: toEmail,
        subject,
        html
    });

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw })
    });

    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Gmail API respondió ${res.status}: ${errBody}`);
    }
}

async function sendResetEmail(toEmail, token) {
    await sendEmail(toEmail, 'Código de recuperación de contraseña - Sistema CANTV', buildResetEmailHtml(token));
}

async function sendEmailChangeCode(toEmail, token) {
    await sendEmail(toEmail, 'Verificación de cambio de correo - Sistema CANTV', `
<div style="background:#eef2f7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(90deg,#2563eb,#E5007E);padding:28px 32px;text-align:center;">
      <span style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-1px;font-style:italic;">cantv</span>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1e293b;text-align:center;">Verificación de cambio de correo</h1>
      <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.5;">Ingresa el siguiente código de 6 dígitos en la aplicación para confirmar tu nueva dirección de correo electrónico. El código expirará en 2 minutos.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px;">
        <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#0f172a;">${token}</span>
      </div>
      <p style="margin:0;font-size:13px;color:#64748b;text-align:center;">Si no solicitaste este cambio, ignora este mensaje.</p>
    </div>
  </div>
</div>`);
}

// Misma plantilla visual que el correo de recuperación, pero para el mensaje libre de una
// notificación del sistema (nueva incidencia, aprobación, rechazo, asignación, etc.).
function buildNotificationEmailHtml(message, appUrl, senderName) {
    return `
<div style="background:#eef2f7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(90deg,#2563eb,#E5007E);padding:28px 32px;text-align:center;">
      <span style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-1px;font-style:italic;">cantv</span>
    </div>
    <div style="padding:32px;">
      <h1 style="margin:0 0 4px;font-size:18px;color:#1e293b;">Nueva notificación</h1>
      <p style="margin:0 0 16px;font-size:12px;color:#94a3b8;">De parte de: <strong style="color:#475569;">${senderName}</strong></p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.5;">${message}</p>
      <div style="text-align:center;margin-top:24px;">
        <a href="${appUrl}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">Ir al sistema</a>
      </div>
      <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;line-height:1.5;text-align:center;">Debes iniciar sesión con tu usuario para ver el detalle.</p>
    </div>
    <div style="background:#ffffff;padding:16px 32px;text-align:center;border-top:1px solid #f1f5f9;">
      <span style="font-size:11px;color:#94a3b8;">© ${new Date().getFullYear()} CANTV — Sistema Relacional de Investigaciones</span>
    </div>
  </div>
</div>`;
}

// Busca el correo del destinatario y el nombre de quien disparó la acción (el usuario autenticado
// que hizo la petición) y envía el correo de notificación. Se llama sin esperar su resultado
// (fire-and-forget): si Gmail falla, la notificación interna ya quedó guardada y no debe verse
// afectada por un problema de correo.
async function notifyByEmail(notifRow, appUrl, senderUsername) {
    if (!notifRow || !notifRow.user_id || !notifRow.mensaje) return;
    const [{ data: recipients }, { data: senders }] = await Promise.all([
        supabase.from('users').select('email').eq('username', notifRow.user_id).limit(1),
        senderUsername
            ? supabase.from('users').select('nombre').eq('username', senderUsername).limit(1)
            : Promise.resolve({ data: null })
    ]);
    const email = recipients && recipients[0] && recipients[0].email;
    if (!email) return;
    const senderName = (senders && senders[0] && senders[0].nombre) || senderUsername || 'Sistema';
    await sendEmail(email, 'Nueva notificación - Sistema CANTV', buildNotificationEmailHtml(notifRow.mensaje, appUrl, senderName));
}

// JWT Middleware (Optional for basic thesis demo, but added for structure)
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

// Middleware global Anti-XSS y limitador de tamaño (Anti-Fuzzing)
const sanitizeMiddleware = (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') return next();
    
    function sanitizeData(obj) {
        if (typeof obj === 'string') {
            // Anti-Fuzzing: prevenir textos anormalmente gigantes (DoS), excepto en subidas de archivos
            if (obj.length > 50000 && !req.path.includes('/upload') && !obj.startsWith('data:')) {
                throw new Error('Payload contains extremely large strings');
            }
            // Anti-XSS: Escapar etiquetas HTML
            return obj.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        } else if (Array.isArray(obj)) {
            return obj.map(sanitizeData);
        } else if (obj !== null && typeof obj === 'object') {
            for (let key in obj) {
                obj[key] = sanitizeData(obj[key]);
            }
        }
        return obj;
    }
    
    try {
        req.body = sanitizeData(req.body);
        next();
    } catch (e) {
        res.status(413).json({ error: 'Payload Too Large / Malformed Data' });
    }
};

app.use('/api/db', sanitizeMiddleware);

// 1. Initial Data Fetch (Replaces direct Supabase fetch in frontend initDB)
let dbCache = null;
let dbCacheTime = 0;
const DB_CACHE_TTL_MS = 60 * 1000; // recarga sola cada 60s, para reflejar cambios hechos directo en Supabase

// La contraseña nunca debe llegar al navegador: se quita de cualquier fila (o arreglo de filas)
// de la tabla users antes de responder, sin importar por qué endpoint salga.
function stripPassword(rows) {
    if (!rows) return rows;
    if (Array.isArray(rows)) return rows.map(({ password, ...rest }) => rest);
    const { password, ...rest } = rows;
    return rest;
}

// Migra en caliente cualquier contraseña que todavía esté en texto plano a un hash bcrypt.
// Se llama una vez al arrancar el servidor; es seguro ejecutarla en cada boot porque revisa el
// formato de cada contraseña y se salta las que ya están hasheadas (idempotente). El login (más
// abajo) también hashea de forma perezosa en el momento si encuentra una contraseña vieja antes
// de que esta migración llegue a ella, así que no hay ventana insegura entre despliegue y migración.
async function hashLegacyPasswordsOnce() {
    try {
        const { data: users, error } = await supabase.from('users').select('id, password');
        if (error || !users) return;
        const pending = users.filter(u => u.password && !isBcryptHash(u.password));
        if (pending.length === 0) return;
        console.log(`Migrando ${pending.length} contraseña(s) en texto plano a bcrypt...`);
        for (const u of pending) {
            const hashed = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
            await supabase.from('users').update({ password: hashed }).eq('id', u.id);
        }
        console.log('Migración de contraseñas completada.');
    } catch (e) {
        console.error('Error migrando contraseñas existentes:', e);
    }
}
hashLegacyPasswordsOnce();

async function prefetchData() {
    try {
        const [users, solicitudes, investigaciones, estadoHistorial, comentarios, invPersona, personas, estudios, referencias, roles, permissions, roleHasPermissions, positions, regions, units, general_managements, line_managements, notificaciones, documents] = await Promise.all([
            supabase.from('users').select('*'),
            supabase.from('solicitudes_especialistas').select('*'),
            supabase.from('investigaciones').select('*'),
            supabase.from('casos_estado_historial').select('*'),
            supabase.from('casos_comentarios').select('*'),
            supabase.from('investigacion_persona').select('*'),
            supabase.from('personas').select('*'),
            supabase.from('estudios').select('*'),
            supabase.from('referencias_laborales').select('*'),
            supabase.from('roles').select('*'),
            supabase.from('permissions').select('*'),
            supabase.from('role_has_permissions').select('*'),
            supabase.from('positions').select('*'),
            supabase.from('regions').select('*'),
            supabase.from('units').select('*'),
            supabase.from('general_managements').select('*'),
            supabase.from('line_managements').select('*'),
            supabase.from('notificaciones').select('*'),
            supabase.from('documents').select('*')
        ]);

        dbCache = {
            users: stripPassword(users.data),
            solicitudes: solicitudes.data,
            investigaciones: investigaciones.data,
            estadoHistorial: estadoHistorial.data,
            comentarios: comentarios.data,
            invPersona: invPersona.data,
            personas: personas.data,
            estudios: estudios.data,
            referencias: referencias.data,
            roles: roles.data,
            permissions: permissions.data,
            role_has_permissions: roleHasPermissions.data,
            positions: positions.data,
            regions: regions.data,
            units: units.data,
            general_managements: general_managements.data,
            line_managements: line_managements.data,
            notificaciones: notificaciones.data,
            documents: documents.data
        };
        dbCacheTime = Date.now();
    } catch (e) { console.error('Prefetch error:', e); }
}
prefetchData();

function filterCacheForUser(cache, userReq) {
    if (!cache) return cache;
    const roleObj = cache.roles ? cache.roles.find(r => String(r.id_rol) === String(userReq.role)) : null;
    const roleName = roleObj ? roleObj.name : String(userReq.role);
    const nameLower = roleName.toLowerCase();
    
    const isAdmin = nameLower.includes('admin') || nameLower.includes('gerente');
    const isCoordOrSuper = nameLower.includes('coordinador') || nameLower.includes('supervisor');
    const isEspecialista = nameLower.includes('especialista');
    
    if (isAdmin) return cache;
    
    let filtered = { ...cache };
    if (isCoordOrSuper) {
        const regionStr = String(userReq.regions);
        filtered.users = (cache.users || []).filter(u => String(u.regions) === regionStr || String(u.id) === String(userReq.id));
        
        const regionUserIds = new Set(filtered.users.map(u => String(u.id)));

        filtered.investigaciones = (cache.investigaciones || []).filter(c => 
            regionUserIds.has(String(c.denunciante_id)) || 
            String(c.coordinador_asignado) === String(userReq.id) || 
            String(c.supervisor_asignado) === String(userReq.id)
        );

        filtered.solicitudes = (cache.solicitudes || []).filter(s => 
            regionUserIds.has(String(s.solicitante_id)) || 
            String(s.solicitante_id) === String(userReq.id)
        );

        filtered.notificaciones = (cache.notificaciones || []).filter(n => n.user_id === userReq.username);
    } else if (isEspecialista) {
        filtered.users = (cache.users || []).filter(u => String(u.id) === String(userReq.id));
        
        filtered.investigaciones = (cache.investigaciones || []).filter(c => 
            String(c.especialista_asignado) === String(userReq.id) || 
            String(c.denunciante_id) === String(userReq.id)
        );

        filtered.solicitudes = (cache.solicitudes || []).filter(s => 
            String(s.solicitante_id) === String(userReq.id)
        );
        
        filtered.notificaciones = (cache.notificaciones || []).filter(n => n.user_id === userReq.username);
    } else {
        filtered.users = (cache.users || []).filter(u => String(u.id) === String(userReq.id));
        filtered.investigaciones = [];
        filtered.solicitudes = [];
        filtered.notificaciones = (cache.notificaciones || []).filter(n => n.user_id === userReq.username);
    }
    
    const validInvIds = new Set((filtered.investigaciones || []).map(i => i.id_investigacion));
    filtered.estadoHistorial = (cache.estadoHistorial || []).filter(h => validInvIds.has(h.investigacion_id));
    filtered.comentarios = (cache.comentarios || []).filter(c => validInvIds.has(c.investigacion_id));
    filtered.invPersona = (cache.invPersona || []).filter(ip => validInvIds.has(ip.investigacion_id));
    
    return filtered;
}

app.get('/api/db/init', authenticate, async (req, res) => {
    try {
        if (dbCache && (Date.now() - dbCacheTime) < DB_CACHE_TTL_MS) {
            return res.json(filterCacheForUser(dbCache, req.user));
        }

        const [users, solicitudes, investigaciones, estadoHistorial, comentarios, invPersona, personas, estudios, referencias, roles, permissions, roleHasPermissions, positions, regions, units, general_managements, line_managements, notificaciones, documents] = await Promise.all([
            supabase.from('users').select('*'),
            supabase.from('solicitudes_especialistas').select('*'),
            supabase.from('investigaciones').select('*'),
            supabase.from('casos_estado_historial').select('*'),
            supabase.from('casos_comentarios').select('*'),
            supabase.from('investigacion_persona').select('*'),
            supabase.from('personas').select('*'),
            supabase.from('estudios').select('*'),
            supabase.from('referencias_laborales').select('*'),
            supabase.from('roles').select('*'),
            supabase.from('permissions').select('*'),
            supabase.from('role_has_permissions').select('*'),
            supabase.from('positions').select('*'),
            supabase.from('regions').select('*'),
            supabase.from('units').select('*'),
            supabase.from('general_managements').select('*'),
            supabase.from('line_managements').select('*'),
            supabase.from('notificaciones').select('*'),
            supabase.from('documents').select('*')
        ]);

        const newData = {
            users: stripPassword(users.data),
            solicitudes: solicitudes.data,
            investigaciones: investigaciones.data,
            estadoHistorial: estadoHistorial.data,
            comentarios: comentarios.data,
            invPersona: invPersona.data,
            personas: personas.data,
            estudios: estudios.data,
            referencias: referencias.data,
            roles: roles.data,
            permissions: permissions.data,
            role_has_permissions: roleHasPermissions.data,
            positions: positions.data,
            regions: regions.data,
            units: units.data,
            general_managements: general_managements.data,
            line_managements: line_managements.data,
            notificaciones: notificaciones.data,
            documents: documents.data
        };
        dbCache = newData;
        dbCacheTime = Date.now();
        res.json(filterCacheForUser(newData, req.user));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// --- GENERIC DB CRUD & UPLOAD ENDPOINTS ---
app.post('/api/upload', authenticate, async (req, res) => {
    try {
        const { fileBase64, fileName } = req.body;
        if (!fileBase64) return res.status(400).json({ error: 'No file provided' });
        const url = await uploadToSupabase(fileBase64, fileName || 'file.dat');
        res.json({ success: true, url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/upload/signed-url', authenticate, async (req, res) => {
    try {
        const { fileName } = req.body;
        if (!fileName) return res.status(400).json({ error: 'No fileName provided' });
        
        const uniquePath = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        
        const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(uniquePath);
        if (error) throw error;
        
        const { data: publicData } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(uniquePath);
        
        // Supabase sometimes returns a relative URL for signedUrl. We prepend the Supabase URL if needed.
        let finalSignedUrl = data.signedUrl;
        if (finalSignedUrl && finalSignedUrl.startsWith('/')) {
            finalSignedUrl = process.env.SUPABASE_URL + finalSignedUrl;
        }
        
        res.json({ success: true, signedUrl: finalSignedUrl, publicUrl: publicData.publicUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/db/:table', authenticate, async (req, res) => {
    try {
        const roleObj = dbCache && dbCache.roles ? dbCache.roles.find(r => String(r.id_rol) === String(req.user.role)) : null;
        const roleName = roleObj ? roleObj.name : String(req.user.role);
        const isAdmin = roleName === 'admin' || roleName === 'Gerente';
        
        const adminOnlyTables = ['roles', 'permissions', 'role_has_permissions', 'regions', 'positions', 'units'];
        if (adminOnlyTables.includes(req.params.table) && !isAdmin) {
            return res.status(403).json({ error: 'Permisos insuficientes para modificar esta tabla.' });
        }

        // Cualquier contraseña que llegue por esta ruta genérica (p.ej. al crear un usuario nuevo)
        // se hashea antes de tocar la base de datos: nunca se guarda en texto plano.
        if (req.params.table === 'users' && req.body.password) {
            req.body.password = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
        }
        let { data, error } = await supabase.from(req.params.table).insert(req.body).select();

        // Algunas tablas (p.ej. 'personas') tienen su secuencia de ID desincronizada con los datos
        // reales — probablemente por filas cargadas con un ID explícito sin avanzar la secuencia.
        // Si el insert choca por eso, se reintenta una única vez calculando el próximo ID libre.
        if (error && error.code === '23505') {
            const match = /Key \(([^)]+)\)=/.exec(error.details || '');
            const pkColumn = match && match[1];
            if (pkColumn && !(pkColumn in req.body)) {
                const { data: maxRow } = await supabase.from(req.params.table).select(pkColumn).order(pkColumn, { ascending: false }).limit(1);
                const nextId = ((maxRow && maxRow[0] && maxRow[0][pkColumn]) || 0) + 1;
                ({ data, error } = await supabase.from(req.params.table).insert({ ...req.body, [pkColumn]: nextId }).select());
            }
        }

        if (error) throw error;
        await prefetchData();

        // Cada notificación interna (nueva incidencia, aprobación, rechazo, asignación, cierre...)
        // pasa por esta tabla vía notifyUser() en el frontend, así que enganchar el correo aquí
        // cubre todas las acciones del flujo sin tocar cada punto donde se generan.
        if (req.params.table === 'notificaciones' && data && data[0]) {
            const appUrl = `${req.protocol}://${req.get('host')}`;
            notifyByEmail(data[0], appUrl, req.user && req.user.username).catch(e => console.error('notifyByEmail ERROR:', e));
        }

        res.json({ success: true, data: req.params.table === 'users' ? stripPassword(data) : data });
    } catch (e) {
        console.error(`POST /api/db/${req.params.table} ERROR:`, e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/db/:table/:idColumn/:idValue', authenticate, async (req, res) => {
    try {
        const roleObj = dbCache && dbCache.roles ? dbCache.roles.find(r => String(r.id_rol) === String(req.user.role)) : null;
        const roleName = roleObj ? roleObj.name : String(req.user.role);
        const isAdmin = roleName === 'admin' || roleName === 'Gerente';
        
        const adminOnlyTables = ['roles', 'permissions', 'role_has_permissions', 'regions', 'positions', 'units'];
        if (adminOnlyTables.includes(req.params.table) && !isAdmin) {
            return res.status(403).json({ error: 'Permisos insuficientes para modificar esta tabla.' });
        }

        if (req.params.table === 'users') {
            const isEditingSelf = String(req.user.id) === String(req.params.idValue);
            if (!isEditingSelf && !isAdmin) {
                return res.status(403).json({ error: 'Permisos insuficientes para modificar este usuario.' });
            }
            if (!isAdmin) {
                delete req.body.role;
                delete req.body.estado;
                delete req.body.regions;
                delete req.body.region_id;
            }
            if (req.body.password) {
                req.body.password = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
            }
        }
        const { data, error } = await supabase.from(req.params.table).update(req.body).eq(req.params.idColumn, req.params.idValue).select();
        if (error) throw error;
        await prefetchData();
        res.json({ success: true, data: req.params.table === 'users' ? stripPassword(data) : data });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Borrado genérico filtrando por query params estilo PostgREST (col=eq.valor), que es el formato
// que ya usa el frontend (p.ej. para desvincular una persona de un caso). Antes no existía ninguna
// ruta DELETE, así que estas peticiones fallaban con 404 en silencio (el frontend no revisaba
// res.ok) y el registro nunca se borraba realmente de la base de datos.
app.delete('/api/db/:table', authenticate, async (req, res) => {
    try {
        const roleObj = dbCache && dbCache.roles ? dbCache.roles.find(r => String(r.id_rol) === String(req.user.role)) : null;
        const roleName = roleObj ? roleObj.name : String(req.user.role);
        const isAdmin = roleName === 'admin' || roleName === 'Gerente';
        
        const adminOnlyTables = ['roles', 'permissions', 'role_has_permissions', 'regions', 'positions', 'units', 'users'];
        if (adminOnlyTables.includes(req.params.table) && !isAdmin) {
            return res.status(403).json({ error: 'Permisos insuficientes para modificar esta tabla.' });
        }
        // WORKAROUND: La base de datos no tiene ON DELETE CASCADE en las foreign keys.
        // Interceptamos borrados de 'personas' e 'investigaciones' para borrar manualmente
        // los hijos primero y evitar el Error 500 (Violación de Clave Foránea).
        if (req.params.table === 'personas') {
            const idValues = Object.entries(req.query).filter(([k, v]) => k === 'id_persona' && typeof v === 'string' && v.startsWith('eq.')).map(([k, v]) => v.slice(3));
            if (idValues.length > 0) {
                for (const id of idValues) {
                    await supabase.from('documents').delete().eq('persona_id', id);
                    await supabase.from('estudios').delete().eq('persona_id', id);
                    await supabase.from('referencias_laborales').delete().eq('persona_id', id);
                    await supabase.from('investigacion_persona').delete().eq('persona_id', id);
                }
            }
        } else if (req.params.table === 'investigaciones') {
            const idValues = Object.entries(req.query).filter(([k, v]) => k === 'id_investigacion' && typeof v === 'string' && v.startsWith('eq.')).map(([k, v]) => v.slice(3));
            if (idValues.length > 0) {
                for (const id of idValues) {
                    await supabase.from('casos_estado_historial').delete().eq('investigacion_id', id);
                    await supabase.from('casos_comentarios').delete().eq('investigacion_id', id);
                    await supabase.from('investigacion_persona').delete().eq('investigacion_id', id);
                }
            }
        }

        let query = supabase.from(req.params.table).delete();
        for (const [key, rawValue] of Object.entries(req.query)) {
            const value = typeof rawValue === 'string' && rawValue.startsWith('eq.') ? rawValue.slice(3) : rawValue;
            query = query.eq(key, value);
        }
        const { error } = await query;
        if (error) throw error;
        await prefetchData();
        res.json({ success: true });
    } catch (e) {
        console.error(`DELETE /api/db/${req.params.table} ERROR:`, e);
        res.status(500).json({ error: e.message });
    }
});

// --- AUTH ENDPOINTS ---
const MAX_LOGIN_ATTEMPTS = 3;
const RESET_TOKEN_TTL_MS = 2 * 60 * 1000; // el código de recuperación vale por 2 minutos

// Contador de intentos fallidos por username, solo en memoria del proceso: no requiere ninguna
// columna nueva en la tabla users. Se reinicia si el servidor se reinicia/redeploya, pero eso es
// aceptable aquí — lo único que necesita sobrevivir entre sesiones es el bloqueo ya aplicado, que
// sí se persiste reutilizando la columna `estado` existente (mismo campo que ya usa 'activo'/'inactivo').
const failedLoginAttempts = new Map();

// 2. Authentication Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const { data: users, error } = await supabase.from('users').select('*').eq('username', username);
    if (error || users.length === 0) return res.status(401).json({ error: 'Credenciales inválidas' });

    const user = users[0];

    // Cuenta ya bloqueada por intentos previos: no se valida la contraseña, la única salida es
    // restablecerla por correo (así un atacante no puede seguir probando contraseñas nunca más).
    if (user.estado && user.estado.toLowerCase() === 'bloqueado') {
        return res.status(423).json({
            error: 'Cuenta bloqueada por múltiples intentos fallidos. Restablece tu contraseña con el código que te enviaremos por correo.',
            locked: true
        });
    }

    // Contraseñas ya migradas se comparan con bcrypt; si por alguna razón una cuenta todavía no
    // pasó por la migración de arranque, se compara en texto plano como respaldo puntual y, si
    // coincide, se hashea y guarda en el momento (así nunca queda una ventana insegura).
    let passwordMatches;
    if (isBcryptHash(user.password)) {
        passwordMatches = await bcrypt.compare(password, user.password);
    } else {
        passwordMatches = user.password === password;
        if (passwordMatches) {
            const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await supabase.from('users').update({ password: hashed }).eq('id', user.id);
        }
    }

    if (!passwordMatches) {
        const intentos = (failedLoginAttempts.get(username) || 0) + 1;

        if (intentos >= MAX_LOGIN_ATTEMPTS) {
            failedLoginAttempts.delete(username);
            await supabase.from('users').update({ estado: 'bloqueado' }).eq('id', user.id);
            await prefetchData();
            return res.status(423).json({
                error: 'Alcanzaste el límite de 3 intentos. Cuenta bloqueada: restablece tu contraseña con el código que te enviaremos por correo.',
                locked: true
            });
        }
        failedLoginAttempts.set(username, intentos);
        return res.status(401).json({ error: 'Credenciales inválidas', attemptsRemaining: MAX_LOGIN_ATTEMPTS - intentos });
    }

    // Login correcto: se limpia el contador de intentos fallidos si tenía alguno acumulado.
    failedLoginAttempts.delete(username);

    // Generate JWT
    const token = jwt.sign({ id: user.id, username: user.username, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: stripPassword(user) });
});

// 3. Password Reset Request
app.post('/api/auth/reset', async (req, res) => {
    const { username } = req.body;
    const { data: users, error } = await supabase.from('users').select('*').eq('username', username);
    if (error || users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    if (!user.email) return res.status(400).json({ error: 'Este usuario no tiene correo registrado.' });
    const token = Math.floor(100000 + Math.random() * 900000).toString();

    const { error: insertErr } = await supabase.from('password_reset_tokens').upsert({
        email: user.email, token: token, created_at: new Date().toISOString()
    });
    if (insertErr) return res.status(500).json({ error: 'Error saving token' });

    try {
        await sendResetEmail(user.email, token);
    } catch (emailErr) {
        console.error('sendResetEmail error:', emailErr);
        return res.status(502).json({ error: 'No se pudo enviar el correo. Intenta de nuevo en unos minutos.' });
    }

    // El token NO se devuelve al cliente: solo llega por correo.
    res.json({ email: user.email });
});

// 4. Password Reset Confirm
app.post('/api/auth/reset/confirm', async (req, res) => {
    const { email, token, newPassword } = req.body;

    const { data: tokens, error } = await supabase.from('password_reset_tokens').select('*').eq('email', email).eq('token', token);
    if (error || tokens.length === 0) return res.status(400).json({ error: 'Código inválido' });

    const tokenAgeMs = Date.now() - new Date(tokens[0].created_at).getTime();
    if (tokenAgeMs > RESET_TOKEN_TTL_MS) {
        await supabase.from('password_reset_tokens').delete().eq('email', email);
        return res.status(400).json({ error: 'El código expiró (vale por 2 minutos). Solicita uno nuevo.' });
    }

    // Restablecer la contraseña también desbloquea la cuenta si estaba bloqueada por intentos
    // fallidos (pero no reactiva una cuenta que un administrador haya puesto en 'inactivo' aparte).
    const { data: userRows } = await supabase.from('users').select('id, username, estado').eq('email', email);
    const targetUser = userRows && userRows[0];
    const wasBlocked = targetUser && targetUser.estado && targetUser.estado.toLowerCase() === 'bloqueado';

    const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const { error: updateErr } = await supabase.from('users')
        .update({ password: hashedNewPassword, ...(wasBlocked ? { estado: 'activo' } : {}) })
        .eq('email', email);
    if (updateErr) return res.status(500).json({ error: 'Error updating password' });

    if (targetUser) failedLoginAttempts.delete(targetUser.username);

    await supabase.from('password_reset_tokens').delete().eq('email', email);
    await prefetchData();
    res.json({ success: true });
});

// 5. Email Change Request
app.post('/api/user/email/request', authenticate, async (req, res) => {
    const { newEmail } = req.body;
    const { username } = req.user;
    
    if (!newEmail) return res.status(400).json({ error: 'Debes proporcionar un nuevo correo.' });
    
    const { data: existing, error: existErr } = await supabase.from('users').select('id').eq('email', newEmail);
    if (existing && existing.length > 0) return res.status(400).json({ error: 'Este correo ya está en uso por otra cuenta.' });

    const token = Math.floor(100000 + Math.random() * 900000).toString();

    const { error: insertErr } = await supabase.from('password_reset_tokens').upsert({
        email: newEmail, token: token, created_at: new Date().toISOString()
    });
    if (insertErr) return res.status(500).json({ error: 'Error al generar el token' });

    try {
        await sendEmailChangeCode(newEmail, token);
    } catch (emailErr) {
        console.error('sendEmailChangeCode error:', emailErr);
        return res.status(502).json({ error: 'No se pudo enviar el correo. Intenta de nuevo en unos minutos.' });
    }

    res.json({ success: true, email: newEmail });
});

// 6. Email Change Confirm
app.post('/api/user/email/confirm', authenticate, async (req, res) => {
    const { newEmail, token } = req.body;
    const { username } = req.user;

    const { data: tokens, error } = await supabase.from('password_reset_tokens').select('*').eq('email', newEmail).eq('token', token);
    if (error || tokens.length === 0) return res.status(400).json({ error: 'Código inválido o expirado' });

    const tokenAgeMs = Date.now() - new Date(tokens[0].created_at).getTime();
    if (tokenAgeMs > RESET_TOKEN_TTL_MS) {
        await supabase.from('password_reset_tokens').delete().eq('email', newEmail);
        return res.status(400).json({ error: 'El código expiró (vale por 2 minutos). Solicita uno nuevo.' });
    }

    const { error: updateErr } = await supabase.from('users').update({ email: newEmail }).eq('username', username);
    if (updateErr) return res.status(500).json({ error: 'Error al actualizar el correo' });

    await supabase.from('password_reset_tokens').delete().eq('email', newEmail);
    await prefetchData(); 
    res.json({ success: true, email: newEmail });
});

// Helper to upload base64 to Supabase Storage
const DOCUMENTS_BUCKET = 'documentos';

async function ensureDocumentsBucket() {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) throw new Error(`No se pudo verificar el bucket de almacenamiento: ${error.message}`);
    const exists = (buckets || []).some(b => b.name === DOCUMENTS_BUCKET);
    if (exists) return;
    const { error: createErr } = await supabase.storage.createBucket(DOCUMENTS_BUCKET, { public: true });
    if (createErr && !/already exists/i.test(createErr.message || '')) {
        throw new Error(`No se pudo crear el bucket '${DOCUMENTS_BUCKET}': ${createErr.message}`);
    }
}

async function uploadToSupabase(base64Str, fileName) {
    if (!base64Str) return null;
    
    // Si el cliente envía el objeto completo { name, type, data }, usamos 'data'
    if (typeof base64Str === 'object' && base64Str.data) {
        base64Str = base64Str.data;
    }
    
    const matches = base64Str.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error(`No se pudo interpretar el archivo "${fileName}" (formato no reconocido).`);
    }
    const type = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const uniquePath = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9.]/g, '_')}`;

    let { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(uniquePath, buffer, {
        contentType: type
    });

    // Auto-provision the bucket the first time this runs against a fresh Supabase project.
    if (error && /bucket not found/i.test(error.message || '')) {
        await ensureDocumentsBucket();
        ({ error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(uniquePath, buffer, {
            contentType: type
        }));
    }

    if (error) throw new Error(`Error al subir "${fileName}" al Storage: ${error.message}`);

    const { data: pubData } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(uniquePath);
    return pubData.publicUrl;
}

// --- REPORTE MENSUAL AUTOMÁTICO ---
// Se genera solo el último día de cada mes y se guarda como documento (tabla 'documents', persona_id null)
// visible para Gerencia en la vista "Reportes Mensuales".
const REPORTE_MENSUAL_TIPO = 'reporte_mensual';

// --- Estilo compartido para todos los PDF generados por el sistema (reportes, casos, incidencias) ---
// Deliberadamente distinto del tema oscuro/azul de la interfaz web: es un membrete de documento
// formal (fondo claro, logo, regla de color, tipografía serif para el cuerpo) en vez de una réplica
// de las tarjetas y badges de la app.
const PDF_BRAND_DARK = '#0f172a';
const PDF_BRAND_BLUE = '#2563eb';
const PDF_TEXT = '#1e293b';
const PDF_MUTED = '#64748b';
const PDF_MARGIN = 50;
const LOGO_DARK_PATH = path.join(__dirname, 'assets', 'cantv_logo_dark.png');

// Deriva un nombre de archivo legible a partir de la URL de Supabase Storage (mismo criterio que
// renderFileBadge en el cliente: quita query string, decodifica y descarta el prefijo numérico).
function nombreDesdeUrl(url) {
    try {
        const limpio = String(url).split('?')[0];
        const ultimo = decodeURIComponent(limpio.split('/').pop() || '');
        return ultimo.replace(/^\d+_/, '') || String(url);
    } catch (e) {
        return String(url);
    }
}

// Membrete: logo CANTV + rótulo institucional/fecha a la derecha, regla de acento azul, título
// del documento con su etiqueta de categoría (eyebrow) y una línea de subtítulo.
function pdfHeader(doc, eyebrow, titulo, subtitulo) {
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - PDF_MARGIN * 2;

    try { doc.image(LOGO_DARK_PATH, PDF_MARGIN, 20, { height: 38 }); } catch (e) { /* si el asset no está disponible, se omite sin romper el PDF */ }

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PDF_MUTED)
        .text('SISTEMA DE INVESTIGACIONES RELACIONALES', PDF_MARGIN, 26, { width: contentWidth, align: 'right', characterSpacing: 0.4 });
    doc.font('Helvetica').fontSize(7.5).fillColor(PDF_MUTED)
        .text(`Generado el ${new Date().toLocaleString('es-VE')}`, PDF_MARGIN, 38, { width: contentWidth, align: 'right' });

    doc.moveTo(PDF_MARGIN, 74).lineTo(pageWidth - PDF_MARGIN, 74).lineWidth(1.4).strokeColor(PDF_BRAND_BLUE).stroke();

    doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_BRAND_BLUE).text(eyebrow.toUpperCase(), PDF_MARGIN, 86, { characterSpacing: 1.2 });
    doc.font('Helvetica-Bold').fontSize(19).fillColor(PDF_BRAND_DARK).text(titulo, PDF_MARGIN, doc.y + 2, { width: contentWidth });
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(PDF_MUTED).text(subtitulo, PDF_MARGIN, doc.y + 2, { width: contentWidth });

    doc.moveDown(0.7);
    doc.moveTo(PDF_MARGIN, doc.y).lineTo(pageWidth - PDF_MARGIN, doc.y).lineWidth(0.6).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.9);
    doc.fillColor(PDF_TEXT);
    doc.x = PDF_MARGIN;
}

// Pie de página institucional (regla fina + confidencialidad + numeración), en todas las páginas.
function pdfFooter(doc) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        // El texto del pie se dibuja dentro del margen inferior del documento; sin este truco,
        // pdfkit interpreta que el contenido se sale de la página y agrega automáticamente una
        // página en blanco extra detrás de cada página real.
        const originalBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        const bottom = doc.page.height - 46;
        doc.moveTo(PDF_MARGIN, bottom).lineTo(doc.page.width - PDF_MARGIN, bottom).lineWidth(0.6).strokeColor('#e2e8f0').stroke();
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(PDF_MUTED)
            .text('CANTV', PDF_MARGIN, bottom + 8, { width: 100, characterSpacing: 0.6, lineBreak: false });
        doc.font('Helvetica').fontSize(7.5).fillColor(PDF_MUTED)
            .text('Sistema de Investigaciones Relacionales — Documento de uso confidencial', PDF_MARGIN, bottom + 8, { width: doc.page.width - PDF_MARGIN * 2, align: 'center', lineBreak: false });
        doc.text(`Página ${i - range.start + 1} de ${range.count}`, doc.page.width - PDF_MARGIN - 120, bottom + 8, { width: 120, align: 'right', lineBreak: false });

        doc.page.margins.bottom = originalBottomMargin;
    }
}

// Título de sección tipo "ficha": barra de acento a la izquierda + etiqueta en versalitas.
function pdfSectionTitle(doc, text) {
    if (doc.y > doc.page.height - 130) doc.addPage();
    doc.moveDown(0.9);
    const y = doc.y;
    doc.rect(PDF_MARGIN, y + 1, 3, 12).fill(PDF_BRAND_BLUE);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(PDF_BRAND_DARK).text(text.toUpperCase(), PDF_MARGIN + 11, y, { characterSpacing: 0.6 });
    doc.moveDown(0.5);
    doc.fillColor(PDF_TEXT);
    doc.x = PDF_MARGIN;
}

// Tabla de datos generales de una sola columna etiqueta/valor (look de formulario/ficha impresa,
// en vez de las tarjetas sin borde que usa la interfaz web).
function pdfDataTable(doc, pairs) {
    const contentWidth = doc.page.width - PDF_MARGIN * 2;
    const labelWidth = contentWidth * 0.36;
    const rowHeight = 21;
    const clean = pairs.filter(p => p && p[1] !== undefined && p[1] !== null && p[1] !== '');

    clean.forEach(([label, value]) => {
        if (doc.y > doc.page.height - 90) doc.addPage();
        const y = doc.y;
        doc.rect(PDF_MARGIN, y, labelWidth, rowHeight).fill('#f1f5f9');
        doc.rect(PDF_MARGIN + labelWidth, y, contentWidth - labelWidth, rowHeight).fill('#ffffff');
        doc.rect(PDF_MARGIN, y, contentWidth, rowHeight).lineWidth(0.6).strokeColor('#cbd5e1').stroke();
        doc.moveTo(PDF_MARGIN + labelWidth, y).lineTo(PDF_MARGIN + labelWidth, y + rowHeight).lineWidth(0.6).strokeColor('#cbd5e1').stroke();
        doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_MUTED).text(String(label).toUpperCase(), PDF_MARGIN + 8, y + 6, { width: labelWidth - 16, characterSpacing: 0.3 });
        doc.font('Helvetica').fontSize(9.5).fillColor(PDF_TEXT).text(String(value), PDF_MARGIN + labelWidth + 8, y + 5.5, { width: contentWidth - labelWidth - 16 });
        doc.y = y + rowHeight;
    });
    doc.moveDown(0.6);
    doc.x = PDF_MARGIN;
}

// Párrafo de cuerpo en serif (Times), para distinguir visualmente el contenido narrativo
// (asunto, plan de trabajo, sustanciación) de las etiquetas/tablas en sans-serif.
function pdfParagraph(doc, text, opts = {}) {
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc.font('Times-Roman').fontSize(10.5).fillColor(PDF_TEXT)
        .text(text || '—', PDF_MARGIN, doc.y, { width: doc.page.width - PDF_MARGIN * 2, lineGap: 4, align: 'justify', ...opts });
    doc.moveDown(0.6);
}

// Tabla de personas involucradas (nombre / cédula / grado de implicación opcional), con
// encabezado oscuro — mismo criterio visual que pdfDataTable para que todo el documento luzca
// como una ficha impresa consistente.
function pdfPeopleTable(doc, personas, showGrado) {
    if (!personas.length) return pdfParagraph(doc, 'No hay personas vinculadas.');
    const contentWidth = doc.page.width - PDF_MARGIN * 2;
    const colCedula = contentWidth * 0.22;
    const colGrado = showGrado ? contentWidth * 0.28 : 0;
    const colNombre = contentWidth - colCedula - colGrado;
    const rowHeight = 20;

    const drawHeaderRow = (y) => {
        doc.rect(PDF_MARGIN, y, contentWidth, rowHeight).fill(PDF_BRAND_DARK);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
            .text('NOMBRE', PDF_MARGIN + 8, y + 6.5, { width: colNombre - 16, characterSpacing: 0.4 })
            .text('CÉDULA', PDF_MARGIN + colNombre + 8, y + 6.5, { width: colCedula - 16, characterSpacing: 0.4 });
        if (showGrado) doc.text('GRADO DE IMPLICACIÓN', PDF_MARGIN + colNombre + colCedula + 8, y + 6.5, { width: colGrado - 16, characterSpacing: 0.4 });
        return y + rowHeight;
    };

    if (doc.y > doc.page.height - 110) doc.addPage();
    let y = drawHeaderRow(doc.y);

    personas.forEach((p, i) => {
        if (y > doc.page.height - 90) { doc.addPage(); y = drawHeaderRow(50); }
        doc.rect(PDF_MARGIN, y, contentWidth, rowHeight).fill(i % 2 === 0 ? '#f8fafc' : '#ffffff');
        doc.rect(PDF_MARGIN, y, contentWidth, rowHeight).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
        doc.font('Helvetica').fontSize(9).fillColor(PDF_TEXT)
            .text(p.nombre || p.cedula || '—', PDF_MARGIN + 8, y + 5.5, { width: colNombre - 16 })
            .text(p.cedula || '—', PDF_MARGIN + colNombre + 8, y + 5.5, { width: colCedula - 16 });
        if (showGrado) doc.text(p.grado || 'No Definido', PDF_MARGIN + colNombre + colCedula + 8, y + 5.5, { width: colGrado - 16 });
        y += rowHeight;
    });

    doc.y = y + 10;
    doc.x = PDF_MARGIN;
}

const IMAGE_EXT_REGEX = /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i;

// Si la URL apunta a una imagen y tenemos la URL base del servidor, la reescribe para pasar por
// /visor-imagen en vez de enlazar directo al archivo de Supabase Storage. Un enlace de PDF solo
// puede apuntar a una URL (no puede ejecutar el JS que bloquea el clic derecho en la app), así que
// sin esta redirección el "clic derecho > Guardar imagen como" del visor de evidencia se podía
// evitar por completo abriendo el documento desde el link del PDF.
function resolveLinkUrl(rawUrl, baseUrl) {
    if (baseUrl && IMAGE_EXT_REGEX.test(rawUrl)) {
        return `${baseUrl}/visor-imagen?url=${encodeURIComponent(rawUrl)}`;
    }
    return rawUrl;
}

// Lista de enlaces a documentos adjuntos: texto en azul y subrayado, con `link` de PDF hacia la
// URL real de Supabase Storage (o hacia /visor-imagen si es una imagen, ver resolveLinkUrl); se
// abren en el navegador, no van embebidos como archivo descargable dentro del propio PDF.
function pdfLinkList(doc, items, baseUrl) {
    const clean = items.filter(it => it && it.url);
    if (!clean.length) return pdfParagraph(doc, 'Sin documentos adjuntos.');
    clean.forEach(it => {
        if (doc.y > doc.page.height - 90) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF_MUTED).text(`•  ${it.label}:  `, PDF_MARGIN, doc.y, { continued: true, width: doc.page.width - PDF_MARGIN * 2 });
        doc.font('Helvetica').fontSize(9).fillColor(PDF_BRAND_BLUE)
            .text(nombreDesdeUrl(it.url), { link: resolveLinkUrl(it.url, baseUrl), underline: true });
    });
    doc.moveDown(0.5);
    doc.x = PDF_MARGIN;
}

// Arma el PDF del reporte mensual (tabla de KPIs) y devuelve el buffer ya generado.
// `subtitulo` es la línea bajo el título (ej. "Generado automáticamente..." o "Generado por: Fulano").
function buildReportePdf(titulo, fechaGeneracion, subtitulo, { total, tasaCierre, avgDays, cumplimiento, trabajados, enProceso, rechazadas, listaDetalle, appUrl }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        pdfHeader(doc, 'Reporte de Gestión', titulo, subtitulo);

        pdfSectionTitle(doc, 'Resumen Ejecutivo de Rendimiento');
        
        doc.moveDown(0.5);
        const startY = doc.y;
        const col1 = 50; // PDF_MARGIN
        const cardW = 246; // (512 - 20) / 2
        const col2 = col1 + cardW + 20;
        const cardH = 75;

        // 1. Total Casos
        doc.roundedRect(col1, startY, cardW, cardH, 6).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('TOTAL CASOS PROCESADOS', col1 + 15, startY + 18, { characterSpacing: 0.5 });
        doc.font('Helvetica-Bold').fontSize(28).fillColor('#0f172a').text(String(total), col1 + 15, startY + 32);

        // 2. Tasa de Cierre
        doc.roundedRect(col2, startY, cardW, cardH, 6).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('TASA DE CIERRE', col2 + 15, startY + 18, { characterSpacing: 0.5 });
        doc.font('Helvetica-Bold').fontSize(28).fillColor('#0f172a').text(`${tasaCierre}%`, col2 + 15, startY + 32);

        const row2Y = startY + cardH + 20;

        // 3. Tiempo Promedio
        doc.roundedRect(col1, row2Y, cardW, cardH, 6).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('TIEMPO PROMEDIO RESOLUCIÓN', col1 + 15, row2Y + 18, { characterSpacing: 0.5 });
        doc.font('Helvetica-Bold').fontSize(28).fillColor('#0f172a').text(`${avgDays} días`, col1 + 15, row2Y + 32);

        // 4. Cumplimiento a Tiempo (Destacado en Azul)
        doc.roundedRect(col2, row2Y, cardW, cardH, 6).fillAndStroke('#eff6ff', '#bfdbfe');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e40af').text('% CUMPLIMIENTO A TIEMPO', col2 + 15, row2Y + 18, { characterSpacing: 0.5 });
        doc.font('Helvetica-Bold').fontSize(28).fillColor('#1d4ed8').text(`${cumplimiento}%`, col2 + 15, row2Y + 32);

        doc.y = row2Y + cardH + 40;

        // Detalle de Casos con Enlaces
        if (listaDetalle && listaDetalle.length > 0) {
            if (doc.y > doc.page.height - 150) doc.addPage();
            pdfSectionTitle(doc, 'Detalle de Casos del Período');
            doc.moveDown(0.5);

            const tableTop = doc.y;
            const w1 = 120, w2 = 140, w3 = 90, w4 = 80, w5 = 80;
            const x1 = PDF_MARGIN, x2 = x1 + w1, x3 = x2 + w2, x4 = x3 + w3, x5 = x4 + w4;

            // Encabezados
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748b');
            doc.text('ID', x1, tableTop, { width: w1 });
            doc.text('Asunto', x2, tableTop, { width: w2 });
            doc.text('Estado', x3, tableTop, { width: w3 });
            doc.text('Región', x4, tableTop, { width: w4 });
            doc.text('Enlace', x5, tableTop, { width: w5, align: 'right' });
            
            doc.moveTo(PDF_MARGIN, doc.y + 5).lineTo(doc.page.width - PDF_MARGIN, doc.y + 5).strokeColor('#e2e8f0').lineWidth(1).stroke();
            doc.y += 12;

            doc.font('Helvetica').fontSize(9);
            listaDetalle.forEach((item, i) => {
                if (doc.y > doc.page.height - 50) {
                    doc.addPage();
                    doc.y = PDF_MARGIN;
                }
                const rowY = doc.y;
                
                doc.fillColor('#0f172a').text(item.id, x1, rowY, { width: w1 });
                // truncate asunto
                const shortAsunto = item.asunto.length > 25 ? item.asunto.substring(0, 25) + '...' : item.asunto;
                doc.fillColor('#475569').text(shortAsunto, x2, rowY, { width: w2 });
                doc.fillColor('#475569').text(item.estado, x3, rowY, { width: w3 });
                doc.fillColor('#475569').text(item.region || 'Nacional', x4, rowY, { width: w4 });

                // Link
                const linkView = item.typeLink === 'solicitud' ? 'solicitud-detail' : 'case-detail';
                const linkUrl = `${appUrl || 'http://localhost'}/?view=${linkView}&id=${encodeURIComponent(item.id)}`;
                doc.fillColor(PDF_BRAND_BLUE).text('Ver Detalle', x5, rowY, { width: w5, align: 'right', link: linkUrl, underline: true });

                doc.moveTo(PDF_MARGIN, doc.y + 5).lineTo(doc.page.width - PDF_MARGIN, doc.y + 5).strokeColor('#f1f5f9').stroke();
                doc.y += 12;
            });
            doc.y += 20;
        }

        pdfFooter(doc);
        doc.end();
    });
}

// Arma el PDF de un caso (investigación) completo: datos generales, plan de trabajo, sustanciación,
// cierre gerencial, personas involucradas, documentos adjuntos (como enlaces) e historial de comentarios.
function buildCasoPdf(c, baseUrl) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const fmtFecha = (v) => v ? new Date(v).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

        pdfHeader(doc, 'Expediente de Caso', `Caso ${c.id ?? ''}`, 'Detalle completo de la investigación y su trazabilidad');

        pdfSectionTitle(doc, 'Información General');
        pdfDataTable(doc, [
            ['Estado', c.estado],
            ['Incidencia de Origen', c.incidenciaOrigen],
            ['Fecha de Apertura', fmtFecha(c.fechaApertura)],
            ['Fecha Límite', fmtFecha(c.fechaLimite)],
            ['Coordinador', c.coordinadorAsignado],
            ['Supervisor', c.supervisorAsignado],
            ['Especialista', c.especialistaAsignado],
            ['Creado por', c.creadorOriginal]
        ]);

        pdfSectionTitle(doc, 'Asunto');
        pdfParagraph(doc, c.asunto);

        pdfSectionTitle(doc, 'Plan de Trabajo');
        pdfParagraph(doc, c.planTrabajo || 'Aún no ha sido elaborado por el Coordinador.');

        if (c.sustanciacion && c.sustanciacion.detalle) {
            pdfSectionTitle(doc, 'Sustanciación');
            pdfParagraph(doc, c.sustanciacion.detalle);
        }

        pdfSectionTitle(doc, 'Personas Involucradas');
        pdfPeopleTable(doc, Array.isArray(c.personasInvolucradasDetalle) ? c.personasInvolucradasDetalle : [], true);

        pdfSectionTitle(doc, 'Documentos Adjuntos');
        pdfLinkList(doc, [
            c.sustanciacion?.xls && { label: 'Sustanciación — Documento 1', url: c.sustanciacion.xls },
            c.sustanciacion?.ppt && { label: 'Sustanciación — Documento 2', url: c.sustanciacion.ppt },
            c.memoFinal && { label: 'Memorándum de Cierre', url: c.memoFinal }
        ].filter(Boolean), baseUrl);

        pdfSectionTitle(doc, 'Historial de Comentarios');
        const mensajes = Array.isArray(c.historialMensajes) ? c.historialMensajes : [];
        if (mensajes.length > 0) {
            mensajes.forEach((m, idx) => {
                if (doc.y > doc.page.height - 110) doc.addPage();
                const y = doc.y;
                doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_BRAND_BLUE).text(String(idx + 1).padStart(2, '0'), PDF_MARGIN, y, { width: 22 });
                doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_MUTED)
                    .text(`${(m.autor || '—').toUpperCase()}   ·   ${m.fecha || ''}`, PDF_MARGIN + 24, y, { width: doc.page.width - PDF_MARGIN * 2 - 24, characterSpacing: 0.3 });
                doc.font('Times-Italic').fontSize(10).fillColor(PDF_TEXT)
                    .text(m.texto || '', PDF_MARGIN + 24, y + 13, { width: doc.page.width - PDF_MARGIN * 2 - 24, lineGap: 2 });
                doc.moveDown(0.55);
                doc.moveTo(PDF_MARGIN, doc.y).lineTo(doc.page.width - PDF_MARGIN, doc.y).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
                doc.moveDown(0.5);
            });
            doc.x = PDF_MARGIN;
        } else {
            pdfParagraph(doc, 'Sin comentarios registrados.');
        }

        pdfFooter(doc);
        doc.end();
    });
}

// Arma el PDF de una incidencia (solicitud): datos generales, asunto, personas involucradas,
// documentos adjuntos (como enlaces) y el historial de observaciones de aprobación/rechazo gerencial.
function buildIncidenciaPdf(s, baseUrl) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const fmtFecha = (v) => v ? new Date(v).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

        pdfHeader(doc, 'Expediente de Incidencia', `Incidencia ${s.id ?? ''}`, 'Proceso de validación gerencial');

        pdfSectionTitle(doc, 'Información General');
        pdfDataTable(doc, [
            ['Estado', s.estado],
            ['Criticidad', s.criticidad],
            ['Enviado por', s.creadoPorNombre || s.creadoPor],
            ['Fecha de Creación', fmtFecha(s.creadoEl)],
            ['Caso Generado', s.casoGenerado ? `Caso ${s.casoGenerado}` : '—']
        ]);

        pdfSectionTitle(doc, 'Asunto');
        pdfParagraph(doc, s.asunto);

        pdfSectionTitle(doc, 'Personas Involucradas');
        pdfPeopleTable(doc, Array.isArray(s.personasInvolucradasDetalle) ? s.personasInvolucradasDetalle : [], false);

        pdfSectionTitle(doc, 'Documentos Adjuntos');
        pdfLinkList(doc, [
            s.adjuntos?.xls && { label: 'Documento Soporte 1', url: s.adjuntos.xls },
            s.adjuntos?.ppt && { label: 'Documento Soporte 2', url: s.adjuntos.ppt }
        ].filter(Boolean), baseUrl);

        const observaciones = Array.isArray(s.observaciones) ? s.observaciones : [];
        if (observaciones.length > 0) {
            pdfSectionTitle(doc, 'Historial de Observaciones');
            observaciones.forEach((o, idx) => {
                if (doc.y > doc.page.height - 100) doc.addPage();
                const y = doc.y;
                doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_BRAND_BLUE).text(String(idx + 1).padStart(2, '0'), PDF_MARGIN, y, { width: 22 });
                doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_MUTED).text((o.autor || '—').toUpperCase(), PDF_MARGIN + 24, y, { width: doc.page.width - PDF_MARGIN * 2 - 24, characterSpacing: 0.3 });
                doc.font('Times-Italic').fontSize(10).fillColor(PDF_TEXT)
                    .text(o.texto || '', PDF_MARGIN + 24, y + 13, { width: doc.page.width - PDF_MARGIN * 2 - 24, lineGap: 2 });
                doc.moveDown(0.55);
                doc.moveTo(PDF_MARGIN, doc.y).lineTo(doc.page.width - PDF_MARGIN, doc.y).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
                doc.moveDown(0.5);
            });
            doc.x = PDF_MARGIN;
        }

        pdfFooter(doc);
        doc.end();
    });
}

async function generarReporteMensualSiCorresponde() {
    try {
        const now = new Date();
        const esUltimoDiaDelMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === now.getDate();
        if (!esUltimoDiaDelMes) return;

        const monthTag = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const fileName = `Reporte_Mensual_${monthTag}.pdf`;

        // Evita generarlo dos veces si el servidor se reinicia el mismo día
        const { data: existentes } = await supabase.from('documents').select('id_documento').eq('nombre_original', fileName);
        if (existentes && existentes.length > 0) return;

        const { data: casos } = await supabase.from('investigaciones').select('estatus, created_at, updated_at, fecha_limite');
        const list = casos || [];
        const cerrados = list.filter(c => c.estatus === 'Cerrado');
        const total = list.length;
        const tasaCierre = total > 0 ? Math.round((cerrados.length / total) * 100) : 0;

        let totalMs = 0;
        cerrados.forEach(c => { totalMs += new Date(c.updated_at).getTime() - new Date(c.created_at).getTime(); });
        const avgDays = cerrados.length > 0 ? Math.round(totalMs / cerrados.length / 86400000) : 0;

        let cumplidos = 0;
        list.forEach(c => {
            if (!c.fecha_limite) return;
            const limite = new Date(c.fecha_limite);
            limite.setHours(23, 59, 59, 999);
            const referencia = c.estatus === 'Cerrado' ? new Date(c.updated_at).getTime() : Date.now();
            if (referencia <= limite.getTime()) cumplidos++;
        });
        const cumplimiento = total > 0 ? Math.round((cumplidos / total) * 100) : 0;

        const pdfBuffer = await buildReportePdf(
            `Reporte de Gestión Mensual — ${monthTag}`,
            now.toLocaleDateString('es-VE'),
            'Generado automáticamente por el sistema el último día del mes.',
            { total, tasaCierre, avgDays, cumplimiento }
        );
        const base64Pdf = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
        const url = await uploadToSupabase(base64Pdf, fileName);

        await supabase.from('documents').insert({
            persona_id: null,
            ruta: url,
            tipo_documento: REPORTE_MENSUAL_TIPO,
            nombre_original: fileName,
            hash_name: fileName
        });

        await prefetchData();
        console.log(`Reporte mensual generado automáticamente: ${fileName}`);
    } catch (e) {
        console.error('Error generando el reporte mensual automático:', e);
    }
}

// Revisa al arrancar (por si el servidor inicia justo el último día del mes) y luego cada 6 horas.
generarReporteMensualSiCorresponde();
setInterval(generarReporteMensualSiCorresponde, 6 * 60 * 60 * 1000);

// 5. Agregar Estudio
app.post('/api/expedientes/estudios', authenticate, async (req, res) => {
    try {
        const { persona_id, titulo, institucion, estado_estudio, fileName, fileBase64 } = req.body;
        let url = null;
        if (fileBase64) {
            url = await uploadToSupabase(fileBase64, fileName);
        }
        
        const { data, error } = await supabase.from('estudios').insert({
            persona_id, titulo, institucion, estado_estudio, soporte_path: url, created_at: new Date().toISOString()
        }).select();
        
        if (error) throw error;
        await prefetchData();
        res.json({ success: true, data: data[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// 6. Agregar Referencia Laboral
app.post('/api/expedientes/referencias', authenticate, async (req, res) => {
    try {
        const { persona_id, referencia_contacto, telefono_contacto, fecha_inicio, fecha_fin, salario, motivo_egreso, fileName, fileBase64 } = req.body;
        let url = null;
        if (fileBase64) {
            url = await uploadToSupabase(fileBase64, fileName);
        }
        
        const { data, error } = await supabase.from('referencias_laborales').insert({
            persona_id, 
            referencia_contacto, 
            telefono_contacto, 
            fecha_inicio: fecha_inicio || null, 
            fecha_fin: fecha_fin || null, 
            salario: salario || null, 
            motivo_egreso: motivo_egreso || null, 
            soporte_path: url, 
            created_at: new Date().toISOString()
        }).select();
        
        if (error) throw error;
        await prefetchData();
        res.json({ success: true, data: data[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// 7. Generar PDF de reporte bajo demanda (botón "Generar Reporte Mensual" del Dashboard).
// Devuelve el PDF directamente como descarga, sin depender del diálogo de impresión del navegador.
app.post('/api/reports/pdf', authenticate, async (req, res) => {
    try {
        const { titulo, generadoPor, total, tasaCierre, avgDays, cumplimiento, trabajados, enProceso, rechazadas, listaDetalle } = req.body;
        
        // Determinar appUrl dinámicamente si es posible, o usar el referer.
        const origin = req.headers.referer ? new URL(req.headers.referer).origin : 'http://localhost';
        
        const pdfBuffer = await buildReportePdf(
            titulo || 'Reporte de Gestión',
            new Date().toLocaleDateString('es-VE'),
            generadoPor ? `Generado por: ${generadoPor}` : 'Generado por el sistema.',
            { 
                total: total || 0, tasaCierre: tasaCierre || 0, avgDays: avgDays || 0, cumplimiento: cumplimiento || 0,
                trabajados: trabajados || 0, enProceso: enProceso || 0, rechazadas: rechazadas || 0,
                listaDetalle: listaDetalle || [], appUrl: origin
            }
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Reporte_Gestion_${Date.now()}.pdf"`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error('Error generando PDF bajo demanda:', e);
        res.status(500).json({ error: e.message });
    }
});

// 8. Exportar un Caso a PDF. El cliente ya tiene el caso completamente ensamblado (con nombres
// de personas y responsables resueltos), así que se lo envía en el body en vez de re-consultarlo.
app.post('/api/casos/pdf', authenticate, async (req, res) => {
    try {
        const appUrl = `${req.protocol}://${req.get('host')}`;
        const pdfBuffer = await buildCasoPdf(req.body || {}, appUrl);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Caso_${req.body?.id ?? Date.now()}.pdf"`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error('Error generando PDF de caso:', e);
        res.status(500).json({ error: e.message });
    }
});

// 9. Exportar una Incidencia (solicitud) a PDF, mismo criterio que el de casos.
app.post('/api/solicitudes/pdf', authenticate, async (req, res) => {
    try {
        const appUrl = `${req.protocol}://${req.get('host')}`;
        const pdfBuffer = await buildIncidenciaPdf(req.body || {}, appUrl);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Incidencia_${req.body?.id ?? Date.now()}.pdf"`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error('Error generando PDF de incidencia:', e);
        res.status(500).json({ error: e.message });
    }
});

// 10. Visor de imágenes con clic derecho desalentado. Los enlaces "Documentos Adjuntos" de los PDF
// exportados (ver pdfLinkList) apuntan aquí en vez de a la URL cruda de Supabase Storage, porque un
// enlace dentro de un PDF solo puede navegar a una URL — no puede ejecutar el JS que bloquea el
// menú contextual en la app. Esta ruta envuelve la misma imagen en una página con
// oncontextmenu bloqueado, igual que openStoredFileUrl/previewFile del lado del cliente.
// No es protección real (herramientas de desarrollador o una captura de pantalla la sortean),
// solo evita el guardado casual por menú.
app.get('/visor-imagen', (req, res) => {
    const raw = req.query.url;
    if (!raw || typeof raw !== 'string') return res.status(400).send('Falta el parámetro "url".');

    let target;
    try { target = new URL(raw); } catch (e) { return res.status(400).send('URL inválida.'); }

    // Solo se permite enlazar a archivos del propio bucket de Supabase Storage, para que esto no
    // se convierta en un visor abierto de cualquier imagen de internet.
    let allowedHost = null;
    try { allowedHost = new URL(supabaseUrl).host; } catch (e) { /* sin SUPABASE_URL configurado, no se permite nada */ }
    if (!allowedHost || target.host !== allowedHost) return res.status(400).send('Dominio no permitido.');

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html><head><title>Vista de Documento</title><style>
        html,body{margin:0;height:100%;background:#000;}
        .wrap{position:relative;display:flex;justify-content:center;align-items:center;min-height:100vh;}
        img{max-width:100%;max-height:100vh;-webkit-user-drag:none;user-select:none;pointer-events:none;}
        .shield{position:absolute;inset:0;}
    </style></head>
    <body oncontextmenu="return false">
        <div class="wrap">
            <img src="${target.toString()}" draggable="false" alt="Documento">
            <div class="shield" oncontextmenu="return false"></div>
        </div>
    </body></html>`);
});

// Default route to serve HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor seguro corriendo en http://localhost:${PORT}`);
});
