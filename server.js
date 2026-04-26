const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// --- CONFIGURACIÓN DE SEGURIDAD INVISIBLE ---
const ADMIN_TOKEN = process.env.ADMIN_SECRET_KEY; // Agrégala en Render (Environment Variables)
let modoMantenimiento = false; // Interruptor general

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

// --- MIDDLEWARE DE AUTORIZACIÓN ---
const checkStatus = (req, res, next) => {
    const userToken = req.headers['x-admin-auth'];
    const isBoss = (userToken === ADMIN_TOKEN && ADMIN_TOKEN !== undefined);
    
    // Si estamos en mantenimiento y no eres el jefe, bloqueamos
    if (modoMantenimiento && !isBoss) {
        return res.status(503).json({ error: "SISTEMA EN MANTENIMIENTO" });
    }
    
    // Guardamos el rango en el objeto request para usarlo luego
    req.isBoss = isBoss;
    next();
};

// 1. RUTA DE SUBIDA (Protegida por mantenimiento)
app.post('/api/upload', checkStatus, upload.single('archivo'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No llegó el archivo" });
        res.status(200).json({ success: true, url: req.file.path });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. RUTA DE LISTADO (Inyecta el rol de admin en la cabecera)
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
            url: f.secure_url
        }));

        // Le avisamos al index.html si eres el admin de forma discreta
        res.set('x-is-admin', req.isBoss ? 'true' : 'false');
        res.set('Access-Control-Expose-Headers', 'x-is-admin'); // Importante para que el JS lo lea
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: "Error en el radar" });
    }
});

// 3. RUTA DE ELIMINACIÓN (Solo para el Admin)
app.delete('/api/files/:folder/:id', checkStatus, async (req, res) => {
    if (!req.isBoss) return res.status(401).json({ error: "No tienes rango para desintegrar archivos" });

    try {
        const publicId = `${req.params.folder}/${req.params.id}`;
        let result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        
        if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        if (result.result !== 'ok') result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });

        res.json({ success: true, message: "Archivo eliminado" });
    } catch (err) {
        res.status(500).json({ error: "Fallo en el borrado" });
    }
});

// 4. PANEL DE CONTROL SECRETO (Para activar/desactivar mantenimiento)
app.get('/api/admin/toggle-maint', (req, res) => {
    const userToken = req.query.token;
    if (userToken === ADMIN_TOKEN) {
        modoMantenimiento = !modoMantenimiento;
        res.send(`ESTADO MANTENIMIENTO: ${modoMantenimiento}`);
    } else {
        res.status(401).send("Token inválido");
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Órbita activa`));
