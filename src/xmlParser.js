/**
 * Mathematical Zero-PII SEC Form D XML Parser.
 *
 * Enforces a 3-layer Zero-PII isolation architecture:
 * Layer 1 (Raw XML Pre-Purge): Strips `<relatedPersonsList>`, `<signatureBlock>`,
 *   `<salesCompensationList>`, `<street1>`, `<street2>`, `<city>`, `<zipCode>`,
 *   `<issuerPhoneNumber>`, and `<clarificationOfResponse>` BEFORE field extraction.
 * Layer 2 (Strict Corporate Allowlist): Constructs output strictly from allowlisted
 *   corporate, offering, and GTM signal primitives.
 * Layer 3 (Output Sanitizer & Assertion): Scrubs any accidental email/phone patterns
 *   and asserts zero forbidden PII keys or `@` characters exist in the output JSON.
 */

const FORBIDDEN_KEY_SUBSTRINGS = [
  'phone',
  'street',
  'relatedperson',
  'signer',
  'signature',
  'email',
  'zipcode',
  'postal',
  'firstname',
  'lastname',
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const US_PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;

/**
 * Decode standard XML entities into clean UTF-8 text.
 */
export function decodeXmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .trim();
}

/**
 * Extract first matching XML tag inner text (supports optional XML namespace prefix).
 */
function extractTag(xmlBlock, tagName) {
  if (!xmlBlock) return null;
  const re = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${tagName}>`,
    'i'
  );
  const match = xmlBlock.match(re);
  return match ? match[1].trim() : null;
}

/**
 * Extract all matching XML tag inner values as decoded strings.
 */
function extractAllTags(xmlBlock, tagName) {
  if (!xmlBlock) return [];
  const re = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${tagName}>`,
    'gi'
  );
  const results = [];
  for (const match of xmlBlock.matchAll(re)) {
    const val = decodeXmlEntities(match[1]);
    if (val) results.push(val);
  }
  return results;
}

/**
 * Layer 1: Purge all PII-bearing XML blocks prior to corporate field parsing.
 */
export function purgePiiFromRawXml(rawXml) {
  const source = String(rawXml || '');

  // Check boolean existence of broker/recipient entry BEFORE purging salesCompensationList
  const salesCompBlock = extractTag(source, 'salesCompensationList') || '';
  const hasSalesRecipient = /<(?:[a-zA-Z0-9_-]+:)?recipient[\s>]/i.test(salesCompBlock);

  const sanitizedXml = source
    .replace(/<(?:[a-zA-Z0-9_-]+:)?relatedPersonsList(?:\s[^>]*)?>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?relatedPersonsList>/gi, '')
    .replace(/<(?:[a-zA-Z0-9_-]+:)?signatureBlock(?:\s[^>]*)?>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?signatureBlock>/gi, '')
    .replace(/<(?:[a-zA-Z0-9_-]+:)?salesCompensationList(?:\s[^>]*)?>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?salesCompensationList>/gi, '')
    .replace(/<(?:[a-zA-Z0-9_-]+:)?street1(?:\s[^>]*)?>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?street1>/gi, '')
    .replace(/<(?:[a-zA-Z0-9_-]+:)?street2(?:\s[^>]*)?>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?street2>/gi, '')
    .replace(/<(?:[a-zA-Z0-9_-]+:)?city(?:\s[^>]*)?>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?city>/gi, '')
    .replace(/<(?:[a-zA-Z0-9_-]+:)?zipCode(?:\s[^>]*)?>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?zipCode>/gi, '')
    .replace(/<(?:[a-zA-Z0-9_-]+:)?issuerPhoneNumber(?:\s[^>]*)?>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?issuerPhoneNumber>/gi, '')
    .replace(/<(?:[a-zA-Z0-9_-]+:)?clarificationOfResponse(?:\s[^>]*)?>[\s\S]*?<\/(?:[a-zA-Z0-9_-]+:)?clarificationOfResponse>/gi, '');

  return { sanitizedXml, hasSalesRecipient };
}

