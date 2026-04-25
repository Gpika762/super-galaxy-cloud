const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const stream = require('stream');
const path = require('path');
const cors = require('cors');
const app = express();

// --- CONFIGURACIÓN DE SEGURIDAD GALAXY (CORS TOTAL) ---
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

// --- CONFIGURACIÓN DE CREDENCIALES CON AUTOLIMPIEZA ---
let CREDENTIALS;
try {
    const rawCredentials = process.env.GOOGLE_CREDENTIALS || '{}';
    CREDENTIALS = JSON.parse(rawCredentials);

    if (CREDENTIALS.private_key) {
        // Limpieza profunda de la llave para evitar Error 500 en Render
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

// --- API DE SUBIDA CON PROTECCIÓN "ANTI-GET" ---
app.route('/api/upload')
    .post(upload.single('archivo'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "No hay archivo" });
        }

        try {
            console.log(`📡 Orbitando: ${req.file.originalname}`);
            
            const bufferStream = new stream.PassThrough();
            bufferStream.end(req.file.buffer);

            const response = await drive.files.create({
                requestBody: { 
                    name: req.file.originalname, 
                    parents: [FOLDER_ID] 
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
            console.error("❌ ERROR EN DRIVE:", err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    })
    .get((req, res) => {
        // Si el navegador intenta entrar aquí por error, lo devolvemos al inicio
        res.redirect('/');
    });

// API: LISTADO DE ARCHIVOS
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
    console.log(`🚀 SUPER GALAXY CLOUD ACTIVA EN PUERTO ${PORT}`);
});
