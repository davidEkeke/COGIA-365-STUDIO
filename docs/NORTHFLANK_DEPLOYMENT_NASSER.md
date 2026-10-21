# COGIA 365 Studio Full Web — Pack de déploiement Northflank

## Destinataire
Nasser — déploiement et exploitation technique COGIA 365.

## Source de référence
- Dépôt : `davidEkeke/COGIA-365-STUDIO`
- Branche : `main`
- Déploiement cible : Northflank
- Architecture : service principal + PostgreSQL + Runner privé + volume workspaces + fournisseur IA externe.

## 1. Architecture cible

### Service A — COGIA-365-STUDIO
Application Web principale.
- Build context : racine du dépôt
- Dockerfile : `/Dockerfile`
- Port : `8080`
- Accessibilité : publique via HTTPS
- Health check : `/health`

### Service B — COGIA-STUDIO-RUNNER
Exécution isolée des builds/tests/previews.
- Build context : racine du dépôt
- Dockerfile : `/runner/Dockerfile`
- Port : `8090`
- Accessibilité : privée uniquement
- Health check : `/health`

### PostgreSQL
Base de données dédiée COGIA 365 Studio.
- Appliquer `db/schema.sql` une fois lors de l'installation initiale.
- Sauvegardes automatiques activées.
- Ne jamais exposer publiquement PostgreSQL.

### Workspaces
Le service principal et le Runner doivent voir le même stockage persistant.
- Studio : montage sur `/workspaces`
- Runner : montage sur `/work`
- Les IDs de workspaces doivent pointer vers les mêmes dossiers physiques.

## 2. Variables du service principal

Variables non secrètes :
- `PORT=8080`
- `WORKSPACE_ROOT=/workspaces`
- `STUDIO_RUNNER_URL=http://cogia-studio-runner:8090/run`
- `OPENAI_MODEL=<modèle autorisé pour la clé>`
- `APP_URL=https://<url-publique-du-service>`
- `PGSSL=require` si PostgreSQL l'exige.

Secrets Northflank :
- `DATABASE_URL`
- `JWT_SECRET` — minimum 32 caractères aléatoires.
- `STUDIO_RUNNER_TOKEN`
- `OPENAI_API_KEY`

Le même `STUDIO_RUNNER_TOKEN` doit être injecté dans Studio et Runner. Ne jamais l'écrire dans GitHub, un mail, une capture ou un fichier du pack.

## 3. Variables du Runner

Variables non secrètes :
- `PORT=8090`
- `RUNNER_WORKSPACE_ROOT=/work`
- `RUNNER_MAX_MS=120000`
- `RUNNER_MAX_CONCURRENCY=1`

Secret :
- `STUDIO_RUNNER_TOKEN` — exactement le même secret que le service principal.

Le Runner ne doit recevoir ni `DATABASE_URL`, ni `JWT_SECRET`, ni `OPENAI_API_KEY`.

## 4. Initialisation de la base

1. Créer PostgreSQL.
2. Exécuter `db/schema.sql`.
3. Créer le premier super-administrateur via une tâche one-shot ou un shell sécurisé du service principal :

```bash
COGIA_ORGANIZATION_NAME="Cabinet One" \
COGIA_ADMIN_EMAIL="<adresse-admin>" \
COGIA_ADMIN_NAME="<nom-admin>" \
COGIA_ADMIN_PASSWORD="<mot-de-passe-temporaire>" \
npm run bootstrap-admin
```

Ne jamais transmettre le mot de passe temporaire dans un canal non sécurisé. Le compte est créé avec changement obligatoire du mot de passe à la première connexion.

## 5. Ordre de déploiement

1. PostgreSQL.
2. Schéma SQL.
3. Volume workspaces.
4. Secret group Northflank.
5. Runner privé.
6. Service principal public.
7. Bootstrap premier administrateur.
8. Tests de santé et tests fonctionnels.

## 6. Contrôles obligatoires

### Santé
Service principal :
```
GET /health
```
Attendu :
- `ok: true`
- `database: true`
- `auth: true`
- `runner: true` si Runner configuré
- `agent: true` si OPENAI_API_KEY configurée

Runner :
```
GET /health
```
Attendu :
```json
{"ok":true,"service":"cogia-studio-runner"}
```

### Fonctionnels
- connexion administrateur ;
- changement de mot de passe initial ;
- création d'un projet ;
- création d'un workspace ;
- création d'une décision ;
- affichage des membres ;
- appel de COGIA Agent ;
- job Build ;
- job Test ;
- job Preview ;
- écriture d'un résultat et d'une preuve ;
- journal d'audit.

## 7. Sécurité minimale

- Runner privé uniquement.
- Secrets stockés dans Northflank.
- Aucun secret dans GitHub ou dans le ZIP.
- PostgreSQL privé.
- HTTPS obligatoire pour le service public.
- Volume workspaces séparé de PostgreSQL.
- Limites CPU/RAM pour Runner.
- Filesystem Runner en lecture seule si compatible avec le stockage/montages retenus.
- Aucun socket Docker exposé au Runner.
- Sauvegardes PostgreSQL automatiques.
- Rotation périodique de `JWT_SECRET`, `STUDIO_RUNNER_TOKEN` et clés fournisseurs selon procédure contrôlée.

## 8. Déploiement continu

La branche de référence est `main`.
Activer CI/CD Northflank uniquement après validation du premier déploiement.
Pour une mise à jour :
1. vérifier le commit ;
2. déployer ;
3. vérifier `/health` ;
4. exécuter les smoke tests ;
5. surveiller les logs ;
6. revenir au déploiement précédent si régression.

## 9. Limites connues à ne pas masquer

- La livraison d'e-mail de réinitialisation de mot de passe n'est pas encore intégrée à un fournisseur d'e-mail.
- Le Runner doit être réellement testé sur Northflank avant de déclarer Build/Test/Preview totalement opérationnels.
- Les capacités IA dépendent de la présence et des droits de la clé fournisseur.
- La conformité fonctionnelle doit être prouvée par les tests et non déduite du seul code.

## 10. Critère de remise en exploitation

Le déploiement peut être déclaré exploitable lorsque :
- Studio et Runner sont `Healthy` ;
- PostgreSQL est joignable ;
- un administrateur peut se connecter ;
- un projet et un workspace peuvent être créés ;
- COGIA Agent répond ;
- un Build/Test/Preview contrôlé aboutit ;
- le journal d'audit enregistre les actions ;
- aucun secret n'apparaît dans les logs ou les livrables.

---
COGIA 365 Studio — AI Engineering & Compliance
Déploiement standard : Northflank
