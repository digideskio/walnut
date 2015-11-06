'use strict';

module.exports.create = function (webserver, info) {
  var path = require('path');
  var vhostsdir = path.join(__dirname, 'vhosts');
  var app = require('express')();
  var apiHandler;

  /*
  function unlockDevice(conf, state) {
    return require('./lib/unlock-device').create().then(function (result) {
      result.promise.then(function (_rootMasterKey) {
        process.send({
          type: 'com.daplie.walnut.keys.root'
          conf: {
            rootMasterKey: _rootMasterkey
          }
        });
        conf.locked = false;
        if (state.caddy) {
          state.caddy.update(conf);
        }
        conf.rootMasterKey = _rootMasterKey;
      });

      return result.app;
    });
  }
  */

  function scrubTheDubHelper(req, res/*, next*/) {
    // hack for bricked app-cache
    if (/\.appcache\b/.test(req.url)) {
      res.setHeader('Content-Type', 'text/cache-manifest');
      res.end('CACHE MANIFEST\n\n# v0__DELETE__CACHE__MANIFEST__\n\nNETWORK:\n*');
      return;
    }

    // TODO port number for non-443
    var escapeHtml = require('escape-html');
    var newLocation = 'https://' + req.hostname.replace(/^www\./, '') + req.url;
    var safeLocation = escapeHtml(newLocation);

    var metaRedirect = ''
      + '<html>\n'
      + '<head>\n'
      + '  <style>* { background-color: white; color: white; text-decoration: none; }</style>\n'
      + '  <META http-equiv="refresh" content="0;URL=' + safeLocation + '">\n'
      + '</head>\n'
      + '<body style="display: none;">\n'
      + '  <p>You requested an old resource. Please use this instead: \n'
      + '    <a href="' + safeLocation + '">' + safeLocation + '</a></p>\n'
      + '</body>\n'
      + '</html>\n'
      ;

    // 301 redirects will not work for appcache
    res.end(metaRedirect);
  }

  function scrubTheDub(req, res, next) {
    var host = req.hostname;

    if (!host || 'string' !== typeof host) {
      next();
      return;
    }
    host = host.toLowerCase();

    if (/^www\./.test(host)) {
      scrubTheDubHelper(req, res, next);
      return;
    }
  }

  function handleApi(req, res, next) {
    if (!/^\/api/.test(req.url)) {
      next();
      return;
    }

    // TODO move to caddy parser?
    if (/(^|\.)proxyable\./.test(req.hostname)) {
      // device-id-12345678.proxyable.myapp.mydomain.com => myapp.mydomain.com
      // proxyable.myapp.mydomain.com => myapp.mydomain.com
      // TODO myapp.mydomain.com.daplieproxyable.com => myapp.mydomain.com
      req.hostname = req.hostname.replace(/.*\.?proxyable\./, '');
    }

    if (apiHandler) {
      if (apiHandler.then) {
        apiHandler.then(function (app) {
          app(req, res, next);
        });
        return;
      }

      apiHandler(req, res, next);
      return;
    }

    apiHandler = require('./vhost-server').create(info.localPort, vhostsdir).create(webserver, app).then(function (app) {
      // X-Forwarded-For
      // X-Forwarded-Proto
      console.log('api server', req.hostname, req.secure, req.ip);
      apiHandler = app;
      app(req, res, next);
    });
  }

  if (info.trustProxy) {
    app.set('trust proxy', ['loopback']);
    //app.set('trust proxy', function (ip) { ... });
  }
  app.use('/', scrubTheDub);
  app.use('/', handleApi);

  return app;
};
