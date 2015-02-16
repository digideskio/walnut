'use strict';
 
var https           = require('https');
var http            = require('http');
var PromiseA        = require('bluebird').Promise;
var forEachAsync    = require('foreachasync').forEachAsync.create(PromiseA);
var fs              = require('fs');
var path            = require('path');
var crypto          = require('crypto');
var connect         = require('connect');
var vhost           = require('vhost');
var escapeRe        = require('escape-string-regexp');

  // connect / express app
var app             = connect();

  // SSL Server
var secureContexts  = {};
var secureOpts;
var secureServer;
var securePort      = process.argv[2] || 443;

  // force SSL upgrade server
var insecureServer;
var insecurePort    = process.argv[3] || 80;

  // the ssl domains I have
  // TODO read vhosts minus 
var domains         = fs.readdirSync(path.join(__dirname, 'vhosts')).filter(function (node) {
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

require('ssl-root-cas')
  .inject()
  ;

function getDummyAppContext(err, msg) {
  if (err) {
    console.error(err);
  }
  return connect().use(function (req, res) {
    res.end('{ "error": { "message": "' + msg.replace(/"/g, '\\"') + '" } }');
  });
}
function getAppContext(domaininfo) {
  var localApp;

  try {
    localApp = require(path.join(__dirname, 'vhosts', domaininfo.dirname, 'app.js'));
    if (localApp.create) {
      // TODO read local config.yml and pass it in
      // TODO pass in websocket
      localApp = localApp.create(/*config*/);
      if (!localApp) {
        return getDummyAppContext(err, "[ERROR] no app was returned by app.js for " + domaininfo.driname);
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
    localApp = getDummyAppContext(err, "[ERROR] could not load app.js for " + domaininfo.dirname);
    localApp = PromiseA.resolve(localApp);

    return localApp;
  }

  return localApp;
}

function loadDummyCerts() {
  var certsPath = path.join(__dirname, 'certs');
  var certs = {
    key:          fs.readFileSync(path.join(certsPath, 'server', 'dummy-server.key.pem'))
  , cert:         fs.readFileSync(path.join(certsPath, 'server', 'dummy-server.crt.pem'))
  , ca:           fs.readdirSync(path.join(certsPath, 'ca')).map(function (node) {
                    return fs.readFileSync(path.join(certsPath, 'ca', node));
                  })
  };
  secureContexts.dummy = crypto.createCredentials(certs).context;
  secureContexts.dummy.certs = certs;
}
loadDummyCerts();

function loadCerts(domaininfo) {
  var certsPath = path.join(__dirname, 'vhosts', domaininfo.dirname, 'certs');

  try {
    var nodes = fs.readdirSync(path.join(certsPath, 'server'));
    var keyNode = nodes.filter(function (node) { return /\.key\.pem$/.test(node); })[0];
    var crtNode = nodes.filter(function (node) { return /\.crt\.pem$/.test(node); })[0];

    secureContexts[domaininfo.hostname] = crypto.createCredentials({
      key:  fs.readFileSync(path.join(certsPath, 'server', keyNode))
    , cert: fs.readFileSync(path.join(certsPath, 'server', crtNode))
    , ca:   fs.readdirSync(path.join(certsPath, 'ca')).map(function (node) {
              return fs.readFileSync(path.join(certsPath, 'ca', node));
            })
    }).context;
  } catch(err) {
    // TODO Let's Encrypt / ACME HTTPS
    console.error("[ERROR] Couldn't load HTTPS certs from '" + certsPath + "':");
    console.error(err);
    secureContexts[domaininfo.hostname] = secureContexts.dummy;
  }
}

forEachAsync(rootDomains, loadCerts).then(function () {
  // fallback / default domain
  /*
  app.use('/', function (req, res) {
    res.statusCode = 404;
    res.end("<html><body><h1>Hello, World... This isn't the domain you're looking for.</h1></body></html>");
  });
  */
  return forEachAsync(domains, function (domaininfo) {
    // should order and group by longest domain, then longest path
    if (!domainMergeMap[domaininfo.hostname]) {
      // create an connect / express app exclusive to this domain
      // TODO express??
      domainMergeMap[domaininfo.hostname] = { hostname: domaininfo.hostname, apps: connect() };
      domainMerged.push(domainMergeMap[domaininfo.hostname]);
    }

    return getAppContext(domaininfo).then(function (localApp) {
      // Note: pathname should NEVER have a leading '/' on its own
      // we always add it explicitly
      try {
        domainMergeMap[domaininfo.hostname].apps.use('/' + domaininfo.pathname, localApp);
        console.info('Loaded ' + domaininfo.hostname + ':' + securePort + '/' + domaininfo.pathname);
      } catch(e) {
        console.error('[ERROR] ' + domaininfo.hostname + ':' + securePort + '/' + domaininfo.pathname);
        console.error(e);
      }
    });
  }).then(function () {
    domainMerged.forEach(function (domainApp) {
      app.use(vhost(domainApp.hostname, domainApp.apps));
      app.use(vhost('www.' + domainApp.hostname, domainApp.apps));
    });
  });
}).then(runServer);

function runServer() {
  //provide a SNICallback when you create the options for the https server
  secureOpts = {
    //SNICallback is passed the domain name, see NodeJS docs on TLS
    SNICallback:  function (domainname) {
                    //console.log('SNI:', domain);
                    return secureContexts[domainname] || secureContext.dummy;
                  }
                  // fallback / default dummy certs
  , key:          secureContexts.dummy.certs.key
  , cert:         secureContexts.dummy.certs.cert
  , ca:           secureContexts.dummy.certs.ca
  };

  secureServer = https.createServer(secureOpts);
  secureServer.on('request', app);
  secureServer.listen(securePort, function () {
    console.log("Listening on https://localhost:" + secureServer.address().port);
  });

  // TODO localhost-only server shutdown mechanism
  // that closes all sockets, waits for them to finish,
  // and then hands control over completely to respawned server

  //
  // Redirect HTTP ot HTTPS
  //
  // This simply redirects from the current insecure location to the encrypted location
  //
  insecureServer = http.createServer();
  insecureServer.on('request', function (req, res) {
    var insecureRedirects;
    var host = req.headers.host || '';
    var url = req.url;

    // because I have domains for which I don't want to pay for SSL certs
    insecureRedirects = require('./redirects.json').sort(function (a, b) {
      var hlen = b.from.hostname.length - a.from.hostname.length;
      var plen;
      if (!hlen) {
        plen = b.from.path.length - a.from.path.length;
        return plen;
      }
      return hlen;
    }).forEach(function (redirect) {
      var origHost = host;
      // TODO if '*' === hostname[0], omit '^'
      host = host.replace(
        new RegExp('^' + escapeRe(redirect.from.hostname))
      , redirect.to.hostname
      );
      if (host === origHost) {
        return;
      }
      url = url.replace(
        new RegExp('^' + escapeRe(redirect.from.path))
      , redirect.to.path
      );
    });

    var newLocation = 'https://'
      + host.replace(/:\d+/, ':' + securePort) + url
      ;

    var metaRedirect = ''
      + '<html>\n'
      + '<head>\n'
      + '  <style>* { background-color: white; color: white; text-decoration: none; }</style>\n'
      + '  <META http-equiv="refresh" content="0;URL=' + newLocation + '">\n'
      + '</head>\n'
      + '<body style="display: none;">\n'
      + '  <p>You requested an insecure resource. Please use this instead: \n'
      + '    <a href="' + newLocation + '">' + newLocation + '</a></p>\n'
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
    res.setHeader('Content-Type', 'text/html');
    res.end(metaRedirect);
  });
  insecureServer.listen(insecurePort, function(){
    console.log("\nRedirecting all http traffic to https\n");
  });
}
