'use strict';

// Note the odd use of callbacks here.
// We're targetting low-power platforms and so we're trying to
// require everything as lazily as possible until our server
// is actually listening on the socket. Bluebird is heavy.
// Even the built-in modules can take dozens of milliseconds to require
module.exports.create = function (lex, certPaths, serverCallback) {
  // Recognize that this secureContexts cache is local to this CPU core
  var secureContexts = {};
  var ciphers = 'ECDH+AESGCM:DH+AESGCM:ECDH+AES128:DH+AES:ECDH+3DES:DH+3DES:RSA+AESGCM:RSA+AES:RSA+3DES:!aNULL:!MD5:!DSS:!AES256';

  function createSecureServer() {
    var domainname = 'www.example.com';
    var fs = require('fs');
    var secureOpts = {
      // TODO create backup file just in case this one is ever corrupted
      // NOTE synchronous is faster in this case of initialization
      // NOTE certsPath[0] must be the default (LE) directory (another may be used for OV and EV certs)
      key: fs.readFileSync(certPaths[0] + '/' + domainname + '/privkey.pem', 'ascii')
    , cert: fs.readFileSync(certPaths[0] + '/' + domainname + '/fullchain.pem', 'ascii')
      // https://hynek.me/articles/hardening-your-web-servers-ssl-ciphers/
      // https://nodejs.org/api/tls.html
      // removed :ECDH+AES256:DH+AES256 and added :!AES256 because AES-256 wastes CPU
    , ciphers: ciphers
    , honorCipherOrder: true
    };

    secureContexts['www.example.com'] = require('tls').createSecureContext(secureOpts);
    secureContexts['example.com'] = secureContexts['www.example.com'];

    //SNICallback is passed the domain name, see NodeJS docs on TLS
    secureOpts.SNICallback = function (domainname, cb) {
      // NOTE: '*.proxyable.*' domains will be truncated
      require('./load-certs').load(secureContexts, certPaths, domainname).then(function (context) {
        cb(null, context);
      }, function (err) {
        console.error('[SNI Callback]');
        console.error(err.stack);
        cb(err);
      });
    };

    serverCallback(null, require('https').createServer(secureOpts));
  }

  function createLeServer() {
    lex.httpsOptions.ciphers = ciphers;
    lex.httpsOptions.honorCipherOrder = true;
    serverCallback(null, require('https').createServer(lex.httpsOptions));
  }

  if (lex) {
    createLeServer();
  } else {
    createSecureServer();
  }
};
