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
  recentNews?: Array<{ title: string; publisher: string }>;
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
  private buildPrompt(data: ReportPromptData): string {
    const newsSection =
      data.recentNews && data.recentNews.length > 0
        ? `\n### Recent News Headlines:\n${data.recentNews
            .map((n, i) => `${i + 1}. "${n.title}" (${n.publisher})`)
            .join('\n')}`
        : '';

    const sign = data.priceChangePct >= 0 ? '+' : '';

    return `Deliver a concise, institutional-grade market analysis in markdown format for the instrument detailed below.

### Instrument Metadata:
- **Name**: ${data.name}
- **Ticker / ISIN**: ${data.symbol} ${data.isin ? `(ISIN: ${data.isin})` : ''}
- **Asset Class**: ${data.assetType}
- **Exchange / Currency**: ${data.exchange || 'N/A'} / ${data.currency}
- **Latest Close**: ${data.lastClose} ${data.currency}
- **Previous Close**: ${data.prevClose} ${data.currency}
- **Session Performance**: ${sign}${data.priceChange} ${data.currency} (${sign}${data.priceChangePct.toFixed(2)}%)

### News Feed & Catalysts:
${newsSection ? newsSection : 'No direct headlines captured. Infer performance drivers from macro correlations, sector beta, and asset-class dynamics.'}

---

### Analytical Framework & Asset-Specific Heuristics:
- **ETFs / Funds**: Anchor analysis on underlying basket exposure, sector weighting, and broad index beta.
- **Equities**: Focus on earnings expectations, company guidance, cost of capital, and peer valuation trends.
- **Commodities & Metals (Gold, Oil, etc.)**: Analyze real yields, US Dollar Index (DXY) momentum, geopolitical risk premiums, and supply-demand fundamentals.
- **Crypto & Futures**: Assess macro risk sentiment (risk-on / risk-off), global liquidity conditions, and regulatory or flow trends.

---

### Required Output Structure (Markdown):

#### 1. Executive Summary
- Provide a 2-3 sentence core thesis capturing the instrument's current market stance, session outcome (${sign}${data.priceChangePct.toFixed(2)}%), and underlying momentum.

#### 2. Price Action & Session Drivers
- Explain the key catalyst behind the ${sign}${data.priceChangePct.toFixed(2)}% move.
- Reference extracted headlines if provided; if no direct news exists, explain the movement using broader market beta, sector rotation, or liquidity flows.

#### 3. Macroeconomic & Cross-Asset Context
- Outline relevant macroeconomic forces impacting this asset class (e.g., Central Bank policies / interest rates, Treasury yields, inflation indicators, currency fluctuations).

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
  public async generateReport(data: ReportPromptData): Promise<{ markdown: string; modelUsed: string }> {
    const client = this.getClient();
    const prompt = this.buildPrompt(data);

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
