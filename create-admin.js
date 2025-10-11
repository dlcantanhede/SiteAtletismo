// create-admin.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@seu-evento.com'; // Use um e-mail real seu
  const senhaPlana = 'senha-super-segura-123'; // Escolha uma senha forte

  // Criptografa a senha
  const senhaHash = bcrypt.hashSync(senhaPlana, 10); // 10 é o "custo" do hash

  const admin = await prisma.admin.upsert({
    where: { email: email },
    update: { senha: senhaHash },
    create: {
      email: email,
      senha: senhaHash,
    },
  });

  console.log(`Administrador criado/atualizado com sucesso: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });