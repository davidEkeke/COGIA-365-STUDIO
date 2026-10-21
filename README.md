# COGIA 365 Studio — AI Engineering & Compliance

COGIA 365 Studio Full Web est la plateforme de conception, développement, contrôle, preuve et déploiement des projets et agents COGIA.

## Architecture actuelle

- Application principale Node.js / Express 5
- Interface Web Full Web
- PostgreSQL
- Authentification JWT et RBAC
- Projets, workspaces, décisions, équipes et audit
- Studio jobs / artifacts / evidence
- COGIA Agent connecté à l'API OpenAI Responses lorsque `OPENAI_API_KEY` est configurée
- Runner séparé pour Build / Test / Preview
- Déploiement standard : Northflank

## Déploiement Northflank

Service principal :
- Dockerfile : `/Dockerfile`
- Port : `8080`
- Accessibilité : publique HTTPS
- Health check : `/health`

Runner :
- Dockerfile : `/runner/Dockerfile`
- Port : `8090`
- Accessibilité : privée uniquement
- Health check : `/health`

Base :
- PostgreSQL privé
- Schéma initial : `db/schema.sql`

Guide complet pour Nasser :
- `docs/NORTHFLANK_DEPLOYMENT_NASSER.md`

## Configuration

Ne jamais committer de secrets.

Le fichier `.env.example` décrit les variables attendues par le service principal.
Le fichier `runner/.env.example` décrit celles du Runner.

## Doctrine

Full Web · Local-first / Offline-first · contrôlable · auditable.

© Cabinet One
