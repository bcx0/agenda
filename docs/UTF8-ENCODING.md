# UTF-8 Encoding Rules

- Toujours garder les fichiers en UTF-8 sans BOM.
- Ne jamais réencoder un fichier existant.
- Ne jamais utiliser "Save with Encoding" pour corriger un texte.
- Correction autorisée: uniquement Rechercher/Remplacer du texte visible.
- Ne pas toucher au code technique (imports, chemins, logique) pour corriger un accent.

## Procédure en cas de texte cassé

1. Faire un Rechercher/Remplacer ciblé des séquences corrompues (ex: `Ã©` -> `é`).
2. Limiter la correction aux labels/messages visibles.
3. Vérifier l'absence de `Ã` dans les fichiers concernés.

## En cas de problème persistant

- `git checkout -- <fichier>`
- `rm -rf .next`
- `npm run dev`
