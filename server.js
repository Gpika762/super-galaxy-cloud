const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json()); 
// Usar path.join previene fallos de rutas estáticas en servidores como Render
app.use(express.static(path.join(__dirname))); 

// --- CONFIGURACIÓN DE CREDENCIALES ---
const ADMIN_TOKEN = process.env.ADMIN_SECRET_KEY || "DELTARUNEGOD"; 
let modoMantenimiento = false; 
let tiempoMantenimiento = null; 
let ultimoDispositivo = "Ninguno detectado"; 
let currentAd = { text: "¡Bienvenidos a Galaxy Cloud !", img: "", link: "#" };

// BASE DE DATOS LOCAL PARA LA FAMILIA
const CONTRASEÑAS_FAMILIA = {
    "admin": ADMIN_TOKEN,                                 // Tú con superpoderes
    "familia": process.env.FAMILY_KEY || "DELTAGOD",      // Contraseña común para tu familia
};

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

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'galaxy_cloud_uploads',
    resource_type: 'auto'
  },
});

const upload = multer({ storage: storage });

// --- MIDDLEWARE DE AUTORIZACIÓN (Mantenimiento + Filtro Familiar Estricto) ---
const checkStatus = (req, res, next) => {
    const userToken = req.headers['x-admin-auth'] || req.query['x-admin-auth'];
    
    const isFamily = (userToken === CONTRASEÑAS_FAMILIA["familia"]);
    const isAdmin = (userToken === ADMIN_TOKEN && ADMIN_TOKEN !== undefined);
    
    // Si no es parte de la familia ni admin, denegado instantáneo
    if (!userToken || (!isFamily && !isAdmin)) {
        return res.status(401).json({ error: "Acceso denegado." });
    }
    
    // Verificación automática de Temporizador de Mantenimiento
    if (tiempoMantenimiento && Date.now() > tiempoMantenimiento) {
        modoMantenimiento = false;
        tiempoMantenimiento = null;
    }

    // Si hay mantenimiento activo y no eres el administrador supremo, bloqueo estricto
    if (modoMantenimiento && !isAdmin) {
        return res.status(503).json({ error: "SISTEMA EN MANTENIMIENTO PRIVADO" });
    }
    
    req.isBoss = isAdmin; 
    next();
};

// --- ENDPOINT: LOGIN INTELIGENTE CON MEMORIA DE MANTENIMIENTO ---
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    
    if (tiempoMantenimiento && Date.now() > tiempoMantenimiento) {
        modoMantenimiento = false;
        tiempoMantenimiento = null;
    }

    if (password === ADMIN_TOKEN) {
        return res.json({ success: true, role: "admin", token: ADMIN_TOKEN, maintenance: false });
    } else if (password === CONTRASEÑAS_FAMILIA["familia"]) {
        return res.json({ 
            success: true, 
            role: "familia", 
            token: CONTRASEÑAS_FAMILIA["familia"], 
            maintenance: modoMantenimiento 
        });
    }
    
    res.status(401).json({ success: false, error: "Clave familiar incorrecta" });
});

// 1. SUBIDA (Con detección de Hardware)
app.post('/api/upload', checkStatus, upload.single('archivo'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No llegó el archivo" });

        // Detección de Hardware Log
        const ua = req.headers['user-agent'] || "";
        if (ua.includes("GT-I9100")) ultimoDispositivo = "Samsung Galaxy S2";
        else if (ua.includes("GT-I9300")) ultimoDispositivo = "Samsung Galaxy S3";
        else if (ua.includes("GT-I9505") || ua.includes("GT-I9500")) ultimoDispositivo = "Samsung Galaxy S4";
        else if (ua.includes("SM-G900")) ultimoDispositivo = "Samsung Galaxy S5";
        else if (ua.includes("SM-N900")) ultimoDispositivo = "Samsung Galaxy Note 3";
        else if (ua.includes("Windows")) ultimoDispositivo = "Notebook (PC)";
        else if (ua.includes("Android")) ultimoDispositivo = "Móvil Android";
        else ultimoDispositivo = "Dispositivo Familiar";

        res.status(200).json({ success: true, url: req.file.path, device: ultimoDispositivo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. LISTADO (Con inyección de estadísticas)
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

        res.set('x-is-admin', req.isBoss ? 'true' : 'false');
        res.set('x-maint-status', modoMantenimiento ? 'true' : 'false');
        res.set('Access-Control-Expose-Headers', 'x-is-admin, x-maint-status'); 
        
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: "Error en el radar" });
    }
});

// --- NUEVOS ENDPOINTS: MOTOR DE HYPER TRANSFER ---

