import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Ce script EFFACE les réservations, blocs, règles, exceptions, blocs
// récurrents, le journal d'e-mails et les réglages. Il est réservé à une base
// locale de démonstration : il refuse de tourner ailleurs, même lancé par
// erreur (prisma db seed, prisma migrate reset) avec l'adresse de production.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function assertLocalDemoDatabase() {
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== "1") {
    throw new Error(
      "Seed refusé : ce script efface des données. Pour une base locale de démonstration, " +
        "relancer avec ALLOW_DESTRUCTIVE_SEED=1."
    );
  }
  let host = "";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    host = "";
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Seed refusé : la base (${host || "adresse illisible"}) n'est pas une base locale.`);
  }
}

async function main() {
  assertLocalDemoDatabase();
  const hash = (password: string) => bcrypt.hash(password, 10);

  await prisma.client.upsert({
    where: { email: "geoffrey.client1@test.com" },
    update: {},
    create: {
      email: "geoffrey.client1@test.com",
      name: "Client Contrat 1",
      passwordHash: await hash("Test1234!"),
      creditsPerMonth: 2,
      isActive: true
    }
  });

  await prisma.client.upsert({
    where: { email: "geoffrey.client2@test.com" },
    update: {},
    create: {
      email: "geoffrey.client2@test.com",
      name: "Client Contrat 2",
      passwordHash: await hash("Test1234!"),
      creditsPerMonth: 1,
      isActive: true
    }
  });

  // Optional: clear old data for a clean demo run
  await prisma.booking.deleteMany({});
  await prisma.block.deleteMany({});
  await prisma.availabilityRule.deleteMany({});
  await prisma.availabilityOverride.deleteMany({});
  await prisma.recurringBlock.deleteMany({});
  await prisma.emailLog.deleteMany({});
  await prisma.settings.deleteMany({});

  // Example block
  await prisma.block.create({
    data: {
      startAt: new Date("2030-01-10T13:00:00Z"),
      endAt: new Date("2030-01-10T15:00:00Z"),
      reason: "Exemple blocage ponctuel"
    }
  });


  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      location: "MIAMI",
      presentielLocation: "Vander Valk",
      defaultMode: "VISIO"
    }
  });

  console.log("Seed done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
