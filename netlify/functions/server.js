// Ponto de entrada na Netlify: a mesma aplicação do servidor local, executada como função serverless.
'use strict';
const serverless = require('serverless-http');
const { server } = require('../../server/server');

exports.handler = serverless((req, res) => server.emit('request', req, res));
