process.env.NODE_ENV = 'test';
import http from 'http';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

const testDbPath = path.resolve(process.cwd(), 'data', 'test_e2e.db');
process.env.DATABASE_PATH = testDbPath;

let server: http.Server;
let API_BASE = '';

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

async function runE2ETests() {
  const { default: app } = await import('../src/index.js');
  const { getDb, closeDb } = await import('../src/db/db.js');
  const { config } = await import('../src/config/env.js');
  const { reportRepository } = await import('../src/db/repositories/report.repository.js');
  console.log('\n=============================================');
  console.log('🌐 RUNNING END-TO-END REST API TESTS');
  console.log('=============================================\n');

  // Clean DB first
  const db = getDb();
  db.exec('DELETE FROM asset_reports; DELETE FROM tracked_assets;');

  // Start temporary test server on dynamic port
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      API_BASE = `http://127.0.0.1:${addr.port}/api`;
      resolve();
    });
  });

  try {
    // 1. Health check
    console.log('--- 1. Health Check Endpoint ---');
    const healthRes = await axios.get(`${API_BASE}/health`);
    assert(healthRes.status === 200, 'GET /api/health returns 200 OK');
    assert(healthRes.data.status === 'ok', 'Health status is "ok"');
    assert(healthRes.data.database === 'connected', 'Database is connected');

    // 2. Resolve Preview Endpoint
    console.log('\n--- 2. Resolve Preview Endpoint ---');
    const resolveRes = await axios.post(`${API_BASE}/resolve`, {
      query: 'US0378331005',
    });
    assert(resolveRes.status === 200, 'POST /api/resolve returns 200 OK');
    assert(resolveRes.data.success === true, 'Resolve returns success: true');
    assert(resolveRes.data.data.bestMatch?.symbol === 'AAPL', 'Best match for US0378331005 is AAPL');

    // 3. Add Asset via ISIN (POST /api/assets)
    console.log('\n--- 3. Asset Tracking Endpoints ---');
    db.exec('DELETE FROM asset_reports; DELETE FROM tracked_assets;');

    const addIsinRes = await axios.post(`${API_BASE}/assets`, {
      query: 'US0378331005',
    });
    assert(addIsinRes.status === 201, 'POST /api/assets with ISIN returns 201 Created');
    assert(addIsinRes.data.data.symbol === 'AAPL', 'Asset added has symbol AAPL');
    assert(addIsinRes.data.data.quote.price > 0, 'Asset response contains live quote');

    // 4. Add Asset via Ticker (POST /api/assets)
    const addTickerRes = await axios.post(`${API_BASE}/assets`, {
      identifier: 'MEUD.MI',
    });
    assert(addTickerRes.status === 201, 'POST /api/assets with Ticker returns 201 Created');
    assert(addTickerRes.data.data.symbol === 'MEUD.MI', 'MEUD.MI added to tracked assets');
    assert(addTickerRes.data.data.isin === 'LU0908500753', `Reverse ISIN for MEUD.MI saved as LU0908500753 (got: ${addTickerRes.data.data.isin})`);

    // 5. Test Duplicate Prevention (409 Conflict)
    try {
      await axios.post(`${API_BASE}/assets`, { symbol: 'AAPL' });
      assert(false, 'Duplicate asset should return 409 Conflict');
    } catch (err: any) {
      assert(err.response?.status === 409, 'Duplicate asset returns 409 Conflict');
    }

    // 6. List Tracked Assets (GET /api/assets)
    const listRes = await axios.get(`${API_BASE}/assets`);
    assert(listRes.status === 200, 'GET /api/assets returns 200 OK');
    assert(listRes.data.count === 2, `GET /api/assets returns 2 tracked assets (got ${listRes.data.count})`);
    assert(Boolean(listRes.data.data[0]?.profile), 'Assets in list contain underlying profile data');

    // 7. Get Single Asset (GET /api/assets/:symbol)
    const getRes = await axios.get(`${API_BASE}/assets/AAPL`);
    assert(getRes.status === 200, 'GET /api/assets/AAPL returns 200 OK');
    assert(getRes.data.data.symbol === 'AAPL', 'Returns asset AAPL details');
    assert(
      Boolean(getRes.data.data.profile?.sector && getRes.data.data.profile?.summary),
      'Single asset response contains parsed equity profile metadata'
    );

    // 8. Test Caching in Report Generation (POST /api/assets/:symbol/report)
    console.log('\n--- 4. Report Generation & Caching Endpoints ---');
    // Pre-seed a report for AAPL to verify cached return flow
    reportRepository.create({
      symbol: 'AAPL',
      price_change_pct: 1.12,
      prev_close: 305.9,
      last_close: 309.35,
      report_markdown: '# Apple Macro Analysis\n\nGenerated report for testing caching pipeline.',
    });

    const reportRes = await axios.post(`${API_BASE}/assets/AAPL/report`);
    assert(reportRes.status === 200, 'POST /api/assets/AAPL/report returns 200 OK');
    assert(reportRes.data.data.status === 'cached', `Report endpoint correctly returned cached report`);
    assert(reportRes.data.data.report.symbol === 'AAPL', 'Report contains valid symbol');

    // 9. Get Historical Reports (GET /api/assets/:symbol/reports)
    const reportsListRes = await axios.get(`${API_BASE}/assets/AAPL/reports`);
    assert(reportsListRes.status === 200, 'GET /api/assets/AAPL/reports returns 200 OK');
    assert(reportsListRes.data.count >= 1, 'Returns array of historical reports');

    // 10. Get Populated Prompt (GET /api/assets/:symbol/prompt)
    const promptRes = await axios.get(`${API_BASE}/assets/AAPL/prompt`);
    assert(promptRes.status === 200, 'GET /api/assets/AAPL/prompt returns 200 OK');
    assert(typeof promptRes.data.prompt === 'string' && promptRes.data.prompt.includes('AAPL'), 'Populated prompt contains symbol AAPL');
    assert(promptRes.data.prompt.includes('Instrument Metadata'), 'Populated prompt contains Instrument Metadata section');

    // 11. Batch Reports (POST /api/reports/batch)
    const batchRes = await axios.post(`${API_BASE}/reports/batch`);
    assert(batchRes.status === 200, 'POST /api/reports/batch returns 200 OK');
    assert(batchRes.data.data.total === 2, 'Batch report processed all 2 tracked assets');
    assert(batchRes.data.data.cached >= 1, 'Batch report detected cached report');

    // 12. Delete Asset (DELETE /api/assets/:symbol)
    console.log('\n--- 5. Delete Asset Endpoint ---');
    const deleteRes = await axios.delete(`${API_BASE}/assets/AAPL`);
    assert(deleteRes.status === 200, 'DELETE /api/assets/AAPL returns 200 OK');

    const verifyDeleteRes = await axios.get(`${API_BASE}/assets`);
    assert(verifyDeleteRes.data.count === 1, 'Tracked asset count decreased to 1 after deletion');
  } catch (err: any) {
    assert(false, 'E2E Test encountered exception', err.response?.data || err.message);
  } finally {
    server.close();
    closeDb();
    if (config.databasePath && config.databasePath !== ':memory:' && fs.existsSync(config.databasePath)) {
      try {
        fs.unlinkSync(config.databasePath);
      } catch {
        // ignore
      }
    }
  }

  console.log('\n=============================================');
  console.log(`📊 E2E API RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runE2ETests().catch((e) => {
  console.error('Fatal E2E error:', e);
  process.exit(1);
});
