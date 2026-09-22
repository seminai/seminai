# Dosage ReAct Agent - Frontend Integration Guide — Part 6

[Back to the guide index](../DOSAGE_REACT_AGENT_FRONTEND_INTEGRATION.md)

```typescript
// Inside submitQuestionnaire callback:
const formattedMessage = `Risposte al questionario:
- Unita produttive: Vigneto Nord (12.5 ha), Frutteto A (8.0 ha)
- Tempistica: Prossime 2 settimane
- Obiettivo: Svuotare il magazzino completamente
- Note: Preferisco iniziare col Sercadis`;

await sendMessage(formattedMessage); // Uses existing POST /stream
```

The agent receives this as a normal `HumanMessage` and proceeds autonomously with the full planning workflow.

---

## 8. Treatment Plan UI

When the agent generates a treatment plan, it emits planning events that you can use to build a rich plan preview.

### Plan Data Structure

```typescript
interface TreatmentPlan {
  id: string;
  status: 'draft' | 'presented' | 'approved' | 'modified' | 'executing' | 'completed' | 'rejected';
  steps: PlanStep[];
  compliance: {
    overallStatus: 'conforme' | 'non_conforme' | 'da_verificare';
    conformSteps: number;
    totalSteps: number;
    warnings: string[];
  };
  stockSummary: {
    hasIssues: boolean;
    products: Array<{
      name: string;
      required: number;
      available: number;
      deficit: number;
      unit: string;
    }>;
  };
}

interface PlanStep {
  id: string;
  sequence: number; // 1-based
  status: 'pending' | 'approved' | 'modified' | 'rejected' | 'executed';
  treatment: {
    productName: string;
    activeIngredient: string;
    adversity: string;
    dosePerHa: number;
    doseUnit: string;
    totalQuantity: number;
    applicationDate: string;
    safetyInterval?: number;
  };
  compliance: {
    status: 'conforme' | 'non_conforme' | 'da_verificare';
    violations: Array<{ message: string; severity: 'ERROR' | 'WARNING' | 'INFO' }>;
  };
  alternatives?: Array<{ productName: string; reason: string; dosePerHa: number }>;
}
```

### Plan Table Component

```tsx
function TreatmentPlanTable({
  plan,
  onModifyStep,
}: {
  plan: TreatmentPlan;
  onModifyStep: (sequence: number, changes: string) => void;
}) {
  const complianceIcon = (status: string) => {
    switch (status) {
      case 'conforme':
        return '✅';
      case 'non_conforme':
        return '❌';
      case 'da_verificare':
        return '⚠️';
      default:
        return '❓';
    }
  };

  const stepStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'gray',
      approved: 'green',
      modified: 'yellow',
      rejected: 'red',
      executed: 'blue',
    };
    return <span className={`badge badge-${colors[status]}`}>{status}</span>;
  };

  return (
    <div className="treatment-plan">
      <div className="plan-header">
        <h3>Piano di Trattamento</h3>
        <span className={`plan-status plan-status-${plan.status}`}>
          {plan.status.toUpperCase()}
        </span>
      </div>

      {/* Compliance Summary */}
      <div className="compliance-summary">
        {complianceIcon(plan.compliance.overallStatus)}
        <span>
          {plan.compliance.conformSteps}/{plan.compliance.totalSteps} passi conformi
        </span>
        {plan.compliance.warnings.map((w, i) => (
          <div key={i} className="compliance-warning">
            ⚠️ {w}
          </div>
        ))}
      </div>

      {/* Plan Table */}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Data</th>
            <th>Prodotto</th>
            <th>P.A.</th>
            <th>Dose/ha</th>
            <th>Avversita</th>
            <th>Conformita</th>
            <th>Stato</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {plan.steps.map((step) => (
            <tr key={step.id} className={`step-row step-${step.status}`}>
              <td>{step.sequence}</td>
              <td>{new Date(step.treatment.applicationDate).toLocaleDateString('it-IT')}</td>
              <td>{step.treatment.productName}</td>
              <td>{step.treatment.activeIngredient}</td>
              <td>
                {step.treatment.dosePerHa} {step.treatment.doseUnit}
              </td>
              <td>{step.treatment.adversity}</td>
              <td>
                {complianceIcon(step.compliance.status)}
                {step.compliance.violations.length > 0 && (
                  <Tooltip content={step.compliance.violations.map((v) => v.message).join('\n')}>
                    <span className="violation-count">({step.compliance.violations.length})</span>
                  </Tooltip>
                )}
              </td>
              <td>{stepStatusBadge(step.status)}</td>
              <td>
                {step.status !== 'executed' && step.status !== 'rejected' && (
                  <button
                    onClick={() => {
                      const changes = prompt('Cosa vuoi modificare? (es: dose 1.5 kg/ha)');
                      if (changes) onModifyStep(step.sequence, changes);
                    }}
                  >
                    Modifica
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Stock Summary */}
      {plan.stockSummary.hasIssues && (
        <div className="stock-warning">
          <h4>⚠️ Problemi di Stock</h4>
          {plan.stockSummary.products
            .filter((p) => p.deficit > 0)
            .map((p, i) => (
              <div key={i} className="stock-issue">
                <strong>{p.name}</strong>: necessari {p.required} {p.unit}, disponibili{' '}
                {p.available} {p.unit}
                (deficit: {p.deficit} {p.unit})
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
```

---

## 9. Typical User Flows

### Flow 1: Simple Question

```
User: "Il Captano e' revocato?"
  --> token events (streaming response)
  --> tool_call: check_product_revoked
  --> token events (agent explains result)
  --> complete event
```

**Frontend**: show streaming text + tool activity indicator.

### Flow 2: Treatment Planning (Full Workflow)

```
User: "Pianifica i trattamenti per il vigneto contro la peronospora"

Step 1 - Context Discovery:
  --> tool_call: list_user_companies
  --> tool_call: list_production_units
  --> tool_call: list_company_products
  --> token: "Ho trovato la tua azienda con 3 vigneti..."

Step 2 - Analysis:
  --> tool_call: search_products
  --> tool_call: calculate_dosage
  --> tool_call: validate_compliance
  --> tool_call: calculate_stock_balance

Step 3 - Plan Generation:
  --> tool_call: generate_treatment_plan
  --> plan_step_generated (x N steps)
  --> plan_presented
  --> token: "Ecco il piano proposto..."
  --> complete

Step 4 - User modifies:
User: "Cambia il passo 2 a 1.5 kg/ha"
  --> tool_call: modify_plan_step
  --> plan_step_modified
  --> token: "Ho modificato il passo 2..."
  --> complete

Step 5 - User approves:
User: "Approva ed esegui il piano"
  --> tool_call: execute_treatment_plan
  --> requires_approval (STREAM PAUSES)
  --> Frontend shows ApprovalDialog
  --> User clicks "Approva"
  --> POST /approve
  --> plan_executing
  --> plan_step_executed (x N)
  --> token: "Piano eseguito: creati 5 job..."
  --> complete (with cost info)
```

### Flow 3: Quick Compliance Check
