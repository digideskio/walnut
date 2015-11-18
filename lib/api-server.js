'use strict';

// TODO handle static app urls?
// NOTE rejecting non-api urls should happen before this
module.exports.create = function (conf, deps, app) {
  var escapeStringRegexp = require('escape-string-regexp');
  var vhostsMap = conf.vhostsMap;
  if (!app) {
    app = deps.app;
  }

  function getApi(route) {
    // TODO don't modify route, modify some other variable instead

    var PromiseA = require('bluebird');
    var path = require('path');
    // TODO needs some version stuff (which would also allow hot-loading of updates)
    // TODO version could be tied to sha256sum
    var pkgpath = path.join(conf.apipath, (route.api.package || route.api.id), (route.api.version || ''));

    return new PromiseA(function (resolve, reject) {
      try {
        // TODO dynamic requires are a no-no
        // can we statically generate a require-er? on each install?
        // module.exports = { {{pkgpath}}: function () { return require({{pkgpath}}) } }
        // requirer[pkgpath]()
        route.route = require(pkgpath).create(conf, deps, app);
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
        pathname = '/api' + pathname;
      }

      if (!route.re) {
        route.re = new RegExp(escapeStringRegexp(pathname) + '(#|\\/|\\?|$)');
      }
      // re.test("/api")
      // re.test("/api?")
      // re.test("/api/")
      // re.test("/api/foo")
      // re.test("/apifoo") // false
      if (route.re.test(req.url)) {
        apps = route.apps;
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

      getApi(route).then(function (route) {
        try {
          route(req, res, nextify);
          route.route = route; 
        } catch(e) {
          route._errored = true;
          console.error('[App Load Error]');
          console.error(e.stack);
          nextify(new Error("couldn't load api"));
        }
      });
    }

    nextify();
  }

  return {
    api: api
  };
};
