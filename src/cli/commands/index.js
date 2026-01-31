/**
 * @fileoverview Command handlers barrel export
 */

module.exports = {
  ...require('./analyze'),
  ...require('./record'),
  ...require('./postprocessUI'),
  ...require('./postprocessSound'),
  ...require('./merge'),
  ...require('./compress'),
  ...require('./playerKills'),
  ...require('./mergeMusic'),
  ...require('./resyncMusic'),
};
