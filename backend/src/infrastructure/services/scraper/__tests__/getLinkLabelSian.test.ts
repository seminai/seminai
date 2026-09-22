import { absolutize, classifyHtmlResponse, tryParseHtmlForPdfLink } from '../getLinkLabelSian';
import {
  SianFetchError,
  SianInvalidResponseError,
  SianNotFoundError,
  SianTransientError,
} from '../sian-errors';

describe('tryParseHtmlForPdfLink', () => {
  it('returns the direct .pdf href when present', () => {
    const html = `<a href="/mimfFitoPub/etichetta_11890.pdf">Scarica</a>`;
    expect(tryParseHtmlForPdfLink(html)).toBe('/mimfFitoPub/etichetta_11890.pdf');
  });

  it('returns a /download href when no .pdf is present', () => {
    const html = `<a href="/mimfFitoPub/download?id=42">Scarica file</a>`;
    expect(tryParseHtmlForPdfLink(html)).toBe('/mimfFitoPub/download?id=42');
  });

  it('returns an /etichetta href as last resort', () => {
    const html = `<a href="/mimfFitoPub/etichetta?nreg=12345">Etichetta</a>`;
    expect(tryParseHtmlForPdfLink(html)).toBe('/mimfFitoPub/etichetta?nreg=12345');
  });

  it('prefers the .pdf link when multiple candidates are present', () => {
    const html = `<a href="/download?x=1">Generico</a><a href="/etichetta_15549.pdf">PDF</a>`;
    expect(tryParseHtmlForPdfLink(html)).toBe('/etichetta_15549.pdf');
  });

  it('returns null when no candidate link is present', () => {
    const html = `<html><body>Nessun risultato</body></html>`;
    expect(tryParseHtmlForPdfLink(html)).toBeNull();
  });

  it('returns null for empty/malformed HTML', () => {
    expect(tryParseHtmlForPdfLink('')).toBeNull();
    expect(tryParseHtmlForPdfLink('<html>')).toBeNull();
  });
});

describe('classifyHtmlResponse', () => {
  it('classifies "nessun risultato" as not_found', () => {
    expect(classifyHtmlResponse(`<body>Nessun risultato trovato.</body>`)).toBe('not_found');
  });

  it('classifies "non trovato" as not_found', () => {
    expect(classifyHtmlResponse(`<body>Prodotto non trovato.</body>`)).toBe('not_found');
  });

  it('classifies "no records found" as not_found', () => {
    expect(classifyHtmlResponse(`<p>No records found in our database.</p>`)).toBe('not_found');
  });

  it('classifies "too many requests" as transient', () => {
    expect(classifyHtmlResponse(`<title>429 - Too many requests</title>`)).toBe('transient');
  });

  it('classifies 503 service unavailable as transient', () => {
    expect(classifyHtmlResponse(`<h1>503 Service Temporaneamente non disponibile</h1>`)).toBe(
      'transient',
    );
  });

  it('classifies bad gateway as transient', () => {
    expect(classifyHtmlResponse(`<title>Bad Gateway</title>`)).toBe('transient');
  });

  it('classifies SIAN "Errore di sistema" page as transient (server hiccup)', () => {
    const html = `<div ><h2>Errore</h2></div>
      <strong>Errore di sistema</strong>
      <img src="/mimfFitoPub/images/errore.gif" />`;
    expect(classifyHtmlResponse(html)).toBe('transient');
  });

  it('classifies "errore generico" as transient', () => {
    expect(classifyHtmlResponse(`<p>Si è verificato un errore generico, riprovare.</p>`)).toBe(
      'transient',
    );
  });

  it('classifies generic HTML as invalid_response', () => {
    expect(classifyHtmlResponse(`<html><body>Random HTML content</body></html>`)).toBe(
      'invalid_response',
    );
  });

  it('classifies empty body as invalid_response', () => {
    expect(classifyHtmlResponse(``)).toBe('invalid_response');
  });

  it('prefers not_found over transient when both markers are present', () => {
    // not_found is checked first by design — when SIAN explicitly says
    // "non trovato" we should not retry even if generic transient words appear.
    const html = `<body>Prodotto non trovato. Riprova più tardi se serve.</body>`;
    expect(classifyHtmlResponse(html)).toBe('not_found');
  });
});

describe('absolutize', () => {
  it('keeps absolute URLs unchanged', () => {
    expect(absolutize('https://www.sian.it/foo.pdf', 'https://www.sian.it')).toBe(
      'https://www.sian.it/foo.pdf',
    );
  });

  it('resolves relative paths against the base URL', () => {
    expect(absolutize('/mimfFitoPub/etichetta.pdf', 'https://www.sian.it')).toBe(
      'https://www.sian.it/mimfFitoPub/etichetta.pdf',
    );
  });

  it('resolves query-string only against the base URL path', () => {
    // Browser URL spec: bare query appends to the base's last path segment.
    expect(absolutize('?id=42', 'https://www.sian.it/mimfFitoPub/x')).toBe(
      'https://www.sian.it/mimfFitoPub/x?id=42',
    );
  });

  it('returns the original string when both inputs are invalid', () => {
    // An invalid base URL makes new URL() throw → fallback returns href.
    expect(absolutize('not-a-url', 'also-not-a-url')).toBe('not-a-url');
  });
});

describe('SianFetchError hierarchy', () => {
  it('SianNotFoundError carries reason="not_found" and product info', () => {
    const err = new SianNotFoundError('ZOLVIS', '11890');
    expect(err).toBeInstanceOf(SianFetchError);
    expect(err.reason).toBe('not_found');
    expect(err.productName).toBe('ZOLVIS');
    expect(err.regNumber).toBe('11890');
    expect(err.name).toBe('SianNotFoundError');
  });

  it('SianTransientError carries reason="transient"', () => {
    const err = new SianTransientError('FANTIC', '15549');
    expect(err.reason).toBe('transient');
    expect(err.name).toBe('SianTransientError');
  });

  it('SianInvalidResponseError carries reason="invalid_response"', () => {
    const err = new SianInvalidResponseError('ALIETTE', '13567');
    expect(err.reason).toBe('invalid_response');
    expect(err.name).toBe('SianInvalidResponseError');
  });

  it('instanceof SianFetchError matches all subclasses (for catch sites)', () => {
    const errors: ReadonlyArray<SianFetchError> = [
      new SianNotFoundError('a', '1'),
      new SianTransientError('b', '2'),
      new SianInvalidResponseError('c', '3'),
    ];
    for (const e of errors) {
      expect(e instanceof SianFetchError).toBe(true);
    }
  });

  it('default message embeds reason + product info', () => {
    const err = new SianNotFoundError('ZOLVIS OTTANTA WG', '11890');
    expect(err.message).toContain('not_found');
    expect(err.message).toContain('ZOLVIS OTTANTA WG');
    expect(err.message).toContain('11890');
  });

  it('custom message overrides the default', () => {
    const err = new SianTransientError('X', '1', 'SIAN responded 503');
    expect(err.message).toBe('SIAN responded 503');
  });
});
