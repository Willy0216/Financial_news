process.env.NODE_ENV = 'test';
import dns from 'dns';
try {
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // ignore
}

import path from 'path';
import http from 'http';
import fs from 'fs';
import axios from 'axios';

const testDbPath = path.resolve(process.cwd(), 'data', 'test_macro.db');
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

async function runMacroTests() {
  console.log('\n=============================================');
  console.log('🧪 RUNNING MACRO ANALYTICS & REGIME TEST SUITE');
  console.log('=============================================\n');

  const { macroAnalyticsService, classifyMacroRegime } = await import(
    '../src/services/macro-analytics.service.js'
  );
  const { default: app } = await import('../src/index.js');
  const { closeDb } = await import('../src/db/db.js');

  // Test 1: Dynamic Regime Classification Logic
  console.log('--- 1. Dynamic Regime Classifier Tests ---');
  try {
    // Stress / Fear Gauges (VIX, HY_OAS, DXY)
    const acuteStress = classifyMacroRegime('VIX', 2.3);
    assert(acuteStress.label === 'ACUTE STRESS (+2σ)' && acuteStress.variant === 'rose', 'VIX +2.3σ -> ACUTE STRESS (rose)');

    const elevatedRisk = classifyMacroRegime('HY_OAS', 1.2);
    assert(elevatedRisk.label === 'ELEVATED RISK (+1σ)' && elevatedRisk.variant === 'amber', 'HY_OAS +1.2σ -> ELEVATED RISK (amber)');

    const benign = classifyMacroRegime('VIX', -1.6);
    assert(benign.label === 'BENIGN / COMPLACENT' && benign.variant === 'emerald', 'VIX -1.6σ -> BENIGN / COMPLACENT (emerald)');

    const subdued = classifyMacroRegime('DXY', -0.9);
    assert(subdued.label === 'SUBDUED (-1σ)' && subdued.variant === 'blue', 'DXY -0.9σ -> SUBDUED (blue)');

    const neutral = classifyMacroRegime('VIX', 0.1);
    assert(neutral.label === 'NEUTRAL' && neutral.variant === 'slate', 'VIX +0.1σ -> NEUTRAL (slate)');

    // Growth / Expansion Ratios (Copper/Gold, Dow/Gold, S&P 500/Gold)
    const strongRiskOn = classifyMacroRegime('COPPER_GOLD', 1.9);
    assert(strongRiskOn.label === 'STRONG RISK-ON (+2σ)' && strongRiskOn.variant === 'emerald', 'COPPER_GOLD +1.9σ -> STRONG RISK-ON (emerald)');

    const expansion = classifyMacroRegime('COPPER_GOLD', 0.9);
    assert(expansion.label === 'EXPANSION (+1σ)' && expansion.variant === 'emerald', 'COPPER_GOLD +0.9σ -> EXPANSION (emerald)');

    const contraction = classifyMacroRegime('DOW_GOLD', -1.9);
    assert(contraction.label === 'CONTRACTION (-2σ)' && contraction.variant === 'rose', 'DOW_GOLD -1.9σ -> CONTRACTION (rose)');

    const defensive = classifyMacroRegime('SP500_GOLD', -0.85);
    assert(defensive.label === 'DEFENSIVE / LAGGING' && defensive.variant === 'amber', 'SP500_GOLD -0.85σ -> DEFENSIVE / LAGGING (amber)');
  } catch (err: any) {
    assert(false, 'Regime classifier exception', err);
  }

  // Test 2: Quantitative Indicators Calculations (computeSeriesMetrics)
  console.log('\n--- 2. Quantitative Math & Indicator Tests ---');
  try {
    // Generate synthetic time series of 260 days
    const mockSeries: number[] = [];
    for (let i = 0; i < 260; i++) {
      mockSeries.push(100 + Math.sin(i / 10) * 10);
    }
    // Make latest value elevated
    mockSeries.push(130);

    const metrics = macroAnalyticsService.computeSeriesMetrics(
      'COPPER_GOLD',
      'Copper / Gold Ratio (x1000)',
      'RATIO',
      'Test economic significance description',
      mockSeries
    );

    assert(metrics.key === 'COPPER_GOLD', 'Metric key matches');
    assert(metrics.latestValue === 130, 'Metric latestValue correctly parsed');
    assert(metrics.sma50 !== null && metrics.sma50 > 0, `SMA 50 computed (${metrics.sma50})`);
    assert(metrics.sma200 !== null && metrics.sma200 > 0, `SMA 200 computed (${metrics.sma200})`);
    assert(metrics.distSma200Pct !== null, `Distance from SMA 200 computed (${metrics.distSma200Pct}%)`);
    assert(metrics.zScore1Y !== null, `252-Day Rolling Z-Score computed (${metrics.zScore1Y}σ)`);
    assert(metrics.regime === 'STRONG RISK-ON (+2σ)', `Dynamic regime is STRONG RISK-ON (got ${metrics.regime})`);
    assert(metrics.regimeVariant === 'emerald', `Dynamic regime variant is emerald (got ${metrics.regimeVariant})`);
    assert(metrics.sparkline.length === 30, `Sparkline has exactly 30 data points (got ${metrics.sparkline.length})`);
    assert(metrics.sparkline[metrics.sparkline.length - 1] === 130, 'Sparkline ends with latest value');
  } catch (err: any) {
    assert(false, 'Quantitative calculation exception', err);
  }

  // Test 3: Time Series Alignment & Controlled Forward Fill (ffill limit 3)
  console.log('\n--- 3. Time Series Alignment & Forward Fill Tests ---');
  try {
    const datasetA = [
      { date: '2024-01-01', close: 10 },
      { date: '2024-01-03', close: 12 },
    ];
    const datasetB = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 105 },
      { date: '2024-01-03', close: 110 },
    ];

    const { dates, aligned } = macroAnalyticsService.alignAndForwardFillSeries(
      {
        A: datasetA,
        B: datasetB,
      },
      3
    );

    assert(dates.length === 3, `Unified dates count is 3 (got ${dates.length})`);
    assert(dates[0] === '2024-01-01' && dates[1] === '2024-01-02' && dates[2] === '2024-01-03', 'Dates sorted chronologically');
    assert(aligned.A[0] === 10, 'A on day 1 is 10');
    assert(aligned.A[1] === 10, 'A on day 2 forward-filled (ffill) to 10');
    assert(aligned.A[2] === 12, 'A on day 3 is 12');
    assert(aligned.B[1] === 105, 'B on day 2 is 105');
  } catch (err: any) {
    assert(false, 'Alignment test exception', err);
  }

  // Test 4: Live Macro Data Ingestion & Calculation
  console.log('\n--- 4. Live Macro Data Ingestion & Calculation ---');
  try {
    const dashboard = await macroAnalyticsService.getDashboard(true);
    assert(dashboard.metrics.length === 6, `Dashboard contains all 6 macro indicators (got ${dashboard.metrics.length})`);

    const keys = dashboard.metrics.map((m) => m.key);
    assert(keys.includes('DXY'), 'Includes DXY (US Dollar Index)');
    assert(keys.includes('VIX'), 'Includes VIX (Volatility Index)');
    assert(keys.includes('HY_OAS'), 'Includes HY_OAS (High Yield Spread)');
    assert(keys.includes('COPPER_GOLD'), 'Includes COPPER_GOLD Ratio');
    assert(keys.includes('DOW_GOLD'), 'Includes DOW_GOLD Ratio');
    assert(keys.includes('SP500_GOLD'), 'Includes SP500_GOLD Ratio');

    const dxy = dashboard.metrics.find((m) => m.key === 'DXY')!;
    assert(dxy.latestValue > 50 && dxy.latestValue < 200, `DXY has realistic value (${dxy.latestValue})`);
    assert(dxy.sparkline.length > 0, 'DXY has sparkline points');

    const vix = dashboard.metrics.find((m) => m.key === 'VIX')!;
    assert(vix.latestValue > 0 && vix.latestValue < 150, `VIX has realistic value (${vix.latestValue})`);

    const hy = dashboard.metrics.find((m) => m.key === 'HY_OAS')!;
    assert(hy.latestValue > 0 && hy.latestValue < 25, `High Yield OAS spread is non-zero valid percentage (${hy.latestValue}%)`);

    const copperGold = dashboard.metrics.find((m) => m.key === 'COPPER_GOLD')!;
    assert(
      copperGold.name.includes('(x1000)'),
      `Copper/Gold name is properly titled "${copperGold.name}"`
    );
    assert(
      copperGold.latestValue >= 0.5 && copperGold.latestValue <= 5.0,
      `Copper/Gold ratio correctly scaled x1000 (${copperGold.latestValue})`
    );
  } catch (err: any) {
    assert(false, 'Live computation exception', err);
  }

  // Test 5: HTTP Endpoints (GET /api/macro-dashboard & POST /api/macro-dashboard/refresh)
  console.log('\n--- 5. REST API Endpoint Tests ---');
  let server: http.Server | null = null;
  try {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server!.address() as any;
    const API_BASE = `http://127.0.0.1:${addr.port}/api`;

    const getRes = await axios.get(`${API_BASE}/macro-dashboard`);
    assert(getRes.status === 200, 'GET /api/macro-dashboard returns 200 OK');
    assert(getRes.data.success === true, 'Response success is true');
    assert(getRes.data.data.metrics.length === 6, 'Returns 6 metrics');

    const refreshRes = await axios.post(`${API_BASE}/macro-dashboard/refresh`);
    assert(refreshRes.status === 200, 'POST /api/macro-dashboard/refresh returns 200 OK');
    assert(refreshRes.data.success === true, 'Refresh response success is true');
    assert(refreshRes.data.data.metrics.length === 6, 'Refreshed payload has 6 metrics');

    const promptRes = await axios.get(`${API_BASE}/macro-dashboard/prompt`);
    assert(promptRes.status === 200, 'GET /api/macro-dashboard/prompt returns 200 OK');
    assert(promptRes.data.success === true, 'Prompt response success is true');
    assert(promptRes.data.prompt.includes('US Dollar Index (DXY)'), 'Macro prompt contains live DXY values');
    assert(promptRes.data.prompt.includes('Copper / Gold Ratio (x1000)'), 'Macro prompt contains Copper/Gold ratio');
    assert(promptRes.data.prompt.includes('CBOE Volatility Index (VIX)'), 'Macro prompt contains VIX');
  } catch (err: any) {
    assert(false, 'API endpoint exception', err.response?.data || err.message);
  } finally {
    if (server) {
      (server as http.Server).close();
    }
  }

  // Cleanup
  closeDb();
  if (fs.existsSync(testDbPath)) {
    try {
      fs.unlinkSync(testDbPath);
    } catch {
      // ignore
    }
  }

  console.log('\n=============================================');
  console.log(`📊 MACRO RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMacroTests().catch((e) => {
  console.error('Fatal macro test error:', e);
  process.exit(1);
});
