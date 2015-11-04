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

      function scrubTheDub(req, res/*, next*/) {
        // hack for bricked app-cache
        if (/\.appcache\b/.test(req.url)) {
          res.setHeader('Content-Type', 'text/cache-manifest');
          res.end('CACHE MANIFEST\n\n# v0__DELETE__CACHE__MANIFEST__\n\nNETWORK:\n*');
          return;
        }

        // TODO port number for non-443
        var escapeHtml = require('escape-html');
        var newLocation = 'https://' + req.headers.host.replace(/^www\./, '') + req.url;
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

        if (/^www\./.test(host)) {
          scrubTheDub(req, res, next);
          return;
        }

        function serveIt() {
          // TODO redirect GET /favicon.ico to GET (req.headers.referer||'') + /favicon.ico
          // TODO other common root things - robots.txt, app-icon, etc
          staticHandlers[host].favicon(req, res, function (err) {
            if (err) {
              next(err);
              return;
            }
            staticHandlers[host](req, res, next);
          });
        }

        if (staticHandlers[host]) {
          if (staticHandlers[host].then) {
            staticHandlers[host].then(function () {
              serveIt();
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

          serveIt();
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

              // ignore .gitkeep and folders without a .
              if (0 === node.indexOf('.') || -1 === node.indexOf('.') || invalidHost.test(node)) {
                return;
              }

              console.log('vhost static');
              console.log(node);
              staticHandlers[node] = require('serve-static')(path.join(__dirname, 'sites-enabled', node));
              try {
                // TODO look for favicon
                staticHandlers[node].favicon = require('serve-favicon')(path.join(__dirname, 'sites-enabled', node, 'favicon.ico'));
              } catch(e) {
                staticHandlers[node].favicon = function (req, res, next) { next(); };
              }
            });

            if (staticHandlers[host]) {
              serveIt();
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
