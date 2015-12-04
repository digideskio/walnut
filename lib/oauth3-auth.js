'use strict';

var PromiseA = require('bluebird');
var scoper = require('app-scoped-ids');

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

  function getClient(req, token, priv) {
    if (!token) {
      token = req.oauth3.token;
    }

    var cacheId = '_' + token.k + 'Client';

    if (priv[cacheId]) {
      return PromiseA.resolve(priv[cacheId]);
    }

    // TODO could get client directly by token.app (id of client)
    priv[cacheId] = ClientsCtrl.login(null, token.k).then(function (apiKey) {
      if (!apiKey) {
        return PromiseA.reject(new Error("Client no longer valid"));
      }

      priv[cacheId + 'Key'] = apiKey;
      priv[cacheId] = apiKey.oauthClient;

      return apiKey.oauthClient;
    });

    return priv[cacheId];
  }

  function getLoginId(req, token, priv) {
    if (!token) {
      token = req.oauth3.token;
    }

    var cacheId = '_' + token.idx + 'LoginId';

    if (priv[cacheId]) {
      return PromiseA.resolve(priv[cacheId]);
    }

    // TODO
    // this ends up defeating part of the purpose of JWT (few database calls)
    // perhaps the oauthClient secret should be sent, encrypted with a master key,
    // with the request? Or just mash the oauthClient secret with the loginId
    // and encrypt with the master key?
    priv._loginId = getClient(req, token, priv).then(function (oauthClient) {
      var loginId;

      if (token.idx) {
        loginId = scoper.unscope(token.idx, oauthClient.secret);
      } else {
        loginId = token.usr;
      }

      priv[cacheId] = loginId;

      return loginId;
    });

    return priv[cacheId];
  }

  function getLogin(req, token, priv) {
    if (!token) {
      token = req.oauth3.token;
    }

    var cacheId = '_' + token.idx + 'Login';

    if (priv[cacheId]) {
      return PromiseA.resolve(priv[cacheId]);
    }

    priv[cacheId] = getLoginId(req, token, priv).then(function (loginId) {
      return LoginsCtrl.rawGet(loginId).then(function (login) {
        priv[cacheId] = login;

        return login;
      });
    });

    return priv[cacheId];
  }

  function getAccountsByLogin(req, token, priv, loginId, decrypt) {
    return getClient(req, req.oauth.token, priv).then(function (oauthClient) {
      if (decrypt) {
        loginId = scoper.unscope(loginId, oauthClient.secret);
      }

      return Db.AccountsLogins.find({ loginId: loginId }).then(function (accounts) {
        return PromiseA.all(accounts.map(function (obj) {
          return Db.Accounts.get(obj.accountId)/*.then(function (account) {
            account.appScopedId = weakCipher(oauthClient.secret, account.id);
            return account;
          })*/;
        }));
      });
    });
  }

  function getAccountsByArray(req, arr) {
    return PromiseA.all(arr.map(function (accountId) {
      return Db.Accounts.get(accountId.id || accountId);
    }));
  }

  function getAccounts(req, token, priv) {
    if (!token) {
      token = req.oauth3.token;
    }

    var err;

    if (priv._accounts) {
      return PromiseA.resolve(priv._accounts);
    }

    if ((req.oauth3.token.idx || req.oauth3.token.usr) && ('password' === req.oauth3.token.grt || 'login' === req.oauth3.token.as)) {
      priv._accounts = getAccountsByLogin(req, req.oauth3.token, priv, (req.oauth3.token.idx || req.oauth3.token.usr), !!req.oauth3.token.idx);
    } else if (req.oauth3.token.axs && req.oauth3.token.axs.length || req.oauth3.token.acx) {
      req.oauth3._accounts = getAccountsByArray(req, req.oauth3.token.axs && req.oauth3.token.axs.length && req.oauth3.token.axs || [req.oauth3.token.acx]);
    } else {
      err = new Error("neither login nor accounts were specified");
      err.code = "E_NO_AUTHZ";
      req.oauth3._accounts = PromiseA.reject(err);
    }

    req.oauth3._accounts.then(function (accounts) {
      req.oauth3._accounts = accounts;

      return accounts;
    });

    return req.oauth3._accounts;
  }

  function promiseCredentials(req, res, next) {
    var privs = {};

    // TODO modify prototypes?
    req.oauth3.getClient = function (token) {
      getClient(req, token || req.oauth3.token, privs);
    };

    req.oauth3.getLoginId = function (token) {
      getLoginId(req, token || req.oauth3.token, privs);
    };

    req.oauth3.getLogin = function (token) {
      getLogin(req, token || req.oauth3.token, privs);
    };

    // TODO req.oauth3.getAccountIds
    req.oauth3.getAccounts = function (token) {
      getAccounts(req, token || req.oauth3.token, privs);
    };

    next();
  }

  app.use('/', cors);

  app.use('/', getToken);

  app.use('/', promiseCredentials);
};
