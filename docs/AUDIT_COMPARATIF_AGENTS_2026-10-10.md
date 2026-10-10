# Audit comparatif COGIA 365 Web — État de l’art et matrice des écarts
**Date : 10 octobre 2026**  
**Statut : Phase 2 — état de l’art documenté, avant conception détaillée et construction**

## 1. Objet audité

### Plateforme
- Dépôt : `davidEkeke/COGIA-365-STUDIO`
- Branche : `main`
- Version applicative déclarée : `0.2.0`
- Commit de référence au démarrage de l’audit : `d70405df3a47eeb8e4fa75ef3e5260f8d446d30a`
- Runtime principal : Node.js / Express 5 / PostgreSQL
- Déploiement observé : service principal Northflank `COGIA-365-STUDIO`
- Runner : code présent dans `runner/`, service Northflank non encore déployé au moment de l’audit en raison d’un incident d’intégration GitHub/Northflank.

### Deux objets distincts
1. **365 Web comme plateforme** : création, configuration, test, déploiement et exploitation d’agents.
2. **Les agents produits** : intelligence, qualité relationnelle, robustesse, capacité d’action et résultats sur missions réelles.

Une fonctionnalité trouvée dans le code n’est pas considérée comme livrée tant que son fonctionnement déployé n’est pas vérifié.

## 2. Référentiel Doctrine 365 appliqué

Parcours :
**Idée → État de l’art obligatoire → Conception → Apparence → Construction → Validation → Livraison → Évolution**

Traçabilité :
**Métier → Processus → Règles → Données → Contrôles → Architecture → Fonctionnalités → Tests → Preuves**

Exigence transversale :
> Chaque agent COGIA porte une intelligence professionnelle complète, contextualisée, empathique, proactive et gouvernée. Il observe, comprend, s’intéresse, raisonne, prépare, agit dans ses autorisations, contrôle les résultats et conserve les preuves nécessaires.

Le document exact `Prompt 365.docx` n’a pas été retrouvé dans les sources accessibles lors de cette phase. L’audit utilise donc les décisions de projet accessibles et `docs/DOCTRINE_365_INTELLIGENCE_COMPLETE.md`. Cette absence reste un point de contrôle documentaire à résoudre ultérieurement.

## 3. Références concurrentes retenues

### ElevenLabs Agents — référence principale
Justification : plateforme de bout en bout particulièrement avancée pour agents conversationnels et vocaux, avec création, workflow visuel, voix, STT/TTS, turn-taking, tools, RAG, téléphonie, tests, analytics, versioning et expérimentation.

Sources officielles :
- https://elevenlabs.io/docs/eleven-agents/overview/
- https://elevenlabs.io/docs/eleven-agents/build/overview
- https://elevenlabs.io/docs/eleven-agents/customization/agent-testing
- https://elevenlabs.io/docs/eleven-agents/operate/experiments
- https://elevenlabs.io/docs/eleven-agents/dashboard
- https://elevenlabs.io/docs/eleven-agents/operate/overview

### Retell AI — référence Voice/Contact Center
Justification : téléphonie, transferts humains, simulations, A/B tests, knowledge base, analytics de calls, MCP et opérations de centre de contacts.

Sources :
- https://www.retellai.com/features/call-transfer
- https://www.retellai.com/features/knowledge-base
- https://www.retellai.com/changelog
- https://www.retellai.com/changelog/agent-transfer-mcp-client
- https://www.retellai.com/changelog/performance-analytics-cf-testing-and-more

### OpenAI Agents — référence orchestration programmable
Justification : runtime programmable, tools, MCP, handoffs, guardrails, human review, sandbox, voice, tracing et observabilité.

Source :
- https://developers.openai.com/api/docs/guides/agents/sdk

### Microsoft Copilot Studio — référence low-code / entreprise / évaluation
Justification : création low-code, connecteurs, gouvernance, test sets, évaluation répétable et automatisable.

Sources :
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/analytics-agent-evaluation-create
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/analytics-agent-evaluation-results
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/evaluation-checklist
- https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/sec-gov-phase4

