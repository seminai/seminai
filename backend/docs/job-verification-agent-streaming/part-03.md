# Job Verification Agent - Live Streaming Guide — Part 3

[Back to the guide index](../JOB_VERIFICATION_AGENT_STREAMING.md)

```tsx
import { motion, AnimatePresence } from 'framer-motion';

function ThinkingPanel({ steps, isLoading }: { steps: ThinkingStep[]; isLoading: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
      <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
        {isLoading && <span className="animate-pulse">🧠</span>}
        Pensiero dell'agente
      </h3>

      <AnimatePresence>
        {steps.map((step) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`text-sm mb-2 p-2 rounded ${getStepStyle(step.type)}`}
          >
            <div className="flex items-start gap-2">
              <span>{getStepIcon(step.type)}</span>
              <div className="flex-1">
                <p className="text-gray-700">{step.message}</p>
                {step.toolName && (
                  <code className="text-xs bg-gray-200 px-1 rounded">{step.toolName}</code>
                )}
              </div>
              <span className="text-xs text-gray-400">{step.timestamp.toLocaleTimeString()}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {isLoading && steps.length === 0 && (
        <div className="flex items-center gap-2 text-gray-500">
          <span className="animate-spin">⏳</span>
          Inizializzazione...
        </div>
      )}
    </div>
  );
}

function getStepIcon(type: ThinkingStep['type']): string {
  switch (type) {
    case 'thinking':
      return '💭';
    case 'tool_start':
      return '🔧';
    case 'tool_result':
      return '✅';
    case 'data_inspection':
      return '🔍';
    case 'task_progress':
      return '📋';
    default:
      return '•';
  }
}

function getStepStyle(type: ThinkingStep['type']): string {
  switch (type) {
    case 'thinking':
      return 'bg-blue-50 border-l-2 border-blue-300';
    case 'tool_start':
      return 'bg-yellow-50 border-l-2 border-yellow-300';
    case 'tool_result':
      return 'bg-green-50 border-l-2 border-green-300';
    case 'data_inspection':
      return 'bg-purple-50 border-l-2 border-purple-300';
    case 'task_progress':
      return 'bg-gray-100 border-l-2 border-gray-300';
    default:
      return 'bg-gray-50';
  }
}
```

---

## Componente Task Progress

```tsx
function TaskProgress({
  tasks,
  currentTaskId,
}: {
  tasks: AgentTask[];
  currentTaskId: string | null;
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-gray-600 mb-3">Piano di lavoro</h3>

      <div className="space-y-2">
        {tasks.map((task, index) => (
          <div
            key={task.id}
            className={`flex items-center gap-3 p-2 rounded ${
              task.id === currentTaskId ? 'bg-blue-50 border border-blue-200' : ''
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                task.status === 'completed'
                  ? 'bg-green-500 text-white'
                  : task.status === 'in_progress'
                    ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-gray-200 text-gray-600'
              }`}
            >
              {task.status === 'completed'
                ? '✓'
                : task.status === 'in_progress'
                  ? '...'
                  : index + 1}
            </div>

            <span
              className={`text-sm ${
                task.status === 'completed'
                  ? 'text-gray-500 line-through'
                  : task.status === 'in_progress'
                    ? 'text-blue-700 font-medium'
                    : 'text-gray-700'
              }`}
            >
              {task.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Esempio Completo
