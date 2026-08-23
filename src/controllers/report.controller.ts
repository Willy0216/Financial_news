import { Request, Response } from 'express';
import { reportRepository } from '../db/repositories/report.repository.js';
import { reportGeneratorService } from '../services/report-generator.service.js';
import { logger } from '../utils/logger.js';

function getParamString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

function normalizeUtcTimestamp(dateStr?: string | null): string {
  if (!dateStr) return new Date().toISOString();
  const s = String(dateStr).trim();
  if (!s.includes('T') && s.includes(' ')) {
    return s.replace(' ', 'T') + 'Z';
  }
  if (!s.endsWith('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(s)) {
    return s + 'Z';
  }
  return s;
}

export class ReportController {
  /**
   * POST /api/assets/:symbol/report - Generate or retrieve report for an asset
   * Supports ?refresh=true / ?force=true
   */
  public async generateReport(req: Request, res: Response): Promise<void> {
    try {
      const symbol = getParamString(req.params.symbol);
      const customPrompt =
        typeof req.body?.customPrompt === 'string'
          ? req.body.customPrompt
          : typeof req.body?.prompt === 'string'
          ? req.body.prompt
          : undefined;

      const force =
        Boolean(customPrompt) ||
        req.body?.refresh === true ||
        req.body?.force === true ||
        req.query?.refresh === 'true' ||
        req.query?.force === 'true';

      const result = await reportGeneratorService.generateReportForSymbol(symbol, {
        force,
        customPrompt,
      });

      const isHoliday =
        result.status === 'skipped_market_closed' || result.status === 'skipped_zero_change';

      if (result.status === 'error') {
        res.status(422).json({
          success: false,
          error: result.reason || 'Failed to generate report',
          symbol: symbol.toUpperCase(),
          reportMarkdown: '',
          createdAt: new Date().toISOString(),
          isHoliday: false,
          data: result,
        });
        return;
      }

      res.status(200).json({
        success: true,
        symbol: symbol.toUpperCase(),
        reportMarkdown: result.reportMarkdown || result.report?.report_markdown || '',
        modelUsed: result.modelUsed || result.report?.model_used || null,
        model_used: result.modelUsed || result.report?.model_used || null,
        createdAt: normalizeUtcTimestamp(result.report?.created_at),
        isHoliday,
        data: result,
      });
    } catch (error: any) {
      logger.error(`Error in generateReport for ${req.params.symbol}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/assets/:symbol/prompt - Get variable-populated prompt template for an asset
   */
  public async getPopulatedPrompt(req: Request, res: Response): Promise<void> {
    try {
      const symbol = getParamString(req.params.symbol);
      const prompt = await reportGeneratorService.getPopulatedPromptForSymbol(symbol);
      res.status(200).json({
        success: true,
        symbol: symbol.toUpperCase(),
        prompt,
      });
    } catch (error: any) {
      logger.error(`Error fetching prompt for ${req.params.symbol}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * GET /api/assets/:symbol/reports - Retrieve all historical reports for an asset
   */
  public async getAssetReports(req: Request, res: Response): Promise<void> {
    try {
      const symbol = getParamString(req.params.symbol);
      const limit = parseInt((req.query.limit as string) || '20', 10);

      const reports = reportRepository.findAllBySymbol(symbol, limit);

      res.status(200).json({
        success: true,
        symbol: symbol.toUpperCase(),
        count: reports.length,
        data: reports.map((r) => ({
          ...r,
          created_at: normalizeUtcTimestamp(r.created_at),
        })),
      });
    } catch (error: any) {
      logger.error(`Error fetching reports for ${req.params.symbol}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/reports/batch - Run batch generation for all tracked assets
   */
  public async generateBatchReports(req: Request, res: Response): Promise<void> {
    try {
      const force =
        req.body?.refresh === true ||
        req.body?.force === true ||
        req.query?.refresh === 'true' ||
        req.query?.force === 'true';
      const summary = await reportGeneratorService.generateBatchReports({ force });

      res.status(200).json({
        success: true,
        message: `Batch report run finished: ${summary.generated} generated, ${summary.cached} cached, ${summary.skipped} skipped, ${summary.errors} errors.`,
        data: summary,
      });
    } catch (error: any) {
      logger.error('Error in generateBatchReports:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export const reportController = new ReportController();