### Google Vertex AI Agent Builder — référence runtime / mémoire / gouvernance
Justification : Agent Engine, sessions, Memory Bank, code execution, observabilité, IAM, A2A et évaluation.

Sources :
- https://docs.cloud.google.com/agent-builder
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-builder/overview
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/evaluate
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/memory-bank/set-up

## 4. Niveaux de preuve utilisés

- **Documenté** : décrit dans une documentation officielle.
- **Observé** : visible dans une interface, un dépôt ou un environnement.
- **Testé** : exécuté dans un protocole reproductible.
- **Vérifié en production** : comportement observé sur la version réellement déployée.
- **Non vérifiable** : accès, environnement ou information manquant.

Les capacités concurrentes de cette phase sont principalement **documentées**, pas encore testées directement par COGIA.

## 5. Matrice des capacités et écarts

| Capacité | Référence de marché | 365 Web constaté | Statut 365 | Écart | Impact métier | Amélioration proposée | Critère de validation |
|---|---|---|---|---|---|---|---|
| Définition d’un agent | ElevenLabs, Copilot Studio | Studio/Agents visible mais pas de définition complète mission+modèle+tools+KB+policy | Prototype | Fort | Empêche création autonome d’agents complets | Agent Definition v1 | Créer, versionner et recharger un agent complet |
| Choix/abstraction LLM | ElevenLabs, OpenAI, Google | Aucun SDK LLM actif dans le package courant | Absence confirmée dans code audité | Critique | Pas d’intelligence générative réellement exécutée | Provider abstraction layer | Même agent exécutable avec ≥2 fournisseurs |
| Workflow visuel | ElevenLabs, Retell | Aucun builder visuel agentique vérifié | Absence confirmée | Fort | Usage non-technique limité | Flow/mission builder, après validation besoins | Construire un workflow sans code |
| Voice STT/TTS | ElevenLabs, Retell | Aucun moteur voix intégré | Absence confirmée | Critique pour agents vocaux | Pas de téléphone/voix | Couche Voice Provider interchangeable | Conversation vocale E2E réussie |
| Turn-taking / interruption | ElevenLabs, Retell | Absent | Absence confirmée | Critique voix | Conversation artificielle si ajout voix naïf | Voice runtime spécialisé | Barge-in et silence gérés selon scénarios |
| Téléphonie/SIP | ElevenLabs, Retell | Absent | Absence confirmée | Fort selon métier | Pas de canal téléphonique | Intégration fournisseur, non reconstruction | Appel entrant/sortant + transfert testés |
| Knowledge Base / RAG | ElevenLabs, Retell, Google | Pas de moteur RAG générique constaté | Absence confirmée | Critique | Réponses non ancrées dans référentiels | COGIA Knowledge & Referentials Engine | Sources, version, autorité et contradiction tracées |
| Référentiels métier structurés | COGIA doctrine | Doctrine très avancée, moteur non construit | Conception avancée | Fort écart réalisation/conception | Différenciation centrale non exploitée | Référentiel typé règles/processus/pouvoirs | Réponse cite la règle valide et gère conflit/version |
| Tool registry | ElevenLabs, OpenAI, Retell MCP | Pas de registre générique d’outils agentiques | Partiel | Critique | Agent ne peut pas accomplir missions métier | Tool Registry + schemas + policies | Tools déclarés, autorisés, testés et traçables |
| Vérification post-action | Doctrine COGIA | Pas de framework générique de confirmation d’action | Partiel | Critique | Risque faux succès | Action contract + verify/compensate | Aucun succès déclaré sans preuve accessible |
| Autorisation des actions | OpenAI human review, gouvernance enterprise | RBAC et org isolation existent | Partiel solide | Moyen | Bon socle, mais non relié aux tools agentiques | Policy/Control Plane | Tool refusé indépendamment du modèle si non autorisé |
| Human-in-the-loop | OpenAI, ElevenLabs/Retell transfer | Pas de HITL générique constaté | Absent | Fort | Risque actions sensibles | Approval Gates | Mission suspendue/reprise après validation |
| Handoff multi-agent | OpenAI, Google A2A, Retell agent transfer | studio_agent_runs existe, orchestration initiale | Prototype | Fort | Collaboration encore artificielle | Handoff Contract COGIA | Contexte minimal, droits non étendus, responsabilité tracée |
| Mémoire session | Google Sessions | Pas de runtime conversationnel complet | Absent | Fort | Continuité faible | Session Store | Reprise fiable sans fuite inter-org |
| Mémoire long terme | Google Memory Bank | Absente | Absent | Fort | Pas de personnalisation contrôlée | Governed Memory | Scope, source, correction, durée, suppression testés |
| Simulations multi-tour | ElevenLabs, Retell | Pas de simulator agentique | Absent | Critique validation | Pas de preuve comportementale à l’échelle | Benchmark/Eval Engine | Suite multi-tour exécutable en batch |
| Next-response eval | ElevenLabs | Absent | Absent | Fort | Régressions conversationnelles non détectées | Scenario Eval | Critères automatiques + revue humaine |
| Tool-call eval | ElevenLabs, Google | Absent | Absent | Critique | Mauvais outil/paramètres non détectés | Tool Eval | Tool et arguments comparés à attendu |
| Agent eval sets | Copilot Studio, Google | Tests build/runtime mais pas agent quality | Partiel | Critique | Confusion test logiciel / qualité agent | Test Sets versionnés | Re-run avant/après et delta mesuré |
| A/B testing | ElevenLabs, Retell | Absent | Absent | Moyen/Fort | Optimisation intuitive | Experiments | Traffic split + métriques + rollback |
| Analytics conversationnels | ElevenLabs, Retell | Audit/jobs, pas analytics conversation | Partiel | Fort | Faible pilotage exploitation | Agent Analytics | Mission success, cost, latency, failures disponibles |
| Tracing agentique | OpenAI, Google | audit_log/studio_evidence mais pas trace modèle/tool complète | Partiel | Fort | Diagnostic difficile | COGIA Trace | Chaque modèle/tool/handoff/approval corrélé |
| Evidence | COGIA | `studio_evidence` existe | Prototype prometteur | Faible sur structure, fort sur usage | Différenciation possible | Evidence Pack par mission | Preuves exportables liées aux contrôles |
| Versioning agents | ElevenLabs experiments | pas de modèle agent_versions observé | Absent | Fort | Pas de rollback fiable | Agent Version Registry | Draft/Test/Prod + diff + rollback |
| Environnements | Copilot/enterprise | projets/workspaces mais pas lifecycle agent | Partiel | Fort | Changements risqués | Dev/Test/Prod promotion | Promotion contrôlée et vérifiée |
| Rétention conversation | ElevenLabs, Retell | pas de lifecycle conversationnel | Absent | Fort | Risque conformité | Retention Policies | TTL, suppression, preuve de purge |
| Sécurité org/RBAC | plateformes enterprise | users/org/roles/audit et isolation org | Disponible dans code | Avantage de base potentiel | À étendre au runtime | Policy enforcement | Tests inter-org + rôle + tool permission |
| MFA | enterprise | interface indique “À venir” | Prévu | Moyen/Fort | Auth admin insuffisante | MFA/SSO selon cible | MFA imposable aux rôles sensibles |
| Local/offline | concurrents surtout cloud | doctrine Local-first/offline-first, non démontrée E2E | Conception / non vérifiable | Potentiel avantage | Important dans contextes à connectivité limitée | Runtime local contrôlé | Mission critique réalisable sans cloud selon périmètre |
| Runner isolé | OpenAI/Google sandbox | code Runner présent, non déployé | Disponible sous conditions | Moyen | Build/test non prouvé en prod | Finaliser Northflank | Build/test/preview E2E avec journal et isolation |
| Coût par mission réussie | analytics concurrents | pas de métrologie agentique | Absent | Fort | Pas d’arbitrage économique | Cost Ledger | coût fournisseur + infra / mission réussie |

