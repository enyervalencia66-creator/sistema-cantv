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
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname)); // Serve Index.html statically

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Using Service Role Key bypasses RLS and allows backend full control.
const supabase = createClient(supabaseUrl, supabaseKey);

// Envío de correo vía la API HTTPS de Brevo (no SMTP): Render bloquea las conexiones SMTP
// salientes en su plan gratuito, así que un transporte SMTP tradicional (como el que se usaba
// antes con Nodemailer + Gmail) nunca llega a conectar ahí. Una petición HTTPS normal sí sale
// sin problema, porque es indistinguible de cualquier otra llamada que ya hace este servidor.
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

async function sendResetEmail(toEmail, token) {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    if (!apiKey || !senderEmail) throw new Error('BREVO_API_KEY o BREVO_SENDER_EMAIL no configurados en el servidor.');

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { name: 'Sistema CANTV', email: senderEmail },
            to: [{ email: toEmail }],
            subject: 'Código de recuperación de contraseña - Sistema CANTV',
            htmlContent: buildResetEmailHtml(token)
        })
    });

    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Brevo respondió ${res.status}: ${errBody}`);
    }
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

app.get('/api/db/init', authenticate, async (req, res) => {
    try {
        if (dbCache && (Date.now() - dbCacheTime) < DB_CACHE_TTL_MS) {
            return res.json(dbCache);
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
        res.json(newData);
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

app.post('/api/db/:table', authenticate, async (req, res) => {
    try {
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
        res.json({ success: true, data: req.params.table === 'users' ? stripPassword(data) : data });
    } catch (e) {
        console.error(`POST /api/db/${req.params.table} ERROR:`, e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/db/:table/:idColumn/:idValue', authenticate, async (req, res) => {
    try {
        // Igual que en el POST genérico: si esta actualización toca la contraseña de un usuario
        // (cambio propio, reseteo de admin, edición), se hashea antes de guardarla.
        if (req.params.table === 'users' && req.body.password) {
            req.body.password = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
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
    const token = jwt.sign({ username: user.username, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h' });
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

// Arma el PDF del reporte (tabla de KPIs) y devuelve el buffer ya generado.
// `subtitulo` es la línea bajo la fecha (ej. "Generado automáticamente..." o "Generado por: Fulano").
function buildReportePdf(titulo, fechaGeneracion, subtitulo, { total, tasaCierre, avgDays, cumplimiento }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.font('Helvetica-Bold').fontSize(20).fillColor('#111').text(titulo);
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(10).fillColor('#555')
            .text(`Fecha de Generación: ${fechaGeneracion}`)
            .text(subtitulo);
        doc.moveDown(1.5);

        doc.font('Helvetica-Bold').fontSize(13).fillColor('#111').text('Resumen Ejecutivo de Rendimiento');
        doc.moveDown(0.75);

        const rows = [
            ['Total Casos Procesados', String(total)],
            ['Tasa de Cierre', `${tasaCierre}%`],
            ['Tiempo Promedio de Resolución', `${avgDays} días`],
            ['% Cumplimiento a Tiempo', `${cumplimiento}%`]
        ];
        const startX = doc.x;
        const tableWidth = 460;
        const rowHeight = 32;
        let y = doc.y;

        rows.forEach(([label, value]) => {
            doc.rect(startX, y, tableWidth, rowHeight).stroke('#cccccc');
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(label, startX + 12, y + 10, { width: tableWidth * 0.6 });
            doc.font('Helvetica').fontSize(11).fillColor('#111').text(value, startX + tableWidth * 0.65, y + 10, { width: tableWidth * 0.3 });
            y += rowHeight;
        });

        doc.moveDown(4);
        doc.font('Helvetica').fontSize(8).fillColor('#888')
            .text('Documento oficial generado automáticamente por el Sistema de Investigaciones Relacionales CANTV.', { align: 'center' });

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
            persona_id, referencia_contacto, telefono_contacto, fecha_inicio, fecha_fin, salario, motivo_egreso, soporte_path: url, created_at: new Date().toISOString()
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
        const { titulo, generadoPor, total, tasaCierre, avgDays, cumplimiento } = req.body;
        const pdfBuffer = await buildReportePdf(
            titulo || 'Reporte de Gestión',
            new Date().toLocaleDateString('es-VE'),
            generadoPor ? `Generado por: ${generadoPor}` : 'Generado por el sistema.',
            { total: total || 0, tasaCierre: tasaCierre || 0, avgDays: avgDays || 0, cumplimiento: cumplimiento || 0 }
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Reporte_Gestion_${Date.now()}.pdf"`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error('Error generando PDF bajo demanda:', e);
        res.status(500).json({ error: e.message });
    }
});

// Default route to serve HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor seguro corriendo en http://localhost:${PORT}`);
});
