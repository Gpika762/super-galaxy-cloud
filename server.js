const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// --- VERIFICACIÓN ACTIVA DE VARIABLES ---
const cloudConfig = {
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
  secure: true
};

if (!cloudConfig.cloud_name || !cloudConfig.api_key || !cloudConfig.api_secret) {
    console.error("❌ ERROR CRÍTICO: Faltan variables de entorno en Render.");
}

cloudinary.config(cloudConfig);

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'galaxy_cloud_uploads',
    resource_type: 'auto'
  },
});

const upload = multer({ storage: storage });

// API DE SUBIDA (Esta ya te funcionaba bien)
app.post('/api/upload', upload.single('archivo'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "El servidor no recibió ningún archivo." });
        console.log("✅ Éxito:", req.file.path);
        res.json({ success: true, url: req.file.path });
    } catch (err) {
        console.error("🔥 Error interno:", err);
        res.status(500).json({ error: "Fallo en Cloudinary: " + err.message });
    }
});

// API DE LISTADO CORREGIDA (LA LLAVE MAESTRA)
app.get('/api/files', async (req, res) => {
    try {
        // Cambiamos 'resources' por 'search' para que sea más potente y no lo bloqueen
        const result = await cloudinary.search
            .expression('folder:galaxy_cloud_uploads')
            .sort_by('created_at','desc')
            .max_results(50)
            .execute();

        const files = result.resources.map(f => ({
            name: f.public_id.split('/').pop(),
            size: (f.bytes / 1024 / 1024).toFixed(2) + " MB",
            url: f.secure_url
        }));
        
        res.json(files);
    } catch (err) {
        console.error("🔥 Error en lista:", err);
        // Si el buscador falla, intentamos el método básico por si acaso
        try {
            const basicResult = await cloudinary.api.resources({
                type: 'upload',
                prefix: 'galaxy_cloud_uploads/',
                max_results: 50
            });
            const basicFiles = basicResult.resources.map(f => ({
                name: f.public_id.split('/').pop(),
                size: (f.bytes / 1024 / 1024).toFixed(2) + " MB",
                url: f.secure_url
            }));
            res.json(basicFiles);
        } catch (innerErr) {
            res.json([]); // Si todo falla, devolvemos vacío para que no explote el index
        }
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR ACTIVO EN PUERTO ${PORT}`);
});
