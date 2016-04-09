'use strict';

var escapeStringRegexp = require('escape-string-regexp');
var runApi = require('./package-server-apis').runApi;
var layerItUp = require('./package-server-static').layerItUp;

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

  // TODO .well-known can be an API (webfinger, letsencrypt, oauth3)
  // or static (...???)

  if (!router._re_api.test(req.url)) {
    //console.log('[static router]');
    //console.log(router._re_api, req.url);
    layerItUp(pkgConf, router, req, res, function (err) {
      if (err) {
        next(err);
        return;
      }

      if (/\/\.well-known([\/?]|$)/.test(req.url)) {
        console.log('[TODO] handle .well-known as API');
        // rewrite api as /api/org.ietf/.well-known ?
        // pass through simply as /.well-known ?
        // runApi(opts, router, req, res, next)
      }

      next();
    });
    return;
  }

  //console.log('[api router]', req.url);
  return runApi(opts, router, req, res, next);
}

module.exports.compileVhosts = compileVhosts;
module.exports.mapToApp = mapToApp;