## 6. Constats structurants

### C1 — 365 Web n’est pas encore un concurrent fonctionnel direct d’ElevenLabs Agents
La version auditée possède une base de plateforme, mais pas encore les composants d’un agent runtime complet : LLM, voix, knowledge engine, tool registry, mémoire, evals conversationnels et exploitation agentique.

### C2 — Le plus grand écart n’est pas la voix ; c’est le runtime d’agent
Ajouter ElevenLabs TTS à l’interface ne transformerait pas COGIA en plateforme d’agents. La priorité est un runtime gouverné capable de raisonner, appeler des tools, vérifier, tracer et produire des preuves.

### C3 — COGIA possède un axe de différenciation crédible
La chaîne métier/processus/règles/données/contrôles et la Doctrine d’intelligence complète peuvent produire une supériorité **sur missions professionnelles**, si elles sont réellement implémentées et évaluées.

### C4 — “Build vs Buy” doit être asymétrique
À intégrer plutôt qu’à reconstruire :
- STT/TTS de pointe ;
- téléphonie/SIP ;
- modèles fondamentaux.

À construire comme propriété COGIA :
- modèle de mission ;
- référentiels métier structurés ;
- autorisation/policy plane ;
- orchestration gouvernée ;
- vérification d’action ;
- evidence ;
- benchmark métier ;
- expérience non-technique orientée résultat.

