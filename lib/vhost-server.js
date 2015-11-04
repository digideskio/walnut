'use strict';

module.exports.create = function (securePort, vhostsdir) {
  var PromiseA = require('bluebird').Promise;
  var serveStatic;
  var fs = require('fs');
  var path = require('path');
  var dummyCerts;
  var serveFavicon;
  var loopbackToken = require('crypto').randomBytes(32).toString('hex');

  function handleAppScopedError(tag, domaininfo, req, res, fn) {
    function next(err) {
      if (!err) {
        fn(req, res);
        return;
      }

      if (res.headersSent) {
        console.error('[ERROR] handleAppScopedError headersSent');
        console.log(err);
        console.log(err.stack);
        return;
      }

      console.error('[ERROR] handleAppScopedError');
      console.log(err);
      console.log(err.stack);

      res.writeHead(500);
      res.end(
          "<html>"
        + "<head>"
        + '<link rel="icon" href="favicon.ico" />'
        + "</head>"
        + "<body>"
        + "<pre>"
        + "<code>"
        + "Method: " + encodeURI(req.method)
        + '\n'
        + "Hostname: " + encodeURI(domaininfo.hostname)
        + '\n'
        + "App: " + encodeURI(domaininfo.pathname ? (domaininfo.pathname + '/') : '')
        + '\n'
        + "Route: " + encodeURI(req.url)//.replace(/^\//, '')
        + '\n'
          // TODO better sanatization
        + 'Error: '  + (err.message || err.toString()).replace(/</g, '&lt;')
        + "</code>"
        + "</pre>"
        + "</body>"
        + "</html>"
      );
    }

    return next;
  }

  function createPromiseApps(secureServer) {
    return new PromiseA(function (resolve) {
      var forEachAsync    = require('foreachasync').forEachAsync.create(PromiseA);
      var connect         = require('connect');
                            // TODO make lazy
      var app             = connect().use(require('compression')());
      var vhost           = require('vhost');

      var domainMergeMap  = {};
      var domainMerged    = [];

      function getDomainInfo(apppath) {
        var parts = apppath.split(/[#%]+/);
        var hostname = parts.shift();
        var pathname = parts.join('/').replace(/\/+/g, '/').replace(/^\//, '');

        return {
          hostname: hostname
        , pathname: pathname
        , dirpathname: parts.join('#')
        , dirname: apppath
        , isRoot: apppath === hostname
        };
      }

      function loadDomainMounts(domaininfo) {
        var connectContext = {};
        var appContext;

        // should order and group by longest domain, then longest path
        if (!domainMergeMap[domaininfo.hostname]) {
          // create an connect / express app exclusive to this domain
          // TODO express??
          domainMergeMap[domaininfo.hostname] = {
            hostname: domaininfo.hostname
          , apps: connect()
          , mountsMap: {}
          };
          domainMerged.push(domainMergeMap[domaininfo.hostname]);
        }

        if (domainMergeMap[domaininfo.hostname].mountsMap['/' + domaininfo.dirpathname]) {
          return;
        }

        console.log('[log] [once] Preparing mount for', domaininfo.hostname + '/' + domaininfo.dirpathname);
        domainMergeMap[domaininfo.hostname].mountsMap['/' + domaininfo.dirpathname] = function (req, res, next) {
          res.setHeader('Strict-Transport-Security', 'max-age=10886400; includeSubDomains; preload');
          function loadThatApp() {
            var time = Date.now();

            console.log('[log] LOADING "' + domaininfo.hostname + '/' + domaininfo.pathname + '"', req.url);
            return getAppContext(domaininfo).then(function (localApp) {
              console.info((Date.now() - time) + 'ms Loaded ' + domaininfo.hostname + ':' + securePort + '/' + domaininfo.pathname);
              //if (localApp.arity >= 2) { /* connect uses .apply(null, arguments)*/ }
              if ('function' !== typeof localApp) {
                localApp = getDummyAppContext(null, "[ERROR] no connect-style export from " + domaininfo.dirname);
              }

              // Note: pathname should NEVER have a leading '/' on its own
              // we always add it explicitly
              function localAppWrapped(req, res) {
                console.log('[debug]', domaininfo.hostname + '/' + domaininfo.pathname, req.url);
                localApp(req, res, handleAppScopedError('localApp', domaininfo, req, res, function (req, res) {
                  if (!serveFavicon) {
                    serveFavicon = require('serve-favicon')(path.join(__dirname, '..', 'public', 'favicon.ico'));
                  }

                  // TODO redirect GET /favicon.ico to GET (req.headers.referer||'') + /favicon.ico
                  // TODO other common root things - robots.txt, app-icon, etc
                  serveFavicon(req, res, handleAppScopedError('serveFavicon', domaininfo, req, res, function (req, res) {
                    connectContext.static(req, res, handleAppScopedError('connect.static', domaininfo, req, res, function (req, res) {
                      res.writeHead(404);
                      res.end(
                          "<html>"
                        + "<head>"
                        + '<link rel="icon" href="favicon.ico" />'
                        + "</head>"
                        + "<body>"
                        + "Cannot "
                        + encodeURI(req.method)
                        + " 'https://"
                        + encodeURI(domaininfo.hostname)
                        + '/'
                        + encodeURI(domaininfo.pathname ? (domaininfo.pathname + '/') : '')
                        + encodeURI(req.url.replace(/^\//, ''))
                        + "'"
                        + "<br/>"
                        + "<br/>"
                        + "Domain: " + encodeURI(domaininfo.hostname)
                        + "<br/>"
                        + "App: " + encodeURI(domaininfo.pathname)
                        + "<br/>"
                        + "Route : " + encodeURI(req.url)
                        + "</body>"
                        + "</html>"
                      );
                    }));
                  }));
                }));
              }
              try {
                var localConnect = connect();
                localConnect.use(require('connect-query')());
                localConnect.use(localAppWrapped);
                domainMergeMap[domaininfo.hostname].apps.use('/' + domaininfo.pathname, localConnect);
                return localConnect;
              } catch(e) {
                console.error('[ERROR] '
                  + domaininfo.hostname + ':' + securePort
                  + '/' + domaininfo.pathname
                );
                console.error(e);
                // TODO this may not work in web apps (due to 500), probably okay
                res.writeHead(500);
                res.end('{ "error": { "message": "[ERROR] could not load '
                  + encodeURI(domaininfo.hostname) + ':' + securePort + '/' + encodeURI(domaininfo.pathname)
                  + 'or default error app." } }');
              }
            });
          }

          function suckItDubDubDub(req, res) {
            var newLoc = 'https://' + (req.headers.host||'').replace(/^www\./) + req.url;
            res.statusCode = 301;
            res.setHeader('Location', newLoc);
            res.end("<html><head><title></title></head><body><!-- redirecting nowww --></body><html>");
          }

          function nextify() {
            if (!appContext) {
              appContext = loadThatApp();
            }

            if (!appContext.then) {
              appContext(req, res, next);
            } else {
              appContext.then(function (localConnect) {
                appContext = localConnect;
                appContext(req, res, next);
              });
            }
          }

          if (!serveStatic) {
            serveStatic = require('serve-static');
          }

          if (!connectContext.static) {
            console.log('[static]', path.join(vhostsdir, domaininfo.dirname, 'public'));
            connectContext.static = serveStatic(path.join(vhostsdir, domaininfo.dirname, 'public'));
          }

          if (/^www\./.test(req.headers.host)) {
            if (/\.appcache\b/.test(req.url)) {
              res.setHeader('Content-Type', 'text/cache-manifest');
              res.end('CACHE MANIFEST\n\n# v0__DELETE__CACHE__MANIFEST__\n\nNETWORK:\n*');
              return;
            }
            suckItDubDubDub(req, res);
            return;
          }

          if (/^\/api\//.test(req.url)) {
            nextify();
          return;
        }

        connectContext.static(req, res, nextify);
        };
        domainMergeMap[domaininfo.hostname].apps.use(
            '/' + domaininfo.pathname
            , domainMergeMap[domaininfo.hostname].mountsMap['/' + domaininfo.dirpathname]
            );

        return PromiseA.resolve();
      }

      function readNewVhosts() {
        return fs.readdirSync(vhostsdir).filter(function (node) {
          // not a hidden or private file
          return '.' !== node[0] && '_' !== node[0];
        }).map(getDomainInfo).sort(function (a, b) {
          var hlen = b.hostname.length - a.hostname.length;
          var plen = b.pathname.length - a.pathname.length;

          // A directory could be named example.com, example.com# example.com##
          // to indicate order of preference (for API addons, for example)
          var dlen = b.dirname.length - a.dirname.length;
          if (!hlen) {
            if (!plen) {
              return dlen;
            }
            return plen;
          }
          return plen;
        });
      }

      function getDummyAppContext(err, msg) {
        console.error('[ERROR] getDummyAppContext');
        console.error(err);
        console.error(msg);
        return function (req, res) {
          res.writeHead(500);
          res.end('{ "error": { "message": "' + msg + '" } }');
        };
      }

      function getLoopbackApp() {
        return function (req, res) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ "success": true, "token": loopbackToken }));
        };
      }

      function getAppContext(domaininfo) {
        var localApp;

        if ('loopback.daplie.invalid' === domaininfo.dirname) {
          return getLoopbackApp();
        }

        try {
          // TODO live reload required modules
          localApp = require(path.join(vhostsdir, domaininfo.dirname, 'app.js'));
          if (localApp.create) {
            // TODO read local config.yml and pass it in
            // TODO pass in websocket
            localApp = localApp.create(secureServer, {
              dummyCerts: dummyCerts
              , hostname: domaininfo.hostname
              , port: securePort
              , url: domaininfo.pathname
            });

            if (!localApp) {
              localApp = getDummyAppContext(null, "[ERROR] no app was returned by app.js for " + domaininfo.dirname);
            }
          }

          if (!localApp.then) {
            localApp = PromiseA.resolve(localApp);
          } else {
            return localApp.catch(function (e) {
              console.error("[ERROR] initialization failed during create() for " + domaininfo.dirname);
              console.error(e);
              throw e;
              //return getDummyAppContext(e, "[ERROR] initialization failed during create() for " + domaininfo.dirname);
            });
          }
        } catch(e) {
          localApp = getDummyAppContext(e, "[ERROR] could not load app.js for " + domaininfo.dirname);
          localApp = PromiseA.resolve(localApp);
        }

        return localApp;
      }

      function loadDomainVhosts() {
        domainMerged.forEach(function (domainApp) {
          if (domainApp._loaded) {
            return;
          }

          console.log('[log] [once] Loading all mounts for ' + domainApp.hostname);
          domainApp._loaded = true;
          app.use(vhost(domainApp.hostname, domainApp.apps));
          app.use(vhost('www.' + domainApp.hostname, function (req, res/*, next*/) {
            if (/\.appcache\b/.test(req.url)) {
              res.setHeader('Content-Type', 'text/cache-manifest');
              res.end('CACHE MANIFEST\n\n# v0__DELETE__CACHE__MANIFEST__\n\nNETWORK:\n*');
              //domainApp.apps(req, res, next);
              return;
            }
            // TODO XXX this is in the api section, so it should hard break
            //res.statusCode = 301;
            //res.setHeader('Location', newLoc);

            // TODO port number for non-443
            var escapeHtml = require('escape-html');
            var newLocation = 'https://' + domainApp.hostname + req.url;
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
          }));
        });
      }

      /*
      function hotloadApp(req, res, next) {
        var forEachAsync = require('foreachasync').forEachAsync.create(PromiseA);
        var vhost = (req.headers.host || '').split(':')[0];

        // the matching domain didn't catch it
        console.log('[log] vhost:', vhost);
        if (domainMergeMap[vhost]) {
          next();
          return;
        }

        return forEachAsync(readNewVhosts(), loadDomainMounts).then(loadDomainVhosts).then(function () {
          // no matching domain was added
          if (!domainMergeMap[vhost]) {
            next();
            return;
          }

          return forEachAsync(domainMergeMap[vhost].apps, function (fn) {
            return new PromiseA(function (resolve, reject) {
              function next(err) {
                if (err) {
                  reject(err);
                }
                resolve();
              }

              try {
                fn(req, res, next);
              } catch(e) {
                reject(e);
              }
            });
          }).catch(function (e) {
            next(e);
          });
        });

        /*
        // TODO loop through mounts and see if any fit
        domainMergeMap[vhost].mountsMap['/' + domaininfo.dirpathname]
        if (!domainMergeMap[domaininfo.hostname]) {
          // TODO reread directories
        }
        */ //
        /*
      }
      */


      // TODO pre-cache these once the server has started?
      // return forEachAsync(rootDomains, loadCerts);
      // TODO load these even more lazily
      return forEachAsync(readNewVhosts(), loadDomainMounts).then(loadDomainVhosts).then(function () {
        console.log('[log] TODO fix and use hotload');
        //app.use(hotloadApp);
        resolve(app);
        return;
      });
    });
  }

  return { create: createPromiseApps };
};
