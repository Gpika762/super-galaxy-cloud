const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// --- CONFIGURACIÓN ---
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

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 } // Límite de 20MB para evitar que Render se cuelgue
});

// API DE SUBIDA
app.post('/api/upload', (req, res) => {
    upload.single('archivo')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // Error de Multer (ej: archivo demasiado grande)
            return res.status(400).json({ error: "Archivo demasiado pesado (Máx 20MB)" });
        } else if (err) {
            // Error de Cloudinary o de red
            return res.status(500).json({ error: "Error en la nube: " + err.message });
        }

        if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });

        console.log("✅ Subido a Cloudinary:", req.file.path);
        res.json({ success: true, url: req.file.path });
    });
});

// API DE LISTADO (EL ARREGLO DEFINITIVO)
app.get('/api/files', async (req, res) => {
    try {
        // Búsqueda avanzada: Ignora el caché y trae archivos recién subidos
        const result = await cloudinary.search
            .expression('folder:galaxy_cloud_uploads')
            .sort_by('created_at','desc')
            .max_results(100)
            .execute();

        const files = result.resources.map(f => ({
            // Mantiene la extensión si Cloudinary la detecta
            name: f.public_id.split('/').pop() + (f.format ? '.' + f.format : ''),
            size: (f.bytes / 1024 / 1024).toFixed(2) + " MB",
            url: f.secure_url
        }));
        
        console.log(`📂 Se encontraron ${files.length} archivos.`);
        res.json(files);

    } catch (err) {
        console.error("🔥 Error listando con Search API:", err);
        
        // SISTEMA DE EMERGENCIA: Si Search API falla, usamos el método Admin API
        try {
            const resFallback = await cloudinary.api.resources({
                type: 'upload',
                prefix: 'galaxy_cloud_uploads/',
                max_results: 100
            });
            const filesFallback = resFallback.resources.map(f => ({
                name: f.public_id.split('/').pop(),
                size: (f.bytes / 1024 / 1024).toFixed(2) + " MB",
                url: f.secure_url
            }));
            res.json(filesFallback);
        } catch (e) {
            console.error("🔥 Fallo total de Cloudinary:", e);
            res.json([]); 
        }
    }
});

// Ruta principal
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Galaxy Server listo en puerto ${PORT}`);
    console.log(`📡 Radar apuntando a la carpeta: galaxy_cloud_uploads`);
});