function parseUsdNumber(rawVal, fallback = 0) {
  if (rawVal === null || rawVal === undefined) return fallback;
  const cleaned = String(rawVal).replace(/[$,\s]/g, '').trim();
  if (!cleaned || /^indefinite$/i.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

function parseBool(rawVal) {
  return /^true$|^1$|^yes$/i.test(String(rawVal || '').trim());
}

/**
 * Infer startup venture stage from round size and incorporation age.
 */
export function inferFundingStage({
  totalOfferingAmountUsd,
  totalAmountSoldUsd,
  yearOfIncorporation,
  isOverFiveYears,
  referenceDate = new Date(),
}) {
  const effectiveRoundUsd = Math.max(
    Number(totalOfferingAmountUsd) || 0,
    Number(totalAmountSoldUsd) || 0
  );

  const currentYear = referenceDate.getUTCFullYear();
  const ageYears = Number.isInteger(yearOfIncorporation)
    ? Math.max(0, currentYear - yearOfIncorporation)
    : isOverFiveYears
      ? 6
      : null;

  if (
    effectiveRoundUsd >= 25_000_000 ||
    (effectiveRoundUsd >= 15_000_000 && ageYears !== null && ageYears >= 5)
  ) {
    return 'Growth / Late';
  }

  if (
    effectiveRoundUsd >= 4_000_000 ||
    (effectiveRoundUsd >= 2_500_000 && ageYears !== null && ageYears >= 3)
  ) {
    return 'Series A-B';
  }

  return 'Pre-Seed / Seed';
}

function sanitizeCorporateText(val) {
  if (val === null || val === undefined) return null;
  const cleaned = String(val)
    .replace(EMAIL_REGEX, '[REDACTED]')
    .replace(US_PHONE_REGEX, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

/**
 * Layer 3: Recursive Zero-PII assertion on final output object.
 * Throws immediately if any forbidden PII key or email (`@`) leaks into the output.
 */
export function assertZeroPiiRecord(record) {
  function walk(node, path = 'root') {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      if (node.includes('@')) {
        throw new Error(`Zero-PII violation: '@' detected at ${path}`);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, `${path}[${idx}]`));
      return;
    }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        const lowerKey = key.toLowerCase();
        for (const forbidden of FORBIDDEN_KEY_SUBSTRINGS) {
          if (lowerKey.includes(forbidden)) {
            throw new Error(`Zero-PII violation: forbidden key "${key}" at ${path}`);
          }
        }
        walk(value, `${path}.${key}`);
      }
    }
  }

  walk(record);
  return record;
}

/**
 * Layer 2: Parse Form D XML into strict allowlisted corporate funding signal schema.
 */
