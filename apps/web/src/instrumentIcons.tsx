import type { InstrumentRecord } from "./api";

/**
 * Домены компаний для favicon-сервиса DuckDuckGo — Clearbit Logo API (стандартный
 * бесплатный вариант) больше не резолвится (DNS-ошибка, проверено вживую), поэтому
 * используется DuckDuckGo как рабочая альтернатива.
 */
const EQUITY_DOMAINS: Record<string, string> = {
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  NVDA: "nvidia.com",
  GOOGL: "abc.xyz",
  AMZN: "amazon.com",
  META: "meta.com",
  TSLA: "tesla.com",
  AVGO: "broadcom.com",
  NFLX: "netflix.com",
  AMD: "amd.com",
  ADBE: "adobe.com",
  INTC: "intel.com",
  CSCO: "cisco.com",
  PEP: "pepsico.com",
  COST: "costco.com",
  QCOM: "qualcomm.com",
  TXN: "ti.com",
  INTU: "intuit.com",
  AMGN: "amgen.com",
  SBUX: "starbucks.com",
  BKNG: "bookingholdings.com",
  ISRG: "intuitivesurgical.com",
  MDLZ: "mondelezinternational.com",
  GILD: "gilead.com",
  ADI: "analog.com",
  REGN: "regeneron.com",
  VRTX: "vrtx.com",
  PYPL: "paypal.com",
  MU: "micron.com",
  LRCX: "lamresearch.com",
  PANW: "paloaltonetworks.com",
  SNPS: "synopsys.com",
  CDNS: "cadence.com",
  MRVL: "marvell.com",
  ORLY: "oreillyauto.com",
  MAR: "marriott.com",
  ABNB: "airbnb.com",
  CRWD: "crowdstrike.com",
  ASML: "asml.com",
};

/** ISO 3166-1 alpha-2 (плюс условный "eu") — коды для flagcdn.com. */
const CURRENCY_COUNTRY: Record<string, string> = {
  EUR: "eu",
  USD: "us",
  GBP: "gb",
  JPY: "jp",
  CHF: "ch",
  AUD: "au",
  CAD: "ca",
  NZD: "nz",
  CNH: "cn",
  MXN: "mx",
};

function hideBrokenImage(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.visibility = "hidden";
}

function GenericIcon({ letter }: { letter: string }) {
  return <span className="instrument-icon-fallback">{letter}</span>;
}

export function InstrumentIcon({ instrument }: { instrument: InstrumentRecord }) {
  if (instrument.assetClass === "CRYPTO") {
    const base = instrument.symbol.replace(/USDT$/i, "").toLowerCase();
    return (
      <img
        className="instrument-icon"
        src={`https://assets.coincap.io/assets/icons/${base}@2x.png`}
        alt=""
        onError={hideBrokenImage}
      />
    );
  }

  if (instrument.assetClass === "EQUITY") {
    const domain = EQUITY_DOMAINS[instrument.symbol];
    if (!domain) return <GenericIcon letter={instrument.symbol.charAt(0)} />;
    return (
      <img className="instrument-icon" src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} alt="" onError={hideBrokenImage} />
    );
  }

  if (instrument.assetClass === "FOREX") {
    const [base, quote] = instrument.symbol.split("/");
    const baseCode = base ? CURRENCY_COUNTRY[base] : undefined;
    const quoteCode = quote ? CURRENCY_COUNTRY[quote] : undefined;
    if (!baseCode && !quoteCode) return <GenericIcon letter={instrument.symbol.charAt(0)} />;
    return (
      <span className="instrument-icon-flag-pair">
        {baseCode && (
          <img className="instrument-icon instrument-icon-flag" src={`https://flagcdn.com/${baseCode}.svg`} alt="" onError={hideBrokenImage} />
        )}
        {quoteCode && (
          <img className="instrument-icon instrument-icon-flag" src={`https://flagcdn.com/${quoteCode}.svg`} alt="" onError={hideBrokenImage} />
        )}
      </span>
    );
  }

  return <GenericIcon letter="B" />;
}
