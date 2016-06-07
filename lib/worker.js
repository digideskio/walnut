'use strict';

module.exports.create = function (webserver, xconfx, state) {
  console.log('DEBUG create worker');

  if (!state) {
    state = {};
  }

  var PromiseA = state.Promise || require('bluebird');
  var memstore;
  var sqlstores = {};
  var systemFactory = require('sqlite3-cluster/client').createClientFactory({
      dirname: xconfx.varpath
    , prefix: 'com.daplie.walnut.'
    //, dbname: 'config'
    , suffix: ''
    , ext: '.sqlite3'
    , sock: xconfx.sqlite3Sock
    , ipcKey: xconfx.ipcKey
  });
  /*
  var clientFactory = require('sqlite3-cluster/client').createClientFactory({
      algorithm: 'aes'
    , bits: 128
    , mode: 'cbc'
    , dirname: xconfx.varpath // TODO conf
    , prefix: 'com.daplie.walnut.'
    //, dbname: 'cluster'
    , suffix: ''
    , ext: '.sqlcipher'
    , sock: xconfx.sqlite3Sock
    , ipcKey: xconfx.ipcKey
  });
  */
  var cstore = require('cluster-store');

  return PromiseA.all([
    // TODO security on memstore
    // TODO memstoreFactory.create
    cstore.create({
      sock: xconfx.memstoreSock
    , connect: xconfx.memstoreSock
      // TODO implement
    , key: xconfx.ipcKey
    }).then(function (_memstore) {
      memstore = PromiseA.promisifyAll(_memstore);
      return memstore;
    })
    // TODO mark a device as lost, stolen, missing in DNS records
    // (and in turn allow other devices to lock it, turn on location reporting, etc)
  , systemFactory.create({
        init: true
      , dbname: 'config'
    })
  ]).then(function (args) {
    memstore = args[0];
    sqlstores.config = args[1];

    var wrap = require('masterquest-sqlite3');
    var dir = [
      { tablename: 'com_daplie_walnut_config'
      , idname: 'id'
      , unique: [ 'id' ]
      , indices: [ 'createdAt', 'updatedAt' ]
      }
    , { tablename: 'com_daplie_walnut_redirects'
      , idname: 'id'      // blog.example.com:sample.net/blog
      , unique: [ 'id' ]
      , indices: [ 'createdAt', 'updatedAt' ]
      }
    ];

    function scopeMemstore(expId) {
      var scope = expId + '|';
      return {
        getAsync: function (id) {
          return memstore.getAsync(scope + id);
        }
      , setAsync: function (id, data) {
          return memstore.setAsync(scope + id, data);
        }
      , touchAsync: function (id, data) {
          return memstore.touchAsync(scope + id, data);
        }
      , destroyAsync: function (id) {
          return memstore.destroyAsync(scope + id);
        }

      // helpers
      , allAsync: function () {
          return memstore.allAsync().then(function (db) {
            return Object.keys(db).filter(function (key) {
              return 0 === key.indexOf(scope);
            }).map(function (key) {
              return db[key];
            });
          });
        }
      , lengthAsync: function () {
          return memstore.allAsync().then(function (db) {
            return Object.keys(db).filter(function (key) {
              return 0 === key.indexOf(scope);
            }).length;
          });
        }
      , clearAsync: function () {
          return memstore.allAsync().then(function (db) {
            return Object.keys(db).filter(function (key) {
              return 0 === key.indexOf(scope);
            }).map(function (key) {
              return memstore.destroyAsync(key);
            });
          }).then(function () {
            return null;
          });
        }
      };
    }

    return wrap.wrap(sqlstores.config, dir).then(function (models) {
      return models.ComDaplieWalnutConfig.find(null, { limit: 100 }).then(function (results) {
        return models.ComDaplieWalnutConfig.find(null, { limit: 10000 }).then(function (redirects) {
          var express = require('express-lazy');
          var app = express();
          var recase = require('connect-recase')({
            // TODO allow explicit and or default flag
            explicit: false
          , default: 'snake'
          , prefixes: ['/api']
            // TODO allow exclude
          //, exclusions: [config.oauthPrefix]
          , exceptions: {}
          //, cancelParam: 'camel'
          });
          var bootstrapApp;
          var mainApp;
          var apiDeps = {
            models: models
            // TODO don't let packages use this directly
          , Promise: PromiseA
          };
          var apiFactories = {
            memstoreFactory: { create: scopeMemstore }
          , systemSqlFactory: systemFactory
          };

          var hostsmap = {};
          function log(req, res, next) {
            var hostname = (req.hostname || req.headers.host || '').split(':').shift();
            console.log('[worker/log]', req.method, hostname, req.url);
            if (hostname && !hostsmap[hostname]) {
              hostsmap[hostname] = true;
              require('fs').writeFile(
                require('path').join(__dirname, '..', '..', 'var', 'hostnames', hostname)
              , hostname, function () {});
            }
            next();
          }

          function setupMain() {
            mainApp = express();
            require('./main').create(mainApp, xconfx, apiFactories, apiDeps).then(function () {
              // TODO process.send({});
            });
          }

          if (!bootstrapApp) {
            bootstrapApp = express();
            require('./bootstrap').create(bootstrapApp, xconfx, models).then(function () {
              // TODO process.send({});
              setupMain();
            });
          }

          process.on('message', function (data) {
            if ('com.daplie.walnut.bootstrap' === data.type) {
              setupMain();
            }
          });

          app.disable('x-powered-by');
          app.use('/', log);
          app.use('/api', require('body-parser').json({
            strict: true // only objects and arrays
          , inflate: true
            // limited to due performance issues with JSON.parse and JSON.stringify
            // http://josh.zeigler.us/technology/web-development/how-big-is-too-big-for-json/
          //, limit: 128 * 1024
          , limit: 1.5 * 1024 * 1024
          , reviver: undefined
          , type: 'json'
          , verify: undefined
          }));
          app.use('/api', recase);

          app.use('/', function (req, res) {
            if (!req.secure) {
              // did not come from https
              if (/\.(appcache|manifest)\b/.test(req.url)) {
                require('./unbrick-appcache').unbrick(req, res);
                return;
              }
            }

            if (xconfx.lex && /\.well-known\/acme-challenge\//.test(req.url)) {
              var LEX = require('letsencrypt-express');
              xconfx.lex.debug = true;
              xconfx.acmeResponder = xconfx.acmeResponder || LEX.createAcmeResponder(xconfx.lex/*, next*/);
              xconfx.acmeResponder(req, res);
              return;
            }

            // TODO check https://letsencrypt.status.io to see if https certification is not available

            if (mainApp) {
              mainApp(req, res);
              return;
            }
            else {
              bootstrapApp(req, res);
              return;
            }
          });

          return app;
        });
      });
    });
  });
};
