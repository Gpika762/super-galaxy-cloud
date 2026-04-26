const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

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

// RUTA DE SUBIDA
app.post('/api/upload', upload.single('archivo'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No llegó el archivo" });
        res.status(200).json({ success: true, url: req.file.path });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// RUTA DE LISTADO
app.get('/api/files', async (req, res) => {
    try {
        const result = await cloudinary.api.resources({
            type: 'upload',
            prefix: 'galaxy_cloud_uploads/',
            max_results: 100 // Subimos a 100 archivos
        });
        const files = result.resources.map(f => ({
            name: f.public_id.split('/').pop(),
            size: (f.bytes / 1024 / 1024).toFixed(2) + " MB",
            url: f.secure_url
        }));
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: "Error en la nube" });
    }
});

// REDIRECCIÓN ANTI-ERROR 404/500
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Órbita activa`));
