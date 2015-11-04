'use strict';

var cluster = require('cluster');
var id = cluster.worker.id.toString();
var path = require('path');
var vhostsdir = path.join(__dirname, 'vhosts');

console.log('[Worker #' + id + '] online!');

function init(info) {
  var promiseServer;
  var workerApp;

  function promiseApps() {
    var PromiseA = require('bluebird');

    if (workerApp) {
      return PromiseA.resolve(workerApp); 
    }

    workerApp = promiseServer.then(function (secureServer) {
      //secureServer = _secureServer;
      console.log("#" + id + " Listening on https://localhost:" + secureServer.address().port, '\n');
      var app = require('express')();
      var apiHandler;
      var staticHandlers = {};

      app.use('/', function (req, res, next) {
        if (!/^\/api/.test(req.url)) {
          next();
          return;
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

        apiHandler = require('./lib/vhost-server').create(info.securePort, vhostsdir).create(secureServer, app).then(function (app) {
          apiHandler = app;
          app(req, res, next);
        });
      });

      app.use('/', function (req, res, next) {
        if (/^\/api/.test(req.url)) {
          next();
          return;
        }

        // TODO block absolute urls for mounted apps?
        // i.e. referer daplie.com/connect requests daplie.com/scripts/blah -> daplie.com/connect/scripts ?
        var host = req.headers.host;
        var invalidHost = /(\.\.)|[\\:\/\s\|>\*<]/;

        if (!host || 'string' !== typeof host) {
          next();
          return;
        }
        host = host.toLowerCase();

        if (staticHandlers[host]) {
          if (staticHandlers[host].then) {
            staticHandlers[host].then(function () {
              staticHandlers[host](req, res, next);
            }, function (err) {
              res.send({
                error: {
                  message: err.message
                , code: err.code
                }
              });
            });
            return;
          }

          staticHandlers[host](req, res, next);
          return;
        }

        staticHandlers[host] = PromiseA.resolve().then(function () {
          var fs = PromiseA.promisifyAll(require('fs'));

          // host can be spoofed by the user, so lets be safe
          // don't allow .. or / or whitespace
          // RFC says domains must start with a-zA-Z0-9 and follow with normal characters
          // HOWEVER, there are now Unicode character domains
          // punycode?
          // 
          if (invalidHost.test(host)) {
            return PromiseA.reject({
              message: "invalid Host header"
            , code: "E_INVALID_HOST"
            });
          }

          return fs.readdirAsync(path.join(__dirname, 'sites-enabled')).then(function (nodes) {
            nodes.forEach(function (node) {
              if ('function' === typeof staticHandlers[host] && !staticHandlers[host].then) {
                return;
              }

              if (-1 === node.indexOf('.') || invalidHost.test(node)) {
                return;
              }

              console.log('vhost static');
              console.log(node);
              staticHandlers[node] = require('serve-static')(path.join(__dirname, 'sites-enabled', node));
            });

            console.log('vhost static final');
            console.log(host);
            console.log(staticHandlers[host]);

            if (staticHandlers[host]) {
              staticHandlers[host](req, res, next);
            } else {
              next();
            }

            return staticHandlers[host];
          });
        });
      });

      workerApp = app;
      return app;
    });

    return workerApp;
  }

  promiseServer = require('./lib/sni-server').create(info.certPaths, info.securePort, promiseApps);
}

process.on('message', function (msg) {
  if ('init' === msg.type) {
    init(msg);
    return;
  }

  console.log('[Worker] got unexpected message:');
  console.log(msg);
});
