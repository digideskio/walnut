'use strict';
 
var https           = require('https');
var PromiseA        = require('bluebird').Promise;
var forEachAsync    = require('foreachasync').forEachAsync.create(PromiseA);
var fs              = require('fs');
var path            = require('path');
var crypto          = require('crypto');
var connect         = require('connect');
var vhost           = require('vhost');

module.exports.create = function (securePort, certsPath, vhostsdir) {
    // connect / express app
  var app             = connect();

    // SSL Server
  var secureContexts  = {};
  var dummyCerts;
  var secureOpts;
  var secureServer;

    // the ssl domains I have
    // TODO read vhosts minus 
  var domains         = fs.readdirSync(vhostsdir).filter(function (node) {
                          // not a hidden or private file
                          return '.' !== node[0] && '_' !== node[0];
                        }).map(function (apppath) {
                          var parts = apppath.split(/[#%]+/);
                          var hostname = parts.shift();
                          var pathname = parts.join('/').replace(/\/+/g, '/').replace(/^\//, '');

                          return {
                            hostname: hostname
                          , pathname: pathname
                          , dirname: apppath
                          , isRoot: apppath === hostname
                          };
                        }).sort(function (a, b) {
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
  var rootDomains     = domains.filter(function (domaininfo) {
                          return domaininfo.isRoot;
                        });
  var domainMergeMap  = {};
  var domainMerged    = [];

  function loadDummyCerts() {
    var certs = {
      key:          fs.readFileSync(path.join(certsPath, 'server', 'dummy-server.key.pem'))
    , cert:         fs.readFileSync(path.join(certsPath, 'server', 'dummy-server.crt.pem'))
    , ca:           fs.readdirSync(path.join(certsPath, 'ca')).filter(function (node) {
                      return /crt\.pem$/.test(node);
                    }).map(function (node) {
                      console.log('[Add CA]', node);
                      return fs.readFileSync(path.join(certsPath, 'ca', node));
                    })
    };
    return certs
  }
  dummyCerts = loadDummyCerts();

  function createSecureContext(certs) {
    // workaround for v0.12 / v1.2 backwards compat
    try {
      return require('tls').createSecureContext(certs);
    } catch(e) { 
      return require('crypto').createCredentials(certs).context;
    }
  }
  secureContexts.dummy = createSecureContext(dummyCerts);

  function getAppContext(domaininfo) {
    var localApp;

    try {
      // TODO live reload required modules
      localApp = require(path.join(vhostsdir, domaininfo.dirname, 'app.js'));
      if (localApp.create) {
        // TODO read local config.yml and pass it in
        // TODO pass in websocket
        localApp = localApp.create(/*config*/);
        if (!localApp) {
          return getDummyAppContext(null, "[ERROR] no app was returned by app.js for " + domaininfo.driname);
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

      return localApp;
    }

    return localApp;
  }

  function loadDummyCerts() {
    var certs = {
      key:          fs.readFileSync(path.join(certsPath, 'server', 'dummy-server.key.pem'))
    , cert:         fs.readFileSync(path.join(certsPath, 'server', 'dummy-server.crt.pem'))
    , ca:           fs.readdirSync(path.join(certsPath, 'ca')).filter(function (node) {
                      return /crt\.pem$/.test(node);
                    }).map(function (node) {
                      console.log('[log dummy ca]', node);
                      return fs.readFileSync(path.join(certsPath, 'ca', node));
                    })
    };
    secureContexts.dummy = crypto.createCredentials(certs).context;
    dummyCerts = certs;
  }
  loadDummyCerts();

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
      secureContexts[domainname] = crypto.createCredentials(secOpts).context;
    } catch(err) {
      console.error("[ERROR] Certificates in '" + certsPath + "' could not be used:");
      console.error(err);
      return null;
    }

    return secureContexts[domainname];
  }

  app.use(function (req, res, next) {
    console.log('[log] request for ' + req.headers.host + req.url);
    next();
  });

  // TODO load these once the server has started
  // return forEachAsync(rootDomains, loadCerts);
  return forEachAsync(domains, function (domaininfo) {
    var appContext;

    // should order and group by longest domain, then longest path
    if (!domainMergeMap[domaininfo.hostname]) {
      // create an connect / express app exclusive to this domain
      // TODO express??
      domainMergeMap[domaininfo.hostname] = { hostname: domaininfo.hostname, apps: connect() };
      domainMerged.push(domainMergeMap[domaininfo.hostname]);
    }

    domainMergeMap[domaininfo.hostname].apps.use(
      '/' + domaininfo.pathname
    , function (req, res, next) {
        if (appContext) {
          console.log('[log] has appContext');
          appContext(req, res, next);
          return;
        }

        console.log('[log] no appContext');
        getAppContext(domaininfo).then(function (localApp) {
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
            res.send('{ "error": { "message": "[ERROR] could not load '
              + domaininfo.hostname + ':' + securePort + '/' + domaininfo.pathname
              + 'or default error app." } }');
          }
        });

      }
    );

    return PromiseA.resolve();
  }).then(function () {
    domainMerged.forEach(function (domainApp) {
      console.log('[log] merged ' + domainApp.hostname);
      app.use(vhost(domainApp.hostname, domainApp.apps));
      app.use(vhost('www.' + domainApp.hostname, domainApp.apps));
    });
  }).then(runServer);

  function runServer() {
    //provide a SNICallback when you create the options for the https server
    secureOpts = {
                    // fallback / default dummy certs
      key:          dummyCerts.key
    , cert:         dummyCerts.cert
    , ca:           dummyCerts.ca
    };

    function addSniWorkaroundCallback() {
      //SNICallback is passed the domain name, see NodeJS docs on TLS
      secureOpts.SNICallback = function (domainname, cb) {
        console.log('[log] SNI:', domainname);

        var secureContext = secureContexts[domainname]
          || loadCerts(domainname)
          || secureContexts.dummy
          //|| createSecureContext(dummyCerts)
          //|| createSecureContext(loadDummyCerts())
          ;

        if (!secureContext) {
          // testing with shared dummy
          //secureContext = secureContexts.dummy;
          // testing passing bad argument
          //secureContext = createSecureContext(loadDummyCerts);
          // testing with fresh dummy
          secureContext = createSecureContext(loadDummyCerts());
        }

        console.log('[log]', secureContext);

        // workaround for v0.12 / v1.2 backwards compat bug
        if ('function' === typeof cb) {
          console.log('using sni callback callback');
          cb(null, secureContext);
        } else {
          console.log('NOT using sni callback callback');
          return secureContext;
        }
      };
    }
    addSniWorkaroundCallback();

    secureServer = https.createServer(secureOpts);
    secureServer.on('request', function (req, res) {
      console.log('[log] request');
      app(req, res);
    });
    secureServer.listen(securePort, function () {
      console.log("Listening on https://localhost:" + secureServer.address().port);
    });

    return PromiseA.resolve();
  }
}
