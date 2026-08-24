process.env.NODE_ENV = 'test';
import path from 'path';

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

async function runNewsAggregatorTests() {
  console.log('\n=============================================');
  console.log('🧪 RUNNING NEWS AGGREGATOR TEST SUITE');
  console.log('=============================================\n');

  const { newsAggregatorService, ASSET_NEWS_DRIVER_MAP } = await import(
    '../src/services/news-aggregator.service.js'
  );

  // 1. Sanitization & HTML Entity Decoding
  console.log('--- 1. HTML Entity Decoding & Title Sanitization ---');
  const rawTitle1 = 'ASML &amp; SAP Rally &quot;Strongly&quot; on AI Demand &#8217;26 - Reuters';
  const cleaned1 = newsAggregatorService.cleanTitle(rawTitle1, 'Reuters');
  assert(
    cleaned1 === 'ASML & SAP Rally "Strongly" on AI Demand \'26',
    `Cleaned and decoded title properly (got: "${cleaned1}")`
  );

  const rawTitle2 = 'ECB &lt;Rates&gt; Hold Steady&#8211;Markets React - Bloomberg';
  const cleaned2 = newsAggregatorService.cleanTitle(rawTitle2, 'Bloomberg');
  assert(
    cleaned2 === 'ECB <Rates> Hold Steady-Markets React',
    `Decoded angle brackets and stripped trailing publisher tag (got: "${cleaned2}")`
  );

  const htmlSnippet = '<p>Strong <b>Q2 earnings</b> beat expectations &amp; forecasts.<a href="url">Read more</a></p>';
  const cleanedSnippet = newsAggregatorService.stripHtmlAndCleanSnippet(htmlSnippet);
  assert(
    cleanedSnippet === 'Strong Q2 earnings beat expectations & forecasts. Read more',
    `Stripped HTML tags and decoded snippet (got: "${cleanedSnippet}")`
  );

  // 2. Primary Driver Ticker Mapping
  console.log('\n--- 2. Primary Driver Ticker Mapping ---');
  assert(
    Boolean(ASSET_NEWS_DRIVER_MAP['SGLN.MI'] && ASSET_NEWS_DRIVER_MAP['SGLN.MI'].queryTickers.includes('GC=F')),
    'SGLN.MI maps to GC=F and GLD'
  );
  assert(
    Boolean(ASSET_NEWS_DRIVER_MAP['BITC.MI'] && ASSET_NEWS_DRIVER_MAP['BITC.MI'].queryTickers.includes('BTC-USD')),
    'BITC.MI maps to BTC-USD and IBIT'
  );
  assert(
    Boolean(ASSET_NEWS_DRIVER_MAP['CRUD.MI'] && ASSET_NEWS_DRIVER_MAP['CRUD.MI'].queryTickers.includes('CL=F')),
    'CRUD.MI maps to CL=F and USO'
  );

  const goldDriver = newsAggregatorService.resolveAssetDriver('SGLN.L');
  assert(
    goldDriver?.keywords === 'Gold price bullion' && goldDriver?.queryTickers.includes('GC=F'),
    'resolveAssetDriver resolves SGLN.L to Gold driver'
  );

  const dynamicSilver = newsAggregatorService.resolveAssetDriver('CUSTOM_SILVER_ETC', {
    underlyingAsset: 'Physical Silver Ounces',
  });
  assert(
    dynamicSilver?.keywords === 'Silver price commodity' && dynamicSilver?.queryTickers.includes('SI=F'),
    'resolveAssetDriver dynamically resolves physical silver asset'
  );

  // 3. Clickbait & Noise Filter Heuristics
  console.log('\n--- 3. Clickbait & Noise Filter Heuristics ---');
  const clickbaitItems = [
    { title: 'Why is ASML surging after the Terafab deal?', publisher: 'Blog' },
    { title: 'Will the Stock Market Crash in September?', publisher: 'Opinion' },
    { title: 'Is it time to buy Bitcoin before the next halving?', publisher: 'CryptoMedia' },
    { title: "Here's what history shows about Bitcoin in August", publisher: 'Motley Fool' },
    { title: 'Top 3 stocks to buy before the next Fed meeting', publisher: 'StockPicks' },
    { title: '3 Things to Know Before Buying Vanguard S&P 500 ETF (VOO)', publisher: 'Motley Fool' },
    { title: 'Should you buy Apple stock today?', publisher: 'Investor' },
    { title: 'Forget NVIDIA, buy this AI stock instead', publisher: 'Picks' },
    { title: 'Company Installs Machine at New Facility in Texas', publisher: 'PR Wire' },
    { title: 'Fintech Appoints New VP of Operations', publisher: 'Press Release' },
    { title: 'The Zacks Analyst Blog Highlights Apple, Alphabet, Microsoft and Amazon', publisher: 'Zacks' },
    { title: 'Robbins LLP Reminds Investors of Class Action Lawsuit against Tech Corp', publisher: 'GlobeNewswire' },
  ];

  for (const item of clickbaitItems) {
    const isHigh = newsAggregatorService.isHighValueNews({
      title: item.title,
      publisher: item.publisher,
      publishedAt: new Date(),
    });
    assert(isHigh === false, `Rejected clickbait/noise item: "${item.title.substring(0, 45)}..."`);
  }

  const qualityItems = [
    {
      title: 'ASML Reports Strong Q2 Bookings Driven by AI Demand',
      summary: 'Orders for EUV lithography systems surged 34% year-on-year, beating analyst consensus.',
      publisher: 'Reuters',
    },
    {
      title: 'ECB Signals Potential Rate Pause Amid Sticky Inflation Prints',
      summary: 'Governing Council members highlighted core services inflation at 4.1% during the latest meeting.',
      publisher: 'Bloomberg',
    },
    {
      title: 'Bitcoin Reclaims $68,000 as Spot ETF Inflows Reach Weekly High',
      summary: 'Institutional net inflows surpassed $1.2B over the past five trading sessions.',
      publisher: 'CoinDesk',
    },
  ];

  for (const item of qualityItems) {
    const isHigh = newsAggregatorService.isHighValueNews({
      title: item.title,
      summary: item.summary,
      publisher: item.publisher,
      publishedAt: new Date(),
    });
    assert(isHigh === true, `Accepted institutional high-value item: "${item.title}"`);
  }

  // 4. Relative Time Computation & Recency Filtering
  console.log('\n--- 4. Relative Time & Recency Filter ---');
  const now = new Date();
  const date30m = new Date(now.getTime() - 30 * 60 * 1000);
  const date4h = new Date(now.getTime() - 4 * 3600 * 1000);
  const date2d = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const date10d = new Date(now.getTime() - 10 * 24 * 3600 * 1000);

  assert(
    newsAggregatorService.computeTimeAgo(date30m, now) === '30m ago',
    '30 minutes ago computed as "30m ago"'
  );
  assert(
    newsAggregatorService.computeTimeAgo(date4h, now) === '4h ago',
    '4 hours ago computed as "4h ago"'
  );
  assert(
    newsAggregatorService.computeTimeAgo(date2d, now) === '2d ago',
    '2 days ago computed as "2d ago"'
  );
  assert(
    newsAggregatorService.isWithinRecency(date2d, 7, now) === true,
    '2-day old article is within 7-day recency'
  );
  assert(
    newsAggregatorService.isWithinRecency(date10d, 7, now) === false,
    '10-day old article is rejected by 7-day recency filter'
  );

  // 5. Deduplication & Ranking Pipeline
  console.log('\n--- 5. Deduplication & Ranking Pipeline ---');
  const mockArticles = [
    {
      title: 'Why is Bitcoin surging today?',
      publisher: 'RandomBlog',
      publishedAt: new Date(now.getTime() - 1 * 3600 * 1000),
      timeAgo: '1h ago',
    },
    {
      title: 'Bitcoin Surges Above $68,000 as Institutional Flows Accelerate',
      publisher: 'RandomBlog',
      publishedAt: new Date(now.getTime() - 20 * 3600 * 1000),
      timeAgo: '20h ago',
    },
    {
      title: 'Bitcoin Surges Above $68,000 as Institutional Flows Accelerate!',
      publisher: 'Reuters',
      summary: 'Net inflows into US spot Bitcoin ETFs hit a four-month high on Monday.',
      publishedAt: new Date(now.getTime() - 2 * 3600 * 1000),
      timeAgo: '2h ago',
    },
    {
      title: 'ECB Rate Cut Expectations Solidify Following Eurozone Inflation Print',
      publisher: 'Financial Times',
      publishedAt: new Date(now.getTime() - 5 * 3600 * 1000),
      timeAgo: '5h ago',
    },
    {
      title: 'European Tech Sector Drives Stoxx 600 Gains',
      publisher: 'Bloomberg',
      publishedAt: new Date(now.getTime() - 1 * 3600 * 1000),
      timeAgo: '1h ago',
    },
  ];

  const ranked = newsAggregatorService.sanitizeAndRankArticles(mockArticles, {
    assetName: 'Bitcoin',
    symbol: 'BTC-USD',
    maxItems: 3,
  });

  assert(ranked.length === 3, `Returns max 3 deduplicated items (got ${ranked.length})`);
  assert(
    ranked.filter((r) => r.title.includes('Bitcoin Surges Above $68,000')).length === 1,
    'Duplicate Bitcoin headline was deduplicated'
  );
  assert(
    !ranked.some((r) => r.title.startsWith('Why is')),
    'Clickbait headline was filtered out'
  );
  assert(
    ranked[0].publisher === 'Reuters' || ranked[0].publisher === 'Bloomberg',
    `Top ranked item is an authoritative source (got ${ranked[0].publisher})`
  );

  // 6. Prompt Formatting
  console.log('\n--- 6. Prompt Formatting Output ---');
  const formattedPromptString = newsAggregatorService.formatHeadlinesForPrompt(ranked);
  assert(
    formattedPromptString.includes('- [') && formattedPromptString.includes('ago]'),
    'Headlines formatted with "- [Publisher | Xh ago] Title" syntax'
  );

  // 7. Live Multi-Tier Ingestion & Driver Tests
  console.log('\n--- 7. Live Multi-Tier News Aggregation ---');

  // Gold ETC (SGLN.L / SGLN.MI)
  const goldNews = await newsAggregatorService.fetchNewsForAsset({
    symbol: 'SGLN.L',
    name: 'iShares Physical Gold ETC',
    asset_type: 'COMMODITY',
  });
  assert(goldNews.length > 0, `Fetched targeted driver news for Gold ETC SGLN.L (got ${goldNews.length} items)`);
  if (goldNews.length > 0) {
    const goldKeywordsPresent = goldNews.some(
      (n) =>
        n.title.toLowerCase().includes('gold') ||
        n.title.toLowerCase().includes('bullion') ||
        n.title.toLowerCase().includes('gld') ||
        n.title.toLowerCase().includes('metal')
    );
    assert(goldKeywordsPresent, 'SGLN.L headlines are relevant to Gold/Bullion commodity drivers');
  }

  // Single Equity (AAPL)
  const equityNews = await newsAggregatorService.fetchNewsForAsset({
    symbol: 'AAPL',
    name: 'Apple Inc.',
    asset_type: 'EQUITY',
  });
  assert(equityNews.length > 0, `Fetched live news for AAPL (got ${equityNews.length} items)`);

  // Crypto / Commodity ETP (BITC.MI)
  const cryptoNews = await newsAggregatorService.fetchNewsForAsset({
    symbol: 'BITC.MI',
    name: 'CoinShares Physical Bitcoin',
    asset_type: 'ETF',
  });
  assert(cryptoNews.length > 0, `Fetched targeted crypto news for BITC.MI (got ${cryptoNews.length} items)`);

  // European ETF with Top Holdings (MEUD.MI)
  const etfNews = await newsAggregatorService.fetchNewsForAsset({
    symbol: 'MEUD.MI',
    name: 'Amundi Stoxx Europe 600 UCITS ETF',
    asset_type: 'ETF',
    profile: {
      categoryName: 'Europe Large-Cap Blend Equity',
      benchmark: 'STOXX Europe 600 Net Return Index',
      topHoldings: [
        { name: 'Novo Nordisk A/S', symbol: 'NOVO-B.CO', weightPct: 3.42 },
        { name: 'ASML Holding NV', symbol: 'ASML.AS', weightPct: 3.12 },
        { name: 'SAP SE', symbol: 'SAP.DE', weightPct: 2.15 },
      ],
    },
  });
  assert(etfNews.length > 0, `Fetched underlying-aware constituent news for MEUD.MI (got ${etfNews.length} items)`);

  console.log('\n=============================================');
  console.log(`📊 NEWS AGGREGATOR RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runNewsAggregatorTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
