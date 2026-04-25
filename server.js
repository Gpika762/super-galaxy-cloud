const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const stream = require('stream');
const path = require('path');
const cors = require('cors');
const app = express();

const SERVER_VERSION = "3.0"; 

app.use(cors());
app.use(express.static(__dirname));

// --- CONFIGURACIÓN OAUTH2 (TU CUOTA PERSONAL DE 15GB) ---
const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } 
});

// --- API DE SUBIDA ---
app.post('/api/upload', upload.single('archivo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: "No hay archivo" });

    try {
        console.log(`📡 Orbitando: ${req.file.originalname} (v${SERVER_VERSION})`);
        const bufferStream = new stream.PassThrough();
        bufferStream.end(req.file.buffer);

        const response = await drive.files.create({
            requestBody: { 
                name: req.file.originalname, 
                parents: [process.env.DRIVE_FOLDER_ID] 
            },
            media: { 
                mimeType: req.file.mimetype, 
                body: bufferStream 
            },
            fields: 'id'
        });

        console.log(`✅ ¡Éxito! Archivo ID: ${response.data.id}`);
        res.status(200).json({ success: true, id: response.data.id });
    } catch (err) {
        console.error("❌ ERROR CRÍTICO:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// API: LISTADO DE ARCHIVOS
app.get('/api/files', async (req, res) => {
    try {
        const response = await drive.files.list({
            q: `'${process.env.DRIVE_FOLDER_ID}' in parents and trashed = false`,
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
        res.status(500).json([]);
    }
});

app.get('/api/version', (req, res) => res.json({ version: SERVER_VERSION }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 GALAXY CLOUD v${SERVER_VERSION} ACTIVA EN MODO OAUTH2`));
