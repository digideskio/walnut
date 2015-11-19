'use strict';

// TODO handle static app urls?
// NOTE rejecting non-api urls should happen before this
module.exports.create = function (conf, deps/*, Services*/) {
  var PromiseA = deps.Promise;
  var app = deps.app;
  var express = deps.express;
  var escapeStringRegexp = require('escape-string-regexp');
  var vhostsMap = conf.vhostsMap;

  function getApi(route) {
    // TODO don't modify route, modify some other variable instead

    var path = require('path');
    // TODO needs some version stuff (which would also allow hot-loading of updates)
    // TODO version could be tied to sha256sum
    var pkgpath = path.join(conf.apipath, (route.api.package || route.api.id), (route.api.version || ''));

    return new PromiseA(function (resolve, reject) {
      var myApp;

      try {
        // TODO dynamic requires are a no-no
        // can we statically generate a require-er? on each install?
        // module.exports = { {{pkgpath}}: function () { return require({{pkgpath}}) } }
        // requirer[pkgpath]()
        myApp = express();
        if (app.get('trust proxy')) {
          myApp.set('trust proxy', app.get('trust proxy'));
        }
        route.route = require(pkgpath).create(conf, deps, myApp);
      } catch(e) {
        reject(e);
        return;
      }

      resolve(route.route);
    });
  }

  function api(req, res, next) {
    var apps; 

    if (!vhostsMap[req.hostname]) {
      // TODO keep track of match-only vhosts, such as '*.example.com',
      // separate from exact matches
      next(new Error("this domain is not registered"));
      return;
    }

    vhostsMap[req.hostname].pathnames.some(function (route) {
      var pathname = route.pathname;
      if ('/' === pathname) {
        pathname = '/api';
      }
      if (-1 === pathname.indexOf('/api')) {
        // TODO needs namespace for current api
        pathname = '/api' + pathname;
      }
      // pathname += '.local';

      if (!route.re) {
        route.re = new RegExp(escapeStringRegexp(pathname) + '(#|\\/|\\?|$)');
      }
      // re.test("/api")
      // re.test("/api?")
      // re.test("/api/")
      // re.test("/api/foo")
      // re.test("/apifoo") // false
      if (route.re.test(req.url)) {
        // make a copy
        apps = route.apps.slice(0);
        return true;
      }
    });

    if (!apps) {
      next();
      return;
    }

    function nextify(err) {
      var route;

      if (err) {
        next(err);
        return;
      }
      
      // shortest to longest
      //route = apps.pop();
      // longest to shortest
      route = apps.shift();
      if (!route) {
        next();
        return;
      }

      if (route.route) {
        if (route.route.then) {
          route.route.then(function (expressApp) {
            expressApp(req, res, nextify);
          });
          return;
        }
        route.route(req, res, nextify);
        return;
      }

      if (route._errored) {
        nextify(new Error("couldn't load api"));
        return;
      }

      if (!route.api) {
        nextify(new Error("no api available for this route"));
        return;
      }

      return getApi(route).then(function (expressApp) {
        try {
          expressApp(req, res, nextify);
          route.route = expressApp;
        } catch(e) {
          route._errored = true;
          console.error('[App Load Error]');
          nextify(new Error("couldn't load api"));
        }

        return expressApp;
      }, function (err) {
        console.error('[App Promise Error]');
        nextify(err);
      });
    }

    nextify();
  }

  return {
    api: api
  };
};