// Generar PIN de 4 dígitos para transferir un archivo de la lista
app.post('/api/transfer/generar', checkStatus, (req, res) => {
    const { fileId } = req.body;
    if (!fileId) return res.status(400).json({ error: "Falta el ID del archivo" });

    const pin = generarPinHyperTransfer();
    hyperTransfers[pin] = {
        fileId: fileId,
        expires: Date.now() + 10 * 60 * 1000 // 10 minutos de vigencia
    };

    res.json({ success: true, pin });
});

// Reclamar archivo desde cualquier dispositivo usando el PIN (Descarga y Destruye)
app.get('/api/transfer/reclamar/:pin', checkStatus, async (req, res) => {
    try {
        const { pin } = req.params;
        const transferencia = hyperTransfers[pin];

        if (!transferencia || Date.now() > transferencia.expires) {
            return res.status(404).json({ error: "Código Hyper Transfer inválido o expirado" });
        }

        const publicId = transferencia.fileId;
        const parts = publicId.split('/');
        const folder = parts[0];
        const id = parts[1];

        // Quitar el PIN inmediatamente para que no se use dos veces
        delete hyperTransfers[pin];

        // Autodestrucción programada en Cloudinary tras 15 segundos (le da tiempo al receptor de iniciar la descarga)
        setTimeout(async () => {
            try {
                let result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
                if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
                if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
                console.log(`[Hyper Transfer] Archivo temporal ${publicId} eliminado con éxito.`);
            } catch (cErr) {
                console.error("Error al ejecutar autodestrucción en Cloudinary:", cErr);
            }
        }, 15000);

        res.json({ success: true, folder, id });
    } catch (err) {
        res.status(500).json({ error: "Error interno en el distribuidor Hyper Transfer" });
    }
});

// 5. GENERADOR DE QR
app.get('/api/share/qr/:folder/:id', checkStatus, async (req, res) => {
    try {
        const { folder, id } = req.params;
        const userToken = req.headers['x-admin-auth'] || req.query['x-admin-auth'];
        
        const hostBase = `${req.protocol}://${req.get('host')}`;
        const downloadRoute = `${hostBase}/api/download/${folder}/${id}?x-admin-auth=${userToken}`;
        
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(downloadRoute)}`;
        
        res.json({ qr_url: qrUrl, original_url: downloadRoute });
    } catch (err) {
        res.status(500).json({ error: "Error en el radar QR" });
    }
});

// 6. PRE-VISUALIZADOR
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

// 7. DESCARGA FORZADA
app.get('/api/download/:folder/:id', checkStatus, (req, res) => {
    try {
        const publicId = `${req.params.folder}/${req.params.id}`;
        const downloadUrl = cloudinary.url(publicId, { flags: "attachment", secure: true });
        res.redirect(downloadUrl);
    } catch (err) {
        res.status(500).send("Error al descargar");
    }
});

app.get('/api/ads', (req, res) => {
    res.json(currentAd);
});

app.post('/api/ads/update', (req, res) => {
    if (req.headers['x-admin-auth'] === ADMIN_TOKEN) {
        currentAd = req.body;
        res.send("OK");
    } else {
        res.status(401).send("No autorizado");
    }
});

app.delete('/api/files/:folder/:id', checkStatus, async (req, res) => {
    try {
        const publicId = `${req.params.folder}/${req.params.id}`;
        let result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });

        if (result.result === 'ok') {
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "No se encontró el archivo" });
        }
    } catch (err) {
        res.status(500).json({ error: "Error interno" });
    }
});

// URL CONTROL REMOTO MANUAL (PARA TI)
app.get('/api/admin/toggle-maint', (req, res) => {
    if (req.query.token === ADMIN_TOKEN) {
        modoMantenimiento = !modoMantenimiento;
        tiempoMantenimiento = null;
        res.send(`ESTADO MANTENIMIENTO: ${modoMantenimiento ? 'ACTIVADO (Bloqueo Total)' : 'DESACTIVADO (Órbita Libre)'}`);
    } else {
        res.status(401).send("Token inválido");
    }
});

app.get('/api/admin/control', (req, res) => {
    if (req.query.token !== ADMIN_TOKEN) return res.status(401).send("Token inválido");
    const { accion, minutos } = req.query;

    if (accion === 'on') { modoMantenimiento = true; tiempoMantenimiento = null; }
    else if (accion === 'off') { modoMantenimiento = false; tiempoMantenimiento = null; }
    else if (accion === 'timer' && minutos) {
        modoMantenimiento = true;
        tiempoMantenimiento = Date.now() + (parseInt(minutos) * 60000);
    }

    res.json({ 
        mantenimiento: modoMantenimiento, 
        expira: tiempoMantenimiento ? new Date(tiempoMantenimiento).toLocaleTimeString() : "Manual"
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Órbita Galaxy Cloud Pro activa con Hyper Transfer`));
