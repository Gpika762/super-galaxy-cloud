const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// Memoria temporal para forzar el registro si Cloudinary tarda
let registrosTemporales = [];

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

// API DE SUBIDA
app.post('/api/upload', upload.single('archivo'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No llegó nada" });

        // GUARDAMOS EN MEMORIA AL INSTANTE
        const nuevoArchivo = {
            name: req.file.originalname,
            size: (req.file.size / 1024 / 1024).toFixed(2) + " MB",
            url: req.file.path
        };
        registrosTemporales.unshift(nuevoArchivo); // Lo pone de primero

        res.json({ success: true, url: req.file.path });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API DE LISTADO (COMBINADA)
app.get('/api/files', async (req, res) => {
    try {
        const result = await cloudinary.search
            .expression('folder:galaxy_cloud_uploads')
            .sort_by('created_at','desc')
            .execute();

        const cloudFiles = result.resources.map(f => ({
            name: f.public_id.split('/').pop() + (f.format ? '.' + f.format : ''),
            size: (f.bytes / 1024 / 1024).toFixed(2) + " MB",
            url: f.secure_url
        }));

        // Juntamos lo de la memoria con lo de la nube y quitamos duplicados
        const listaFinal = [...registrosTemporales, ...cloudFiles];
        const unicos = listaFinal.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);

        res.json(unicos);
    } catch (err) {
        // Si la nube falla, al menos mostramos lo que se subió en esta sesión
        res.json(registrosTemporales);
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Galaxy Pro con Memoria Activa`));
