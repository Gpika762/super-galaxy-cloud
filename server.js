const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json()); // Necesario para procesar el body de los anuncios
app.use(express.static(__dirname));

// --- CONFIGURACIÓN ---
const ADMIN_TOKEN = process.env.ADMIN_SECRET_KEY; 
let modoMantenimiento = false; 
let tiempoMantenimiento = null; // Almacena el fin del temporizador
let ultimoDispositivo = "Ninguno detectado"; // Para el Hardware Log
let currentAd = { text: "¡Bienvenidos a Galaxy Cloud!", img: "", link: "#" };

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

// --- MIDDLEWARE DE AUTORIZACIÓN (Unificado) ---
const checkStatus = (req, res, next) => {
    const userToken = req.headers['x-admin-auth'];
    const isBoss = (userToken === ADMIN_TOKEN && ADMIN_TOKEN !== undefined);
    
    // Verificación automática de Temporizador
    if (tiempoMantenimiento && Date.now() > tiempoMantenimiento) {
        modoMantenimiento = false;
        tiempoMantenimiento = null;
    }

    // Si hay mantenimiento y no eres el jefe, bloqueamos
    if (modoMantenimiento && !isBoss) {
        return res.status(503).json({ error: "SISTEMA EN MANTENIMIENTO" });
    }
    
    req.isBoss = isBoss;
    next();
};

// 1. SUBIDA (Con detección de Hardware)
app.post('/api/upload', checkStatus, upload.single('archivo'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No llegó el archivo" });

        // Detección de Dispositivo (Hardware Log)
        const ua = req.headers['user-agent'];
        if (ua.includes("GT-I9100")) ultimoDispositivo = "Samsung Galaxy S2";
        else if (ua.includes("GT-I9300")) ultimoDispositivo = "Samsung Galaxy S3";
        else if (ua.includes("GT-I9505") || ua.includes("GT-I9500")) ultimoDispositivo = "Samsung Galaxy S4";
        else if (ua.includes("SM-G900")) ultimoDispositivo = "Samsung Galaxy S5";
        else if (ua.includes("SM-N900")) ultimoDispositivo = "Samsung Galaxy Note 3";
        else if (ua.includes("Windows")) ultimoDispositivo = "Notebook (PC)";
        else ultimoDispositivo = "Móvil Desconocido";

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
        res.set('x-last-device', encodeURIComponent(ultimoDispositivo));
        res.set('Access-Control-Expose-Headers', 'x-is-admin, x-maint-status, x-last-device'); 
        
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: "Error en el radar" });
    }
});

// --- NUEVAS FUNCIONES: PREVIEW, QR Y DESCARGA ---

// 5. GENERADOR DE QR (Para compartir archivos)
app.get('/api/share/qr/:folder/:id', checkStatus, (req, res) => {
    try {
        const publicId = `${req.params.folder}/${req.params.id}`;
        const fileUrl = cloudinary.url(publicId, { secure: true });
        // Usamos Google Charts API para generar el QR
        const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(fileUrl)}`;
        res.json({ qr_url: qrUrl, original_url: fileUrl });
    } catch (err) {
        res.status(500).json({ error: "No se pudo generar el QR" });
    }
});

// 6. PRE-VISUALIZADOR (Thumbnail optimizado para S2/S4)
app.get('/api/preview/:folder/:id', checkStatus, (req, res) => {
    try {
        const publicId = `${req.params.folder}/${req.params.id}`;
        // Genera una miniatura de 250px optimizada automáticamente
        const thumbUrl = cloudinary.url(publicId, {
            width: 250,
            height: 250,
            crop: "fill",
            quality: "auto",
            fetch_format: "auto",
            secure: true
        });
        res.json({ thumbnail: thumbUrl });
    } catch (err) {
        res.status(500).json({ error: "Error al generar vista previa" });
    }
});

// 7. DESCARGA FORZADA (Evita que el navegador del móvil abra el archivo en lugar de bajarlo)
app.get('/api/download/:folder/:id', checkStatus, (req, res) => {
    try {
        const publicId = `${req.params.folder}/${req.params.id}`;
        const downloadUrl = cloudinary.url(publicId, { 
            flags: "attachment", 
            secure: true 
        });
        res.redirect(downloadUrl);
    } catch (err) {
        res.status(500).json({ error: "Error al procesar descarga" });
    }
});

// --- FIN NUEVAS FUNCIONES ---

app.get('/api/ads', (req, res) => {
    res.json(currentAd);
});

app.post('/api/ads/update', (req, res) => {
    if (req.headers['x-admin-auth'] === 'DELTARUNEGOD') {
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

app.get('/api/admin/control', (req, res) => {
    if (req.query.token !== ADMIN_TOKEN) return res.status(401).send("Token inválido");
    
    const { accion, minutos } = req.query;

    if (accion === 'on') {
        modoMantenimiento = true;
        tiempoMantenimiento = null;
    } else if (accion === 'off') {
        modoMantenimiento = false;
        tiempoMantenimiento = null;
    } else if (accion === 'timer' && minutos) {
        modoMantenimiento = true;
        tiempoMantenimiento = Date.now() + (parseInt(minutos) * 60000);
    }

    res.json({ 
        mantenimiento: modoMantenimiento, 
        expira: tiempoMantenimiento ? new Date(tiempoMantenimiento).toLocaleTimeString() : "Manual",
        dispositivo: ultimoDispositivo
    });
});

app.get('/api/admin/toggle-maint', (req, res) => {
    if (req.query.token === ADMIN_TOKEN) {
        modoMantenimiento = !modoMantenimiento;
        tiempoMantenimiento = null;
        res.send(`ESTADO MANTENIMIENTO: ${modoMantenimiento}`);
    } else {
        res.status(401).send("Token inválido");
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Órbita Galaxy Cloud Pro activa`));
