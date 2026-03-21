# Agenda — Système de réservation coaching

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript) ![Prisma](https://img.shields.io/badge/Prisma-5.12-2D3748?logo=prisma) ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase) ![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38BDF8?logo=tailwindcss) ![Vercel](https://img.shields.io/badge/Déployé-Vercel-000?logo=vercel)

Système de prise de rendez-vous sur mesure pour Geoffrey Mahieu, coach. Permet à ses clients de réserver des séances (visio ou présentiel), avec synchronisation bidirectionnelle Google Calendar et notifications email automatiques.

---

## Stack technique

- **Framework** — Next.js 14 (App Router)
- **Base de données** — PostgreSQL via Supabase + Prisma ORM
- **Authentification** — Sessions cookie + bcryptjs
- **Email** — Resend
- **Calendrier** — Google Calendar API (OAuth2, webhooks, iCal feed)
- **Validation** — Zod
- **Dates** — Luxon + date-fns
- **Style** — Tailwind CSS 3.4

---

## Prérequis

- Node.js ≥ 18
- Compte Supabase (PostgreSQL)
- Compte Google Cloud (OAuth2 + Calendar API activée)
- Compte Resend

---

## Installation

```bash
git clone <repo-url>
cd agenda
npm install
cp .env.example .env.local
# Remplir les variables d'environnement
npx prisma generate
npx prisma db push
```

---

## Variables d'environnement

| Variable | Description | Requis |
|---|---|---|
| `DATABASE_URL` | URL de connexion Prisma (pooling Supabase) | ✅ |
| `DIRECT_URL` | URL directe Supabase (pour les migrations) | ✅ |
| `SESSION_SECRET` | Secret pour les cookies de session admin | ✅ |
| `ADMIN_PASSWORD` | Mot de passe du compte admin | ✅ |
| `GOOGLE_CLIENT_ID` | Client ID Google OAuth2 | ✅ |
| `GOOGLE_CLIENT_SECRET` | Secret Google OAuth2 | ✅ |
| `GOOGLE_REDIRECT_URI` | URI de callback OAuth2 | ✅ |
| `RESEND_API_KEY` | Clé API Resend pour les emails | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL publique de l'application | ✅ |

---

## Lancement en développement

```bash
npm run dev
```

Application disponible sur [http://localhost:3000](http://localhost:3000).

Commandes Prisma utiles :

```bash
npm run prisma:generate   # Régénérer le client Prisma
npm run prisma:push       # Pousser le schéma sans migration formelle
npm run prisma:seed       # Alimenter la base avec des données de test
```

---

## Structure des dossiers

```
agenda/
├── app/
│   ├── admin/          # Tableau de bord administrateur
│   │   ├── availability/   # Gestion des disponibilités
│   │   ├── bookings/       # Gestion des réservations
│   │   ├── clients/        # Gestion des clients
│   │   └── settings/       # Paramètres (localisation, mode)
│   ├── api/            # Routes API (Google OAuth, Calendar, Email)
│   ├── book/           # Page de réservation publique
│   ├── login/          # Connexion client
│   └── rdv/manage/     # Gestion de RDV par token (annulation/report)
├── components/         # Composants React réutilisables
├── lib/                # Logique métier (sync, slots, auth, email, Google)
├── prisma/             # Schéma Prisma et migrations
└── pages/api/          # Webhooks Google Calendar
```

---

## Fonctionnalités principales

- Réservation de créneaux en ligne (vue semaine / vue mois)
- Gestion des disponibilités récurrentes et exceptions ponctuelles
- Synchronisation bidirectionnelle Google Calendar (webhooks en temps réel)
- Système de crédits mensuels par client
- Notifications email (confirmation, annulation, report) via Resend
- Modes de séance : VISIO ou PRÉSENTIEL (avec lieu configurable)
- Support multi-timezone — Europe/Brussels ↔ America/New_York (Miami)
- Règle 72h : annulation/report impossible à moins de 72h du RDV
- Tableau de bord admin complet (clients, réservations, disponibilités, paramètres)
- Liens de gestion sécurisés par token — le client peut annuler/reporter sans connexion

---

## Comptes de test (seed local)

| Email | Mot de passe | Crédits/mois |
|---|---|---|
| `geoffrey.client1@test.com` | `Test1234!` | 2 |
| `geoffrey.client2@test.com` | `Test1234!` | 1 |

Admin : mot de passe défini dans la variable `ADMIN_PASSWORD`.

---

## Déploiement

Configuré pour Vercel. Le `postinstall` (`prisma generate`) s'exécute automatiquement au build.

```bash
npm run build
```

---

## Statut du projet

**Production** — Déployé pour Geoffrey Mahieu.
