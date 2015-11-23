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

    //console.log('[vhost]');
    //console.log(vhost);
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

function loadPages(pkgConf, route, req, res, next) {
  var PromiseA = require('bluebird');
  var fs = require('fs');
  var path = require('path');
  var pkgpath = path.join(pkgConf.pagespath, (route.app.package || route.app.id), (route.app.version || ''));

  // TODO special cases for /.well_known/ and similar (oauth3.html, oauth3.json, webfinger, etc)

  function handlePromise(p) {
    p.then(function (app) {
      app(req, res, next);
      route._app = app;
    }, function (err) {
      console.error('[App Promise Error]');
      next(err);
    });
  }

  if (staticHandlers[pkgpath]) {
    route._app = staticHandlers[pkgpath];
    route._app(req, res, next);
    return;
  }

  if (!route._promise_app) {
    route._promise_app = new PromiseA(function (resolve, reject) {
      fs.exists(pkgpath, function (exists) {
        if (!exists) {
          reject(new Error("package is registered but does not exist"));
          return;
        }

        //console.log('[static mount]', pkgpath);
        resolve(require('serve-static')(pkgpath));
      });
    });
  }

  handlePromise(route._promise_app);
}

function getApi(pkgConf, pkgDeps, route) {
  var PromiseA = require('bluebird');
  var path = require('path');
  var pkgpath = path.join(pkgConf.apipath, route.api.id/*, (route.api.version || '')*/);

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
      route._apipkg = require(path.join(pkgpath, 'package.json'));
      route._apiname = route._apipkg.name;
      if (route._apipkg.walnut) {
        pkgpath += '/' + route.apipkg.walnut;
      }
      promise = require(pkgpath).create(pkgConf, pkgDeps, myApp);
    } catch(e) {
      reject(e);
      return;
    }

    promise.then(function () {
      // TODO give pub/priv pair for app and all public keys
      // route._api = require(pkgpath).create(pkgConf, pkgDeps, myApp);
      route._api = require('express')();
      route._api_app = myApp;
      // TODO fix backwards compat
      // /api/com.example.foo (no change)
      route._api.use('/', route._api_app);
      // /api/com.example.foo => /
      route._api.use('/api/' + route.api.id, function (req, res, next) {
        //console.log('api mangle 2:', '/api/' + route.api.id, req.url);
        route._api_app(req, res, next);
      });
      // /api/com.example.foo => /api
      route._api.use('/', function (req, res, next) {
        req.url = '/api' + req.url.slice(('/api/' + route.api.id).length);
        //console.log('api mangle 3:', req.url);
        route._api_app(req, res, next);
      });
      resolve(route._api);
    }, reject);
  });
}

function loadApi(pkgConf, pkgDeps, route) {
  function handlePromise(p) {
    return p.then(function (api) {
      route._api = api;
      return api;
    });
  }

  if (!route._promise_api) {
    route._promise_api = getApi(pkgConf, pkgDeps, route);
  }

  return handlePromise(route._promise_api);
}

function layerItUp(pkgConf, router, req, res, next) {
  var nexti = -1;
  // Layers exist so that static apps can use them like a virtual filesystem
  // i.e. oauth3.html isn't in *your* app but you may use it and want it mounted at /.well-known/oauth3.html
  // or perhaps some dynamic content (like application cache)
  function nextify(err) {
    var route;
    nexti += 1;

    if (err) {
      next(err);
      return;
    }

    // shortest to longest
    //route = packages.pop();
    // longest to shortest
    route = router.packages[nexti];
    if (!route) {
      next();
      return;
    }

    if (!route.app) {
      // new Error("no Static App is registered for the specified path")
      nextify();
      return;
    }
    if (route._app) {
      route._app(req, res, nextify);
      return;
    }

    // could attach to req.{ pkgConf, pkgDeps, Services}
    loadPages(pkgConf, route, req, res, next);
  }

  nextify();
}

function runApi(opts, router, req, res, next) {
  var pkgConf = opts.config;
  var pkgDeps = opts.deps;
  //var Services = opts.Services;
  var route;

  // TODO compile packagesMap
  // TODO people may want to use the framework in a non-framework way (i.e. to conceal the module name)
  router.packages.some(function (_route) {
    if (!_route.api) {
      return;
    }

    var pathname = router.pathname;
    if ('/' === pathname) {
      pathname = '';
    }
    // TODO allow for special apis that do not follow convention (.well_known, webfinger, oauth3.html, etc)
    if (!_route._api_re) {
      _route._api_re = new RegExp(escapeStringRegexp(pathname + '/api/' + _route.api.id) + '\/([\\w\\.\\-]+)(\\/|\\?|$)');
      //console.log('[api re 2]', _route._api_re);
    }
    if (_route._api_re.test(req.url)) {
      route = _route;
      return true;
    }
  });

  if (!route) {
    //console.log('[no api route]');
    next();
    return;
  }
  Object.defineProperty(req, 'appId', {
    enumerable: true
  , configurable: false
  , writable: false
    // TODO this identifier may need to be non-deterministic as to transfer if a domain name changes but is still the "same" app
    // (i.e. a company name change. maybe auto vs manual register - just like oauth3?)
  , value: route.id
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

  if (route._api) {
    route._api(req, res, next);
    return;
  }

  loadApi(pkgConf, pkgDeps, route).then(function (api) {
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
      if ('*' === pkg.id || pkg.id === req.hostname.slice(req.hostname.length - pkg.id.length)) {
        vhost = pkg;
        return true;
      }
    });
  }

  if (!vhost) {
    next();
    return;
  }

  //console.log('vhost');
  //console.log(vhost);

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
