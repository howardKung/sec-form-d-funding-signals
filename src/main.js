/**
 * Apify Actor Entrypoint — US Startup Funding Signals — SEC Form D API (Zero-PII).
 *
 * Implements strict Pay-Per-Event (PPE) Zero-Charge Protection:
 * - Event name: `funding-signal-extracted` (suggested $10.00 / 1,000 = $0.01/record).
 * - Charges ONLY per valid matching startup funding record pushed to the dataset.
 * - If 0 filings match user filters, `Actor.charge()` is NEVER called ($0 cost).
 * - Respects user spending limits via `chargeResult.eventChargeLimitReached`.
 */

import { Actor, log } from 'apify';
import { collectStartupFundingSignals } from './collector.js';

export const CHARGE_EVENT_NAME = 'funding-signal-extracted';

await Actor.init();

try {
  const input = (await Actor.getInput()) || {};
  const {
    daysBack = 7,
    maxResults = 25,
    minOfferingAmountUsd = 100000,
    minAmountSoldUsd = 0,
    excludePooledInvestmentFunds = true,
    industries = [],
    states = [],
    includeAmendments = true,
    searchQuery = '',
  } = input;

  log.info(
    `Starting SEC Form D Startup Funding extraction (daysBack=${daysBack}, maxResults=${maxResults}, minOfferingUsd=${minOfferingAmountUsd}, excludePooledFunds=${excludePooledInvestmentFunds}).`
  );

  let chargedCount = 0;
  let limitReached = false;

  const { stats } = await collectStartupFundingSignals({
    daysBack,
    maxResults,
    minOfferingAmountUsd,
    minAmountSoldUsd,
    excludePooledInvestmentFunds,
    industries,
    states,
    includeAmendments,
    searchQuery,
    logger: log,
    onMatch: async (record) => {
      const chargeResult = await Actor.charge({
        eventName: CHARGE_EVENT_NAME,
        count: 1,
      });

      const outputRecord = {
        ...record,
        charged: true,
      };

      await Actor.pushData(outputRecord);
      chargedCount += 1;

      log.info(
        `[FUNDED] ${record.companyName} (${record.issuerStateOrCountry || 'US'}) | ${record.industryGroupType} | Offering=$${record.fundingMetrics.totalOfferingAmountUsd ?? 'Indefinite'} | Sold=$${record.fundingMetrics.totalAmountSoldUsd} | Stage=${record.gtmSignals.inferredStage} [CHARGED]`
      );

      if (chargeResult?.eventChargeLimitReached) {
        limitReached = true;
        log.warning(
          'User max pay-per-event charge limit reached. Stopping gracefully.'
        );
        return false;
      }

      return true;
    },
  });

  if (chargedCount === 0) {
    log.info(
      `No matching Form D filings found for given filters (scanned ${stats.totalEftsHits} index hits, ${stats.xmlFetchedCount} XMLs). Zero-Charge Protection active: ChargedEvents=0 ($0.00).`
    );
  } else {
    log.info(
      `Completed! Matched=${chargedCount} | SkippedPooledFunds=${stats.skippedPooledFundsCount} | XmlInspected=${stats.xmlFetchedCount} | ChargedEvents=${chargedCount} | BudgetLimitReached=${limitReached}`
    );
  }
} finally {
  await Actor.exit();
}
