// --- 1. IMPORTAÇÕES E CONFIGURAÇÕES ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { Server } = require("socket.io");
const { PrismaClient } = require('@prisma/client');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');

// --- FUNÇÃO DE VALIDAÇÃO DO CPF (Adicionada aqui) ---
function validaCPF(cpf) {
    if (typeof cpf !== 'string') return false;
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    let soma = 0, resto;
    for (let i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    soma = 0;
    for (let i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;
    return true;
}

// --- 2. INICIALIZAÇÃO ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
});
const payment = new Payment(client);

// --- Configuração do Multer para o Upload de Arquivos ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'atletismo-site/public/uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- 3. MIDDLEWARES ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'atletismo-site', 'public')));

app.use(
    session({
        store: new MemoryStore({ checkPeriod: 86400000 }),
        secret: process.env.SESSION_SECRET || 'um-segredo-muito-forte',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 1000 * 60 * 60 * 24 },
    })
);

const checkAuth = (req, res, next) => {
    if (req.session.adminId) {
        return next();
    }
    res.redirect('/login');
};

// --- 4. LÓGICA DO SOCKET.IO ---
io.on('connection', (socket) => {
    console.log('Um utilizador conectou-se via WebSocket');
    socket.on('join-room', (inscritoId) => {
        const roomName = `inscrito-${inscritoId}`;
        socket.join(roomName);
        console.log(`Socket ${socket.id} entrou na sala: ${roomName}`);
    });
    socket.on('disconnect', () => {
        console.log('Utilizador desconectou-se');
    });
});

// --- 5. ROTAS DA APLICAÇÃO ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'atletismo-site', 'public', 'index.html'));
});
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'atletismo-site', 'public', 'login.html'));
});
app.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (admin && bcrypt.compareSync(senha, admin.senha)) {
        req.session.adminId = admin.id;
        req.session.save((err) => {
            if (err) {
                console.error('Erro ao salvar a sessão:', err);
                return res.redirect('/login?error=1');
            }
            res.redirect('/admin');
        });
    } else {
        res.redirect('/login?error=1');
    }
});
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// **** ROTA MODIFICADA COM A VALIDAÇÃO DO CPF ****
app.post('/criar-inscricao-pix', async (req, res) => {
    const { nome, cpf, cidade, tamanho_camisa, genero, faixa_etaria, telefone } = req.body;
    
    if (!nome || !cpf || !cidade || !tamanho_camisa || !genero || !faixa_etaria || !telefone) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    // --- VALIDAÇÃO DE SEGURANÇA DO CPF NO BACKEND ---
    if (!validaCPF(cpf)) {
        return res.status(400).json({ error: 'O CPF fornecido é inválido.' });
    }
    // ---------------------------------------------------

    try {
        const inscrito = await prisma.inscrito.upsert({
            where: { cpf },
            update: { nome, cidade, tamanho_camisa, genero, faixa_etaria, telefone },
            create: { nome, cpf, cidade, tamanho_camisa, genero, faixa_etaria, telefone },
        });
        const valorInscricao = 0.01;
        const paymentBody = {
            transaction_amount: valorInscricao,
            description: `Inscrição de ${nome}`,
            payment_method_id: 'pix',
            payer: {
                email: `pagador-${Date.now()}@email.com`,
                first_name: nome,
                identification: { type: 'CPF', number: cpf },
            },
            external_reference: inscrito.id.toString(),
            notification_url: `${process.env.BASE_URL}/webhook`,
        };
        const pixPayment = await payment.create({ body: paymentBody });
        await prisma.pagamento.upsert({
            where: { inscritoId: inscrito.id },
            update: {
                mercadoPagoId: pixPayment.id.toString(),
                status: 'pending',
                valor: pixPayment.transaction_amount,
            },
            create: {
                inscritoId: inscrito.id,
                mercadoPagoId: pixPayment.id.toString(),
                status: 'pending',
                valor: pixPayment.transaction_amount,
            },
        });
        res.json({
            inscritoId: inscrito.id,
            qr_code_base64: pixPayment.point_of_interaction.transaction_data.qr_code_base64,
            qr_code: pixPayment.point_of_interaction.transaction_data.qr_code,
        });
    } catch (error) {
        console.error('Erro ao criar pagamento PIX:', error);
        res.status(500).json({ error: 'Falha ao gerar QR Code.' });
    }
});

app.post('/webhook', async (req, res) => {
    console.log('--- Webhook Recebido ---');
    const event = req.body;
    if (event.type === 'payment') {
        const paymentId = event.data.id;
        try {
            const paymentDetails = await payment.get({ id: paymentId });
            if (paymentDetails.status === 'approved') {
                const inscritoId = parseInt(paymentDetails.external_reference, 10);
                await prisma.pagamento.update({
                    where: { inscritoId: inscritoId },
                    data: { status: 'approved' },
                });
                const roomName = `inscrito-${inscritoId}`;
                io.to(roomName).emit('payment-confirmed', {
                    message: 'Pagamento confirmado com sucesso!',
                    nome: paymentDetails.payer.first_name
                });
                console.log(`✅ Notificação enviada para a sala: ${roomName}`);
            }
        } catch (error) {
            console.error('Erro ao processar webhook:', error);
        }
    }
    res.sendStatus(200);
});

