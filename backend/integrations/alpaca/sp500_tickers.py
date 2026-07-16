"""Static S&P 500 constituents for the MVP.

Alpaca Market Data does not expose an official “S&P 500 members” endpoint, so
the free-tier client ships a curated ticker universe. Refresh periodically from
an index provider when moving beyond the MVP.

Replace with Polygon.io (or another constituents feed) when scaling.
"""

from __future__ import annotations

# Snapshot of liquid S&P 500 symbols used by PropPredict stock markets.
# Not every index change is reflected immediately — treat as MVP seed data.
SP500_TICKERS: tuple[str, ...] = (
    "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "GOOG", "META", "BRK.B", "AVGO", "TSLA",
    "JPM", "LLY", "V", "UNH", "XOM", "MA", "COST", "HD", "PG", "JNJ",
    "WMT", "ABBV", "NFLX", "MRK", "BAC", "CRM", "ORCL", "KO", "AMD", "PEP",
    "CVX", "TMO", "ACN", "LIN", "CSCO", "MCD", "ABT", "ADBE", "WFC", "IBM",
    "GE", "PM", "CAT", "NOW", "TXN", "QCOM", "ISRG", "INTU", "VZ", "DIS",
    "CMCSA", "AMGN", "PFE", "SPGI", "BX", "MS", "AXP", "BA", "T", "NEE",
    "UNP", "PGR", "RTX", "LOW", "HON", "GS", "BKNG", "BLK", "SYK", "TJX",
    "VRTX", "UBER", "PLD", "ELV", "C", "MDT", "ADP", "REGN", "CB", "SBUX",
    "LMT", "MMC", "AMT", "DE", "BMY", "ADI", "GILD", "CI", "SCHW", "ETN",
    "FI", "PANW", "SO", "BSX", "TMUS", "DUK", "EQIX", "SHW", "ICE", "MO",
    "KLAC", "CME", "SNPS", "ZTS", "CDNS", "PH", "WM", "ITW", "MCO", "TT",
    "CSX", "CL", "BDX", "MCK", "NOC", "CMG", "EOG", "TDG", "APD", "ORLY",
    "FCX", "USB", "CVS", "PYPL", "ECL", "AON", "EMR", "GD", "PNC", "HCA",
    "MPC", "SLB", "PSX", "TGT", "ADSK", "NXPI", "MAR", "WELL", "ROP", "AJG",
    "CARR", "NSC", "AFL", "PCAR", "WMB", "AZO", "CPRT", "OXY", "MSI", "AIG",
    "FTNT", "ROST", "SPG", "D", "SRE", "O", "PSA", "GM", "KMB", "ALL",
    "AEP", "MET", "F", "HES", "AMP", "MSCI", "GIS", "CTAS", "IDXX", "PAYX",
    "TEL", "LHX", "TRV", "VLO", "PCG", "DXCM", "YUM", "EXC", "CTVA", "KMI",
    "NEM", "IQV", "DOW", "JCI", "PRU", "MNST", "COR", "SYY", "KR", "OTIS",
    "RSG", "ODFL", "FAST", "CNC", "IT", "GWW", "GEHC", "AME", "CTSH", "VRSK",
    "EA", "URI", "HLT", "FICO", "IR", "MLM", "EXR", "XEL", "RCL", "EFX",
    "CHTR", "BIIB", "DD", "VICI", "ED", "WAB", "GLW", "KEYS", "VMC", "PEG",
    "ANSS", "RMD", "CAH", "DAL", "DFS", "HWM", "STZ", "CBRE", "WTW", "AVB",
    "PPG", "TSCO", "AWK", "CDW", "WEC", "MTD", "DLR", "FITB", "EBAY", "ROK",
    "EIX", "HIG", "HPQ", "TTWO", "WST", "DHI", "KDP", "FANG", "MTB", "XYL",
    "EQR", "FTV", "DOV", "NTAP", "CHD", "SBAC", "TROW", "NUE", "GPN", "RJF",
    "BR", "STE", "HUBB", "PHM", "FE", "LYB", "INVH", "IEX", "PPL", "ES",
    "A", "MOH", "BALL", "ULTA", "LDOS", "EXPD", "STT", "TDY", "BAX", "BRO",
    "CINF", "ARE", "WAT", "HOLX", "SYF", "ZBH", "MAA", "DRI", "CLX", "WDC",
    "ATO", "CMS", "TSN", "AVY", "JBHT", "RF", "NVR", "ESS", "ALGN", "PKG",
    "CF", "TRGP", "LUV", "APTV", "MKC", "CNP", "PTC", "TER", "WRB", "NTRS",
    "LH", "DG", "STLD", "CEG", "BG", "IP", "L", "POOL", "VTRS", "SNA",
    "SWK", "CFG", "JBL", "KEY", "EPAM", "MRO", "AKAM", "K", "NDAQ", "EG",
    "LNT", "PFG", "TYL", "NRG", "DPZ", "CE", "BBY", "EVRG", "SWKS", "MAS",
    "TECH", "JKHY", "UDR", "CRL", "GEN", "HPE", "TXT", "EMN", "AES", "CPT",
    "JNPR", "ENPH", "CAG", "NI", "DOC", "FFIV", "REG", "HSIC", "HST", "ALLE",
    "BXP", "APA", "PAYC", "LW", "QRVO", "INCY", "AOS", "MKTX", "UHS", "DAY",
    "CPB", "FOXA", "FOX", "MTCH", "CZR", "TAP", "NCLH", "GNRC", "IVZ", "WYNN",
    "MOS", "HAS", "RL", "FRT", "BEN", "AAL", "PARA", "DVA", "MHK", "BBWI",
)
