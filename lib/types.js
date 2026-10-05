const { types } = require('./game-data');
const TYPE_CHART = {};
for (const atk of types) {
  TYPE_CHART[atk.id.toLowerCase()] = {};
  for (const def of types) {
    TYPE_CHART[atk.id.toLowerCase()][def.id.toLowerCase()] = def.immunities.includes(atk.id) ? 0 : def.weaknesses.includes(atk.id) ? 2 : def.resistances.includes(atk.id) ? 0.5 : 1;
  }
}
function getEffectiveness(moveType, defTypes) {
  return defTypes.reduce((mult, type) => mult * (TYPE_CHART[moveType]?.[type] ?? 1), 1);
}
module.exports = { TYPE_CHART, getEffectiveness };
