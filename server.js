const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const app = express();

app.use(cors());

// Carpeta donde se guardará TODO (APKs, fotos, saves)
const uploadDir = path.join(__dirname, 'archivos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configuración para que los archivos no pierdan el nombre
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

app.use(express.static(__dirname));
app.use('/archivos', express.static(uploadDir));

// API: Subir archivo
app.post('/api/upload', upload.single('archivo'), (req, res) => {
    if (req.file) {
        console.log(`✅ Recibido: ${req.file.originalname}`);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false });
    }
});

// API: Listar archivos
app.get('/api/files', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).json([]);
        const fileList = files.map(file => {
            const stats = fs.statSync(path.join(uploadDir, file));
            return {
                name: file,
                size: (stats.size / 1024).toFixed(2) + " KB",
                url: `/archivos/${encodeURIComponent(file)}`
            };
        });
        res.json(fileList);
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SUPER GALAXY CLOUD EN ÓRBITA - PUERTO ${PORT}`));
