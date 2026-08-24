import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface DynamicAssetReportPayload {
  name: string;
  symbol: string;
  isin?: string | null;
  assetType: string;
  exchange?: string | null;
  currency: string;
  lastClose: number;
  prevClose: number;
  priceChange: number;
  priceChangePct: number;
  underlyingContext?: string; // Formatted top holdings or underlying target
  newsContext: string;        // Dynamic formatted fresh headlines with snippets
}

export interface DynamicMacroReportPayload {
  dxy: { value: number; zScore: number; distSma200: number };
  vix: { value: number; zScore: number; distSma200: number };
  hyOas: { value: number; zScore: number; distSma200: number };
  copperGold: { value: number; zScore: number; distSma200: number };
  dowGold: { value: number; zScore: number; distSma200: number };
  sp500Gold: { value: number; zScore: number; distSma200: number };
}

/**
 * Build dynamic prompt for individual asset analysis (Zero hardcoding, pure runtime SSOT)
 */
export function buildAssetReportPrompt(data: DynamicAssetReportPayload): string {
  const sign = data.priceChange >= 0 ? '+' : '';
  const formattedChange = `${sign}${data.priceChange.toFixed(2)} ${data.currency} (${sign}${data.priceChangePct.toFixed(2)}%)`;

  return `You are a Senior Financial Market Analyst.
Write a concise, high-impact, institutional-grade market note for the specified instrument based strictly on the provided real-time market data, underlying basket exposure, and breaking news.

### Instrument Overview:
- **Instrument**: ${data.name} (${data.symbol}${data.isin ? ` | ISIN: ${data.isin}` : ''})
- **Asset Class / Exchange**: ${data.assetType} / ${data.exchange || 'N/A'}
- **Current Close**: ${data.lastClose} ${data.currency} (Previous: ${data.prevClose} ${data.currency})
- **Session Performance**: ${formattedChange}

### Underlying Exposure & Basket Dynamics:
${data.underlyingContext || 'Single instrument; evaluate direct price discovery.'}

### Recent News Feed & Direct Catalysts (Past 48 Hours):
${data.newsContext || 'No breaking news captured. Assess session moves via sector beta and asset-class price action.'}

---

### Required Report Structure (Markdown):

#### 1. Executive Summary
- 2 concise sentences summarizing the asset's current stance, momentum, and session move (${formattedChange}).

#### 2. Immediate Price Action & News Drivers
- Detail the specific news headlines, market developments, or corporate/commodity catalysts that drove the ${formattedChange} move.
- If news is absent, attribute movement to broad sector rotation, underlying basket momentum, or cross-asset beta.

#### 3. Underlying Holdings & Sector Performance
- For ETFs/Funds: Analyze the contribution and momentum of top constituent holdings.
- For Equities: Assess company fundamentals, sector sentiment, and direct peer group dynamics.
- For Commodities/Crypto: Assess spot supply-demand dynamics, ETF flow momentum, or physical market trends.

#### 4. Near-Term Catalysts & Key Levels
- 2 to 3 bullet points detailing immediate upcoming events (earnings releases, economic data releases, central bank commentary, contract roll dates).

---

### Compliance & Quality Rules:
- Base all reasoning on the provided numbers and news; do NOT invent events.
- Strictly analytical and objective. No investment advice ("buy", "sell", "target price").
- Output strictly in English.`;
}

/**
 * Build dynamic prompt for Global Macro Intelligence synthesis (Zero hardcoding, pure runtime SSOT)
 */
