/**
 * End-to-End & Security Audit Test Suite for `sec-form-d-funding-signals`.
 *
 * Validates:
 * 1. Apify Store `.actor/` schemas (`actor.json`, `input_schema.json`, `output_schema.json`, `dataset_schema.json`).
 * 2. Adversarial PII-laden XML torture test (proves mathematical Zero-PII isolation).
 * 3. Live US SEC EDGAR E2E extraction (12 real newly funded operating startups, pooled-fund exclusion, <= 5 req/s rate compliance, strict Zero-PII JSON scan).
 * 4. Full Actor (`src/main.js`) subprocess E2E: Zero-Charge Protection (`chargedEvents === 0` on empty query) + live dataset output verification.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { parseFormDXml, assertZeroPiiRecord } from '../src/xmlParser.js';
import { collectStartupFundingSignals, matchesIndustryFilter } from '../src/collector.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function scanJsonForForbiddenPii(records) {
  const forbiddenKeys = [
    'phone',
    'street',
    'relatedperson',
    'signer',
    'signature',
    'zipcode',
    'email',
    'firstname',
    'lastname',
  ];

  for (const rec of records) {
    assertZeroPiiRecord(rec);
    const jsonStr = JSON.stringify(rec);
    assert.equal(
      jsonStr.includes('@'),
      false,
      `Output JSON must NEVER contain '@' email character: ${jsonStr}`
    );

    const keyMatches = [...jsonStr.matchAll(/"([^"]+)":/g)].map((m) => m[1].toLowerCase());
    for (const k of keyMatches) {
      for (const bad of forbiddenKeys) {
        assert.equal(
          k.includes(bad),
          false,
          `Forbidden PII key "${k}" found in output record`
        );
      }
    }
  }
}

async function testActorSchemas() {
  console.log('1️⃣  Validating .actor/ schemas & Dockerfile...');

  const actorJson = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, '.actor/actor.json'), 'utf8')
  );
  assert.equal(actorJson.actorSpecification, 1);
  assert.equal(actorJson.input, './input_schema.json');
  assert.equal(actorJson.output, './output_schema.json');
  assert.equal(actorJson.storages?.dataset, './dataset_schema.json');
  assert.equal(actorJson.dockerfile, '../Dockerfile');

  const outputSchema = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, '.actor/output_schema.json'), 'utf8')
  );
  assert.equal(outputSchema.actorOutputSchemaVersion, 1);
  assert.equal(
    outputSchema.properties?.results?.template,
    '{{links.apiDefaultDatasetUrl}}/items?view=overview'
  );

  const inputSchema = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, '.actor/input_schema.json'), 'utf8')
  );
  const expectedProps = [
    'daysBack',
    'maxResults',
    'minOfferingAmountUsd',
    'minAmountSoldUsd',
    'excludePooledInvestmentFunds',
    'industries',
    'states',
    'includeAmendments',
    'searchQuery',
  ];
  for (const prop of expectedProps) {
    assert.ok(inputSchema.properties[prop], `Missing input property: ${prop}`);
  }
  assert.equal(inputSchema.properties.maxResults.default, 25);
  assert.equal(inputSchema.properties.maxResults.prefill, 15);
  assert.equal(inputSchema.properties.excludePooledInvestmentFunds.default, true);

  const datasetSchema = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, '.actor/dataset_schema.json'), 'utf8')
  );
  assert.ok(datasetSchema.views?.overview, 'Missing dataset overview view');

  const dockerfile = fs.readFileSync(path.join(ROOT_DIR, 'Dockerfile'), 'utf8');
  assert.ok(dockerfile.includes('FROM apify/actor-node:22'));

  console.log('   ✅ .actor/ schemas & Dockerfile passed 100%!\n');
}

async function testAdversarialZeroPiiXmlParser() {
  console.log('2️⃣  Running Adversarial Zero-PII XML Torture Test...');

  const toxicXml = `<?xml version="1.0"?>
  <edgarSubmission>
    <submissionType>D</submissionType>
    <primaryIssuer>
      <cik>0001999888</cik>
      <entityName>HyperScale AI Corp ceo@hyperscale.io 415-555-0199</entityName>
      <issuerAddress>
        <street1>742 Evergreen Terrace Apt 4B</street1>
        <street2>Private Founder Residence</street2>
        <city>SAN FRANCISCO</city>
        <stateOrCountry>CA</stateOrCountry>
        <zipCode>94107</zipCode>
      </issuerAddress>
      <issuerPhoneNumber>(415) 555-0199</issuerPhoneNumber>
      <jurisdictionOfInc>DELAWARE</jurisdictionOfInc>
      <entityType>Corporation</entityType>
      <yearOfInc>
        <withinFiveYears>true</withinFiveYears>
        <value>2025</value>
      </yearOfInc>
    </primaryIssuer>
    <relatedPersonsList>
      <relatedPersonInfo>
        <relatedPersonName>
          <firstName>Jane</firstName>
          <lastName>FounderSecretName</lastName>
        </relatedPersonName>
        <relatedPersonAddress>
          <street1>123 Home Lane</street1>
          <city>Palo Alto</city>
          <stateOrCountry>CA</stateOrCountry>
          <zipCode>94301</zipCode>
        </relatedPersonAddress>
      </relatedPersonInfo>
    </relatedPersonsList>
    <offeringData>
      <industryGroup>
        <industryGroupType>Other Technology</industryGroupType>
      </industryGroup>
      <federalExemptionsExclusions>
        <item>06c</item>
      </federalExemptionsExclusions>
      <typeOfFiling>
        <newOrAmendment><isAmendment>false</isAmendment></newOrAmendment>
        <dateOfFirstSale><value>2026-11-20</value></dateOfFirstSale>
      </typeOfFiling>
      <minimumInvestmentAccepted>25000</minimumInvestmentAccepted>
      <salesCompensationList>
        <recipient>
          <recipientName>John BrokerPerson</recipientName>
        </recipient>
      </salesCompensationList>
      <offeringSalesAmounts>
        <totalOfferingAmount>8000000</totalOfferingAmount>
        <totalAmountSold>6500000</totalAmountSold>
        <totalRemaining>1500000</totalRemaining>
        <clarificationOfResponse>Contact secret_cfo@hyperscale.io for details</clarificationOfResponse>
      </offeringSalesAmounts>
      <investors>
        <hasNonAccreditedInvestors>false</hasNonAccreditedInvestors>
        <totalNumberAlreadyInvested>14</totalNumberAlreadyInvested>
      </investors>
      <salesCommissionsFindersFees>
        <salesCommissions><dollarAmount>120000</dollarAmount></salesCommissions>
        <findersFees><dollarAmount>0</dollarAmount></findersFees>
      </salesCommissionsFindersFees>
      <signatureBlock>
        <signature>
          <issuerName>HyperScale AI Corp</issuerName>
          <signatureName>Jane FounderSecretName</signatureName>
          <nameOfSigner>Jane FounderSecretName</nameOfSigner>
          <signatureTitle>Chief Executive Officer</signatureTitle>
          <signatureDate>2026-11-25</signatureDate>
        </signature>
      </signatureBlock>
    </offeringData>
  </edgarSubmission>`;

  const { record, isPooledInvestmentFund } = parseFormDXml(toxicXml, {
    filingDate: '2026-11-25',
    accessionNumber: '0001999888-26-000001',
    secFilingUrl: 'https://www.sec.gov/Archives/edgar/data/1999888/000199988826000001/primary_doc.xml',
    referenceDate: new Date('2026-11-26T00:00:00Z'),
  });

  assert.equal(isPooledInvestmentFund, false);
  assert.equal(record.issuerStateOrCountry, 'CA');
  assert.equal(record.gtmSignals.inferredStage, 'Series A-B');
  assert.equal(record.gtmSignals.isFreshFirstSale, true);
  assert.equal(record.gtmSignals.hasSalesCompensation, true);
  assert.deepEqual(record.gtmSignals.federalExemptions, ['06c']);

  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes('FounderSecretName'), false);
  assert.equal(serialized.includes('Evergreen Terrace'), false);
  assert.equal(serialized.includes('555-0199'), false);
  assert.equal(serialized.includes('94107'), false);
  assert.equal(serialized.includes('BrokerPerson'), false);
  assert.equal(serialized.includes('@'), false);
  scanJsonForForbiddenPii([record]);

  assert.equal(matchesIndustryFilter('Other Technology', ['Technology']), true);
  assert.equal(matchesIndustryFilter('Other Health Care', ['Healthcare']), true);

  console.log('   ✅ Adversarial Zero-PII torture test passed 100%!\n');
}

async function testLiveSecEdgarExtraction() {
  console.log('3️⃣  Running Live US SEC EDGAR Form D Extraction (12 real startups)...');

  const t0 = Date.now();
  const { results, stats } = await collectStartupFundingSignals({
    daysBack: 14,
    maxResults: 12,
    minOfferingAmountUsd: 100000,
    minAmountSoldUsd: 0,
    excludePooledInvestmentFunds: true,
    includeAmendments: true,
  });
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(2);

  console.log(
    `   📊 Live SEC Stats (${elapsedSec}s): EFTS Hits=${stats.totalEftsHits}, XMLs Inspected=${stats.xmlFetchedCount}, Pooled Funds Excluded=${stats.skippedPooledFundsCount}, Startups Extracted=${results.length}`
  );

  assert.ok(results.length >= 10, `Expected >= 10 real startups, got ${results.length}`);
  assert.ok(
    stats.skippedPooledFundsCount > 0,
    'Expected excludePooledInvestmentFunds=true to filter out >0 pooled investment funds'
  );

  // Verify rate limit compliance: total HTTP requests = 1+ EFTS + xmlFetchedCount
  const totalRequests = 1 + stats.xmlFetchedCount;
  const effectiveReqPerSec = totalRequests / ((Date.now() - t0) / 1000);
  assert.ok(
    effectiveReqPerSec <= 5.0,
    `Effective request rate ${effectiveReqPerSec.toFixed(2)} req/s exceeded 5 req/s cap`
  );

  // Verify every extracted startup record
  for (const item of results) {
    assert.ok(item.companyName && item.companyName.length > 1);
    assert.ok(/^\d{10}$/.test(item.cik), `Expected 10-digit CIK, got ${item.cik}`);
    assert.ok(item.industryGroupType, 'Missing industryGroupType');
    assert.notEqual(
      item.industryGroupType.toLowerCase(),
      'pooled investment fund',
      `Pooled investment fund leaked through filter: ${item.companyName}`
    );
    assert.equal(
      item.investmentFundType,
      null,
      `investmentFundType should be null for operating startup: ${item.companyName}`
    );
    assert.equal(
      item.gtmSignals.federalExemptions.some((ex) => /^3c/i.test(ex)),
      false,
      `3C exemption fund leaked through filter: ${item.companyName}`
    );
    assert.ok(['D', 'D/A'].includes(item.formType));
    assert.ok(item.secFilingUrl.startsWith('https://www.sec.gov/Archives/edgar/data/'));
    assert.ok(
      ['Pre-Seed / Seed', 'Series A-B', 'Growth / Late'].includes(
        item.gtmSignals.inferredStage
      )
    );
  }

  // Strict Zero-PII scan across all live SEC records
  scanJsonForForbiddenPii(results);

  console.log('   📋 Sample Live Startups Extracted:');
  for (const s of results.slice(0, 5)) {
    console.log(
      `      - ${s.companyName} (${s.issuerStateOrCountry}) | ${s.industryGroupType} | Offering=$${s.fundingMetrics.totalOfferingAmountUsd ?? 'Indefinite'} | Sold=$${s.fundingMetrics.totalAmountSoldUsd} | Stage=${s.gtmSignals.inferredStage} | Exemptions=[${s.gtmSignals.federalExemptions.join(',')}]`
    );
  }
  console.log('   ✅ Live SEC EDGAR extraction & Zero-PII verification passed!\n');

  return { results, stats, elapsedSec, effectiveReqPerSec };
}

async function runActorSubprocess(inputObj) {
  const tmpStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-form-d-test-'));
  const kvDir = path.join(tmpStorage, 'key_value_stores', 'default');
  fs.mkdirSync(kvDir, { recursive: true });
  fs.writeFileSync(path.join(kvDir, 'INPUT.json'), JSON.stringify(inputObj));

  try {
    const { stdout, stderr } = await execFileAsync('node', ['src/main.js'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        CRAWLEE_STORAGE_DIR: tmpStorage,
        APIFY_LOCAL_STORAGE_DIR: tmpStorage,
      },
      timeout: 60000,
    });

    const datasetDir = path.join(tmpStorage, 'datasets', 'default');
    let items = [];
    if (fs.existsSync(datasetDir)) {
      const files = fs
        .readdirSync(datasetDir)
        .filter((f) => f.endsWith('.json'))
        .sort();
      items = files.map((f) =>
        JSON.parse(fs.readFileSync(path.join(datasetDir, f), 'utf8'))
      );
    }

    return { stdout: `${stdout}\n${stderr}`, items };
  } finally {
    fs.rmSync(tmpStorage, { recursive: true, force: true });
  }
}

async function testZeroChargeAndActorMain() {
  console.log('4️⃣  Testing Actor Entrypoint (`src/main.js`) & Zero-Charge Protection...');

  // 4A: Impossible query -> 0 matches -> ChargedEvents=0
  const emptyRun = await runActorSubprocess({
    daysBack: 7,
    maxResults: 5,
    searchQuery: 'NonExistentMarsColonyStartupXYZ99999999',
  });
  assert.equal(emptyRun.items.length, 0, 'Expected 0 dataset items for non-matching query');
  assert.ok(
    emptyRun.stdout.includes('ChargedEvents=0'),
    `Expected ChargedEvents=0 in Actor log, got:\n${emptyRun.stdout}`
  );
  console.log('   ✅ Zero-Charge Protection verified (0 results -> ChargedEvents=0)!');

  // 4B: Real 3-startup Actor CLI run -> 3 items -> ChargedEvents=3
  const liveRun = await runActorSubprocess({
    daysBack: 14,
    maxResults: 3,
    minOfferingAmountUsd: 100000,
    excludePooledInvestmentFunds: true,
  });
  assert.equal(liveRun.items.length, 3, `Expected 3 dataset items, got ${liveRun.items.length}`);
  assert.ok(liveRun.stdout.includes('ChargedEvents=3'));
  assert.ok(liveRun.items.every((i) => i.charged === true));
  scanJsonForForbiddenPii(liveRun.items);
  console.log('   ✅ Full Actor `npm start` E2E run verified (ChargedEvents=3, Zero-PII)!\n');
}

async function main() {
  console.log('==============================================================');
  console.log('🚀 SEC Form D Startup Funding Signals — E2E & Zero-PII Suite');
  console.log('==============================================================\n');

  await testActorSchemas();
  await testAdversarialZeroPiiXmlParser();
  await testLiveSecEdgarExtraction();
  await testZeroChargeAndActorMain();

  console.log('🎉 ALL TESTS PASSED 100% (0 PII Leaks, 0-Charge Protected, Live SEC Verified)!');
}

main().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
