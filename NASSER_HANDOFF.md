# Pack de remise à Nasser — COGIA 365 Studio Full Web

## Référence de remise
- Dépôt : `davidEkeke/COGIA-365-STUDIO`
- Branche source : `main`
- Commit gelé pour remise : `19b425464e4a5b2cca711e1bbad942b0f7060573`
- Cible : Northflank
- Date de préparation : 2026-10-21

## Contenu fonctionnel
Le dépôt contient :
- application principale Full Web ;
- serveur Node.js/Express ;
- interface `index.html` ;
- PostgreSQL et `db/schema.sql` ;
- authentification, rôles et audit ;
- projets, workspaces, décisions et membres ;
- Studio jobs, artifacts, agents et evidence ;
- COGIA Agent connecté à OpenAI Responses API lorsque la clé est configurée ;
- Runner privé Build/Test/Preview ;
- Dockerfiles principal et Runner ;
- modèles de variables d'environnement ;
- documentation Doctrine 365 ;
- documentation de déploiement Northflank ;
- script de bootstrap du premier super-administrateur.

## Fichiers clés
- `Dockerfile`
- `server.js`
- `index.html`
- `package.json`
- `package-lock.json`
- `db/schema.sql`
- `runner/Dockerfile`
- `runner/server.js`
- `runner/package.json`
- `runner/.env.example`
- `.env.example`
- `scripts/bootstrap-admin.js`
- `docs/NORTHFLANK_DEPLOYMENT_NASSER.md`
- `docs/DEPLOYMENT_POLICY_NORTHFLANK.md`

## Règle de déploiement
Northflank est la cible standard retenue pour COGIA 365.

Nasser doit déployer directement depuis GitHub afin que le code source de référence et le déploiement restent synchronisés.

## Secrets
Aucun secret réel ne fait partie du dépôt ou du pack.
Les valeurs suivantes doivent être créées dans Northflank :
- `DATABASE_URL`
- `JWT_SECRET`
- `STUDIO_RUNNER_TOKEN`
- `OPENAI_API_KEY`

Le `STUDIO_RUNNER_TOKEN` doit être identique dans Studio et Runner.

## Validation
Le déploiement n'est déclaré terminé qu'après :
1. health check principal OK ;
2. health check Runner OK ;
3. connexion administrateur ;
4. création projet/workspace ;
5. réponse COGIA Agent ;
6. Build/Test/Preview contrôlé ;
7. présence des événements d'audit ;
8. vérification qu'aucun secret n'est exposé.

## Limites connues
- L'envoi d'e-mails de réinitialisation de mot de passe n'est pas encore relié à un fournisseur d'e-mail.
- Build/Test/Preview nécessitent un Runner effectivement déployé et testé.
- Les capacités IA nécessitent une clé fournisseur valide et autorisée.

Ce document accompagne la remise technique à Nasser et ne remplace pas le guide détaillé `docs/NORTHFLANK_DEPLOYMENT_NASSER.md`.