export function buildGlobalMacroPrompt(data: DynamicMacroReportPayload): string {
  return `Synthesize the current global macroeconomic regime using this live quantitative indicator dataset (SSOT):

- **US Dollar Index (DXY)**: ${data.dxy.value.toFixed(2)} (1Y Z-Score: ${data.dxy.zScore >= 0 ? '+' : ''}${data.dxy.zScore.toFixed(2)}σ, ${data.dxy.distSma200 >= 0 ? '+' : ''}${data.dxy.distSma200.toFixed(2)}% vs SMA 200)
- **CBOE Volatility Index (VIX)**: ${data.vix.value.toFixed(2)} (1Y Z-Score: ${data.vix.zScore >= 0 ? '+' : ''}${data.vix.zScore.toFixed(2)}σ, ${data.vix.distSma200 >= 0 ? '+' : ''}${data.vix.distSma200.toFixed(2)}% vs SMA 200)
- **US High Yield Credit Spread (OAS)**: ${data.hyOas.value.toFixed(2)}% (1Y Z-Score: ${data.hyOas.zScore >= 0 ? '+' : ''}${data.hyOas.zScore.toFixed(2)}σ, ${data.hyOas.distSma200 >= 0 ? '+' : ''}${data.hyOas.distSma200.toFixed(2)}% vs SMA 200)
- **Copper / Gold Ratio (x1000)**: ${data.copperGold.value.toFixed(2)} (1Y Z-Score: ${data.copperGold.zScore >= 0 ? '+' : ''}${data.copperGold.zScore.toFixed(2)}σ, ${data.copperGold.distSma200 >= 0 ? '+' : ''}${data.copperGold.distSma200.toFixed(2)}% vs SMA 200)
- **Dow Jones / Gold Ratio**: ${data.dowGold.value.toFixed(2)} (1Y Z-Score: ${data.dowGold.zScore >= 0 ? '+' : ''}${data.dowGold.zScore.toFixed(2)}σ, ${data.dowGold.distSma200 >= 0 ? '+' : ''}${data.dowGold.distSma200.toFixed(2)}% vs SMA 200)
- **S&P 500 / Gold Ratio**: ${data.sp500Gold.value.toFixed(2)} (1Y Z-Score: ${data.sp500Gold.zScore >= 0 ? '+' : ''}${data.sp500Gold.zScore.toFixed(2)}σ, ${data.sp500Gold.distSma200 >= 0 ? '+' : ''}${data.sp500Gold.distSma200.toFixed(2)}% vs SMA 200)

---

### Structure Your Synthesis:
1. **Global Macro Regime & Risk Posture**: Summarize whether markets are in Risk-On, Risk-Off, Stagflationary, or Liquidity-Constrained regimes based on DXY, VIX, and HY OAS. do not overexplain in case of a flat situation 
2. **Growth vs. Safety Dynamics**: Interpret the Copper/Gold signal regarding global industrial expansion.
3. **Hard-Asset Equity Valuation**: Evaluate equity multiples in terms of physical gold reserves (Dow/Gold and S&P 500/Gold).

Tone: tecnical but not too academic, macro-quantitative, strictly English.`;
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
   * Backward-compatible alias to buildAssetReportPrompt
   */
  public buildPrompt(data: DynamicAssetReportPayload): string {
    return buildAssetReportPrompt(data);
  }

  /**
   * Generate report with resilient multi-model fallback hierarchy
   */
  public async generateReport(
    payload: DynamicAssetReportPayload | string,
    customPrompt?: string
  ): Promise<{ markdown: string; modelUsed: string }> {
    const client = this.getClient();
    const prompt =
      customPrompt && customPrompt.trim().length > 10
        ? customPrompt.trim()
        : typeof payload === 'string'
        ? payload
        : buildAssetReportPrompt(payload);

    const logIdentifier = typeof payload === 'string' ? 'Custom Prompt' : payload.symbol;
    let lastError: any = null;

    for (const model of this.modelHierarchy) {
      try {
        logger.info(`Attempting report generation for ${logIdentifier} with model "${model}"...`);

        const response = await client.models.generateContent({
          model,
          contents: prompt,
        });

        const text = response.text?.trim();
        if (text && text.length > 50) {
          logger.info(`Successfully generated report for ${logIdentifier} using model "${model}".`);
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
          `Model "${model}" failed for ${logIdentifier}: ${err.message || err}. Falling back to next model...`
        );
      }
    }

    throw new Error(
      `All models in the fallback hierarchy failed. Last error: ${lastError?.message || lastError}`
    );
  }

  /**
   * Generate Global Macro synthesis report for Macro Health Dashboard
   */
  public async generateMacroReport(
    payload: DynamicMacroReportPayload | string,
    customPrompt?: string
  ): Promise<{ markdown: string; modelUsed: string }> {
    const client = this.getClient();
    const prompt =
      customPrompt && customPrompt.trim().length > 10
        ? customPrompt.trim()
        : typeof payload === 'string'
        ? payload
        : buildGlobalMacroPrompt(payload);

    let lastError: any = null;

    for (const model of this.modelHierarchy) {
      try {
        logger.info(`Attempting macro synthesis generation with model "${model}"...`);

        const response = await client.models.generateContent({
          model,
          contents: prompt,
        });

        const text = response.text?.trim();
        if (text && text.length > 50) {
          logger.info(`Successfully generated global macro synthesis using model "${model}".`);
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
          `Model "${model}" failed for macro synthesis: ${err.message || err}. Falling back to next model...`
        );
      }
    }

    throw new Error(
      `All models in the fallback hierarchy failed for macro synthesis. Last error: ${lastError?.message || lastError}`
    );
  }
}

export const geminiService = new GeminiService();
