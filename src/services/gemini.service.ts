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

    return `You are a Senior Financial Market & Macroeconomic Analyst.
Write a concise, high-impact, professional financial analysis report in English for the following asset:

### Asset Information:
- **Name**: ${data.name}
- **Symbol**: ${data.symbol}
- **ISIN**: ${data.isin || 'N/A'}
- **Asset Type**: ${data.assetType}
- **Exchange**: ${data.exchange || 'N/A'}
- **Currency**: ${data.currency}
- **Latest Close Price**: ${data.lastClose} ${data.currency}
- **Previous Close**: ${data.prevClose} ${data.currency}
- **Price Change**: ${sign}${data.priceChange} ${data.currency} (${sign}${data.priceChangePct.toFixed(2)}%)
${newsSection}

### Report Guidelines:
1. Provide a well-structured markdown report.
2. Focus on macroeconomic indicators (interest rates, central banks, inflation, economic data), sector specific trends, and market sentiment driving this asset.
3. Structure the output with these exact sections:
   - **Executive Summary**: High-level takeaway of the asset's performance and core thesis.
   - **Price Action & Intraday Drivers**: Why the asset moved ${sign}${data.priceChangePct.toFixed(2)}% in the session.
   - **Macroeconomic & Sector Context**: Broader market drivers, bond yields, currency fluctuations, or commodity dynamics relevant to this asset.
   - **Risks & Key Catalysts Ahead**: Near-term upcoming events (earnings, CPI, FOMC/ECB meetings, geopolitical factors).
4. Do NOT give direct financial or trading advice (e.g. "buy", "sell", "target price"). Keep the tone analytical, institutional, and objective.
5. All text MUST be strictly in English.`;
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
