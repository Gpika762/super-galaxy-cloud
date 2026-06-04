const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json()); 
app.use(express.static(path.join(__dirname))); 

// --- CONFIGURACIÓN DE PARÁMETROS LIBRES ---
let modoMantenimiento = false; 
let tiempoMantenimiento = null; 
let ultimoDispositivo = "Ninguno detectado"; 
let currentAd = { text: "¡Bienvenidos a Galaxy Cloud !", img: "", link: "#" };

// --- BASE DE DATOS EN MEMORIA: HYPER TRANSFER ---
let hyperTransfers = {}; 

function generarPinHyperTransfer() {
    let pin;
    do {
        pin = Math.floor(1000 + Math.random() * 9000).toString();
    } while (hyperTransfers[pin]);
    return pin;
}

// Limpiador automático de pines expirados (corre cada 1 minuto)
setInterval(() => {
    const ahora = Date.now();
    for (const pin in hyperTransfers) {
        if (ahora > hyperTransfers[pin].expires) {
            delete hyperTransfers[pin];
        }
    }
}, 60000);

cloudinary.config({ 
  cloud_name: process.env.CLOUD_NAME, 
  api_key: process.env.API_KEY, 
  api_secret: process.env.API_SECRET,
  secure: true 
});

// El resource_type: 'auto' es clave aquí para que Cloudinary acepte PNG, MP3 y APKs sin discriminar
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'galaxy_cloud_uploads',
    resource_type: 'auto'
  },
});

const upload = multer({ storage: storage });

// --- MIDDLEWARE INTEGRADO (Únicamente verifica estado técnico global) ---
const checkStatus = (req, res, next) => {
    if (tiempoMantenimiento && Date.now() > tiempoMantenimiento) {
        modoMantenimiento = false;
        tiempoMantenimiento = null;
    }

    if (modoMantenimiento) {
        return res.status(503).json({ error: "SISTEMA EN MANTENIMIENTO PRIVADO" });
    }
    next();
};

// =========================================================================
// 1. ENDPOINTS DE LA API (PROCESAMIENTO Y CONTROL DE DATOS)
// =========================================================================

// SUBIDA LIBRE (Con detección de Hardware y redirección opcional para motores viejos)
app.post('/api/upload', checkStatus, upload.single('archivo'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No llegó el archivo" });

        const ua = req.headers['user-agent'] || "";
        if (ua.includes("GT-I9100")) ultimoDispositivo = "Samsung Galaxy S2";
        else if (ua.includes("GT-I9300")) ultimoDispositivo = "Samsung Galaxy S3";
        else if (ua.includes("GT-I9505") || ua.includes("GT-I9500")) ultimoDispositivo = "Samsung Galaxy S4";
        else if (ua.includes("SM-G900")) ultimoDispositivo = "Samsung Galaxy S5";
        else if (ua.includes("SM-N900")) ultimoDispositivo = "Samsung Galaxy Note 3";
        else if (ua.includes("SM-A366")) ultimoDispositivo = "Samsung Galaxy A36 5G"; 
        else if (ua.includes("SM-A525") || ua.includes("SM-A526")) ultimoDispositivo = "Samsung Galaxy A52"; 
        else if (ua.includes("Windows")) ultimoDispositivo = "Notebook (PC)";
        else if (ua.includes("Android")) ultimoDispositivo = "Móvil Android";
        else ultimoDispositivo = "Dispositivo Familiar";

        if (req.query.redirect === 'true') {
            return res.redirect(`/retro?device=${encodeURIComponent(ultimoDispositivo)}`);
        }

        res.status(200).json({ 
            success: true, 
            url: req.file.path, 
            device: ultimoDispositivo,
            name: req.file.originalname 
        });
    } catch (err) {
        if (req.query.redirect === 'true') {
            return res.send(`<h2>Error en la carga: ${err.message}</h2><a href="/retro">Volver a intentar</a>`);
        }
        res.status(500).json({ error: err.message });
    }
});

// LISTADO LIBRE
app.get('/api/files', checkStatus, async (req, res) => {
    try {
        const result = await cloudinary.search
            .expression('folder:galaxy_cloud_uploads')
            .sort_by('created_at','desc')
            .max_results(500)
            .execute();

        const files = result.resources.map(f => ({
            id: f.public_id,
            name: f.filename + "." + f.format,
            size: (f.bytes / 1024 / 1024).toFixed(2) + " MB",
            url: f.secure_url,
            folder: f.folder
        }));
        
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: "Error en el radar" });
    }
});

// GENERAR PIN EN HYPER TRANSFER
app.post('/api/transfer/generar', checkStatus, (req, res) => {
    const { fileId } = req.body;
    if (!fileId) return res.status(400).json({ error: "Falta el ID del archivo" });

    const pin = generarPinHyperTransfer();
    hyperTransfers[pin] = {
        fileId: fileId,
        expires: Date.now() + 10 * 60 * 1000
    };

    res.json({ success: true, pin });
});

