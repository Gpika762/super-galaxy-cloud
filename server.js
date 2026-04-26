const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// --- CONFIGURACIÓN DE CLOUDINARY ---
cloudinary.config({ 
  cloud_name: process.env.CLOUD_NAME, 
  api_key: process.env.API_KEY, 
  api_secret: process.env.API_SECRET 
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'galaxy_cloud_uploads', // Se creará esta carpeta en tu Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif'],
  },
});

const upload = multer({ storage: storage });

// --- RUTA PRINCIPAL (Para ver tu web) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- API DE SUBIDA ---
app.post('/api/upload', upload.single('archivo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "No se recibió archivo" });
    }
    
    console.log("🚀 Archivo en la nube:", req.file.path);
    
    // Respondemos con éxito y el link de la foto
    res.status(200).json({ 
        success: true, 
        url: req.file.path,
        name: req.file.originalname 
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ SERVIDOR GALAXY CLOUD ACTIVO EN PUERTO ${PORT}`);
});