export function parseFormDXml(rawXml, metadata = {}) {
  const {
    filingDate = null,
    accessionNumber = null,
    secFilingUrl = null,
    eftsFormType = null,
    referenceDate = new Date(),
  } = metadata;

  const { sanitizedXml, hasSalesRecipient } = purgePiiFromRawXml(rawXml);

  if (!/<(?:[a-zA-Z0-9_-]+:)?edgarSubmission/i.test(sanitizedXml)) {
    throw new Error('Invalid or non-Form-D XML payload (missing <edgarSubmission>)');
  }

  const primaryIssuerBlock = extractTag(sanitizedXml, 'primaryIssuer') || '';
  const issuerAddressBlock = extractTag(primaryIssuerBlock, 'issuerAddress') || '';
  const yearOfIncBlock = extractTag(primaryIssuerBlock, 'yearOfInc') || '';
  const offeringDataBlock = extractTag(sanitizedXml, 'offeringData') || '';
  const industryGroupBlock = extractTag(offeringDataBlock, 'industryGroup') || '';
  const investmentFundInfoBlock = extractTag(industryGroupBlock, 'investmentFundInfo') || '';
  const exemptionsBlock = extractTag(offeringDataBlock, 'federalExemptionsExclusions') || '';
  const typeOfFilingBlock = extractTag(offeringDataBlock, 'typeOfFiling') || '';
  const newOrAmendmentBlock = extractTag(typeOfFilingBlock, 'newOrAmendment') || '';
  const dateOfFirstSaleBlock = extractTag(typeOfFilingBlock, 'dateOfFirstSale') || '';
  const securitiesTypesBlock = extractTag(offeringDataBlock, 'typesOfSecuritiesOffered') || '';
  const offeringAmountsBlock = extractTag(offeringDataBlock, 'offeringSalesAmounts') || '';
  const investorsBlock = extractTag(offeringDataBlock, 'investors') || '';
  const commissionsBlock = extractTag(offeringDataBlock, 'salesCommissionsFindersFees') || '';
  const salesCommissionsBlock = extractTag(commissionsBlock, 'salesCommissions') || '';
  const findersFeesBlock = extractTag(commissionsBlock, 'findersFees') || '';

  // Corporate identity (strictly corporate facts only)
  const rawCik = decodeXmlEntities(extractTag(primaryIssuerBlock, 'cik') || metadata.cik || '');
  const cikDigits = rawCik.replace(/\D/g, '');
  const cik = cikDigits ? cikDigits.padStart(10, '0') : null;

  const companyName = sanitizeCorporateText(
    decodeXmlEntities(extractTag(primaryIssuerBlock, 'entityName') || '')
  );
  const entityType = sanitizeCorporateText(
    decodeXmlEntities(extractTag(primaryIssuerBlock, 'entityType') || '')
  );
  const jurisdictionOfInc = sanitizeCorporateText(
    decodeXmlEntities(extractTag(primaryIssuerBlock, 'jurisdictionOfInc') || '')
  );
  const issuerStateOrCountry = sanitizeCorporateText(
    decodeXmlEntities(extractTag(issuerAddressBlock, 'stateOrCountry') || '')
  );

  const yearValRaw = decodeXmlEntities(extractTag(yearOfIncBlock, 'value') || '');
  const parsedYear = /^\d{4}$/.test(yearValRaw) ? Number(yearValRaw) : null;
  const isOverFiveYears = parseBool(extractTag(yearOfIncBlock, 'overFiveYears'));

  // Industry & Pooled Fund classification
  const industryGroupType = sanitizeCorporateText(
    decodeXmlEntities(extractTag(industryGroupBlock, 'industryGroupType') || '')
  );
  const investmentFundType = sanitizeCorporateText(
    decodeXmlEntities(extractTag(investmentFundInfoBlock, 'investmentFundType') || '')
  );
  const is40Act = parseBool(extractTag(investmentFundInfoBlock, 'is40Act'));
  const isPooledSecurityType = parseBool(
    extractTag(securitiesTypesBlock, 'isPooledInvestmentFundType')
  );

  const federalExemptions = extractAllTags(exemptionsBlock, 'item').map((item) =>
    sanitizeCorporateText(item)
  ).filter(Boolean);

  const has3cExemption = federalExemptions.some((ex) => /^3c\b|^3c\./i.test(ex));
  const isPooledInvestmentFund =
    /^pooled investment fund$/i.test(industryGroupType || '') ||
    Boolean(investmentFundType) ||
    isPooledSecurityType ||
    is40Act ||
    has3cExemption;

  // Filing type & dates
  const xmlSubmissionType = decodeXmlEntities(extractTag(sanitizedXml, 'submissionType') || '');
  const xmlIsAmendment = parseBool(extractTag(newOrAmendmentBlock, 'isAmendment'));
  const rawForm = (eftsFormType || xmlSubmissionType || 'D').toUpperCase();
  const isAmendment = rawForm === 'D/A' || xmlIsAmendment;
  const formType = isAmendment ? 'D/A' : 'D';

  const rawFirstSale = decodeXmlEntities(extractTag(dateOfFirstSaleBlock, 'value') || '');
  const dateOfFirstSale = /^\d{4}-\d{2}-\d{2}$/.test(rawFirstSale) ? rawFirstSale : null;

  // Offering & funding metrics
  const rawTotalOffering = decodeXmlEntities(
    extractTag(offeringAmountsBlock, 'totalOfferingAmount') || ''
  );
  const rawTotalSold = decodeXmlEntities(
    extractTag(offeringAmountsBlock, 'totalAmountSold') || ''
  );
  const rawTotalRemaining = decodeXmlEntities(
    extractTag(offeringAmountsBlock, 'totalRemaining') || ''
  );
  const isIndefiniteOffering =
    /^indefinite$/i.test(rawTotalOffering) || /^indefinite$/i.test(rawTotalRemaining);

  const totalOfferingAmountUsd = parseUsdNumber(rawTotalOffering, null);
  const totalAmountSoldUsd = parseUsdNumber(rawTotalSold, 0) ?? 0;
  const totalRemainingUsd = parseUsdNumber(rawTotalRemaining, null);
  const minimumInvestmentAcceptedUsd =
    parseUsdNumber(extractTag(offeringDataBlock, 'minimumInvestmentAccepted'), 0) ?? 0;
  const totalNumberAlreadyInvested =
    parseUsdNumber(extractTag(investorsBlock, 'totalNumberAlreadyInvested'), 0) ?? 0;
  const hasNonAccreditedInvestors = parseBool(
    extractTag(investorsBlock, 'hasNonAccreditedInvestors')
  );

  // Sales compensation signal
  const salesCommissionsUsd =
    parseUsdNumber(extractTag(salesCommissionsBlock, 'dollarAmount'), 0) ?? 0;
  const findersFeesUsd =
    parseUsdNumber(extractTag(findersFeesBlock, 'dollarAmount'), 0) ?? 0;
  const hasSalesCompensation =
    salesCommissionsUsd > 0 || findersFeesUsd > 0 || hasSalesRecipient;

  // Fresh first sale signal (<= 30 days relative to referenceDate)
  let isFreshFirstSale = false;
  if (dateOfFirstSale) {
    const saleMs = Date.parse(`${dateOfFirstSale}T00:00:00Z`);
    if (Number.isFinite(saleMs)) {
      const diffDays = (referenceDate.getTime() - saleMs) / 86_400_000;
      isFreshFirstSale = diffDays >= -2 && diffDays <= 30;
    }
  }

  const inferredStage = inferFundingStage({
    totalOfferingAmountUsd,
    totalAmountSoldUsd,
    yearOfIncorporation: parsedYear,
    isOverFiveYears,
    referenceDate,
  });

  // Strict allowlist construction — NO zip, NO city, NO street, NO phone, NO individuals
  const record = {
    companyName,
    cik,
    entityType,
    yearOfIncorporation: parsedYear,
    jurisdictionOfInc,
    issuerStateOrCountry,
    industryGroupType,
    investmentFundType,
    formType,
    isAmendment,
    filingDate: filingDate || null,
    dateOfFirstSale,
    accessionNumber: accessionNumber || null,
    secFilingUrl: secFilingUrl || null,
    fundingMetrics: {
      totalOfferingAmountUsd,
      totalAmountSoldUsd,
      totalRemainingUsd,
      minimumInvestmentAcceptedUsd,
      totalNumberAlreadyInvested,
      hasNonAccreditedInvestors,
      isIndefiniteOffering,
    },
    gtmSignals: {
      inferredStage,
      isFreshFirstSale,
      hasSalesCompensation,
      federalExemptions,
    },
  };

  assertZeroPiiRecord(record);

  return {
    record,
    isPooledInvestmentFund,
  };
}
