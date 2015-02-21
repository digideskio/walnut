'use strict';
 
module.exports.create = function (securePort, certsPath, vhostsdir) {
  var PromiseA = require('bluebird').Promise;
  var https = require('https');
  var fs = require('fs');
  var path = require('path');
  var dummyCerts;
  var secureContexts  = {};

  function loadDummyCerts() {
    if (dummyCerts) {
      return dummyCerts;
    }

    dummyCerts = {
      key:          fs.readFileSync(path.join(certsPath, 'server', 'dummy-server.key.pem'))
    , cert:         fs.readFileSync(path.join(certsPath, 'server', 'dummy-server.crt.pem'))
    , ca:           fs.readdirSync(path.join(certsPath, 'ca')).filter(function (node) {
                      return /crt\.pem$/.test(node);
                    }).map(function (node) {
                      console.log('[log dummy ca]', node);
                      return fs.readFileSync(path.join(certsPath, 'ca', node));
                    })
    };

    return dummyCerts;
  }

  function createSecureContext(certs) {
    // workaround for v0.12 / v1.2 backwards compat
    try {
      return require('tls').createSecureContext(certs);
    } catch(e) { 
      return require('crypto').createCredentials(certs).context;
    }
  }

  function createPromiseApps(secureServer) {
    return new PromiseA(function (resolve) {
      var forEachAsync    = require('foreachasync').forEachAsync.create(PromiseA);
      var connect         = require('connect');
      var app             = connect();
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

        domainMergeMap[domaininfo.hostname].mountsMap['/' + domaininfo.dirpathname] = function (req, res, next) {
          if (appContext) {
            appContext(req, res, next);
            return;
          }

          console.log('[log] LOADING "' + domaininfo.hostname + '/' + domaininfo.pathname + '"');
          getAppContext(domaininfo).then(function (localApp) {
            //if (localApp.arity >= 2) { /* connect uses .apply(null, arguments)*/ }
            if ('function' !== typeof localApp) {
              localApp = getDummyAppContext(null, "[ERROR] no connect-style export from " + domaininfo.dirname);
            }

            // Note: pathname should NEVER have a leading '/' on its own
            // we always add it explicitly
            try {
              domainMergeMap[domaininfo.hostname].apps.use('/' + domaininfo.pathname, localApp);
              console.info('Loaded ' + domaininfo.hostname + ':' + securePort + '/' + domaininfo.pathname);
              appContext = localApp;
              appContext(req, res, next);
            } catch(e) {
              console.error('[ERROR] ' + domaininfo.hostname + ':' + securePort + '/' + domaininfo.pathname);
              console.error(e);
              res.end('{ "error": { "message": "[ERROR] could not load '
                + domaininfo.hostname + ':' + securePort + '/' + domaininfo.pathname
                + 'or default error app." } }');
            }
          });
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
          res.end('{ "error": { "message": "' + msg + '" } }');
        }
      }

      function getAppContext(domaininfo) {
        var localApp;

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
              return getDummyAppContext(e, "[ERROR] initialization failed during create() for " + domaininfo.dirname);
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

          console.log('[log] [once] Loading mounts for ' + domainApp.hostname);
          domainApp._loaded = true;
          app.use(vhost(domainApp.hostname, domainApp.apps));
          app.use(vhost('www.' + domainApp.hostname, domainApp.apps));
        });
      }

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
            return new PromiseA(function (resolve) {
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
        */
      }


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
  };

  function loadCerts(domainname) {
    // TODO make async
    // WARNING: This must be SYNC until we KNOW we're not going to be running on v0.10
    // Also, once we load Let's Encrypt, it's lights out for v0.10

    var certsPath = path.join(vhostsdir, domainname, 'certs');

    try {
      var nodes = fs.readdirSync(path.join(certsPath, 'server'));
      var keyNode = nodes.filter(function (node) { return /\.key\.pem$/.test(node); })[0];
      var crtNode = nodes.filter(function (node) { return /\.crt\.pem$/.test(node); })[0];
      var secOpts = {
        key:  fs.readFileSync(path.join(certsPath, 'server', keyNode))
      , cert: fs.readFileSync(path.join(certsPath, 'server', crtNode))
      }

      if (fs.existsSync(path.join(certsPath, 'ca'))) {
        secOpts.ca = fs.readdirSync(path.join(certsPath, 'ca')).filter(function (node) {
          console.log('[log ca]', node);
          return /crt\.pem$/.test(node);
        }).map(function (node) {
          return fs.readFileSync(path.join(certsPath, 'ca', node));
        });
      }
    } catch(err) {
      // TODO Let's Encrypt / ACME HTTPS
      console.error("[ERROR] Couldn't READ HTTPS certs from '" + certsPath + "':");
      // this will be a simple file-read error
      console.error(err.message);
      return null;
    }

    try {
      secureContexts[domainname] = createSecureContext(secOpts);
    } catch(err) {
      console.error("[ERROR] Certificates in '" + certsPath + "' could not be used:");
      console.error(err);
      return null;
    }

    if (!secureContexts[domainname]) {
      console.error("[ERROR] Sanity check fail, no cert for '" + domainname + "'");
      return null;
    }

    return secureContexts[domainname];
  }

  function createSecureServer() {
    var localDummyCerts = loadDummyCerts();
    var secureOpts = {
                    // fallback / default dummy certs
      key:          localDummyCerts.key
    , cert:         localDummyCerts.cert
    , ca:           localDummyCerts.ca
    };

    function addSniWorkaroundCallback() {
      //SNICallback is passed the domain name, see NodeJS docs on TLS
      secureOpts.SNICallback = function (domainname, cb) {
        if (!secureContexts.dummy) {
          console.log('[log] Loading dummy certs');
          secureContexts.dummy = createSecureContext(localDummyCerts);
        }

        if (!secureContexts[domainname]) {
          console.log('[log] Loading certs for', domainname);
          secureContexts[domainname] = loadCerts(domainname);
        }

        // workaround for v0.12 / v1.2 backwards compat bug
        if ('function' === typeof cb) {
          cb(null, secureContexts[domainname] || secureContexts.dummy);
        } else {
          return secureContexts[domainname] || secureContexts.dummy;
        }
      };
    }

    addSniWorkaroundCallback();
    return https.createServer(secureOpts);
  }

  function runServer() {
    return new PromiseA(function (resolve) {
      var secureServer = createSecureServer();
      var promiseApps;

      function loadPromise() {
        if (!promiseApps) {
          promiseApps = createPromiseApps(secureServer);
        }
        return promiseApps;
      }

      secureServer.listen(securePort, function () {
        resolve(secureServer);
        console.log("Listening on https://localhost:" + secureServer.address().port, '\n');
        loadPromise();
      });

      // Get up and listening as absolutely quickly as possible
      secureServer.on('request', function (req, res) {
        if (/(^|\.)_proxyable\./.test(req.headers.host)) {
          // device-id-12345678._proxyable.myapp.mydomain.com => myapp.mydomain.com
          // _proxyable.myapp.mydomain.com => myapp.mydomain.com
          // TODO myapp.mydomain.com.proxyable.com => myapp.mydomain.com
          req.headers.host = req.headers.host.replace(/.*\.?_proxyable\./, '');
        }

        loadPromise().then(function (app) {
          app(req, res);
        });
      });

      return secureServer;
    });
  }

  return runServer();
}
