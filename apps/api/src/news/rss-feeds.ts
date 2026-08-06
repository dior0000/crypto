/**
 * Дефолтные RSS-фиды финансовых новостей. Список переопределяется через
 * env NEWS_RSS_FEEDS (через запятую) — эти URL не привязаны к аккаунту
 * и не требуют API-ключа, но при желании их можно заменить любыми другими.
 */
export const DEFAULT_NEWS_RSS_FEEDS = [
  "https://finance.yahoo.com/news/rssindex",
  "http://feeds.marketwatch.com/marketwatch/topstories/",
];