// RECLAMAR PIN EN HYPER TRANSFER
app.get('/api/transfer/reclamar/:pin', checkStatus, async (req, res) => {
    try {
        const { pin } = req.params;
        const transferencia = hyperTransfers[pin];

        if (!transferencia || Date.now() > transferencia.expires) {
            if (req.query.source === 'pro') {
                return res.status(400).json({ error: "El PIN no existe en el radar o ya caducó." });
            }
            return res.send(`
                <body style="background:#0a0f1d; color:#e2e8f0; font-family:sans-serif; text-align:center; padding:40px 20px;">
                    <h2 style="color:#ef4444;">❌ Código Inválido o Expirado</h2>
                    <p style="color:#94a3b8;">El PIN de Hyper Transfer no existe en el radar o ya caducó.</p>
                    <br><a href="/retro" style="color:#3b82f6; text-decoration:none; font-weight:bold;">Volver al Panel Retro</a>
                </body>
            `);
        }

        const publicId = transferencia.fileId;
        const parts = publicId.split('/');
        const folder = parts[0];
        const id = parts[1];

        delete hyperTransfers[pin];

        setTimeout(async () => {
            try {
                let result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
                if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
                if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
                console.log(`💥 [Hyper Transfer] Archivo ${publicId} autodestruido con éxito.`);
            } catch (cErr) {
                console.error("Error en la autodestrucción en segundo plano:", cErr);
            }
        }, 15000);

        if (req.query.source === 'pro') {
            return res.json({ success: true, folder, id, publicId });
        }

        return res.redirect(`/retro?dl_folder=${encodeURIComponent(folder)}&dl_id=${encodeURIComponent(id)}`);

    } catch (err) {
        if (req.query.source === 'pro') {
            return res.status(500).json({ error: "Error interno en el distribuidor Hyper Transfer" });
        }
        res.status(500).send("Error interno en el distribuidor Hyper Transfer");
    }
});

// GENERADOR DE QR LIBRE
app.get('/api/share/qr/:folder/:id', checkStatus, async (req, res) => {
    try {
        const { folder, id } = req.params;
        const hostBase = `${req.protocol}://${req.get('host')}`;
        const downloadRoute = `${hostBase}/api/download/${folder}/${id}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(downloadRoute)}`;
        
        res.json({ qr_url: qrUrl, original_url: downloadRoute });
    } catch (err) {
        res.status(500).json({ error: "Error en el radar QR" });
    }
});

// PRE-VISUALIZADOR LIBRE
app.get('/api/preview/:folder/:id', checkStatus, (req, res) => {
    try {
        const publicId = `${req.params.folder}/${req.params.id}`;
        const thumbUrl = cloudinary.url(publicId, {
            width: 250, height: 250, crop: "fill", gravity: "auto", quality: "auto", fetch_format: "auto", secure: true
        });
        res.redirect(thumbUrl);
    } catch (err) {
        res.status(404).send("No se pudo generar miniatura");
    }
});

// 📥 DESCARGA FORZADA LIBRE ORIGINAL RESTAURADA (Detecta dinámicamente el tipo por query opcional si es .mp3)
app.get('/api/download/:folder/:id', checkStatus, (req, res) => {
    try {
        const publicId = `${req.params.folder}/${req.params.id}`;
        
        // Usamos la configuración por defecto que te funcionaba perfecto para imágenes
        let opciones = { flags: "attachment", secure: true };
        
        // Si desde el frontend para música le pasas un ?type=video, Cloudinary sabrá procesar el .mp3 sin romper los PNG
        if (req.query.type) {
            opciones.resource_type = req.query.type;
        }

        const downloadUrl = cloudinary.url(publicId, opciones);
        res.redirect(downloadUrl);
    } catch (err) {
        res.status(500).send("Error al descargar");
    }
});

app.get('/api/ads', (req, res) => { res.json(currentAd); });

app.delete('/api/files/:folder/:id', checkStatus, async (req, res) => {
    try {
        const publicId = `${req.params.folder}/${req.params.id}`;
        let result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Error interno" });
    }
});

// URL de control de mantenimiento manual
app.get('/api/admin/toggle-maint', (req, res) => {
    modoMantenimiento = !modoMantenimiento;
    tiempoMantenimiento = null;
    res.send(`ESTADO MANTENIMIENTO: ${modoMantenimiento ? 'ACTIVADO (Bloqueo Total)' : 'DESACTIVADO (Órbita Libre)'}`);
});

app.get('/api/admin/control', (req, res) => {
    const { accion } = req.query;
    if (accion === 'on') { modoMantenimiento = true; tiempoMantenimiento = null; }
    else if (accion === 'off') { modoMantenimiento = false; tiempoMantenimiento = null; }
    res.json({ mantenimiento: modoMantenimiento });
});


