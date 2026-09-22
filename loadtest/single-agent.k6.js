/**
 * k6 Load Test — Single Agent per User
 * Simulates 10 concurrent users each running 1 agent conversation.
 *
 * Run: k6 run load-test/single-agent.k6.js
 * Requires: BASE_URL and AUTH_TOKEN env vars.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const errorRate = new Rate('errors');
const streamLatency = new Trend('stream_latency_ms');

export const options = {
  stages: [
    { duration: '30s', target: 5 }, // ramp up
    { duration: '2m', target: 10 }, // sustained load
    { duration: '30s', target: 0 }, // ramp down
  ],
  thresholds: {
    errors: ['rate<0.1'],
    stream_latency_ms: ['p(95)<30000'],
    http_req_duration: ['p(95)<10000'],
  },
};

export default function () {
  const threadId = `load-test-${__VU}-${Date.now()}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${AUTH_TOKEN}`,
  };

  // Step 1: Send a message to create a new agent thread
  const startTime = Date.now();
  const res = http.post(
    `${BASE_URL}/api/chat/dosage-react`,
    JSON.stringify({
      threadId,
      message: 'Quali sono le mie aziende registrate?',
    }),
    { headers, timeout: '60s' },
  );

  const latency = Date.now() - startTime;
  streamLatency.add(latency);

  const isOk = check(res, {
    'status is 200': (r) => r.status === 200,
    'response has content': (r) => r.body.length > 0,
  });

  errorRate.add(!isOk);

  // Step 2: Follow-up message (multi-turn)
  if (isOk) {
    sleep(1);
    const res2 = http.post(
      `${BASE_URL}/api/chat/dosage-react`,
      JSON.stringify({
        threadId,
        message: 'Mostrami le unità produttive della prima azienda.',
      }),
      { headers, timeout: '60s' },
    );

    check(res2, {
      'follow-up status is 200': (r) => r.status === 200,
    });
  }

  sleep(2);
}
