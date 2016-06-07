'use strict';

module.exports.create = function (app, xconfx, apiFactories, apiDeps) {
  var PromiseA = require('bluebird');
  var path = require('path');
  var fs = PromiseA.promisifyAll(require('fs'));
  // NOTE: each process has its own cache
  var localCache = { le: {}, statics: {} };
  var express = require('express');
  var apiApp;
  var setupDomain = xconfx.setupDomain = ('cloud.' + xconfx.primaryDomain);
  var setupApp;

  function redirectHttpsHelper(req, res) {
    var host = req.hostname || req.headers.host || '';
    var url = req.url;

    // TODO
    // allow exceptions for the case of arduino and whatnot that cannot handle https?
    // http://evothings.com/is-it-possible-to-secure-micro-controllers-used-within-iot/
    // needs ECDSA?

    var escapeHtml = require('escape-html');
    var newLocation = 'https://'
      + host.replace(/:\d+/, ':' + xconfx.externalPort) + url
      ;
    var safeLocation = escapeHtml(newLocation);

    var metaRedirect = ''
      + '<html>\n'
      + '<head>\n'
      + '  <style>* { background-color: white; color: white; text-decoration: none; }</style>\n'
      + '  <META http-equiv="refresh" content="0;URL=' + safeLocation + '">\n'
      + '</head>\n'
      + '<body style="display: none;">\n'
      + '  <p>You requested an insecure resource. Please use this instead: \n'
      + '    <a href="' + safeLocation + '">' + safeLocation + '</a></p>\n'
      + '</body>\n'
      + '</html>\n'
      ;

    // DO NOT HTTP REDIRECT
    /*
    res.setHeader('Location', newLocation);
    res.statusCode = 302;
    */

    // BAD NEWS BEARS
    //
    // When people are experimenting with the API and posting tutorials
    // they'll use cURL and they'll forget to prefix with https://
    // If we allow that, then many users will be sending private tokens
    // and such with POSTs in clear text and, worse, it will work!
    // To minimize this, we give browser users a mostly optimal experience,
    // but people experimenting with the API get a message letting them know
    // that they're doing it wrong and thus forces them to ensure they encrypt.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(metaRedirect);
  }

  function redirectHttps(req, res) {
    if (localCache.le[req.hostname]) {
      if (localCache.le[req.hostname].conf) {
        redirectHttpsHelper(req, res);
        return;
      }
      else {
        // TODO needs IPC to expire cache
        redirectSetup(req.hostname, req, res);
        return;
        /*
        if (Date.now() - localCache.le[req.hostname].createdAt < (5 * 60 * 1000)) {
          // TODO link to dbconf.primaryDomain
          res.send({ error: { message: "Security Error: Encryption for '" + req.hostname + "' has not been configured."
              + " Please use the management interface to set up ACME / Let's Encrypt (or another solution)." } });
          return;
        }
        */
      }
    }

    return xconfx.walkLe(req.hostname).then(function (leAuth) {
      if (!leAuth) {
        redirectSetup(req.hostname, req, res);
        return;
      }

      localCache.le[req.hostname] = { conf: leAuth, createdAt: Date.now() };
      redirectHttps(req, res);
    }, function (err) {
      console.error('[Error] lib/main.js walkLe');
      if (err.stack) {
        console.error(err.stack);
      }
      else {
        console.error(new Error('getstack').stack);
        console.error(err);
      }
      res.send({ error: { message: "failed to get tls certificate for '" + (req.hostname || '') + "'" } });
    });
  }

  function disallowSymLinks(req, res) {
    res.end(
      "Symbolic Links are not supported on all platforms and are therefore disallowed."
    + " Instead, simply create a file of the same name as the link with a single line of text"
    + " which should be the relative or absolute path to the target directory."
    );
  }

  function disallowNonFiles(req, res) {
    res.end(
      "Pipes, Blocks, Sockets, FIFOs, and other such nonsense are not permitted."
    + " Instead please create a directory from which to read or create a file "
    + " with a single line of text which should be the target directory to read from."
    );
  }

  function securityError(req, res) {
    res.end("Security Error: Link points outside of packages/pages");
  }

  function notConfigured(req, res, next) {
    if (setupDomain !== req.hostname) {
      redirectSetup(req.hostname, req, res);
      return;
    }

    if (!setupApp) {
      setupApp = express.static(path.join(xconfx.staticpath, 'com.daplie.walnut'));
    }
    setupApp(req, res, function () {
      if ('/' === req.url) {
        res.end('Sanity Fail: Configurator not found');
        return;
      }
      next();
    });
  }

  function loadHandler(name) {
    return function handler(req, res, next) {
      var packagepath = path.join(xconfx.staticpath, name);

      return fs.lstatAsync(packagepath).then(function (stat) {
        if (stat.isSymbolicLink()) {
          return disallowSymLinks;
        }

        if (stat.isDirectory()) {
          return express.static(packagepath);
        }

        if (!stat.isFile()) {
          return disallowNonFiles;
        }

        return fs.readFileAsync(packagepath, 'utf8').then(function (text) {
          // TODO allow cascading
          text = text.trim().split(/\n/)[0];

          // TODO rerun the above, disallowing link-style (or count or memoize to prevent infinite loop)
          // TODO make safe
          packagepath = path.resolve(xconfx.staticpath, text);
          if (0 !== packagepath.indexOf(xconfx.staticpath)) {
            return securityError;
          }

          return express.static(packagepath);
        });
      }, function (/*err*/) {
        return notConfigured;
      }).then(function (handler) {

        // keep object reference intact
        localCache.statics[name].handler = handler;
        handler(req, res, next);
      });
    };
  }

  function staticHelper(appId, opts) {
    // TODO inter-process cache expirey
    // TODO add to xconfx.staticpath
    xconfx.staticpath = path.join(__dirname, '..', '..', 'packages', 'pages');
    return fs.readdirAsync(xconfx.staticpath).then(function (nodes) {
      if (opts && opts.clear) {
        localCache.statics = {};
      }

      // longest to shortest
      function shortToLong(a, b) {
        return b.length - a.length;
      }
      nodes.sort(shortToLong);

      nodes.forEach(function (name) {
        if (!localCache.statics[name]) {
          localCache.statics[name] = { handler: loadHandler(name), createdAt: Date.now() };
        }
      });

      // Secure Matching
      // apple.com#blah#  apple.com#blah#
      // apple.com.us#    apple.com#foo#
      // apple.com#       apple.com#foo#
      nodes.some(function (name) {
        if (0 === (name + '#').indexOf(appId + '#')) {
          if (appId !== name) {
            localCache.statics[appId] = localCache.statics[name];
          }
          return true;
        }
      });

      if (!localCache.statics[appId]) {
        localCache.statics[appId] = { handler: notConfigured, createdAt: Date.now() };
      }

      localCache.staticsKeys = Object.keys(localCache.statics).sort(shortToLong);
      return localCache.statics[appId];
    });
  }

  function redirectSetup(reason, req, res/*, next*/) {
    var url = 'https://cloud.' + xconfx.primaryDomain;

    if (443 !== xconfx.externalPort) {
      url += ':' + xconfx.externalPort;
    }

    url += '#referrer=' + reason;

    res.statusCode = 302;
    res.setHeader('Location', url);
    res.end();
  }

  function serveStatic(req, res, next) {
    // If we get this far we can be pretty confident that
    // the domain was already set up because it's encrypted
    var appId = req.hostname + req.url.replace(/\/+/g, '#').replace(/#$/, '');
    var appIdParts = appId.split('#');
    var appIdPart;

    if (!req.secure) {
      // did not come from https
      if (/\.(appcache|manifest)\b/.test(req.url)) {
        require('./unbrick-appcache').unbrick(req, res);
        return;
      }
      return redirectHttps(req, res);
    }

    // TODO configuration for allowing www
    if (/^www\./.test(req.hostname)) {
      // NOTE: acme responder and appcache unbricker must come before scrubTheDub
      if (/\.(appcache|manifest)\b/.test(req.url)) {
        require('./unbrick-appcache').unbrick(req, res);
        return;
      }
      require('./no-www').scrubTheDub(req, res);
      return;
    }
    /*
    if (!redirectives && config.redirects) {
      redirectives = require('./hostname-redirects').compile(config.redirects);
    }
    */

    // TODO assets.example.com/sub/assets/com.example.xyz/
    if (/^api\./.test(req.hostname) && /\/api(\/|$)/.test(req.url)) {
      // supports api.example.com/sub/app/api/com.example.xyz/
      if (!apiApp) {
        apiApp = require('./apis').create(xconfx, apiFactories, apiDeps);
      }
      apiApp(req, res, next);
      return;
    }

    while (appIdParts.length) {
      // TODO needs IPC to expire cache
      appIdPart = appIdParts.join('#');
      if (localCache.statics[appIdPart]) {
        break;
      }
      // TODO test via staticsKeys

      appIdParts.pop();
    }

    if (!appIdPart || !localCache.statics[appIdPart]) {
      return staticHelper(appId).then(function () {
        localCache.statics[appId].handler(req, res, next);
      });
    }

    localCache.statics[appIdPart].handler(req, res, next);
    if (Date.now() - localCache.statics[appIdPart].createdAt > (5 * 60 * 1000)) {
      staticHelper(appId, { clear: true });
    }
  }

  app.use('/', serveStatic);

  return PromiseA.resolve();
};
