const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const stream = require('stream');
const path = require('path');
const cors = require('cors');
const app = express();

// --- SOLUCIÓN MAESTRA AL ERROR CORS ---
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// --- CONFIGURACIÓN EINSTEIN (MEJORADA PARA RENDER) ---
const rawCredentials = process.env.GOOGLE_CREDENTIALS || '{}';
const CREDENTIALS = JSON.parse(rawCredentials);

// Reparación de saltos de línea en la llave privada para evitar Error 500
if (CREDENTIALS.private_key) {
    CREDENTIALS.private_key = CREDENTIALS.private_key.replace(/\\n/g, '\n');
}

const FOLDER_ID = process.env.DRIVE_FOLDER_ID;

const auth = new google.auth.GoogleAuth({
    credentials: CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } 
});

app.use(express.static(__dirname));

// API: SUBIDA DIRECTA A TU NUBE GALAXY
app.post('/api/upload', upload.single('archivo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: "No hay archivo" });

    try {
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        console.log(`📡 Orbitando archivo: ${req.file.originalname}`);

        await drive.files.create({
            requestBody: { 
                name: req.file.originalname, 
                parents: [FOLDER_ID] 
            },
            media: { 
                mimeType: req.file.mimetype, 
                body: bufferStream 
            }
        });

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Error en la subida orbital:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: LISTADO COMPATIBLE
app.get('/api/files', async (req, res) => {
    try {
        const response = await drive.files.list({
            q: `'${FOLDER_ID}' in parents and trashed = false`,
            fields: 'files(id, name, size, webContentLink)',
            orderBy: 'name'
        });

        const fileList = response.data.files.map(file => ({
            name: file.name,
            size: file.size ? (file.size / (1024 * 1024)).toFixed(2) + " MB" : "---",
            url: file.webContentLink 
        }));

        res.json(fileList);
    } catch (err) {
        console.error("❌ Error al listar:", err.message);
        res.status(500).json([]);
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 SUPER GALAXY CLOUD ACTIVA`);
    console.log(`🛰️ Conectado a carpeta: ${FOLDER_ID}`);
});