// --- Rotas Protegidas (Admin) ---
app.get('/admin', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'atletismo-site', 'public', 'admin.html'));
});

// --- ROTAS DA API DE INSCRITOS ---
app.get('/api/inscritos', checkAuth, async (req, res) => {
    try {
        const todosInscritos = await prisma.inscrito.findMany({
            orderBy: { id: 'asc' },
            include: { pagamento: true },
        });
        res.json(todosInscritos);
    } catch (error) {
        res.status(500).json({ error: 'Falha ao buscar inscritos.' });
    }
});
// --- GERAR PDF DOS INSCRITOS ---
app.get('/api/inscritos/pdf', checkAuth, async (req, res) => {
    const { status } = req.query;
    const PDFDocument = require('pdfkit');
    const path = require('path');

    try {
        let inscritos = await prisma.inscrito.findMany({
            orderBy: { id: 'asc' },
            include: { pagamento: true },
        });

        if (status && status !== 'todos') {
            inscritos = inscritos.filter(i => i.pagamento?.status === status);
        }

        const doc = new PDFDocument({ margin: 40 });
        doc.pipe(res); // ✅ precisa vir antes dos textos

        // registra a fonte Roboto
        doc.registerFont('Roboto', path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'));
        doc.font('Roboto');

        const fileName = `inscritos_${status || 'todos'}.pdf`;

        res.setHeader('Content-Type', 'application/pdf; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

        // Cabeçalho
        doc.fontSize(18).text('Corrida de Atletismo 2025', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Relatório de Inscritos (${status || 'todos'})`, { align: 'center' });
        doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
        doc.moveDown(1.5);

        // Cabeçalho da tabela
        doc.fontSize(12).text('ID | Nome | WhatsApp | Camisa | Gênero | Faixa Etária | Cidade | Status', { underline: true });
        doc.moveDown(0.5);

        inscritos.forEach(i => {
            doc.fontSize(10).text(
                `${i.id} | ${i.nome} | ${i.telefone} | ${i.tamanho_camisa} | ${i.genero} | ${i.faixa_etaria} | ${i.cidade} | ${i.pagamento?.status || 'pendente'}`
            );
        });

        doc.moveDown(1);

        // Total arrecadado
        const total = inscritos
            .filter(i => i.pagamento?.status === 'approved')
            .reduce((sum, i) => sum + (i.pagamento?.valor || 0), 0);

        doc.fontSize(12).text(`Total arrecadado: R$ ${total.toFixed(2)}`, { align: 'right' });

        doc.end(); // ✅ fecha o stream

    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        res.status(500).send('Erro ao gerar PDF.');
    }
});
app.delete('/api/inscritos/:id', checkAuth, async (req, res) => {
    const inscritoId = parseInt(req.params.id, 10);
    try {
        await prisma.pagamento.deleteMany({ where: { inscritoId } });
        await prisma.inscrito.delete({ where: { id: inscritoId } });
        res.status(200).json({ message: 'Inscrito excluído com sucesso' });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao excluir inscrito.' });
    }
});

// --- ROTAS DA API DA GALERIA ---
app.get('/api/galeria', async (req, res) => {
    try {
        const imagens = await prisma.galeria.findMany({
            orderBy: { criadoEm: 'desc' }
        });
        res.json(imagens);
    } catch (error) {
        res.status(500).json({ error: "Falha ao buscar imagens da galeria." });
    }
});
app.post('/api/galeria/upload', checkAuth, upload.single('imagem'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    const extensao = path.extname(req.file.originalname).toLowerCase();
    const tipoMidia = ['.mp4', '.mov', '.webm'].includes(extensao) ? 'video' : 'imagem';
    try {
        const novaMidia = await prisma.galeria.create({
            data: {
                caminhoArquivo: `/uploads/${req.file.filename}`,
                tipo: tipoMidia
            }
        });
        res.status(201).json(novaMidia);
    } catch (error) {
        console.error("Erro ao salvar mídia:", error);
        res.status(500).json({ error: 'Falha ao salvar a mídia no banco de dados.' });
    }
});
app.delete('/api/galeria/:id', checkAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const imagem = await prisma.galeria.findUnique({ where: { id } });
        if (!imagem) {
            return res.status(404).json({ error: 'Imagem não encontrada.' });
        }
        const caminhoFisico = path.join(__dirname, 'atletismo-site', 'public', imagem.caminhoArquivo);
        if (fs.existsSync(caminhoFisico)) {
            fs.unlinkSync(caminhoFisico);
        }
        await prisma.galeria.delete({ where: { id } });
        res.status(200).json({ message: 'Imagem excluída com sucesso.' });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao excluir a imagem.' });
    }
});

// --- 6. INICIALIZAÇÃO DO SERVIDOR ---
server.listen(PORT, () => {
    console.log(`Servidor rodando em ${PORT}`);
});
