process.env.NODE_ENV = 'test';
import path from 'path';
import fs from 'fs';

const testDbPath = path.resolve(process.cwd(), 'data', 'test_verify.db');
process.env.DATABASE_PATH = testDbPath;

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`, detail || '');
    failed++;
  }
}

async function runTests() {
  const { getDb, initSchema, closeDb } = await import('../src/db/db.js');
  const { config } = await import('../src/config/env.js');
  const { assetRepository } = await import('../src/db/repositories/asset.repository.js');
  const { reportRepository } = await import('../src/db/repositories/report.repository.js');
  const { marketDataService } = await import('../src/services/market-data.service.js');
  const { isinResolverService } = await import('../src/services/isin-resolver.service.js');
  const { reportGeneratorService } = await import('../src/services/report-generator.service.js');
  console.log('\n=============================================');
  console.log('🧪 RUNNING COMPREHENSIVE BACKEND TEST SUITE');
  console.log('=============================================\n');

  // Test 1: Database Setup & Repositories
  console.log('--- 1. Database Schema & Repository Tests ---');
  try {
    const db = getDb();
    initSchema(db);
    assert(true, 'Database schema initialized successfully');

    // Clean test table state
    db.exec('DELETE FROM asset_reports; DELETE FROM tracked_assets;');

    const testAsset = assetRepository.create({
      symbol: 'AAPL',
      isin: 'US0378331005',
      name: 'Apple Inc.',
      asset_type: 'EQUITY',
      exchange: 'NMS',
      currency: 'USD',
    });

    assert(testAsset.id > 0 && testAsset.symbol === 'AAPL', 'Create asset in tracked_assets');

    const foundBySymbol = assetRepository.findBySymbol('AAPL');
    assert(foundBySymbol?.name === 'Apple Inc.', 'Find asset by symbol');

    const foundByIsin = assetRepository.findByIsin('US0378331005');
    assert(foundByIsin?.symbol === 'AAPL', 'Find asset by ISIN');

    const testReport = reportRepository.create({
      symbol: 'AAPL',
      price_change_pct: 1.45,
      prev_close: 220.0,
      last_close: 223.19,
      report_markdown: '# Apple Daily Analysis\nPositive performance led by tech earnings.',
    });

    assert(testReport.id > 0 && testReport.symbol === 'AAPL', 'Create asset report in asset_reports');

    const latestReport = reportRepository.findLatestBySymbol('AAPL');
    assert(latestReport?.price_change_pct === 1.45, 'Find latest report by symbol');

    const recentToday = reportRepository.findRecentToday('AAPL');
    assert(recentToday?.id === testReport.id, 'Find recent report created today');
  } catch (err: any) {
    assert(false, 'Database operations exception', err);
  }

  // Test 2: Market Data Service
  console.log('\n--- 2. Market Data Service (Yahoo Finance API) ---');
  try {
    const quote = await marketDataService.getQuote('AAPL');
    assert(quote !== null, 'Fetch live quote for AAPL');
    if (quote) {
      assert(quote.price > 0, `AAPL price is positive (${quote.price} ${quote.currency})`);
      assert(quote.assetType === 'EQUITY', `AAPL mapped to asset_type EQUITY (got: ${quote.assetType})`);
      assert(typeof quote.priceChangePct === 'number', `AAPL price change % is number (${quote.priceChangePct}%)`);
    }

    const indexQuote = await marketDataService.getQuote('^GSPC');
    assert(indexQuote !== null && indexQuote.assetType === 'INDEX', 'Fetch and map index quote (^GSPC)');

    // Test Underlying & Profile Intelligence
    console.log('\n--- 2b. Underlying & Profile Intelligence ---');
    const meudProfile = await marketDataService.fetchUnderlyingData('MEUD.MI', 'ETF');
    assert(
      meudProfile !== null &&
        (meudProfile.topHoldings?.length || 0) > 0 &&
        Boolean(meudProfile.benchmark),
      'Fetch underlying ETF profile with top holdings for MEUD.MI'
    );

    const aaplProfile = await marketDataService.fetchUnderlyingData('AAPL', 'EQUITY');
    assert(
      aaplProfile !== null && Boolean(aaplProfile.sector) && Boolean(aaplProfile.summary),
      'Fetch equity sector and business summary for AAPL'
    );

    const btcProfile = await marketDataService.fetchUnderlyingData('BITC.MI', 'ETF');
    assert(
      btcProfile !== null && Boolean(btcProfile.underlyingAsset?.includes('Bitcoin')),
      'Fetch crypto spot underlying target for BITC.MI'
    );

    // Test repository update
    assetRepository.updateUnderlyingData('AAPL', JSON.stringify(aaplProfile));
    const aaplDb = assetRepository.findBySymbol('AAPL');
    assert(
      Boolean(aaplDb?.underlying_data && aaplDb.underlying_data.includes('Technology')),
      'Persist and retrieve underlying_data in tracked_assets'
    );

    const commodityQuote = await marketDataService.getQuote('GC=F');
    assert(commodityQuote !== null && commodityQuote.assetType === 'COMMODITY', 'Fetch and classify Commodity quote (GC=F)');

    const validation = await marketDataService.validateActiveTrading('AAPL');
    assert(validation.isValid === true, 'Validate active trading history for AAPL');
  } catch (err: any) {
    assert(false, 'Market data test exception', err);
  }

  // Test 3: ISIN Resolution & Multi-Candidate Strategy
  console.log('\n--- 3. ISIN Resolution Service Tests ---');
  try {
    assert(isinResolverService.isIsin('US0378331005'), 'Identify US0378331005 as ISIN');
    assert(isinResolverService.isIsin('IE00B4L5Y983'), 'Identify IE00B4L5Y983 as ISIN');
    assert(!isinResolverService.isIsin('AAPL'), 'Identify AAPL as non-ISIN (ticker)');

    console.log('  Resolving ISIN "US0378331005" (Apple)...');
    const usResolution = await isinResolverService.resolve('US0378331005');
    assert(usResolution.resolved, 'Resolve US ISIN (US0378331005)');
    assert(
      usResolution.bestMatch?.symbol === 'AAPL' || usResolution.candidates.some((c) => c.symbol === 'AAPL'),
      `Candidate list contains AAPL (Best match: ${usResolution.bestMatch?.symbol})`
    );

    console.log('  Resolving European ETF ISIN "IE00B4L5Y983" (iShares Core MSCI World)...');
    const etfResolution = await isinResolverService.resolve('IE00B4L5Y983');
    assert(etfResolution.resolved, 'Resolve European ETF ISIN');
    assert(etfResolution.candidates.length > 0, `Discovered ${etfResolution.candidates.length} active candidates`);

    console.log('  Resolving direct ticker "VWCE.DE"...');
    const tickerResolution = await isinResolverService.resolve('VWCE.DE');
    assert(tickerResolution.resolved && tickerResolution.bestMatch?.symbol === 'VWCE.DE', 'Resolve direct ticker VWCE.DE');

    console.log('  Resolving SGLN and checking commercial fund name prioritization...');
    const sglnResolution = await isinResolverService.resolve('SGLN');
    assert(
      sglnResolution.resolved &&
        sglnResolution.bestMatch?.name.toLowerCase().includes('gold') &&
        !sglnResolution.bestMatch?.name.endsWith('PLC ISH'),
      `SGLN resolves to descriptive commercial name: "${sglnResolution.bestMatch?.name}"`
    );

    const goldIsinResolution = await isinResolverService.resolve('IE00B4ND3602');
    assert(
      goldIsinResolution.resolved &&
        goldIsinResolution.bestMatch?.name.toLowerCase().includes('gold'),
      `IE00B4ND3602 resolves to descriptive name: "${goldIsinResolution.bestMatch?.name}"`
    );

    console.log('  Resolving European ETF ISIN "LU0908500753" (Amundi Stoxx 600)...');
    const amundiResolution = await isinResolverService.resolve('LU0908500753');
    assert(
      amundiResolution.resolved && amundiResolution.candidates.length > 0,
      `LU0908500753 resolves with ${amundiResolution.candidates.length} candidates (Best match: ${amundiResolution.bestMatch?.symbol})`
    );

    console.log('  Resolving Italian ISIN "IT0005239360" (UniCredit)...');
    const ucgResolution = await isinResolverService.resolve('IT0005239360');
    assert(
      ucgResolution.resolved && ucgResolution.bestMatch?.symbol === 'UCG.MI',
      `IT0005239360 resolves to Italian exchange ticker: "${ucgResolution.bestMatch?.symbol}"`
    );

    console.log('  Testing reverse ISIN lookup on direct tickers...');
    const meudIsin = await isinResolverService.findIsinForSymbol('MEUD.MI');
    assert(meudIsin === 'LU0908500753', `Reverse ISIN for MEUD.MI is LU0908500753 (got: ${meudIsin})`);

    const aaplIsin = await isinResolverService.findIsinForSymbol('AAPL');
    assert(aaplIsin === 'US0378331005', `Reverse ISIN for AAPL is US0378331005 (got: ${aaplIsin})`);
  } catch (err: any) {
    assert(false, 'ISIN resolution test exception', err);
  }

  // Test 4: Report Generator Logic (Zero-change skipping & Caching)
  console.log('\n--- 4. Report Generator & Caching Tests ---');
  try {
    // Check cached retrieval
    const cachedResult = await reportGeneratorService.generateReportForSymbol('AAPL');
    assert(
      cachedResult.status === 'cached' || cachedResult.status === 'generated' || cachedResult.status === 'skipped_zero_change',
      `Report generator status handling (${cachedResult.status})`
    );

    if (cachedResult.status === 'cached') {
      assert(cachedResult.report?.id !== undefined, 'Cached report returned valid report payload');
    }
  } catch (err: any) {
    assert(false, 'Report generator test exception', err);
  }

  // Clean up test database
  try {
    closeDb();
    if (config.databasePath && config.databasePath !== ':memory:' && fs.existsSync(config.databasePath)) {
      fs.unlinkSync(config.databasePath);
    }
  } catch {
    // Ignore cleanup error
  }

  console.log('\n=============================================');
  console.log(`📊 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
