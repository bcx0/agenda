# Relais Google Calendar (Apps Script)

## Pourquoi

Depuis le 03/11/2026, Google rejette par intermittence les tokens d'accès que
l'app obtient en rafraîchissant son refresh token (401 « Invalid Credentials »),
alors que le rafraîchissement lui-même réussit. La sync s'arrêtait alors pendant
des heures, jusqu'à une reconnexion manuelle.

Le relais supprime ce maillon. Un petit script tourne **dans le compte Google de
l'agenda** (`gmcalpro@gmail.com`). L'app lui confie chaque requête Google
Calendar, il l'exécute avec l'autorisation que Google gère lui-même pour ce
script, et renvoie la réponse. L'app ne gère plus aucun token.

Rien d'autre ne change : même agenda, même logique de sync, même webhook.

## Installation (environ 10 minutes, une seule fois)

Tout se fait connecté avec **gmcalpro@gmail.com**.

1. **Créer le projet**
   - Ouvrir https://script.google.com puis *Nouveau projet*.
   - Le renommer « Relais Agenda Geoffrey Mahieu ».

2. **Coller le code**
   - Remplacer tout le contenu de `Code.gs` par le fichier `Code.gs` de ce dossier.
   - *Paramètres du projet* (roue dentée) : cocher **Afficher le fichier manifeste
     « appsscript.json » dans l'éditeur**.
   - Remplacer le contenu de `appsscript.json` par le fichier de ce dossier.
   - Enregistrer.

3. **Choisir un secret**
   - Générer une longue chaîne aléatoire (au moins 40 caractères), par exemple
     avec un gestionnaire de mots de passe.
   - *Paramètres du projet* > *Propriétés du script* > *Ajouter* :
     nom `PROXY_SECRET`, valeur = ce secret.

4. **Autoriser le script**
   - Dans l'éditeur, choisir la fonction `autoriser` puis *Exécuter*.
   - Accepter les autorisations demandées (agenda + services externes).
   - Le journal d'exécution doit afficher `Calendar API : HTTP 200`.

5. **Déployer**
   - *Déployer* > *Nouveau déploiement* > type **Application Web**.
   - *Exécuter en tant que* : **Moi (gmcalpro@gmail.com)**.
   - *Qui a accès* : **Tout le monde**. Seul quelqu'un qui connaît le secret peut
     s'en servir, et il ne peut appeler que l'API Calendar.
   - Copier l'**URL de l'application Web** (elle se termine par `/exec`).
   - Contrôle : ouvrir cette URL dans un navigateur doit afficher `ok`.

6. **Brancher l'app** (Vercel > projet > Settings > Environment Variables,
   environnement Production)
   - `GOOGLE_PROXY_URL` = l'URL `/exec` de l'étape 5.
   - `GOOGLE_PROXY_SECRET` = le secret de l'étape 3 (cocher *Sensitive*).
   - Redéployer la production.

7. **Vérifier**
   - Dans les 5 minutes, la table `SyncLog` doit montrer des `sync_ok` sans
     `auth_error`, et le badge Google de l'admin repasse au vert.

## Retour arrière

Supprimer `GOOGLE_PROXY_URL` sur Vercel et redéployer : l'app reprend
immédiatement l'ancien fonctionnement par tokens OAuth (toujours présent).

## Mise à jour du script

Après une modification de `Code.gs` : *Déployer* > *Gérer les déploiements* >
crayon > *Version : Nouvelle version*. L'URL `/exec` ne change pas.

## Limites connues

- Quota Apps Script d'un compte Gmail gratuit : 20 000 appels sortants par
  jour. L'app en consomme environ 300 à 1 500 (cron toutes les 5 minutes,
  webhooks, réservations) : large marge.
- Si Google change un jour le fonctionnement des Applications Web Apps Script,
  la sync remontera une erreur `proxy_error` dans `SyncLog` et une alerte email
  sera envoyée à l'admin. Le retour arrière ci-dessus reste possible.
