-- Prospect: demandes de RDV de personnes sans compte client ni contrat.
-- Découplé de Client (pas d'email unique, pas de mot de passe) : l'email du
-- coach peut servir à plusieurs prospects sans écraser un client existant.
CREATE TABLE "Prospect" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "desiredAt" TIMESTAMP(3),
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Prospect_status_idx" ON "Prospect"("status");
CREATE INDEX "Prospect_createdAt_idx" ON "Prospect"("createdAt");

-- Sécurité : RLS activé sans policy => l'anon key est totalement bloquée,
-- seul le service role (utilisé côté serveur par Prisma) accède à la table.
ALTER TABLE "Prospect" ENABLE ROW LEVEL SECURITY;
