# Espace Client - Prise de rendez-vous (demo locale)

Demo Next.js 14 + Prisma SQLite. Agenda local avec conversions Brussels/Miami, quotas mensuels et espace admin protégé.

## Lancer le projet (Windows / PowerShell)
- Prérequis : Node.js 18+, npm.
- Installer : `npm install`
- Config env : copiez `.env.example` vers `.env` et ajustez `SESSION_SECRET` + `ADMIN_PASSWORD` (défaut local : `220700mG`). `DATABASE_URL` est déjà en SQLite local (`file:./dev.db`).
- Variables requises en local : `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`.
- Script local (PowerShell) pour automatiser migration + generate + dev :
  - `.\scripts\setup-admin.ps1`
  - Options : `-SkipMigrate`, `-SkipGenerate`, `-SkipDev`

## Dépannage (Windows / Supabase)
- Erreur `spawn EPERM` (Next/Prisma) :
  - Fermer les terminaux Node ouverts.
  - Relancer PowerShell en admin.
  - Vérifier l'antivirus/Defender (fichiers Prisma/Next parfois bloqués).
- Erreur `EPERM rename ...query_engine-windows.dll.node` :
  - Fermer les processus Node.
  - Supprimer `node_modules/.prisma` puis relancer `npx prisma generate`.
- Erreur `P1001 Can't reach database server` :
  - Vérifier la connexion réseau.
  - Vérifier que `DATABASE_URL` pointe vers le bon projet Supabase.
  - Tester l'accès avec un client SQL (psql/pgAdmin).
- Règles horaires :
  - Miami 07:00 → 20:00 (dernier créneau commence à 20:00).
  - Si localisation admin = Belgique : 09:00 → 18:00 (Brussels).
- Règle 72h : annulation/modification impossible à moins de 72h du rendez-vous.
- Mode de rendez-vous : VISIO (défaut) ou PRÉSENTIEL. Le lieu présentiel est affiché (défaut : Vander Valk).
- Générer Prisma Client : `npx prisma generate`
- Initialiser la base : `npx prisma db push`
- Seed de démo (idempotent) : `npx prisma db seed`
- Démarrer : `npm run dev` puis ouvrez `http://localhost:3000`

## Maintenance Prisma
- Quand le schema change : `npx prisma generate`, `npx prisma db push`, `npx prisma db seed` (si besoin), puis `npm run dev`.
- `DATABASE_URL` doit être défini même en SQLite local.

## URLs & comptes de test
- Accueil : `http://localhost:3000`
- Login : `http://localhost:3000/login`
- Agenda : `http://localhost:3000/book`
- Admin : `http://localhost:3000/admin`
  - Disponibilités : `http://localhost:3000/admin/availability`
  - Clients : `http://localhost:3000/admin/clients`
  - Bookings : `http://localhost:3000/admin/bookings`
  - Settings : `http://localhost:3000/admin/settings`

Clients :
- `geoffrey.client1@test.com` / `Test1234!` / 2 crédits/mois
- `geoffrey.client2@test.com` / `Test1234!` / 1 crédit/mois

Admin :
- Mot de passe local (env `ADMIN_PASSWORD`) : `220700mG`
- Switch localisation + mode par défaut + lieu présentiel dans `/admin/settings`.

## Parcours utilisateur
- `/login` : connexion email + mot de passe (clients actifs seulement).
- `/book` : agenda protégé. Créneaux Brussels/Miami, règle lundi 17h Brussels bloqué, quotas mensuels, confirmation via modale/bandeau.

## Interface admin (`/admin`)
- Protégé par `ADMIN_PASSWORD`.
- Clients : ajouter, quotas, activer/désactiver.
- Indisponibilités : ajouter/supprimer des blocages ponctuels.
- Bookings : statut (DONE/NO_SHOW/CANCELLED/CONFIRMED), mode VISIO/PRÉSENTIEL, annulation (72h mini).
- Settings : localisation Miami/Belgique, mode par défaut, lieu/notes présentiel.

## Tests manuels rapides
- Quota atteint : client2 réserve 1 créneau, message quota.
- Blocage récurrent lundi 17h : voir indisponibilité.
- Blocage ponctuel : ajouter un bloc côté admin puis vérifier côté client.
- Admin login : mot de passe `220700mG`, navigation settings et changement de localisation.
