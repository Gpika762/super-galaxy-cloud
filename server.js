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

// 1. SUBIDA LIBRE (Con detección de Hardware)
app.post('/api/upload', checkStatus, upload.single('archivo'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No llegó el archivo" });

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

// 2. LISTADO LIBRE
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

// 3. GENERAR PIN EN HYPER TRANSFER
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

// 4. RECLAMAR PIN EN HYPER TRANSFER
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

        delete hyperTransfers[pin];

        setTimeout(async () => {
            try {
                let result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
                if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
                if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
            } catch (cErr) {
                console.error("Error al ejecutar autodestrucción:", cErr);
            }
        }, 15000);

        res.json({ success: true, folder, id });
    } catch (err) {
        res.status(500).json({ error: "Error interno en el distribuidor Hyper Transfer" });
    }
});

// 5. GENERADOR DE QR LIBRE
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

// 6. PRE-VISUALIZADOR LIBRE
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

// 7. DESCARGA FORZADA LIBRE
app.get('/api/download/:folder/:id', checkStatus, (req, res) => {
    try {
        const publicId = `${req.params.folder}/${req.params.id}`;
        const downloadUrl = cloudinary.url(publicId, { flags: "attachment", secure: true });
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

// URL de control de mantenimiento manual libre de tokens para comodidad
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
// 8. ENRUTAMIENTO CONTROLADO POR RUTAS FIJAS (SISTEMA DETERMINISTA POR URL)
// =========================================================================

// Ruta específica para la interfaz Retro-Esencial (index-retro.html)
app.get('/retro', (req, res) => {
    console.log(`📟 [Ruta Fija] Desplegando index-retro.html de forma directa.`);
    res.sendFile(path.join(__dirname, 'index-retro.html'));
});

// Ruta específica para la interfaz de Transición (index-transition.html)
app.get('/transition', (req, res) => {
    console.log(`⚖️ [Ruta Fija] Desplegando index-transition.html de forma directa.`);
    res.sendFile(path.join(__dirname, 'index-transition.html'));
});

// Ruta específica para la interfaz de No Compatible (index-unsupported.html)
app.get('/unsupported', (req, res) => {
    console.log(`⚠️ [Ruta Fija] Desplegando index-unsupported.html de forma directa.`);
    res.sendFile(path.join(__dirname, 'index-unsupported.html'));
});

// Comodín final (*): Si no es la API ni una ruta fija, sirve la versión Pro (index.html)
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
