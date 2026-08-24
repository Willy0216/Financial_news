import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';
import { AssetType } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface ReportPromptData {
  symbol: string;
  name: string;
  isin?: string | null;
  assetType: AssetType;
  exchange?: string | null;
  currency: string;
  lastClose: number;
  prevClose: number;
  priceChangePct: number;
  priceChange: number;
  benchmark?: string;
  underlyingAsset?: string;
  sector?: string;
  industry?: string;
  family?: string;
  macroIndicators?: string;
  formattedNews?: string;
  recentNews?: Array<{ title: string; publisher: string; timeAgo?: string }>;
}

export class GeminiService {
  private client: GoogleGenAI | null = null;
  private readonly modelHierarchy: string[];

  constructor() {
    this.modelHierarchy = [config.models.primary, ...config.models.fallbacks];
    if (config.geminiApiKey) {
      this.client = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      if (config.geminiApiKey) {
        this.client = new GoogleGenAI({ apiKey: config.geminiApiKey });
      } else {
        throw new Error('GEMINI_API_KEY is not configured in the environment.');
      }
    }
    return this.client;
  }

  /**
   * Build structured prompt for macroeconomic and market driver analysis
   */
  public buildPrompt(data: ReportPromptData): string {
    let newsSection =
      '\nNo direct headlines captured. Infer performance drivers from macro correlations, sector beta, and asset-class dynamics.';

    if (data.formattedNews && data.formattedNews.trim().length > 0) {
      newsSection = `\n### Recent News Headlines:\n${data.formattedNews.trim()}`;
    } else if (data.recentNews && data.recentNews.length > 0) {
      const items = data.recentNews.map((n) => {
        const time = n.timeAgo ? ` | ${n.timeAgo}` : '';
        return `- [${n.publisher}${time}] ${n.title}`;
      });
      newsSection = `\n### Recent News Headlines:\n${items.join('\n')}`;
    }

    const sign = data.priceChangePct >= 0 ? '+' : '';
    const formattedChange = `${sign}${data.priceChange.toFixed(2)}`;
    const formattedChangePct = `${sign}${data.priceChangePct.toFixed(2)}%`;

    const metadataLines: string[] = [
      `- **Name**: ${data.name}`,
      `- **Ticker / ISIN**: ${data.symbol}${data.isin ? ` (ISIN: ${data.isin})` : ''}`,
      `- **Asset Class**: ${data.assetType}`,
      `- **Exchange / Currency**: ${data.exchange || 'N/A'} / ${data.currency}`,
      `- **Latest Close**: ${data.lastClose} ${data.currency}`,
      `- **Previous Close**: ${data.prevClose} ${data.currency}`,
      `- **Session Performance**: ${formattedChange} ${data.currency} (${formattedChangePct})`,
    ];

    if (data.benchmark) {
      metadataLines.push(`- **Benchmark Index**: ${data.benchmark}`);
    }
    if (data.underlyingAsset) {
      metadataLines.push(`- **Underlying Spot Target**: ${data.underlyingAsset}`);
    }

    const defaultMacroIndicators = `- **Global Liquidity & FX**:
  - **US Dollar Index (DXY)** at 98.80 (-0.20σ, -0.36% vs SMA 200) -> Stable and neutral global FX liquidity conditions.
- **Market Volatility & Credit Stress**:
  - **CBOE Volatility Index (VIX)** at 15.13 (-0.95σ, -17.74% vs SMA 200) -> Subdued equity volatility regime, reflecting compressed near-term hedging demand.
  - **US High Yield Credit Spread (OAS)** at 2.75% (-0.74σ, -3.92% vs SMA 200) -> Benign credit risk premium with no systemic corporate default stress.
- **Global Growth & Industrial Cycle**:
  - **Copper / Gold Ratio (x1000)** at 1.41 (+0.75σ, +6.30% vs SMA 200) -> Cyclical economic expansion and firm industrial risk appetite relative to safe-haven assets.
- **Real-Asset Equity Valuations (Gold Ratios)**:
  - **S&P 500 / Gold Ratio** at 1.64 (+0.19σ, +3.53% vs SMA 200) -> Resilient broad-market equity strength when benchmarked against monetary gold.
  - **Dow Jones / Gold Ratio** at 11.38 (+0.15σ, +2.94% vs SMA 200) -> Stable industrial/value asset valuations relative to hard currency reserves.`;

    const macroIndicatorsSection = data.macroIndicators || defaultMacroIndicators;

    const productDataList: string[] = [];
    if (data.benchmark) {
      productDataList.push(`- **Benchmark Index**: ${data.benchmark}`);
    }
    if (data.underlyingAsset) {
      productDataList.push(`- **Underlying Spot Target**: ${data.underlyingAsset}`);
    }
    const productDataSection =
      productDataList.length > 0 ? '\n' + productDataList.join('\n') : '';

    return `Deliver a concise, institutional-grade market analysis in markdown format for the instrument detailed below.

### Instrument Metadata:
${metadataLines.join('\n')}

### News Feed & Catalysts:
${newsSection}

Ignore the useless titles
---

### Analytical Framework & Asset-Specific Heuristics:
- **ETFs / Funds**: Anchor analysis on underlying basket exposure, sector weighting, and broad index beta.
- **Equities**: Focus on earnings expectations, company guidance, cost of capital, and peer valuation trends.
- **Commodities & Metals (Gold, Oil, etc.)**: Analyze real yields, US Dollar Index (DXY) momentum, geopolitical risk premiums, and supply-demand fundamentals.
- **Crypto & Futures**: Assess macro risk sentiment (risk-on / risk-off), global liquidity conditions, and regulatory or flow trends.

---

### Required Output Structure (Markdown):

#### 1. Executive Summary
- Provide a 2-3 sentence core thesis capturing the instrument's current market stance, session outcome (${formattedChangePct}), and underlying momentum.

#### 2. Price Action & Session Drivers
- Reference extracted headlines and imminent risks to monitor, if provided, and explain the movement using following market indicators:

${macroIndicatorsSection}

#### 3. Macroeconomic & Cross-Asset Context analysis
- Outline relevant macroeconomic forces impacting this asset class (central bank monetary policies, yield dynamics, global liquidity, risk appetite, and inflation trends) using these datas on the product:${productDataSection}

#### 4. Key Catalysts & Risks to Monitor
- Highlight 2 to 3 bullet points detailing near-term events (e.g., upcoming economic prints like CPI/PMI, central bank meetings, earnings releases, geopolitical developments).

---

### Formatting & Compliance Guardrails:
- **Tone**: Professional, data-driven, concise, and institutional.
- **No Boilerplate Fluff**: Skip conversational openers ("Here is the report...") or generic disclaimers. Jump straight into the markdown sections.
- **Regulatory Guardrail**: Provide objective analytical commentary only. Strictly avoid investment recommendations (e.g., never write "buy", "sell", "hold", or set price targets).
- **Language**: Strictly English.`;
  }

