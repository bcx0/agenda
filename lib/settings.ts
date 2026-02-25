import { prisma } from "./prisma";

export async function getSettings() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings) return settings;
  return prisma.settings.create({
    data: {
      id: 1,
      location: "MIAMI",
      presentielLocation: "Vander Valk",
      defaultMode: "VISIO"
    }
  });
}

export async function updateSettings(input: {
  location: "MIAMI" | "BELGIUM";
  presentielLocation: string;
  presentielNote?: string | null;
  defaultMode: "VISIO" | "PRESENTIEL";
}) {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: input,
    create: { id: 1, ...input }
  });
}
