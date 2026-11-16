import {marketFamily} from './research-candidates.mjs';
import {shadowSelectionKey} from './shadow-model.mjs';

export const NBA_CALIBRATION_VERSION = 'nba-prop-calibration-nov10-v1';
export const ACTIVE_PROP_VERSION = 'season-team-guard-v4-temporal-coverage';

// Game-weighted logistic calibration fit on the NBA evaluation cohort, November 4–10.
// Training used outcomes verified before the first November 13 holdout capture.
const coefficients = {
 counts: [-0.06728990879242852, 0.4418065944860165],
 scoring: [-0.1269370812933508, 0.31284503429230853]
};

export function nbaCalibration(model, quote, game, activeVersion, now = new Date()) {
 const fitted = coefficients[marketFamily(quote)];
 const {pWin, pPush} = model;
 const start = Date.parse(game.start), priceTime = Date.parse(quote.asOf);
 if (activeVersion !== ACTIVE_PROP_VERSION || quote.league !== 'NBA' || !fitted ||
     !Number.isFinite(start) || start <= now.getTime() ||
     !Number.isFinite(priceTime) || priceTime > now.getTime() ||
     !Number.isFinite(pWin) || pWin < 0 ||
     !Number.isFinite(pPush) || pPush < 0 || pPush >= 1 || pWin + pPush > 1 + 1e-9) return null;
 const [intercept, slope] = fitted;
 const p = Math.max(.001, Math.min(.999, pWin / (1 - pPush)));
 const probability = 1 / (1 + Math.exp(-(intercept + slope * Math.log(p / (1 - p)))));
 return {version:NBA_CALIBRATION_VERSION, activeVersion, createdAt:now.toISOString(),
  selectionKey:shadowSelectionKey(quote), activeWin:pWin, activePush:pPush, probability};
}

export function archivedNbaCalibration(pick, activeVersion, savedAt) {
 const saved = pick.nbaCalibration;
 if (activeVersion !== ACTIVE_PROP_VERSION || saved?.version !== NBA_CALIBRATION_VERSION ||
     saved.activeVersion !== activeVersion || saved.activeWin !== pick.experimentalProbability ||
     saved.activePush !== pick.modelEvidence?.pPush || pick.quote?.league !== 'NBA' ||
     saved.selectionKey !== shadowSelectionKey(pick.quote) ||
     !Number.isFinite(saved.probability) || saved.probability < 0 || saved.probability > 1) return null;
 const created = Date.parse(saved.createdAt), price = Date.parse(pick.asOf), start = Date.parse(pick.game?.start);
 return Number.isFinite(created) && created >= price && created <= Date.parse(savedAt) && created < start ? saved : null;
}
