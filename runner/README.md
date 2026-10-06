# COGIA Studio Runner

Microservice séparé pour Build, Test et Preview.

- `GET /health`
- `POST /run` authentifié par `STUDIO_RUNNER_TOKEN`
- workspace monté sous `/work/<workspace-id>`
- commandes lancées sans shell
- stdout/stderr plafonnés
- timeout via `RUNNER_MAX_MS`

À déployer séparément avec CPU/mémoire limités, filesystem éphémère et réseau sortant filtré.
