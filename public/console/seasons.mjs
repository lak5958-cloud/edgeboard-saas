/** Conservative ESPN season classification. Unknown phases never enter betting hit rates. */
const TYPES = new Map([[1, 'preseason'], [2, 'regular'], [3, 'postseason']]);
export function normalizeSeason(value) {
  if (value && typeof value === 'object') value = value.type ?? value.id ?? value.slug ?? value.name ?? value.abbreviation;
  if (value == null || value === '') return 'unknown';
  if (TYPES.has(Number(value))) return TYPES.get(Number(value));
  const s = String(value).toLowerCase().replace(/[\s_]+/g, '-');
  if (/pre-?season|pre-?seasonal/.test(s)) return 'preseason';
  if (/regular|reg-?season/.test(s)) return 'regular';
  if (/post|playoff/.test(s)) return 'postseason';
  return 'unknown';
}
export function eventSeason(event = {}, summary = null) {
  const paths = [
    event.season?.type, event.season?.slug, event.season?.name,
    event.seasonType?.id, event.seasonType?.type, event.seasonType,
    event.competitions?.[0]?.type?.slug,
    summary?.header?.season?.type,
    summary?.header?.season?.slug,
    summary?.header?.season?.name,
    summary?.season?.type, summary?.season?.slug
  ];
  const seasons = paths.map(normalizeSeason).filter(x => x !== 'unknown');
  if (seasons.length === 0) return 'unknown';
  // Conflicting season identifiers are unsafe to classify.
  return new Set(seasons).size === 1 ? seasons[0] : 'unknown';
}
export function seasonYear(league, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  // Football season is named after the autumn calendar year;
  // NBA season is named after the autumn that begins it.
  return m >= 7 ? y : y - 1;
}
export function normalizeSeasonGame(game) {
  const type = normalizeSeason(game?.seasonType ?? game?.season_type);
  const year = Number.isFinite(Number(game?.seasonYear)) && game.seasonYear != null ? Number(game.seasonYear) : seasonYear(null, game?.date);
  return { ...game, seasonType: type, seasonYear: year };
}