// =========================================================================
//  📡 MODULO DE RADAR WI-FI INTEGRADO
// =========================================================================

let clientesDisponibles = {}; 

app.get('/api/wifi/escuchar', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const ua = req.headers['user-agent'] || "";
    let modeloDetectado = "Dispositivo Desconocido";

    if (ua.includes("GT-I9100")) modeloDetectado = "Samsung Galaxy S2";
    else if (ua.includes("GT-I9300")) modeloDetectado = "Samsung Galaxy S3";
    else if (ua.includes("GT-I9505") || ua.includes("GT-I9500")) modeloDetectado = "Samsung Galaxy S4";
    else if (ua.includes("SM-G900")) modeloDetectado = "Samsung Galaxy S5";
    else if (ua.includes("SM-N900")) modeloDetectado = "Samsung Galaxy Note 3";
    else if (ua.includes("SM-A366")) modeloDetectado = "Samsung Galaxy A36 5G"; 
    else if (ua.includes("SM-A525") || ua.includes("SM-A526")) modeloDetectado = "Samsung Galaxy A52"; 
    else if (ua.includes("Windows")) modeloDetectado = "Notebook (PC)";
    else if (ua.includes("Android")) modeloDetectado = "Móvil Android";
    else modeloDetectado = "Dispositivo Familiar";

    const idDispositivo = "dev_" + Math.floor(1000 + Math.random() * 9000);
    
    clientesDisponibles[idDispositivo] = { nombre: modeloDetectado, res: res };
    console.log(`📡 [Radar Wi-Fi] Dispositivo detectado y sintonizado: ${modeloDetectado} (${idDispositivo})`);

    res.write(`data: ${JSON.stringify({ tipo: "identificacion", modelo: modeloDetectado })}\n\n`);

    const pingInterval = setInterval(() => {
        res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
        clearInterval(pingInterval);
        delete clientesDisponibles[idDispositivo];
        console.log(`❌ [Radar Wi-Fi] Fuera de cobertura local: ${modeloDetectado}`);
    });
});

app.get('/api/wifi/dispositivos', (req, res) => {
    const lista = Object.keys(clientesDisponibles).map(id => ({
        id: id,
        nombre: clientesDisponibles[id].nombre
    }));
    res.json(lista);
});

app.post('/api/wifi/enviar-archivo', (req, res) => {
    const { targetId, fileId } = req.body;
    if (!targetId || !fileId) return res.status(400).json({ error: "Parámetros insuficientes para el envío de radar" });

    const targetCelular = clientesDisponibles[targetId];
    if (!targetCelular) return res.status(404).json({ error: "El celular objetivo ya no responde en el radar local." });

    const parts = fileId.split('/');
    const folder = parts[0];
    const id = parts[1];

    const downloadRoute = `/api/download/${folder}/${id}`;

    targetCelular.res.write(`data: ${JSON.stringify({ tipo: "archivo", fileId, url: downloadRoute })}\n\n`);
    
    console.log(`🚀 [Radar Wi-Fi] Archivo ${fileId} inyectado con éxito al dispositivo ${targetId}`);
    res.json({ success: true, message: "¡Ráfaga enviada! Comprueba la terminal del celular objetivo." });
});

app.get('/escuchar', (req, res) => {
    console.log(`📱 [Ruta Fija] Desplegando pantalla del receptor radar (escuchar.html)`);
    res.sendFile(path.join(__dirname, 'escuchar.html'));
});


// =========================================================================
// 8. ENRUTAMIENTO CONTROLADO POR RUTAS FIJAS
// =========================================================================

app.get('/retro', (req, res) => {
    console.log(`📟 [Ruta Fija] Desplegando index-retro.html de forma directa.`);
    res.sendFile(path.join(__dirname, 'index-retro.html'));
});

app.get('/retro-success', (req, res) => {
    console.log(`✅ [Ruta Fija] Desplegando index-retro-success.html.`);
    res.sendFile(path.join(__dirname, 'index-retro-success.html'));
});

app.get('/transition', (req, res) => {
    console.log(`⚖️ [Ruta Fija] Desplegando index-transition.html de forma directa.`);
    res.sendFile(path.join(__dirname, 'index-transition.html'));
});

app.get('/unsupported', (req, res) => {
    console.log(`⚠️ [Ruta Fija] Desplegando index-unsupported.html de forma directa.`);
    res.sendFile(path.join(__dirname, 'index-unsupported.html'));
});

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: "Endpoint no encontrado en el radar" });
    }
    console.log(`🚀 [Ruta Fija] Desplegando interfaz Pro por defecto (index.html)`);
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- INICIO DEL PUERTO DE LANZAMIENTO ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Nube Libre Activa en Puerto ${PORT}`));
