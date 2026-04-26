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

// Si falta alguna, el servidor te avisará en los Logs de Render
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

// API DE SUBIDA CON REPORTE DETALLADO
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

// API DE LISTADO
app.get('/api/files', async (req, res) => {
    try {
        const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: 'galaxy_cloud_uploads/',
            max_results: 50
        });
        const files = result.resources.map(f => ({
            name: f.public_id.split('/').pop(),
            size: (f.bytes / 1024 / 1024).toFixed(2) + " MB",
            url: f.secure_url
        }));
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: "Error de conexión con la nube: " + err.message });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR ACTIVO EN PUERTO ${PORT}`);
    console.log(`☁️ CLOUD NAME CONFIGURADO: ${process.env.CLOUD_NAME || 'VACÍO'}`);
});
