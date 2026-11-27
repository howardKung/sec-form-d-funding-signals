# US Startup Funding Signals — SEC Form D API (Zero-PII)

Extract **newly funded US operating startups** directly from official **US Securities and Exchange Commission (SEC EDGAR) Form D & Form D/A XML filings** — weeks or months before funding rounds appear in Crunchbase, PitchBook, or TechCrunch.

Built specifically for **Clay, n8n, Make, AI SDR pipelines, RevOps, B2B agencies, and VC deal-flow automation** with **0-Browser speed**, **Pooled Investment Fund Noise Removal**, **Strict Mathematical Zero-PII Compliance**, and **Zero-Charge Protection**.

---

## Why Teams Switch to This SEC Form D Signal Engine

1. **Kills 70% of SEC Form D Noise (`excludePooledInvestmentFunds: true`)**  
   Over two-thirds of daily SEC Form D filings are Hedge Funds, Private Equity Funds, Real Estate Syndications, and Venture Capital 3(c)(1)/3(c)(7) vehicles. Our XML parser inspects `<industryGroupType>`, `<investmentFundType>`, `<isPooledInvestmentFundType>`, and `3C` exemptions to automatically discard fund vehicles and isolate **real operating companies**.
2. **Catch Stealth Rounds Before Press Releases**  
   Under SEC Regulation D, startups raising private capital (Rule 506(b) or 506(c)) must file Form D within **15 days after their first sale of securities** — even when they stay in stealth mode with zero press announcements.
3. **100% Mathematical Zero-PII Compliance (Enterprise-Safe)**  
   A 3-layer XML isolation pipeline strips `<relatedPersonsList>`, `<signatureBlock>`, `<salesCompensationList>`, `<street1>`, `<street2>`, `<city>`, `<zipCode>`, and `<issuerPhoneNumber>` *before* field extraction. Output contains **strictly corporate & financial facts** (no personal names, no home addresses, no phone numbers, no emails).
4. **Zero-Charge Protection ($0 on Empty Filters)**  
   Uses Apify Pay-Per-Event (`funding-signal-extracted`). If your filter combination matches `0` startups, **you pay $0.00**.

---

## Output Example (Strict Zero-PII Corporate Schema)

```json
{
  "companyName": "AgnitioAI Technologies, Inc.",
  "cik": "0002167055",
  "entityType": "Corporation",
  "yearOfIncorporation": 2025,
  "jurisdictionOfInc": "DELAWARE",
  "issuerStateOrCountry": "CA",
  "industryGroupType": "Other Technology",
  "investmentFundType": null,
  "formType": "D",
  "isAmendment": false,
  "filingDate": "2026-11-25",
  "dateOfFirstSale": "2026-11-18",
  "accessionNumber": "0002167055-26-000001",
  "secFilingUrl": "https://www.sec.gov/Archives/edgar/data/2167055/000216705526000001/primary_doc.xml",
  "fundingMetrics": {
    "totalOfferingAmountUsd": 2000000,
    "totalAmountSoldUsd": 350000,
    "totalRemainingUsd": 1650000,
    "minimumInvestmentAcceptedUsd": 0,
    "totalNumberAlreadyInvested": 3,
    "hasNonAccreditedInvestors": false,
    "isIndefiniteOffering": false
  },
  "gtmSignals": {
    "inferredStage": "Pre-Seed / Seed",
    "isFreshFirstSale": true,
    "hasSalesCompensation": false,
    "federalExemptions": ["06b"]
  },
  "charged": true
}
```

---

## Input Parameters

| Parameter | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `daysBack` | `integer` | `7` | Lookback window in calendar days (`1`–`365`). |
| `maxResults` | `integer` | `25` | Max matching startup records to return (`prefill: 15` finishes in ~5–8s). |
| `minOfferingAmountUsd` | `integer` | `100000` | Minimum `totalOfferingAmountUsd` in USD. |
| `minAmountSoldUsd` | `integer` | `0` | Minimum `totalAmountSoldUsd` already closed in USD. |
| `excludePooledInvestmentFunds` | `boolean` | `true` | Automatically excludes Hedge, PE, VC, and 3(c)(1)/3(c)(7) pooled funds. |
| `industries` | `string[]` | `[]` | Optional industry filter, e.g. `["Technology", "Computers", "Biotechnology", "Health Care"]`. |
| `states` | `string[]` | `[]` | Optional 2-letter state/country filter, e.g. `["CA", "NY", "TX", "MA", "WA", "DE"]`. |
| `includeAmendments` | `boolean` | `true` | Include `D/A` amended filings alongside initial `D` filings. |
| `searchQuery` | `string` | `""` | Optional keyword, company name, or CIK filter (matched strictly against corporate fields). |

---

## High-ROI GTM Signal Definitions

- **`gtmSignals.inferredStage`**: Deterministically classifies rounds into `Pre-Seed / Seed`, `Series A-B`, or `Growth / Late` based on offering size and incorporation age.
- **`gtmSignals.isFreshFirstSale`**: `true` when `dateOfFirstSale` occurred within the last 30 days — highest-urgency buying window when fresh capital just hit the bank account.
- **`gtmSignals.federalExemptions`**:
  - `06b` (Rule 506(b)): Classic institutional/angel private placement (no general solicitation).
  - `06c` (Rule 506(c)): General solicitation permitted — startup is actively marketing its raise publicly.
