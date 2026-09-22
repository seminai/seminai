import type { Server as SocketServer, Socket } from 'socket.io';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import type { ComplianceStatus } from '../type/plan';

/**
 * Payload for a direct plan step edit from the frontend.
 */
interface PlanStepEditPayload {
  readonly threadId: string;
  readonly stepSequence: number;
  readonly modifications: {
    readonly productName?: string;
    readonly activeIngredient?: string;
    readonly dosePerHa?: number;
    readonly doseUnit?: string;
    readonly applicationDate?: string;
    readonly adversity?: string;
  };
}

/**
 * Registers Socket.IO listener for direct plan step edits.
 * This bypasses the LLM reasoning loop and modifies the plan directly in working memory,
 * then broadcasts the updated plan to all clients in the thread room.
 */
export function registerPlanEditHandler(io: SocketServer, socket: Socket): void {
  socket.on('user:plan_step_edit', (payload: PlanStepEditPayload) => {
    const { threadId, stepSequence, modifications } = payload;
    if (!threadId || !stepSequence) return;

    if (!hasWorkingMemoryData(threadId, 'activePlan')) {
      socket.emit('agent:plan_edit_error', {
        error: 'Nessun piano attivo. Genera prima un piano di trattamento.',
        timestamp: Date.now(),
      });
      return;
    }

    const wm = getWorkingMemory(threadId);
    const plan = wm.activePlan!;
    const step = plan.steps.find((s) => s.sequence === stepSequence);
    if (!step) {
      socket.emit('agent:plan_edit_error', {
        error: `Passo ${stepSequence} non trovato nel piano.`,
        timestamp: Date.now(),
      });
      return;
    }

    // Apply modifications
    if (modifications.productName !== undefined)
      step.treatment.productName = modifications.productName;
    if (modifications.activeIngredient !== undefined)
      step.treatment.activeIngredient = modifications.activeIngredient;
    if (modifications.dosePerHa !== undefined) {
      step.treatment.dosePerHa = modifications.dosePerHa;
      const target = plan.targets[0];
      if (target?.areaHa) {
        step.treatment.totalQuantity = modifications.dosePerHa * target.areaHa;
      }
    }
    if (modifications.doseUnit !== undefined) step.treatment.doseUnit = modifications.doseUnit;
    if (modifications.applicationDate !== undefined)
      step.treatment.applicationDate = modifications.applicationDate;
    if (modifications.adversity !== undefined) step.treatment.adversity = modifications.adversity;

    // Mark as modified, reset compliance
    step.status = 'modified';
    step.compliance = {
      status: 'da_verificare' as ComplianceStatus,
      violations: [
        { message: 'Modificato via UI. Ri-validazione consigliata.', severity: 'WARNING' },
      ],
    };
    plan.status = 'modified';
    plan.metadata.updatedAt = new Date().toISOString();

    // Recalculate overall compliance
    const conformSteps = plan.steps.filter((s) => s.compliance.status === 'conforme').length;
    const nonConformSteps = plan.steps.filter((s) => s.compliance.status === 'non_conforme').length;
    plan.compliance = {
      overallStatus:
        nonConformSteps > 0
          ? 'non_conforme'
          : plan.steps.some((s) => s.compliance.status === 'da_verificare')
            ? 'da_verificare'
            : 'conforme',
      totalSteps: plan.steps.length,
      conformSteps,
      nonConformSteps,
      warnings: plan.steps
        .flatMap((s) => s.compliance.violations)
        .filter((v) => v.severity === 'WARNING')
        .map((v) => v.message),
    };

    updateWorkingMemory(threadId, { activePlan: plan });

    // Broadcast the updated plan to all clients in the thread room
    io.to(`chat:${threadId}`).emit('agent:plan_updated', {
      planId: plan.id,
      steps: plan.steps.map((s) => ({
        sequence: s.sequence,
        productName: s.treatment.productName,
        dosePerHa: s.treatment.dosePerHa,
        doseUnit: s.treatment.doseUnit,
        applicationDate: s.treatment.applicationDate,
        adversity: s.treatment.adversity,
        status: s.status,
        complianceStatus: s.compliance.status,
      })),
      overallCompliance: plan.compliance.overallStatus,
      timestamp: Date.now(),
    });
  });
}
