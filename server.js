const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;

const ADMIN_PASSWORD = '1234';

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Uploads Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
        cb(null, Date.now() + '-' + cleanName);
    }
});
const upload = multer({ storage: storage });

const db = new sqlite3.Database('./database.db');

// --- BANCO DE DADOS ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS elections (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        title TEXT, 
        status TEXT DEFAULT 'OPEN', 
        created_at DATETIME,
        end_time DATETIME
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        election_id INTEGER,
        name TEXT, 
        photo TEXT, 
        votes INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS vote_history (
        ip TEXT, 
        election_id INTEGER,
        PRIMARY KEY (ip, election_id)
    )`);
});

// --- VERIFICAÇÃO AUTOMÁTICA DE TEMPO (A CADA 1 MINUTO) ---
setInterval(() => {
    const now = new Date().toISOString();
    db.all("SELECT * FROM elections WHERE status = 'OPEN' AND end_time < ?", [now], (err, rows) => {
        rows.forEach(elec => {
            console.log(`[AUTO] Tempo esgotado! Encerrando: ${elec.title}`);
            db.run("UPDATE elections SET status = 'CLOSED' WHERE id = ?", [elec.id]);
        });
    });
}, 60 * 1000); 

// --- ROTAS PÚBLICAS ---
app.get('/api/public/active', (req, res) => {
    db.get("SELECT * FROM elections WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1", (err, election) => {
        if (!election) return res.json({ active: false, title: "Nenhuma votação ativa" });

        db.all("SELECT * FROM candidates WHERE election_id = ?", [election.id], (err, candidates) => {
            res.json({ 
                active: true, 
                id: election.id, 
                title: election.title, 
                endTime: election.end_time, 
                candidates: candidates 
            });
        });
    });
});

// --- ROTA DE EDIÇÃO (Adicione isso no final das rotas, antes do app.listen) ---
app.post('/api/admin/candidate/edit', upload.single('photo'), (req, res) => {
    if (req.body.password !== '1234') return res.status(401).json({ message: "Senha incorreta" });

    const { id, name } = req.body;
    
    // Se enviou foto nova, atualiza nome e foto. Se não, atualiza só o nome.
    if (req.file) {
        const photoPath = `/uploads/${req.file.filename}`;
        db.run("UPDATE candidates SET name = ?, photo = ? WHERE id = ?", [name, photoPath, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Atualizado com sucesso" });
        });
    } else {
        db.run("UPDATE candidates SET name = ? WHERE id = ?", [name, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Atualizado com sucesso" });
        });
    }
});

// --- ROTA: LISTA DE HISTÓRICO (Para o Dropdown) ---
app.get('/api/public/history-list', (req, res) => {
    db.all("SELECT id, title, end_time FROM elections WHERE status = 'CLOSED' ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows);
    });
});

// --- ROTA: DETALHES DE UMA ELEIÇÃO ESPECÍFICA ---
app.get('/api/public/election/:id', (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM elections WHERE id = ?", [id], (err, election) => {
        if (!election) return res.status(404).json({ error: "Não encontrado" });

        db.all("SELECT * FROM candidates WHERE election_id = ? ORDER BY votes DESC", [id], (err, candidates) => {
            res.json({ 
                title: election.title, 
                status: election.status,
                candidates: candidates 
            });
        });
    });
});

// --- ROTA: EXCLUIR ELEIÇÃO COMPLETA ---
app.post('/api/admin/election/delete', (req, res) => {
    if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ message: "Senha incorreta" });

    const id = req.body.id;

    db.serialize(() => {
        // 1. Apaga os votos registrados dessa eleição
        db.run("DELETE FROM vote_history WHERE election_id = ?", [id]);
        
        // 2. Apaga os candidatos dessa eleição
        db.run("DELETE FROM candidates WHERE election_id = ?", [id]);
        
        // 3. Apaga a eleição em si
        db.run("DELETE FROM elections WHERE id = ?", [id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Eleição excluída com sucesso!" });
        });
    });
});

app.post('/api/vote', (req, res) => {
    const { candidateId, electionId } = req.body;
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const now = new Date().toISOString();

    db.get("SELECT * FROM elections WHERE id = ?", [electionId], (err, election) => {
        if (!election || election.status !== 'OPEN' || now > election.end_time) {
            return res.status(400).json({ message: "Votação encerrada!" });
        }

        db.get("SELECT * FROM vote_history WHERE ip = ? AND election_id = ?", [userIp, electionId], (err, history) => {
            if (history) return res.status(403).json({ message: "Você já votou nesta eleição!" });

            const stmt = db.prepare("UPDATE candidates SET votes = votes + 1 WHERE id = ?");
            stmt.run(candidateId, function(err) {
                if (err) return res.status(500).json({ error: err.message });
                db.run("INSERT INTO vote_history (ip, election_id) VALUES (?, ?)", [userIp, electionId]);
                res.json({ message: "Voto confirmado!" });
            });
            stmt.finalize();
        });
    });
});

// --- ROTAS ADMIN ---

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === '1234') {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "Senha incorreta" });
    }
});

app.get('/api/admin/data', (req, res) => {
    db.get("SELECT * FROM elections WHERE status = 'OPEN' LIMIT 1", (err, active) => {
        db.all("SELECT * FROM elections WHERE status = 'CLOSED' ORDER BY id DESC", (err, history) => {
            if (active) {
                db.all("SELECT * FROM candidates WHERE election_id = ?", [active.id], (err, cands) => {
                    res.json({ active: {...active, candidates: cands}, history: history });
                });
            } else {
                res.json({ active: null, history: history });
            }
        });
    });
});

app.post('/api/admin/add', upload.single('photo'), (req, res) => {
    if (req.body.password !== '1234') return res.status(401).json({ message: "Senha incorreta" });
    
    db.get("SELECT id FROM elections WHERE status = 'OPEN' LIMIT 1", (err, election) => {
        if (!election) return res.status(400).json({ message: "Nenhuma eleição aberta!" });
        
        const photoPath = req.file ? `/uploads/${req.file.filename}` : `https://ui-avatars.com/api/?name=${req.body.name}&background=random`;
        
        db.run("INSERT INTO candidates (name, photo, election_id) VALUES (?, ?, ?)", 
            [req.body.name, photoPath, election.id], 
            () => res.json({message:"OK"})
        );
    });
});

// Nova Eleição com Duração Personalizada
app.post('/api/admin/new-cycle', (req, res) => {
    if (req.body.password !== '1234') return res.status(401).json({ message: "Senha incorreta" });

    const { title, minutes } = req.body; 
    const duration = parseFloat(minutes) || 20;
    
    const now = new Date();
    const end = new Date(Date.now() + (minutes * 60 * 1000));

    db.serialize(() => {
        db.run("UPDATE elections SET status = 'CLOSED' WHERE status = 'OPEN'");
        db.run("INSERT INTO elections (title, status, created_at, end_time) VALUES (?, 'OPEN', ?, ?)", 
            [title, now.toISOString(), end.toISOString()], 
            () => res.json({ message: "Nova eleição criada com sucesso!" })
        );
    });
});

app.get('/api/admin/history/:id', (req, res) => {
    db.all("SELECT * FROM candidates WHERE election_id = ? ORDER BY votes DESC", [req.params.id], (err, rows) => res.json(rows));
});

app.post('/api/admin/candidate/delete', (req, res) => {
    if (req.body.password !== '1234') return res.status(401).send();
    db.run("DELETE FROM candidates WHERE id = ?", [req.body.id], () => res.json({msg:"ok"}));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});