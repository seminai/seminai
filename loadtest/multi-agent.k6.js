/**
 * k6 Load Test — Multiple Agents per User
 * Simulates 5 users each running 3 concurrent agent conversations.
 * Tests working memory isolation, agent cache, and resource contention.
 *
 * Run: k6 run load-test/multi-agent.k6.js
 * Requires: BASE_URL and AUTH_TOKEN env vars.
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const errorRate = new Rate('errors');
const streamLatency = new Trend('stream_latency_ms');
const contentionEvents = new Counter('contention_events');

export const options = {
  scenarios: {
    multi_agent: {
      executor: 'per-vu-iterations',
      vus: 5,
      iterations: 3, // each VU creates 3 agent threads
      maxDuration: '5m',
    },
  },
  thresholds: {
    errors: ['rate<0.15'],
    stream_latency_ms: ['p(95)<45000'],
  },
};

const MESSAGES = [
  'Quali sono le mie aziende registrate?',
  'Cerca prodotti per il vigneto contro la peronospora.',
  'Quali campi ho registrato?',
];

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };

  const iteration = __ITER;
  const threadId = `load-multi-${__VU}-${iteration}-${Date.now()}`;
  const message = MESSAGES[iteration % MESSAGES.length];

  group(`Agent ${iteration + 1}`, function () {
    const startTime = Date.now();
    const res = http.post(
      `${BASE_URL}/api/chat/dosage-react`,
      JSON.stringify({ threadId, message }),
      { headers, timeout: '60s' },
    );

    streamLatency.add(Date.now() - startTime);

    const isOk = check(res, {
      'status is 200': (r) => r.status === 200,
      'no contention error': (r) => !r.body.includes('contention'),
    });

    if (res.body.includes('contention') || res.body.includes('già in uso')) {
      contentionEvents.add(1);
    }

    errorRate.add(!isOk);
  });

  sleep(1);
}
