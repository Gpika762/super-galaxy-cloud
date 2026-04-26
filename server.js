const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// 1. Configuración de tus llaves
cloudinary.config({ 
  cloud_name: process.env.CLOUD_NAME, 
  api_key: process.env.API_KEY, 
  api_secret: process.env.API_SECRET 
});

// 2. Configuración del almacenamiento
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'galaxy_cloud_uploads',
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'apk', 'zip'],
  },
});

const upload = multer({ storage: storage });

// 3. RUTA DE SUBIDA (Aquí es donde ocurría el Error 500)
app.post('/api/upload', upload.single('archivo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No seleccionaste ningún archivo" });
        }
        console.log("✅ Archivo recibido:", req.file.path);
        res.status(200).json({ success: true, url: req.file.path });
    } catch (err) {
        console.error("❌ Error en la subida:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. RUTA PARA LISTAR (Para que se vean en el Aero Glass)
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
        console.error("❌ Error al listar:", err);
        res.status(500).json({ error: "No se pudieron cargar los archivos" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 GALAXY CLOUD EN ÓRBITA EN PUERTO ${PORT}`));
