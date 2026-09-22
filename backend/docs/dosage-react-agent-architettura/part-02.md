# Dosage ReAct Agent — Architettura e tool — Part 2

[Back to the guide index](../DOSAGE_REACT_AGENT_ARCHITETTURA.md)

| Nome tool                | Scopo                              |
| ------------------------ | ---------------------------------- |
| `update_job`             | Modifica job esistente.            |
| `create_job`             | Crea nuovo job.                    |
| `merge_treatment_dates`  | Merge date trattamento su più job. |
| `optimize_selected_jobs` | Ottimizzazione su job selezionati. |

### Stock e autorizzazioni (con `userId`)

| Nome tool                           | Scopo                                     |
| ----------------------------------- | ----------------------------------------- |
| `search_company_stock_products`     | Ricerca prodotti in stock aziendale.      |
| `check_product_crop_authorizations` | Verifica autorizzazioni coltura/prodotto. |

### Ricerca e RAG (condizionali)

| Nome tool                          | Scopo                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `search_rules`                     | RAG su regole workspace/job/user.                                             |
| `search_disciplinari_database`     | Ricerca testuale/strutturata su DB disciplinari.                              |
| `bdf_search_product_doses`         | Dosi da catalogo BDF per prodotto.                                            |
| `bdf_search_products_by_adversity` | Prodotti BDF per avversità.                                                   |
| `tavily_scientific_search`         | Ricerca web scientifica (citazioni estratte in `extractSourcesFromMessages`). |
| `search_disciplinari_bdf_pdf`      | Ricerca semantica su PDF disciplinari indicizzati.                            |
| `search_job_operations`            | RAG sulle operazioni storiche del job corrente.                               |

### Tool sottoposti ad auto-critic

Insieme definito in `graph/auto-critic-node.ts` (`CRITIC_TARGET_TOOLS`): include `calculate_dosage`, `validate_compliance`, `validate_sa_group_limits`, `optimize_dosage`, creazioni/import, `create_treatment_jobs`, `execute_treatment_plan`, `update_job`, `confirm_conformity_check`.

---

## 9. Tool non registrati nel grafo

- **`spawn_subagent`** (`tools/spawn-subagent.tool.ts`): factory esportata da `tools/index.ts` e usata in test di integrazione, **non** inclusa in `buildTools` del registry principale. Utile come estensione o sperimentazione, non fa parte del set standard dell’agente in produzione.

---

## Riferimenti file chiave

| File                        | Contenuto                                                  |
| --------------------------- | ---------------------------------------------------------- |
| `DosageReactAgent.ts`       | Ciclo di vita agente, messaggi, HITL, cache, fonti Tavily. |
| `graph/DosageReactGraph.ts` | Compilazione grafo, bind tool, flag prompt.                |
| `graph/tool-registry.ts`    | `buildTools`, categorie, condizioni di attivazione.        |
| `graph/routing.ts`          | Decisioni dopo agent, guard, tools.                        |
| `graph/nodes.ts`            | Nodi agent, guard, approval_gate.                          |
| `type/state.ts`             | `DosageReactState`, `WorkingMemory`.                       |

Per integrazione frontend/socket si possono consultare anche `docs/DOSAGE_REACT_AGENT_FRONTEND_INTEGRATION.md` e `docs/dosage-react-agent-frontend-integration.md`.
