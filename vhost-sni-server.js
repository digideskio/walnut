'use strict';
 
var https           = require('https')
  , http            = require('http')
  , PromiseA        = require('bluebird').Promise
  , forEachAsync    = require('foreachasync').forEachAsync.create(PromiseA)
  , fs              = require('fs')
  , path            = require('path')
  , crypto          = require('crypto')
  , connect         = require('connect')
  , vhost           = require('vhost')
  , escapeRe        = require('escape-string-regexp')

  // connect / express app
  , app             = connect()

  // SSL Server
  , secureContexts  = {}
  , secureOpts
  , secureServer
  , securePort      = /*process.argv[2] ||*/ 443

  // force SSL upgrade server
  , insecureServer
  , insecurePort    = /*process.argv[3] ||*/ 80

  // the ssl domains I have
  // TODO read vhosts minus 
  , domains         = fs.readdirSync(path.join(__dirname, 'vhosts')).filter(function (node) {
                        // not a hidden or private file
                        return '.' !== node[0] && '_' !== node[0];
                      })
  ;

require('ssl-root-cas')
  .inject()
  ;

function getAppContext(domain) {
  var localApp
    ;

  localApp = require(path.join(__dirname, 'vhosts', domain, 'app.js'));
  if (localApp.create) {
    // TODO read local config.yml and pass it in
    localApp = localApp.create(/*config*/);
  }
  if (!localApp.then) {
    localApp = PromiseA.resolve(localApp);
  }

  return localApp;
}

forEachAsync(domains, function (domain) {
  secureContexts[domain] = crypto.createCredentials({
    key:  fs.readFileSync(path.join(__dirname, 'vhosts', domain, 'certs/server/my-server.key.pem'))
  , cert: fs.readFileSync(path.join(__dirname, 'vhosts', domain, 'certs/server/my-server.crt.pem'))
  , ca:   fs.readdirSync(path.join(__dirname, 'vhosts', domain, 'certs/ca')).map(function (node) {
            return fs.readFileSync(path.join(__dirname, 'vhosts', domain, 'certs/ca', node));
          })
  }).context;

  return getAppContext(domain).then(function (localApp) {
    app.use(vhost('www.' + domain, localApp));
    app.use(vhost(domain, localApp));
  });
}).then(function () {
  // fallback / default domain
  /*
  app.use('/', function (req, res) {
    res.statusCode = 404;
    res.end("<html><body><h1>Hello, World... This isn't the domain you're looking for.</h1></body></html>");
  });
  */
});

//provide a SNICallback when you create the options for the https server
secureOpts = {
  //SNICallback is passed the domain name, see NodeJS docs on TLS
  SNICallback:  function (domain) {
                  //console.log('SNI:', domain);
                  return secureContexts[domain];
                }
                // fallback / default domain
, key:          fs.readFileSync(path.join(__dirname, 'certs/server', 'dummy-server.key.pem'))
, cert:         fs.readFileSync(path.join(__dirname, 'certs/server', 'dummy-server.crt.pem'))
, ca:           fs.readdirSync(path.join(__dirname, 'certs/ca')).map(function (node) {
                  return fs.readFileSync(path.join(__dirname, 'certs/ca', node));
                })
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
