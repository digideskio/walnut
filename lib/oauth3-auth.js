'use strict';

var PromiseA = require('bluebird');

module.exports.inject = function (conf, app, pkgConf, pkgDeps) {
  var scoper = require('app-scoped-ids');
  var inProcessCache = {};
  var createClientFactory = require('sqlite3-cluster/client').createClientFactory;
  var dir = [
    { tablename: 'codes'
    , idname: 'uuid'
    , indices: ['createdAt']
    }
  , { tablename: 'logins' // coolaj86, coolaj86@gmail.com, +1-317-426-6525
    , idname: 'hashId'
    //, relations: [{ tablename: 'secrets', id: 'hashid', fk: 'loginId' }]
    , indices: ['createdAt', 'type', 'node']
    //, immutable: false
    }
  , { tablename: 'verifications'
    , idname: 'hashId' // hash(date + node)
    //, relations: [{ tablename: 'secrets', id: 'hashid', fk: 'loginId' }]
    , indices: ['createdAt', 'nodeId']
    //, immutable: true
    }
  , { tablename: 'secrets'
    , idname: 'hashId' // hash(node + secret)
    , indices: ['createdAt']
    //, immutable: true
    }
  , { tablename: 'recoveryNodes' // just for 1st-party logins
    , idname: 'hashId' //
      // TODO how transmit that something should be deleted / disabled?
    , indices: ['createdAt', 'updatedAt', 'loginHash', 'recoveryNode', 'deleted']
    }

    //
    // Accounts
    //
  , { tablename: 'accounts_logins'
    , idname: 'id' // hash(accountId + loginId)
    , indices: ['createdAt', 'revokedAt', 'loginId', 'accountId']
    }
  , { tablename: 'accounts'
    , idname: 'id' // crypto random id? or hash(name) ?
    , unique: ['name']
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'name', 'displayName']
    }

    //
    // OAuth3
    //
  , { tablename: 'private_key'
    , idname: 'id'
    , indices: ['createdAt']
    }
  , { tablename: 'oauth_clients'
    , idname: 'id'
    , indices: ['createdAt', 'updatedAt', 'accountId']
    , hasMany: ['apiKeys'] // TODO
    , belongsTo: ['account']
    , schema: function () {
        return {
          test: true
        , insecure: true
        };
      }
    }
  , { tablename: 'api_keys'
    , idname: 'id'
    , indices: ['createdAt', 'updatedAt', 'oauthClientId']
    , belongsTo: ['oauthClient'] // TODO pluralization
    , schema: function () {
        return {
          test: true
        , insecure: true
        };
      }
    }
  , { tablename: 'tokens' // note that a token functions as a session
    , idname: 'id'
    , indices: ['createdAt', 'updatedAt', 'expiresAt', 'revokedAt', 'oauthClientId', 'loginId', 'accountId']
    }
  , { tablename: 'grants'
    , idname: 'id' // sha256(scope + oauthClientId + (accountId || loginId))
    , indices: ['createdAt', 'updatedAt', 'oauthClientId', 'loginId', 'accountId']
    }
  ];

  function getAppScopedControllers(experienceId) {
    if (inProcessCache[experienceId]) {
      return PromiseA.resolve(inProcessCache[experienceId]);
    }

    var mq = require('masterquest');
    var path = require('path');
    // TODO how can we encrypt this?
    var systemFactory = createClientFactory({
      // TODO only complain if the values are different
        algorithm: 'aes'
      , bits: 128
      , mode: 'cbc'
      , dirname: path.join(__dirname, '..', '..', 'var') // TODO info.conf
      //, prefix: appname.replace(/\//g, ':') // 'com.example.'
      //, dbname: 'cluster'
      , suffix: ''
      , ext: '.sqlcipher'
      , sock: conf.sqlite3Sock
      , ipcKey: conf.ipcKey
    });
    var clientFactory = createClientFactory({
    // TODO only complain if the values are different
      dirname: path.join(__dirname, '..', '..', 'var') // TODO info.conf
    , prefix: 'com.oauth3' // 'com.example.'
    //, dbname: 'config'
    , suffix: ''
    , ext: '.sqlite3'
    , sock: conf.sqlite3Sock
    , ipcKey: conf.ipcKey
    });

    inProcessCache[experienceId] = systemFactory.create({
      init: true
    //, key: '00000000000000000000000000000000'
    , dbname: experienceId // 'com.example.'
    }).then(function (sqlStore) {
      //var db = factory.
      return mq.wrap(sqlStore, dir).then(function (models) {
        return require('./oauthclient-microservice/lib/sign-token').create(models.PrivateKey).init().then(function (signer) {
          var CodesCtrl = require('authcodes').create(models.Codes);
          /* models = { Logins, Verifications } */
          var LoginsCtrl = require('./authentication-microservice/lib/logins').create({}, CodesCtrl, models);
          /* models = { ApiKeys, OauthClients } */
          var ClientsCtrl = require('./oauthclient-microservice/lib/oauthclients').createController({}, models, signer);

          return {
            Codes: CodesCtrl
          , Logins: LoginsCtrl
          , Clients: ClientsCtrl
          , SqlFactory: clientFactory
          , models: models
          };
        });
      });
    }).then(function (ctrls) {
      inProcessCache[experienceId] = ctrls;
      return ctrls;
    });

    return inProcessCache[experienceId];
  }

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

  function getClient(req, token, priv, Controllers) {
    if (!token) {
      token = req.oauth3.token;
    }

    var cacheId = '_' + token.k + 'Client';

    if (priv[cacheId]) {
      return PromiseA.resolve(priv[cacheId]);
    }

    // TODO could get client directly by token.app (id of client)
    priv[cacheId] = Controllers.Clients.login(null, token.k).then(function (apiKey) {
      if (!apiKey) {
        return PromiseA.reject(new Error("Client no longer valid"));
      }

      priv[cacheId + 'Key'] = apiKey;
      priv[cacheId] = apiKey.oauthClient;

      return apiKey.oauthClient;
    });

    return priv[cacheId];
  }

  function getAccountsByLogin(req, token, priv, Controllers, loginId, decrypt) {
    return getClient(req, req.oauth.token, priv).then(function (oauthClient) {
      if (decrypt) {
        loginId = scoper.unscope(loginId, oauthClient.secret);
      }

      return Controllers.models.AccountsLogins.find({ loginId: loginId }).then(function (accounts) {
        return PromiseA.all(accounts.map(function (obj) {
          return Controllers.models.Accounts.get(obj.accountId)/*.then(function (account) {
            account.appScopedId = weakCipher(oauthClient.secret, account.id);
            return account;
          })*/;
        }));
      });
    });
  }

  function getAccountsByArray(req, Controllers, arr) {
    return PromiseA.all(arr.map(function (accountId) {
      return Controllers.models.Accounts.get(accountId.id || accountId);
    }));
  }

  function getAccounts(req, token, priv, Controllers) {
    if (!token) {
      token = req.oauth3.token;
    }

    var err;

    if (priv._accounts) {
      return PromiseA.resolve(priv._accounts);
    }

    if ((req.oauth3.token.idx || req.oauth3.token.usr) && ('password' === req.oauth3.token.grt || 'login' === req.oauth3.token.as)) {
      priv._accounts = getAccountsByLogin(req, req.oauth3.token, priv, Controllers, (req.oauth3.token.idx || req.oauth3.token.usr), !!req.oauth3.token.idx);
    } else if (req.oauth3.token.axs && req.oauth3.token.axs.length || req.oauth3.token.acx) {
      req.oauth3._accounts = getAccountsByArray(req, Controllers, req.oauth3.token.axs && req.oauth3.token.axs.length && req.oauth3.token.axs || [req.oauth3.token.acx]);
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

  function getLoginId(req, token, priv/*, Controllers*/) {
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

  function getLogin(req, token, priv, Controllers) {
    if (!token) {
      token = req.oauth3.token;
    }

    var cacheId = '_' + token.idx + 'Login';

    if (priv[cacheId]) {
      return PromiseA.resolve(priv[cacheId]);
    }

    priv[cacheId] = getLoginId(req, token, priv).then(function (loginId) {
      // DB.Logins.get(hashId)
      return Controllers.Logins.rawGet(loginId).then(function (login) {
        priv[cacheId] = login;

        return login;
      });
    });

    return priv[cacheId];
  }

  function attachOauth3(req, res, next) {
    var privs = {};
    req.oauth3 = {};

    getAppScopedControllers(req.experienceId).then(function (Controllers) {

      return parseAccessToken(req).then(function (token) {
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

        req.oauth3.getLoginId = function (token) {
          getLoginId(req, token || req.oauth3.token, privs, Controllers);
        };

        req.oauth3.getLogin = function (token) {
          getLogin(req, token || req.oauth3.token, privs, Controllers);
        };

        // TODO modify prototypes?
        req.oauth3.getClient = function (token) {
          getClient(req, token || req.oauth3.token, privs, Controllers);
        };

        // TODO req.oauth3.getAccountIds
        req.oauth3.getAccounts = function (token) {
          getAccounts(req, token || req.oauth3.token, privs, Controllers);
        };

        next();
      });
    });
  }

  app.use('/', cors);

  app.use('/', attachOauth3);
};
