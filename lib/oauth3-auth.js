'use strict';

var PromiseA = require('bluebird');

module.exports.inject = function (app) {
  //var jwsUtils = require('./lib/jws-utils').create(signer);
  var CORS = require('connect-cors');
  var cors = CORS({ credentials: true, headers: [
    'X-Requested-With'
  , 'X-HTTP-Method-Override'
  , 'Content-Type'
  , 'Accept'
  , 'Authorization'
  ], methods: [ "GET", "POST", "PATCH", "PUT", "DELETE" ] });

  // Allows CORS access to API with ?access_token=
  // TODO Access-Control-Max-Age: 600
  // TODO How can we help apps handle this? token?
  // TODO allow apps to configure trustedDomains, auth, etc

  //function weakDecipher(secret, val) { return require('./weak-crypt').weakDecipher(val, secret); }

  //
  // Generic Session / Login / Account Routes
  //
  function parseAccessToken(req, opts) {
    var token;
    var parts;
    var scheme;
    var credentials;

    if (req.headers && req.headers.authorization) {
      parts = req.headers.authorization.split(' ');

      if (parts.length !== 2) {
        return PromiseA.reject(new Error("malformed Authorization header"));
      }

      scheme = parts[0];
      credentials = parts[1];

      if (-1 !== (opts && opts.schemes || ['token', 'bearer']).indexOf(scheme.toLowerCase())) {
        token = credentials;
      }
    }

    if (req.body && req.body.access_token) {
      if (token) { PromiseA.reject(new Error("token exists in header and body")); }
      token = req.body.access_token;
    }

    // TODO disallow query with req.method === 'GET'
    // (cookies should be used for protected static assets)
    if (req.query && req.query.access_token) {
      if (token) { PromiseA.reject(new Error("token already exists in either header or body and also in query")); }
      token = req.query.access_token;
    }

    /*
    err = new Error(challenge());
    err.code = 'E_BEARER_REALM';

    if (!token) { return PromiseA.reject(err); }
    */

    return PromiseA.resolve(token);
  }

  function getToken(req, res, next) {
    req.oauth3 = {};

    parseAccessToken(req).then(function (token) {
      if (!token) {
        next();
        return;
      }

      var jwt = require('jsonwebtoken');
      var data = jwt.decode(token);
      var err;

      if (!data) {
        err = new Error('not a json web token');
        err.code = 'E_NOT_JWT';
        res.send({
          error: err.code
        , error_description: err.message
        , error_url: 'https://oauth3.org/docs/errors#' + (err.code || 'E_UNKNOWN_EXCEPTION')
        });
        // PromiseA.reject(err);
        return;
      }

      req.oauth3.token = token;

      next();
    });
  }

  app.use('/', function (req, res, next) {
    //console.log('[DEBUG CORS]', req.method, req.hostname, req.url);
    cors(req, res, next);
  });

  app.use('/', getToken);
};