- **`gtmSignals.hasSalesCompensation`**: `true` if broker-dealer sales commissions or finder's fees are reported on the round.

---

## 🔗 The B2B GTM Intelligence Trilogy (Clay / n8n Power Stack)

Combine all three **Zero-Browser, Zero-PII, Zero-Charge-Protected** signal engines to automate the ultimate outbound waterfall — **Funded → Hiring → Tech-Ready**:

| Step | Apify Actor | Signal Captured | Best Used For |
| :---: | :--- | :--- | :--- |
| **1. Capital Trigger** | **`howardkung/sec-form-d-funding-signals`** *(This Actor)* | Fresh US startup Form D funding rounds (`$100K–$100M+`), stage, state & industry | Discovering newly capitalized startups 30–90 days before Crunchbase |
| **2. Hiring Velocity** | [**`howardkung/multi-ats-hiring-signals`**](https://apify.com/howardkung/multi-ats-hiring-signals) | Open roles, 30-day hiring velocity, department breakdown & 60+ job-description tech signals across 8 ATS platforms | Confirming which newly funded startups are actively scaling Engineering, Sales, or Security |
| **3. Tech & Deliverability** | **`howardkung/domain-dns-tech-trust-signals`** | DNS `MX/SPF/DMARC` email gateway, infrastructure stack, and deterministic `CNAME` Trust Center detection (Vanta, Drata, SafeBase) | Verifying email deliverability, security compliance maturity, and cloud stack before outreach |

### 3-Step n8n / Clay Automated Waterfall
1. **Schedule Daily at 08:00 EST**: Run `sec-form-d-funding-signals` (`daysBack: 1`, `excludePooledInvestmentFunds: true`, `minOfferingAmountUsd: 500000`, `industries: ["Technology", "Biotechnology"]`).
2. **Resolve Domain & Check Hiring**: Pass newly funded startup domains into `multi-ats-hiring-signals` to prioritize companies with active open headcount.
3. **Inspect Infrastructure & Compliance**: Pass qualified domains into `domain-dns-tech-trust-signals` to tailor your outbound pitch to their exact email provider, cloud DNS, and SOC 2 Trust Center status.

---

## SEC EDGAR Fair Access & Legal Compliance

- **Data Source**: Public-domain US Federal filings via official SEC EDGAR (`efts.sec.gov` & `www.sec.gov/Archives/edgar/data`).
- **Rate Limiting**: Built-in serialized token-bucket rate limiter strictly enforces `<= 4 req/sec` (well below SEC EDGAR's `10 req/sec` Fair Access ceiling) with compliant `User-Agent` identification and exponential retry backoff.
- **Zero-PII Architecture**: Strictly outputs corporate issuer metadata and aggregate round economics. Zero executive names, zero residential/street addresses, zero phone numbers, and zero email addresses are ever stored or returned.

---

## ⚡ Ready-to-Import n8n Automation Workflow

Get daily Slack and Google Sheets alerts whenever a US operating startup files a fresh SEC Form D round:

1. Download or copy [`examples/n8n-workflow.json`](./examples/n8n-workflow.json) from this repository.
2. In **n8n**, click **Workflows → Import from File** (or paste the JSON directly onto the canvas).
3. Set `APIFY_API_TOKEN` (plus `SLACK_WEBHOOK_URL` or Google Sheets credential) and activate the daily 08:00 schedule!

### 🔗 Complete `howardkung` Zero-PII Signal Suite (Cross-Actor Matrix)

| Signal Engine | Best Used For | Apify Store | Ready n8n JSON |
| :--- | :--- | :--- | :--- |
| **US Startup Funding (SEC Form D)** *(This Actor)* | Newly funded US operating startups (pooled funds filtered out) | [Apify](https://apify.com/howardkung/sec-form-d-funding-signals) | [`examples/n8n-workflow.json`](./examples/n8n-workflow.json) |
| **Multi-ATS Hiring Signals** | Open roles, 30d velocity & GTM buying signals across 8 ATS APIs | [Apify](https://apify.com/howardkung/multi-ats-hiring-signals) | [GitHub](https://github.com/howardKung/multi-ats-hiring-signals/blob/main/examples/n8n-workflow.json) |
| **DNS, Email-Auth & Tech Stack** | MX/SPF/DMARC cold-email safety, Proofpoint/Mimecast & 85+ DNS tools | [Apify](https://apify.com/howardkung/domain-dns-tech-trust-signals) | [GitHub](https://github.com/howardKung/domain-dns-tech-trust-signals/blob/main/examples/n8n-workflow.json) |
| **Shopify & WooCommerce Store Intel** | DTC platform, 30+ paid apps (Klaviyo, Recharge, Yotpo) & pricing | [Apify](https://apify.com/howardkung/ecommerce-store-app-intel) | [GitHub](https://github.com/howardKung/ecommerce-store-app-intel/blob/main/examples/n8n-workflow.json) |
| **SEC Form 4 Insider Cluster Buys** | Open-market C-suite stock purchases (`Code P` only) & cluster alerts | [Apify](https://apify.com/howardkung/sec-form4-insider-cluster-buys) | [GitHub](https://github.com/howardKung/sec-form4-insider-cluster-buys/blob/main/examples/n8n-workflow.json) |

