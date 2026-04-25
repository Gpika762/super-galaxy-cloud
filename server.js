const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const stream = require('stream');
const path = require('path');
const cors = require('cors');
const app = express();

// --- CONFIGURACIÓN DE SEGURIDAD GALAXY (CORS TOTAL) ---
app.use(cors()); // Habilita la base de CORS

app.use((req, res, next) => {
    // Estas cabeceras son el "salvoconducto" para tus teléfonos antiguos
    res.header("Access-Control-Allow-Origin", "*"); 
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    
    // Responder de inmediato a las peticiones de verificación (preflight)
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// --- CONFIGURACIÓN DE CREDENCIALES ---
const rawCredentials = process.env.GOOGLE_CREDENTIALS || '{}';
const CREDENTIALS = JSON.parse(rawCredentials);

// Reparación de seguridad para la llave privada en servidores Render
if (CREDENTIALS.private_key) {
    CREDENTIALS.private_key = CREDENTIALS.private_key.replace(/\\n/g, '\n');
}

const FOLDER_ID = process.env.DRIVE_FOLDER_ID;

const auth = new google.auth.GoogleAuth({
    credentials: CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

// Configuración de Multer para archivos grandes (APKs, ROMs, etc)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB de límite
});

app.use(express.static(__dirname));

// API: SUBIDA DIRECTA A TU NUBE
app.post('/api/upload', upload.single('archivo'), async (req, res) => {
    if (!req.file) {
        console.log("⚠️ Intento de subida sin archivo.");
        return res.status(400).json({ success: false, error: "No hay archivo" });
    }

    try {
        console.log(`📡 Iniciando órbita para: ${req.file.originalname} (${req.file.size} bytes)`);
        
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

        console.log(`✅ Archivo en la nube. ID: ${response.data.id}`);
        res.status(200).json({ success: true, id: response.data.id });

    } catch (err) {
        console.error("❌ ERROR CRÍTICO EN LA SUBIDA:", err.message);
        // Enviamos el error detallado para saber si es falta de permisos en Drive
        res.status(500).json({ success: false, error: err.message });
    }
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
        console.error("❌ Error al listar archivos:", err.message);
        res.status(500).json([]);
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 SUPER GALAXY CLOUD ACTIVA EN PUERTO ${PORT}`);
    console.log(`🛰️ Conectado a carpeta Drive: ${FOLDER_ID}`);
});
