import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
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

  await prisma.admin.upsert({
    where: { email: "admin@geoffreymahieu.com" },
    update: {},
    create: {
      email: "admin@geoffreymahieu.com",
      passwordHash: await hash("220700mG")
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
