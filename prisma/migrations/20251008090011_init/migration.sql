-- CreateTable
CREATE TABLE "Inscrito" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "tamanho_camisa" TEXT NOT NULL,
    "genero" TEXT NOT NULL,
    "faixa_etaria" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inscrito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" SERIAL NOT NULL,
    "inscritoId" INTEGER NOT NULL,
    "mercadoPagoId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "valor" DOUBLE PRECISION NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAtualizacao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Galeria" (
    "id" SERIAL NOT NULL,
    "caminhoArquivo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'imagem',
    "titulo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Galeria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inscrito_cpf_key" ON "Inscrito"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_inscritoId_key" ON "Pagamento"("inscritoId");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_mercadoPagoId_key" ON "Pagamento"("mercadoPagoId");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_inscritoId_fkey" FOREIGN KEY ("inscritoId") REFERENCES "Inscrito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
