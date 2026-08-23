import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databasePath:
    process.env.DATABASE_PATH ||
    (process.env.NODE_ENV === 'test'
      ? path.resolve(process.cwd(), 'data', 'test.db')
      : path.resolve(process.cwd(), 'data', 'finance.db')),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openFigiApiKey: process.env.OPENFIGI_API_KEY || '',
  models: {
    primary: process.env.GEMINI_PRIMARY_MODEL || 'gemini-3.6-flash',
    fallbacks: (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.5-flash,gemini-3.7-flash')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
  },
};
