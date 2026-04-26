const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// Configuración de la NASA (Cloudinary)
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
    resource_type: 'auto' // Detecta si es imagen, video o APK
  },
});

const upload = multer({ storage: storage });

// 1. RUTA DE SUBIDA
app.post('/api/upload', upload.single('archivo'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No llegó el archivo" });
        res.status(200).json({ success: true, url: req.file.path });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. RUTA DE LISTADO (Arreglada para ver TODOS los archivos)
app.get('/api/files', async (req, res) => {
    try {
        // Usamos search para que encuentre imágenes, videos y archivos raw (APKs) al mismo tiempo
        const result = await cloudinary.search
            .expression('folder:galaxy_cloud_uploads')
            .sort_by('created_at','desc')
            .max_results(500)
            .execute();

        const files = result.resources.map(f => ({
            id: f.public_id, // Necesario para borrar
            name: f.filename + "." + f.format,
            size: (f.bytes / 1024 / 1024).toFixed(2) + " MB",
            url: f.secure_url
        }));
        res.json(files);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error en el radar orbital" });
    }
});

// 3. NUEVA RUTA: ELIMINAR ARCHIVOS (Para el botón X)
// NUEVA RUTA DE ELIMINACIÓN REFORZADA
app.delete('/api/files/:folder/:id', async (req, res) => {
    try {
        // Unimos la carpeta y el ID para tener el Public ID completo
        const publicId = `${req.params.folder}/${req.params.id}`;
        console.log("Intentando desintegrar:", publicId);

        // Intentamos borrarlo como imagen/video (tipo upload)
        let result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        
        // Si no funcionó (porque es una APK o archivo raro), intentamos como 'raw'
        if (result.result !== 'ok') {
            result = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
        }
        
        // Si tampoco, intentamos como 'video'
        if (result.result !== 'ok') {
            result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
        }

        if (result.result === 'ok') {
            res.json({ success: true, message: "Archivo eliminado de la órbita" });
        } else {
            res.status(400).json({ error: "Cloudinary no encontró el archivo", detalle: result });
        }
    } catch (err) {
        console.error("Fallo en el borrado:", err);
        res.status(500).json({ error: "Error interno en el radar" });
    }
});

// REDIRECCIÓN ANTI-ERROR
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Órbita activa en puerto ${PORT}`));
