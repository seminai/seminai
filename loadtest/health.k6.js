import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, { 'health succeeds': (res) => res.status === 200 });
  const config = http.get(`${BASE_URL}/config/public`);
  check(config, { 'public config succeeds': (res) => res.status === 200 });
}
