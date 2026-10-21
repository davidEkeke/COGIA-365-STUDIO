# Politique de déploiement COGIA 365 — Northflank

## Décision
Northflank devient la cible standard de déploiement pour les applications COGIA 365, sauf décision explicite contraire pour un projet donné.

## Principes
- GitHub reste la source de référence du code.
- Les secrets restent dans le gestionnaire de secrets de la plateforme.
- Les applications composées sont déployées en services séparés lorsque l'isolation l'exige.
- Les bases de données sont privées et sauvegardées.
- Les services techniques internes (Runner, workers, moteurs) ne sont pas exposés publiquement sans nécessité.
- Les déploiements sont vérifiés par health checks, tests fonctionnels et preuves.
- cPanel n'est pas la cible standard des applications COGIA 365.
- Le packaging doit rester portable afin de permettre une migration future si nécessaire.

## Modèle COGIA 365 Studio
- `COGIA-365-STUDIO` : service Web principal.
- `COGIA-STUDIO-RUNNER` : service privé.
- PostgreSQL : base privée.
- Volume Workspaces : stockage persistant partagé selon les capacités de la plateforme.
