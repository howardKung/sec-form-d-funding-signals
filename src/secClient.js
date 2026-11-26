/**
 * SEC EDGAR Fair Access HTTP Client & Rate Limiter.
 *
 * Enforces SEC EDGAR Fair Access compliance:
 * 1. Mandatory descriptive User-Agent header (configurable via SEC_USER_AGENT env var).
 * 2. Strict token-bucket pacing <= 5 req/sec (default 260ms interval = ~3.8 req/sec).
 * 3. Automatic exponential backoff on HTTP 429 / 5xx / transient network errors.
 */

export const DEFAULT_SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ||
  'MultiATSSignalsBot/1.0 (compliance@howardkung-tools.org)';

// Hard floor of 205ms guarantees strictly <= 4.87 req/sec (under SEC 5 req/sec cap)
const CONFIGURED_INTERVAL = Number(process.env.SEC_MIN_INTERVAL_MS);
export const MIN_REQUEST_INTERVAL_MS = Number.isFinite(CONFIGURED_INTERVAL)
  ? Math.max(205, CONFIGURED_INTERVAL)
  : 260;

const EFTS_SEARCH_URL = 'https://efts.sec.gov/LATEST/search-index';
const SEC_ARCHIVES_BASE = 'https://www.sec.gov/Archives/edgar/data';

let nextAllowedTimestamp = 0;
let rateLimitChain = Promise.resolve();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serialized rate-limiter slot ensuring global spacing >= MIN_REQUEST_INTERVAL_MS.
 */
function acquireRateLimitSlot(minIntervalMs = MIN_REQUEST_INTERVAL_MS) {
  const interval = Math.max(205, Number(minIntervalMs) || MIN_REQUEST_INTERVAL_MS);
  const slotPromise = rateLimitChain.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, nextAllowedTimestamp - now);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    nextAllowedTimestamp = Date.now() + interval;
  });
  // Keep chain alive regardless of errors
  rateLimitChain = slotPromise.catch(() => {});
  return slotPromise;
}

/**
 * Normalize XML filename by stripping any SEC XSLT stylesheet folder prefix (e.g. `xslFormDX01/`).
 */
export function normalizeXmlFileName(rawDocName = 'primary_doc.xml') {
  const cleaned = String(rawDocName || 'primary_doc.xml')
    .trim()
    .replace(/^\/+/, '')
    .replace(/^xsl[^/]+\//i, '');
  return cleaned || 'primary_doc.xml';
}

/**
 * Construct canonical raw XML URL on SEC EDGAR Archives.
 */
export function buildRawFormDXmlUrl({ cik, accessionNumber, xmlFileName = 'primary_doc.xml' }) {
  const cikDigits = String(cik || '').replace(/\D/g, '');
  const cikNoZeros = cikDigits.replace(/^0+/, '') || '0';
  const accessionNoHyphens = String(accessionNumber || '').replace(/[^0-9a-zA-Z]/g, '');
  const docName = normalizeXmlFileName(xmlFileName);
  return `${SEC_ARCHIVES_BASE}/${cikNoZeros}/${accessionNoHyphens}/${docName}`;
}

/**
 * Perform a compliant, rate-limited HTTP GET against SEC EDGAR with 429/5xx retries.
 */
export async function secFetch(url, options = {}) {
  const {
    userAgent = DEFAULT_SEC_USER_AGENT,
    accept = '*/*',
    maxRetries = 3,
    timeoutMs = 15000,
    minIntervalMs = MIN_REQUEST_INTERVAL_MS,
  } = options;

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await acquireRateLimitSlot(minIntervalMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          Accept: accept,
          'Accept-Encoding': 'gzip, deflate',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        return response;
      }

      const status = response.status;
      const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

      if (!retryable || attempt === maxRetries) {
        throw new Error(`SEC EDGAR HTTP ${status} for ${url}`);
      }

      const retryAfterHeader = Number(response.headers.get('retry-after'));
      const backoffMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : Math.min(8000, 600 * 2 ** attempt + Math.floor(Math.random() * 250));

      await sleep(backoffMs);
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) {
        break;
      }
      const backoffMs = Math.min(8000, 600 * 2 ** attempt + Math.floor(Math.random() * 250));
      await sleep(backoffMs);
    }
  }

  throw lastError || new Error(`Failed to fetch SEC URL: ${url}`);
}

/**
 * Query SEC EDGAR EFTS full-text search index for Form D (`D` and `D/A`) filings.
 */
export async function fetchEftsFormDPage({
  startDate,
  endDate,
  from = 0,
  searchQuery = '',
  userAgent = DEFAULT_SEC_USER_AGENT,
  minIntervalMs = MIN_REQUEST_INTERVAL_MS,
}) {
  const params = new URLSearchParams({
    forms: 'D',
    dateRange: 'custom',
    startdt: startDate,
    enddt: endDate,
    from: String(Math.max(0, Number(from) || 0)),
  });

  const trimmedQuery = String(searchQuery || '').trim();
  if (trimmedQuery) {
    params.set('q', trimmedQuery);
  }

  const url = `${EFTS_SEARCH_URL}?${params.toString()}`;
  const res = await secFetch(url, {
    userAgent,
    accept: 'application/json',
    minIntervalMs,
  });

  return res.json();
}

/**
 * Fetch raw Form D XML filing string from SEC EDGAR Archives.
 */
export async function fetchFormDXml(url, options = {}) {
  // Normalize in case an XSLT HTML URL was passed
  const cleanUrl = String(url).replace(/\/xsl[^/]+\//i, '/');
  const res = await secFetch(cleanUrl, {
    ...options,
    accept: 'application/xml, text/xml, */*',
  });
  return res.text();
}
