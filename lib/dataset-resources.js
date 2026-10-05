const path = require('node:path');

const datasetId = 'azul-4.0.6-extracted-game-data';
// Explicit catalog: URL input never becomes a filesystem path.
const resources = ['metadata', 'species', 'moves', 'abilities', 'items', 'types',
  'encounters', 'trainers', 'trainer_types', 'maps', 'regions', 'raid_teams',
  'mechanics_detected', 'regional_dexes', 'nature_names', 'mounts',
  'trainer_lists', 'rematch_dialogue_sets', 'custom_battle_animations'];

function loadResource(resource) {
  if (!resources.includes(resource)) return null;
  return require(path.join(__dirname, '../data/datasets/azul-4.0.6-extracted', resource + '.json'));
}

function catalog() {
  return resources.map(resource => {
    const data = loadResource(resource);
    return { recurso: resource, formato: Array.isArray(data) ? 'lista' : 'objeto',
      total: Array.isArray(data) ? data.length : Object.keys(data).length,
      url: `/anil/datasets/${datasetId}/${resource}` };
  });
}

module.exports = { datasetId, resources, loadResource, catalog };
