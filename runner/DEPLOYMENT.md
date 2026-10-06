# COGIA Studio Runner — Contrat de déploiement

## Séparation obligatoire
Le Runner est un service distinct de COGIA 365 Studio. Il ne reçoit ni DATABASE_URL ni JWT_SECRET de l'application principale.

## Variables Runner
- STUDIO_RUNNER_TOKEN : secret partagé long et aléatoire
- RUNNER_WORKSPACE_ROOT=/work
- RUNNER_MAX_MS=120000
- PORT=8090

## Variables application principale
- STUDIO_RUNNER_URL : URL privée du Runner terminée par /run
- STUDIO_RUNNER_TOKEN : même secret partagé
- WORKSPACE_ROOT=/workspaces

## Volume de workspaces
Les deux services doivent voir les mêmes sources via un stockage dédié :
- Studio : /workspaces/<workspace-id>
- Runner : /work/<workspace-id>

Le Runner ne doit pas recevoir le volume de la base PostgreSQL.

## Isolation
Runner :
- utilisateur non-root ;
- CPU/mémoire limités ;
- filesystem du conteneur en lecture seule lorsque la plateforme le permet ;
- /tmp et espace de build éphémères ;
- aucun port public nécessaire ;
- trafic entrant limité au service Studio ;
- trafic sortant autorisé uniquement pendant l'installation contrôlée des dépendances, puis bloqué pour l'exécution.

## Secrets
Ne jamais committer STUDIO_RUNNER_TOKEN. Utiliser le gestionnaire de secrets de la plateforme.

## Déploiement
Construire le Runner avec runner/Dockerfile. Exposer /health uniquement au réseau interne et connecter Studio à http(s)://<runner-interne>/run.
