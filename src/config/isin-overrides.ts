/**
 * Static ISIN to Milan (.MI) / Primary Ticker Override Dictionary
 * Maps known European and Global ISINs to their exact Borsa Italiana tickers (or primary tickers)
 * for edge cases where ticker symbols diverge across European exchanges.
 */
export const ISIN_OVERRIDES: Record<string, string> = {
  // Core European & Global ETFs on Borsa Italiana (Milan)
  'LU0908500753': 'MEUD.MI',    // Amundi Core Stoxx Europe 600 UCITS ETF Acc (XETRA: LYP6.DE, Milan: MEUD.MI)
  'IE00B4L5Y983': 'SWDA.MI',    // iShares Core MSCI World UCITS ETF (Amsterdam: IWDA.AS, XETRA: EUNL.DE, Milan: SWDA.MI)
  'IE00B4ND3602': 'SGLN.MI',    // iShares Physical Gold ETC (London: SGLN.L, Milan: SGLN.MI)
  'IE00BK5BQT80': 'VWCE.MI',    // Vanguard FTSE All-World UCITS ETF (USD) Acc (XETRA: VWCE.DE, Milan: VWCE.MI)
  'IE00B3RBWM25': 'VGWL.MI',    // Vanguard FTSE All-World UCITS ETF (USD) Dist
  'IE00B5BMR087': 'CSSPX.MI',   // iShares Core S&P 500 UCITS ETF (XETRA: SXR8.DE, Milan: CSSPX.MI)
  'LU1681045370': 'LCWD.MI',    // Amundi MSCI World UCITS ETF (Milan: LCWD.MI)
  'IE00B3XXRP09': 'VUSA.MI',    // Vanguard S&P 500 UCITS ETF (USD) Dist
  'IE00BFMXXD54': 'VUAA.MI',    // Vanguard S&P 500 UCITS ETF (USD) Acc
  'IE00B0M62Q58': 'EMIM.MI',    // iShares Core MSCI Emerging Markets IMI
  'IE00B1XNHC34': 'INRG.MI',    // iShares Global Clean Energy UCITS ETF
  'IE00BYX2JD69': 'WTAI.MI',    // WisdomTree Artificial Intelligence UCITS ETF
  'IE00B53SZB19': 'CSEMAS.MI',  // iShares NASDAQ 100 UCITS ETF
  'LU1829221024': 'LYMS.MI',    // Lyxor Core MSCI EMU UCITS ETF
  'LU0274208692': 'XBAK.MI',    // Xtrackers Euro Stoxx 50 UCITS ETF

  // Major Italian Equities (Borsa Italiana)
  'IT0005239360': 'UCG.MI',     // UniCredit S.p.A.
  'IT0003132476': 'ENI.MI',     // Eni S.p.A.
  'IT0003128367': 'ENEL.MI',    // Enel S.p.A.
  'IT0000072618': 'ISP.MI',     // Intesa Sanpaolo S.p.A.
  'IT0005211237': 'PIRC.MI',    // Pirelli & C. S.p.A.
  'NL0011585146': 'RACE.MI',    // Ferrari N.V. (Milan)
  'NL00150001Q9': 'STLAM.MI',   // Stellantis N.V. (Milan)
  'NL0000226223': 'STMMI.MI',   // STMicroelectronics N.V. (Milan)

  // Popular US Equities & Tech Giants (Direct Tickers)
  'US0378331005': 'AAPL',       // Apple Inc.
  'US5949181045': 'MSFT',       // Microsoft Corporation
  'US02079K3059': 'GOOGL',      // Alphabet Inc. Class A
  'US02079K1079': 'GOOG',       // Alphabet Inc. Class C
  'US0231351067': 'AMZN',       // Amazon.com Inc.
  'US67066G1040': 'NVDA',       // NVIDIA Corporation
  'US88160R1014': 'TSLA',       // Tesla Inc.
  'US30303M1027': 'META',       // Meta Platforms Inc.
};

// Reverse mapping for Symbol -> ISIN
export const SYMBOL_TO_ISIN: Record<string, string> = Object.entries(ISIN_OVERRIDES).reduce(
  (acc, [isin, symbol]) => {
    acc[symbol.toUpperCase()] = isin;
    // Map base ticker without suffix if not already present
    const base = symbol.split('.')[0].toUpperCase();
    if (!acc[base]) {
      acc[base] = isin;
    }
    return acc;
  },
  {} as Record<string, string>
);
