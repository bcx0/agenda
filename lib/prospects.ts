import { prisma } from "./prisma";

/** Statuts d'une demande de RDV prospect. */
export const PROSPECT_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "ARCHIVED"] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export function isProspectStatus(value: string): value is ProspectStatus {
  return (PROSPECT_STATUSES as readonly string[]).includes(value);
}

export interface ProspectRecord {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  desiredAt: Date | null;
  note: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProspectInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  desiredAt?: Date | null;
  note?: string | null;
}

/** Liste les prospects, les plus récents d'abord. Optionnellement filtrés par statut. */
export async function listProspects(status?: ProspectStatus): Promise<ProspectRecord[]> {
  return prisma.prospect.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

/** Crée une demande de RDV prospect (aucun compte client requis). */
export async function createProspect(input: CreateProspectInput) {
  return prisma.prospect.create({
    data: {
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      desiredAt: input.desiredAt ?? null,
      note: input.note ?? null,
      status: "NEW",
    },
  });
}

export async function updateProspectStatus(id: number, status: ProspectStatus) {
  return prisma.prospect.update({ where: { id }, data: { status } });
}

export async function deleteProspect(id: number) {
  return prisma.prospect.delete({ where: { id } });
}
