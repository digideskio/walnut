'use strict';

var escapeStringRegexp = require('escape-string-regexp');
//var apiHandlers = {};

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

function runApi(opts, router, req, res, next) {
  var path = require('path');
  var pkgConf = opts.config;
  var pkgDeps = opts.deps;
  //var Services = opts.Services;
  var packagedApi;
  var pathname;

  // TODO compile packagesMap
  // TODO people may want to use the framework in a non-framework way (i.e. to conceal the module name)
  router.packagedApis.some(function (_packagedApi) {
    // console.log('[DEBUG _packagedApi.id]', _packagedApi.id);
    pathname = router.pathname;
    if ('/' === pathname) {
      pathname = '';
    }
    // TODO allow for special apis that do not follow convention (.well_known, webfinger, oauth3.html, etc)
    if (!_packagedApi._api_re) {
      _packagedApi._api_re = new RegExp(escapeStringRegexp(pathname + '/api/' + _packagedApi.id) + '\/([\\w\\.\\-]+)(\\/|\\?|$)');
      //console.log('[api re 2]', _packagedApi._api_re);
    }
    if (_packagedApi._api_re.test(req.url)) {
      packagedApi = _packagedApi;
      return true;
    }
  });

  if (!packagedApi) {
    console.log("[ODD] no api for '" + req.url + "'");
    next();
    return;
  }

  // Reaching this point means that there are APIs for this pathname
  // it is important to identify this host + pathname (example.com/foo) as the app
  Object.defineProperty(req, 'experienceId', {
    enumerable: true
  , configurable: false
  , writable: false
    // TODO this identifier may need to be non-deterministic as to transfer if a domain name changes but is still the "same" app
    // (i.e. a company name change. maybe auto vs manual register - just like oauth3?)
    // NOTE: probably best to alias the name logically
  , value: (path.join(req.hostname, pathname || '')).replace(/\/$/, '')
  });
  Object.defineProperty(req, 'escapedExperienceId', {
    enumerable: true
  , configurable: false
  , writable: false
    // TODO this identifier may need to be non-deterministic as to transfer if a domain name changes but is still the "same" app
    // (i.e. a company name change. maybe auto vs manual register - just like oauth3?)
    // NOTE: probably best to alias the name logically
  , value: req.experienceId.replace(/\//g, ':')
  });
  // packageId should mean hash(api.id + host + path) - also called "api"
  Object.defineProperty(req, 'packageId', {
    enumerable: true
  , configurable: false
  , writable: false
    // TODO this identifier may need to be non-deterministic as to transfer if a domain name changes but is still the "same" app
    // (i.e. a company name change. maybe auto vs manual register - just like oauth3?)
    // NOTE: probably best to alias the name logically
  , value: packagedApi.domain.id
  });
  Object.defineProperty(req, 'appConfig', {
    enumerable: true
  , configurable: false
  , writable: false
  , value: {}       // TODO just the app-scoped config
  });
  Object.defineProperty(req, 'appDeps', {
    enumerable: true
  , configurable: false
  , writable: false
  , value: {}       // TODO app-scoped deps
                    // i.e. when we need to use things such as stripe id
                    // without exposing them to the app
  });

  //
  // TODO user authentication should go right about here
  //

  //
  // TODO freeze objects for passing them into app
  //

  if (packagedApi._api) {
    packagedApi._api(req, res, next);
    return;
  }

  // console.log("[DEBUG pkgpath]", pkgConf.apipath, packagedApi.id);
  loadApi(opts.conf, pkgConf, pkgDeps, packagedApi).then(function (api) {
    api(req, res, next);
  }, function (err) {
    console.error('[App Promise Error]');
    next(err);
  });
}

module.exports.runApi = runApi;
