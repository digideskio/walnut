'use strict';

module.exports.create = function (webserver, info, state) {
  if (!state) {
    state = {};
  }

  var PromiseA = state.Promise || require('bluebird');
  var path = require('path');
  var vhostsdir = path.join(__dirname, 'vhosts');
  var app = require('express')();
  var apiHandler;
  var memstore;
  var sqlstores = {};
  var models = {};
  var systemFactory = require('sqlite3-cluster/client').createClientFactory({
      dirname: path.join(__dirname, '..', 'var') // TODO info.conf
    , prefix: 'com.daplie.'
    //, dbname: 'config'
    , suffix: ''
    , ext: '.sqlite3'
    , sock: info.conf.sqlite3Sock
    , ipcKey: info.conf.ipcKey
  });
  var clientFactory = require('sqlite3-cluster/client').createClientFactory({
      algorithm: 'aes'
    , bits: 128
    , mode: 'cbc'
    , dirname: path.join(__dirname, '..', 'var') // TODO info.conf
    , prefix: 'com.daplie.'
    //, dbname: 'cluster'
    , suffix: ''
    , ext: '.sqlcipher'
    , sock: info.conf.sqlite3Sock
    , ipcKey: info.conf.ipcKey
  });
  var cstore = require('cluster-store');

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

  // TODO handle insecure to actual redirect
  // blog.coolaj86.com -> coolaj86.com/blog
  // hmm... that won't really matter with hsts
  // I guess I just needs letsencrypt

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

  return PromiseA.all([
    cstore.create({
      sock: info.conf.memstoreSock
    , connect: info.conf.memstoreSock
      // TODO implement
    , key: info.conf.ipcKey
    }).then(function (_memstore) {
      memstore = _memstore;
      return memstore;
    })
    // TODO mark a device as lost, stolen, missing in DNS records
    // (and in turn allow other devices to lock it, turn on location reporting, etc)
  , systemFactory.create({
        init: true
      , dbname: 'config'
    })
  , clientFactory.create({
        init: true
      , key: '00000000000000000000000000000000'
      // TODO only complain if the values are different
      //, algo: 'aes'
      , dbname: 'auth'
    })
  , clientFactory.create({
        init: false
      , dbname: 'system'
    })
  ]).then(function (args) {
    memstore = args[0];
    sqlstores.config = args[1];
    sqlstores.auth = args[2];
    sqlstores.system = args[3];
    sqlstores.create = clientFactory.create;

    return require('../lib/schemes-config').create(sqlstores.config).then(function (tables) {
      models.Config = tables;
      models.Config.Config.get().then(function (circ) {
      
        /*
          // todo getDomainInfo
          var utils = require('./utils');
          results.domains.forEach(function (domain) {
            utils.getDomainInfo(domain.id);
          });
        */
        console.log(circ);

        return app;
      });
    });
  });
};
