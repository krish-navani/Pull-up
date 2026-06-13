const handler = require('../../backend/dist/server.js').default;

module.exports = async (req, res) => {
  return handler(req, res);
};
