'use strict';

module.exports.create = function (xconfx, apiFactories, apiDeps) {
  var PromiseA = apiDeps.Promise;
  var express = require('express');
  var fs = PromiseA.promisifyAll(require('fs'));
  var path = require('path');
  var localCache = { apis: {}, pkgs: {} };

  // TODO xconfx.apispath
  xconfx.apispath = path.join(__dirname, '..', '..', 'packages', 'apis');

  function notConfigured(req, res) {
    res.send({ error: { message: "api '" + req.apiId + "' not configured for domain '" + req.experienceId + "'" } });
  }

  function loadApi(conf, pkgConf, pkgDeps, packagedApi) {
    function handlePromise(p) {
      return p.then(function (api) {
        packagedApi._api = api;
        return api;
      });
    }

    if (!packagedApi._promise_api) {
      packagedApi._promise_api = getApi(conf, pkgConf, pkgDeps, packagedApi);
    }

    return handlePromise(packagedApi._promise_api);
  }

  function getApi(conf, pkgConf, pkgDeps, packagedApi) {
    var PromiseA = pkgDeps.Promise;
    var path = require('path');
    var pkgpath = path.join(pkgConf.apipath, packagedApi.id/*, (packagedApi.api.version || '')*/);

    // TODO needs some version stuff (which would also allow hot-loading of updates)
    // TODO version could be tied to sha256sum

    return new PromiseA(function (resolve, reject) {
      var myApp;
      var ursa;
      var promise;

      // TODO dynamic requires are a no-no
      // can we statically generate a require-er? on each install?
      // module.exports = { {{pkgpath}}: function () { return require({{pkgpath}}) } }
      // requirer[pkgpath]()
      myApp = pkgDeps.express();
      myApp.disable('x-powered-by');
      if (pkgDeps.app.get('trust proxy')) {
        myApp.set('trust proxy', pkgDeps.app.get('trust proxy'));
      }
      if (!pkgConf.pubkey) {
        /*
          return ursa.createPrivateKey(pem, password, encoding);
          var pem = myKey.toPrivatePem();
          return jwt.verifyAsync(token, myKey.toPublicPem(), { ignoreExpiration: false && true }).then(function (decoded) {
          });
        */
        ursa = require('ursa');
        pkgConf.keypair = ursa.createPrivateKey(pkgConf.privkey, 'ascii');
        pkgConf.pubkey = ursa.createPublicKey(pkgConf.pubkey, 'ascii'); //conf.keypair.toPublicKey();
      }

      try {
        packagedApi._apipkg = require(path.join(pkgpath, 'package.json'));
        packagedApi._apiname = packagedApi._apipkg.name;
        if (packagedApi._apipkg.walnut) {
          pkgpath += '/' + packagedApi._apipkg.walnut;
        }
        promise = PromiseA.resolve(require(pkgpath).create(pkgConf, pkgDeps, myApp));
      } catch(e) {
        reject(e);
        return;
      }

      promise.then(function () {
        // TODO give pub/priv pair for app and all public keys
        // packagedApi._api = require(pkgpath).create(pkgConf, pkgDeps, myApp);
        packagedApi._api = require('express-lazy')();
        packagedApi._api_app = myApp;

        //require('./oauth3-auth').inject(conf, packagedApi._api, pkgConf, pkgDeps);
        pkgDeps.getOauth3Controllers =
        packagedApi._getOauth3Controllers = require('oauthcommon/example-oauthmodels').create(conf).getControllers;
        require('oauthcommon').inject(packagedApi._getOauth3Controllers, packagedApi._api, pkgConf, pkgDeps);

        // DEBUG
        //
        /*
        packagedApi._api.use('/', function (req, res, next) {
          console.log('[DEBUG pkgApiApp]', req.method, req.hostname, req.url);
          next();
        });
        //*/

        // TODO fix backwards compat

        // /api/com.example.foo (no change)
        packagedApi._api.use('/', packagedApi._api_app);

        // /api/com.example.foo => /api
        packagedApi._api.use('/', function (req, res, next) {
          var priorUrl = req.url;
          req.url = '/api' + req.url.slice(('/api/' + packagedApi.id).length);
          // console.log('api mangle 3:', req.url);
          packagedApi._api_app(req, res, function (err) {
            req.url = priorUrl;
            next(err);
          });
        });

        // /api/com.example.foo => /
        packagedApi._api.use('/api/' + packagedApi.id, function (req, res, next) {
          // console.log('api mangle 2:', '/api/' + packagedApi.id, req.url);
          // console.log(packagedApi._api_app.toString());
          packagedApi._api_app(req, res, next);
        });

        resolve(packagedApi._api);
      }, reject);
    });
  }

  // Read packages/apis/sub.sld.tld (forward dns) to find list of apis as tld.sld.sub (reverse dns)
  // TODO packages/allowed_apis/sub.sld.tld (?)
  // TODO auto-register org.oauth3.consumer for primaryDomain (and all sites?)
  function loadApiHandler() {
    return function handler(req, res, next) {
      var name = req.experienceId;
      var apiId = req.apiId;
      var packagepath = path.join(xconfx.apispath, name);

      return fs.readFileAsync(packagepath, 'utf8').then(function (text) {
        return text.trim().split(/\n/);
      }, function () {
        return [];
      }).then(function (apis) {
        return function (req, res, next) {
          var apipath;

          if (!apis.some(function (api) {
            if (api === apiId) {
              return true;
            }
          })) {
            if (req.experienceId === ('api.' + xconfx.setupDomain) && 'org.oauth3.consumer' === apiId) {
              // fallthrough
            } else {
              return null;
            }
          }

          apipath = path.join(xconfx.apispath, apiId);

          if (!localCache.pkgs[apiId]) {
            return fs.readFileAsync(path.join(apipath, 'package.json'), 'utf8').then(function (text) {
              var pkg = JSON.parse(text);
              var deps = {};
              var myApp;

              if (pkg.walnut) {
                apipath = path.join(apipath, pkg.walnut);
              }

              Object.keys(apiDeps).forEach(function (key) {
                deps[key] = apiDeps[key];
              });
              Object.keys(apiFactories).forEach(function (key) {
                deps[key] = apiFactories[key];
              });

              // TODO pull db stuff from package.json somehow and pass allowed data models as deps
              //
              // how can we tell which of these would be correct?
              // deps.memstore = apiFactories.memstoreFactory.create(apiId);
              // deps.memstore = apiFactories.memstoreFactory.create(req.experienceId);
              // deps.memstore = apiFactories.memstoreFactory.create(req.experienceId + apiId);

              // let's go with this one for now and the api can choose to scope or not to scope
              deps.memstore = apiFactories.memstoreFactory.create(apiId);

              console.log('DEBUG apipath', apipath);
              myApp = express();
              //
              // TODO handle /accounts/:accountId
              //
              return PromiseA.resolve(require(apipath).create({}/*pkgConf*/, deps/*pkgDeps*/, myApp/*myApp*/)).then(function (handler) {
                localCache.pkgs[apiId] = { pkg: pkg, handler: handler || myApp, createdAt: Date.now() };
                localCache.pkgs[apiId].handler(req, res, next);
              });
            });
          }
          else {
            localCache.pkgs[apiId].handler(req, res, next);
            // TODO expire require cache
            /*
            if (Date.now() - localCache.pkgs[apiId].createdAt < (5 * 60 * 1000)) {
              return;
            }
            */
          }
        };
      }, function (/*err*/) {
        return null;
      }).then(function (handler) {

        // keep object reference intact
        // DO NOT cache non-existant api
        if (handler) {
          localCache.apis[name].handler = handler;
        } else {
          handler = notConfigured;
        }
        handler(req, res, next);
      });
    };
  }

  return function (req, res, next) {
    var experienceId = req.hostname + req.url.replace(/\/api\/.*/, '/').replace(/\/+/g, '#').replace(/#$/, '');
    var apiId = req.url.replace(/.*\/api\//, '').replace(/\/.*/, '');

    Object.defineProperty(req, 'experienceId', {
      enumerable: true
    , configurable: false
    , writable: false
      // TODO this identifier may need to be non-deterministic as to transfer if a domain name changes but is still the "same" app
      // (i.e. a company name change. maybe auto vs manual register - just like oauth3?)
      // NOTE: probably best to alias the name logically
    , value: experienceId
    });
    Object.defineProperty(req, 'apiId', {
      enumerable: true
    , configurable: false
    , writable: false
    , value: apiId
    });

    if (!localCache.apis[experienceId]) {
      localCache.apis[experienceId] = { handler: loadApiHandler(experienceId), createdAt: Date.now() };
    }

    localCache.apis[experienceId].handler(req, res, next);
    if (Date.now() - localCache.apis[experienceId].createdAt > (5 * 60 * 1000)) {
      localCache.apis[experienceId] = { handler: loadApiHandler(experienceId), createdAt: Date.now() };
    }
  };
};
