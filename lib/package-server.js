'use strict';

var escapeStringRegexp = require('escape-string-regexp');
var staticHandlers = {};
//var apiHandlers = {};

function compileVhosts(vhostsMap) {
  var results = {
    patterns: []
  , conflictsMap: {}
  , matchesMap: {}
  };

  // compli
  Object.keys(vhostsMap).forEach(function (key) {
    var vhost = vhostsMap[key];
    var bare;
    var www;

    if ('.' === vhost.hostname[0]) {
      // for consistency
      // TODO this should happen at the database level
      vhost.hostname = '*' + vhost.hostname;
    }

    if ('*' === vhost.hostname[0]) {
      // TODO check that we are not trying to redirect a tld (.com, .co.uk, .org, etc)
      // tlds should follow the global policy
      if (vhost.hostname[1] && '.' !== vhost.hostname[1]) {
        // this is not a good place to throw as the consequences of a bug would be
        // very bad, but errors should never be silent, so we'll compromise
        console.warn("[NON-FATAL ERROR]: ignoring pattern '" + vhost.hostname + "'");
        results.conflictsMap[vhost.hostname] = vhost;
      }

      // nix the '*' for easier matching
      vhost.hostname = vhost.hostname.slice(1);
      // except the default
      if (!vhost.hostname) {
        vhost.hostname = '*';
      }
      if (results.conflictsMap[vhost.hostname]) {
        console.warn("[NON-FATAL ERROR]: duplicate entry for pattern '" + vhost.hostname + "'");
      }

      results.conflictsMap[vhost.hostname] = vhost;
      results.patterns.push(vhost);
      return;
    }

    bare = vhost.hostname.replace(/^www\./i, '');
    www = vhost.hostname.replace(/^(www\.)?/i, 'www.');

    results.matchesMap[bare] = vhost;
    results.matchesMap[www] = vhost;
  });

  results.patterns.sort(function (a, b) {
    return b.id.length - a.id.length;
  });

  return results;
}

function loadPages(pkgConf, packagedPage, req, res, next) {
  var PromiseA = require('bluebird');
  var fs = require('fs');
  var path = require('path');
  var pkgpath = path.join(pkgConf.pagespath, (packagedPage.package || packagedPage.id), (packagedPage.version || ''));

  // TODO special cases for /.well_known/ and similar (oauth3.html, oauth3.json, webfinger, etc)

  function handlePromise(p) {
    p.then(function (app) {
      app(req, res, next);
      packagedPage._page = app;
    }, function (err) {
      console.error('[App Promise Error]');
      next(err);
    });
  }

  if (staticHandlers[pkgpath]) {
    packagedPage._page = staticHandlers[pkgpath];
    packagedPage._page(req, res, next);
    return;
  }

  if (!packagedPage._promise_page) {
    packagedPage._promise_page = new PromiseA(function (resolve, reject) {
      fs.exists(pkgpath, function (exists) {
        if (!exists) {
          reject(new Error("package '" + pkgpath + "' is registered but does not exist"));
          return;
        }

        //console.log('[static mount]', pkgpath);
        resolve(require('serve-static')(pkgpath));
      });
    });
  }

  handlePromise(packagedPage._promise_page);
}

function getApi(conf, pkgConf, pkgDeps, packagedApi) {
  var PromiseA = require('bluebird');
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

      require('./oauth3-auth').inject(conf, packagedApi._api, pkgConf, pkgDeps);

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

function layerItUp(pkgConf, router, req, res, next) {
  var nexti = -1;
  // Layers exist so that static apps can use them like a virtual filesystem
  // i.e. oauth3.html isn't in *your* app but you may use it and want it mounted at /.well-known/oauth3.html
  // or perhaps some dynamic content (like application cache)
  function nextify(err) {
    var packagedPage;
    nexti += 1;

    if (err) {
      next(err);
      return;
    }

    // shortest to longest
    //route = packages.pop();
    // longest to shortest
    packagedPage = router.packagedPages[nexti];
    if (!packagedPage) {
      next();
      return;
    }

    if (packagedPage._page) {
      packagedPage._page(req, res, nextify);
      return;
    }

    // could attach to req.{ pkgConf, pkgDeps, Services}
    loadPages(pkgConf, packagedPage, req, res, next);
  }

  nextify();
}

function runApi(opts, router, req, res, next) {
  var pkgConf = opts.config;
  var pkgDeps = opts.deps;
  //var Services = opts.Services;
  var packagedApi;

  // TODO compile packagesMap
  // TODO people may want to use the framework in a non-framework way (i.e. to conceal the module name)
  router.packagedApis.some(function (_packagedApi) {
    // console.log('[DEBUG _packagedApi.id]', _packagedApi.id);
    var pathname = router.pathname;
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
  , value: (req.hostname + req.pathname).replace(/\/$/, '')
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

function mapToApp(opts, req, res, next) {
  // opts = { config, deps, services }
  var vhost;
  var router;
  var pkgConf = opts.config;

  if (!pkgConf.vhostConf) {
    pkgConf.vhostConf = compileVhosts(pkgConf.vhostsMap);
  }

  //console.log('req.hostname');
  //console.log(req.hostname);

  //console.log(Object.keys(pkgConf.vhostConf.matchesMap));

  // TODO www vs no-www?
  vhost = pkgConf.vhostConf.matchesMap[req.hostname];

  if (!vhost) {
    pkgConf.vhostConf.patterns.some(function (pkg) {
      // TODO this should be done in the compile phase
      if ('*' === pkg.id[0] && '.' === pkg.id[1]) {
        pkg.id = pkg.id.slice(1);
      }
      if (pkg.id === req.hostname.slice(req.hostname.length - pkg.id.length)) {
        vhost = pkg;
        return true;
      }
    });
  }

  if (!vhost) {
    next();
    return;
  }

  // TODO don't modify route here (or in subloaders), modify some other variable instead
  // TODO precompile RegExps and pre-sort app vs api
  vhost.pathnames.some(function (routes) {
    var pathname = routes.pathname;
    if ('/' === pathname) {
      pathname = '';
    }

    if (!routes._re_app) {
      routes._re_app = new RegExp(escapeStringRegexp(pathname) + '(#|\\/|\\?|$)');
      //console.log('[static re]', routes._re_app);
    }

    if (!routes._re_api) {
      // TODO allow for special apis that do not follow convention (.well_known, webfinger, oauth3.html, etc)
      routes._re_api = new RegExp(escapeStringRegexp(pathname + '/api/') + '([\\w\\.\\-]+)(\\/|\\?|$)');
      //console.log('[api re]', routes._re_api);
    }

    if (routes._re_app.test(req.url)) {
      router = routes;
      return true;
    }

    // no need to test for api yet as it is a postfix
  });

  if (!router) {
    //console.log('[no router for]', req.url);
    next();
    return;
  }

  if (!router._re_api.test(req.url)) {
    //console.log('[static router]');
    //console.log(router._re_api, req.url);
    layerItUp(pkgConf, router, req, res, next);
    return;
  }

  //console.log('[api router]', req.url);
  return runApi(opts, router, req, res, next);
}

module.exports.runApi = runApi;
module.exports.compileVhosts = compileVhosts;
module.exports.mapToApp = mapToApp;
