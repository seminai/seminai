import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { SeminaiHttpClient } from '../client/http';
import { SeminaiAuthError, SeminaiHttpError, SeminaiNotFoundError } from '../client/http-errors';

interface RecordedRequest {
  method: string;
  url: string;
  authorization: string | undefined;
  contentType: string | undefined;
  body: string;
}

interface TestServer {
  port: number;
  recorded: RecordedRequest[];
  close(): Promise<void>;
}

function startServer(
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void,
): Promise<TestServer> {
  const recorded: RecordedRequest[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      recorded.push({
        method: req.method ?? '',
        url: req.url ?? '',
        authorization: req.headers.authorization,
        contentType: req.headers['content-type'] as string | undefined,
        body,
      });
      handler(req, res, body);
    });
  });
  return new Promise((resolveStart) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolveStart({
        port: addr.port,
        recorded,
        close: () =>
          new Promise<void>((closeResolve) => {
            server.close(() => closeResolve());
          }),
      });
    });
  });
}

describe('SeminaiHttpClient integration (real HTTP)', () => {
  let testServer: TestServer;
  let client: SeminaiHttpClient;

  afterEach(async () => {
    if (testServer) await testServer.close();
  });

  it('GET sends Bearer auth and parses JSON response from a real server', async () => {
    testServer = await startServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify([{ id: 'c1', name: 'Acme' }]));
    });
    client = new SeminaiHttpClient({
      baseUrl: `http://127.0.0.1:${testServer.port}`,
      token: 'integration-token',
    });
    const actual = await client.get<Array<{ id: string }>>('/companies');
    expect(actual).toEqual([{ id: 'c1', name: 'Acme' }]);
    expect(testServer.recorded).toHaveLength(1);
    expect(testServer.recorded[0].authorization).toBe('Bearer integration-token');
    expect(testServer.recorded[0].method).toBe('GET');
    expect(testServer.recorded[0].url).toBe('/companies');
  });

  it('POST forwards JSON body and Content-Type to a real server', async () => {
    testServer = await startServer((_req, res) => {
      res.statusCode = 201;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'new-id' }));
    });
    client = new SeminaiHttpClient({
      baseUrl: `http://127.0.0.1:${testServer.port}`,
      token: 'integration-token',
    });
    const actual = await client.post<{ id: string }>('/companies', {
      body: { name: 'Acme' },
    });
    expect(actual).toEqual({ id: 'new-id' });
    expect(testServer.recorded[0].method).toBe('POST');
    expect(testServer.recorded[0].contentType).toBe('application/json');
    expect(JSON.parse(testServer.recorded[0].body)).toEqual({ name: 'Acme' });
  });

  it('serialises query string into the actual HTTP request', async () => {
    testServer = await startServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    client = new SeminaiHttpClient({
      baseUrl: `http://127.0.0.1:${testServer.port}`,
      token: 'integration-token',
    });
    await client.get('/bdf/products/search', { query: { q: 'glifo', page: 2 } });
    expect(testServer.recorded[0].url).toBe('/bdf/products/search?q=glifo&page=2');
  });

  it('throws SeminaiAuthError on 401 from a real server', async () => {
    testServer = await startServer((_req, res) => {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'expired' }));
    });
    client = new SeminaiHttpClient({
      baseUrl: `http://127.0.0.1:${testServer.port}`,
      token: 'bad-token',
    });
    await expect(client.get('/companies')).rejects.toBeInstanceOf(SeminaiAuthError);
  });

  it('throws SeminaiNotFoundError on 404 from a real server', async () => {
    testServer = await startServer((_req, res) => {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'missing' }));
    });
    client = new SeminaiHttpClient({
      baseUrl: `http://127.0.0.1:${testServer.port}`,
      token: 'integration-token',
    });
    await expect(client.get('/companies/missing')).rejects.toBeInstanceOf(SeminaiNotFoundError);
  });

  it('preserves status and body for 5xx responses', async () => {
    testServer = await startServer((_req, res) => {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'unavailable', retryAfter: 10 }));
    });
    client = new SeminaiHttpClient({
      baseUrl: `http://127.0.0.1:${testServer.port}`,
      token: 'integration-token',
    });
    const err = await client.get('/jobs').catch((e) => e);
    expect(err).toBeInstanceOf(SeminaiHttpError);
    expect((err as SeminaiHttpError).status).toBe(503);
    expect((err as SeminaiHttpError).body).toEqual({ error: 'unavailable', retryAfter: 10 });
  });
});
