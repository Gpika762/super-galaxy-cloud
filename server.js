const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const stream = require('stream');
const path = require('path');
const cors = require('cors');
const app = express();

// --- VERSIÓN DEL SISTEMA (GALAXY V-SYNC) ---
// Subimos a 2.1 para asegurar el fix de transferencia de propiedad
const SERVER_VERSION = "2.1"; 

// --- CONFIGURACIÓN DE SEGURIDAD PARA MÓVILES VINTAGE ---
app.use(cors()); 

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); 
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// --- CONFIGURACIÓN DE CREDENCIALES ---
let CREDENTIALS;
try {
    const rawCredentials = process.env.GOOGLE_CREDENTIALS || '{}';
    CREDENTIALS = JSON.parse(rawCredentials);

    if (CREDENTIALS.private_key) {
        CREDENTIALS.private_key = CREDENTIALS.private_key
            .replace(/\\n/g, '\n')
            .replace(/"/g, ''); 
    }
} catch (err) {
    console.error("❌ ERROR AL LEER GOOGLE_CREDENTIALS:", err.message);
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

// --- SENSOR DE VERSIÓN ---
app.get('/api/version', (req, res) => {
    res.json({ version: SERVER_VERSION });
});

// --- API DE SUBIDA: FIX MAESTRO DE CUOTA (TRANSFERENCIA) ---
app.route('/api/upload')
    .post(upload.single('archivo'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No hay archivo" });
        }

        try {
            console.log(`📡 Orbitando: ${req.file.originalname} (v${SERVER_VERSION})`);
            
            const bufferStream = new stream.PassThrough();
            bufferStream.end(req.file.buffer);

            // 1. EL BOT SUBE EL ARCHIVO
            const response = await drive.files.create({
                requestBody: { 
                    name: req.file.originalname, 
                    parents: [FOLDER_ID] 
                },
                media: { 
                    mimeType: req.file.mimetype, 
                    body: bufferStream 
                },
                fields: 'id',
                supportsAllDrives: true
            });

            const fileId = response.data.id;

            // 2. TRANSFERENCIA DE PROPIEDAD A TU GMAIL (Adiós error de cuota)
            await drive.permissions.create({
                fileId: fileId,
                transferOwnership: true,
                requestBody: {
                    type: 'user',
                    role: 'owner',
                    emailAddress: 'gchamba479@gmail.com' 
                },
                supportsAllDrives: true
            });

            console.log(`✅ ¡Éxito! Propiedad transferida. ID: ${fileId}`);
            res.status(200).json({ success: true, id: fileId });

        } catch (err) {
            console.error("❌ ERROR EN DRIVE:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    })
    .get((req, res) => {
        res.redirect('/');
    });

// API: LISTADO DE ARCHIVOS
app.get('/api/files', async (req, res) => {
    try {
        const response = await drive.files.list({
            q: `'${FOLDER_ID}' in parents and trashed = false`,
            fields: 'files(id, name, size, webContentLink)',
            orderBy: 'name',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
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
    console.log(`🚀 GALAXY CLOUD v${SERVER_VERSION} ACTIVA`);
});