  /**
   * Generate report with resilient multi-model fallback hierarchy
   */
  public async generateReport(
    data: ReportPromptData,
    customPrompt?: string
  ): Promise<{ markdown: string; modelUsed: string }> {
    const client = this.getClient();
    const prompt =
      customPrompt && customPrompt.trim().length > 10
        ? customPrompt.trim()
        : this.buildPrompt(data);

    let lastError: any = null;

    for (const model of this.modelHierarchy) {
      try {
        logger.info(`Attempting report generation for ${data.symbol} with model "${model}"...`);

        const response = await client.models.generateContent({
          model,
          contents: prompt,
        });

        const text = response.text?.trim();
        if (text && text.length > 50) {
          logger.info(`Successfully generated report for ${data.symbol} using model "${model}".`);
          return {
            markdown: text,
            modelUsed: model,
          };
        } else {
          throw new Error(`Empty or malformed response returned by model "${model}"`);
        }
      } catch (err: any) {
        lastError = err;
        logger.warn(
          `Model "${model}" failed for ${data.symbol}: ${err.message || err}. Falling back to next model...`
        );
      }
    }

    throw new Error(
      `All models in the fallback hierarchy failed. Last error: ${lastError?.message || lastError}`
    );
  }
}

export const geminiService = new GeminiService();
