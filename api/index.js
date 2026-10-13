// Ponto de entrada na Vercel: a mesma aplicação do servidor local, executada como função serverless.
'use strict';
const { server } = require('../server/server');

module.exports = (req, res) => server.emit('request', req, res);