## 7. Priorités proposées

### P0 — Fondation agentique
1. Agent Definition schema
2. Provider abstraction
3. LLM runtime
4. Tool Registry
5. Policy/Authorization Plane
6. Mission State Machine
7. Action Verification
8. Trace & Evidence

### P1 — Connaissances et qualité
9. Knowledge & Referentials Engine
10. Session/memory gouvernée
11. Evaluation Engine
12. Benchmark 365
13. Agent versions + Dev/Test/Prod + rollback

### P2 — Interaction et exploitation
14. Voice Provider Layer
15. téléphonie / transfert humain selon métiers
16. Agent Analytics
17. A/B / canary
18. coûts et SLA

## 8. Protocole Benchmark 365 v0.1

Scénarios minimaux :
1. demande simple ;
2. ambiguïté ;
3. données manquantes ;
4. contradiction ;
5. information périmée ;
6. utilisateur inquiet ;
7. utilisateur mécontent ;
8. multi-documents ;
9. calcul ;
10. plusieurs tools ;
11. action soumise à approbation ;
12. demande interdite ;
13. tool indisponible ;
14. prompt injection ;
15. interruption vocale ;
16. transfert humain ;
17. reprise après erreur ;
18. vérification post-action.

Mesures :
- taux de mission réussie ;
- exactitude ;
- groundedness / qualité des sources ;
- tool selection accuracy ;
- argument accuracy ;
- respect autorisations ;
- qualité relationnelle ;
- taux d’escalade correcte ;
- récupération après erreur ;
- latence p50/p95 ;
- coût par mission ;
- qualité et complétude des preuves.

## 9. Définition opérationnelle de “meilleur”

COGIA ne sera déclaré meilleur que sur une mission nommée, un périmètre, des données, une configuration et des métriques explicites.

Exemples de supériorité pertinente :
- meilleur traitement d’une contestation bancaire de bout en bout ;
- meilleure préparation d’un dossier hôtelier complexe ;
- meilleure application d’une procédure municipale ;
- meilleure traçabilité réglementaire ;
- meilleure gestion d’une exception métier avec validation humaine.

Une meilleure voix seule ne prouve pas une meilleure intelligence professionnelle.

## 10. Prochaine étape

Avant construction :
1. transformer P0 en spécifications d’architecture et contrats de données ;
2. définir `Agent Definition v1`, `Mission v1`, `Tool v1`, `Policy v1`, `Trace v1`, `Evidence v1` ;
3. choisir deux missions pilotes COGIA pour les premiers benchmarks ;
4. établir la baseline mesurée de la version actuelle ;
5. seulement ensuite commencer l’implémentation des composants P0.
