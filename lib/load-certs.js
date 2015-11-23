'use strict';

function loadCerts(secureContexts, certPaths, domainname, prevdomainname) {
  var PromiseA = require('bluebird');
  var fs = PromiseA.promisifyAll(require('fs'));
  var path = require('path');

  if (/(^|\.)proxyable\./.test(domainname)) {
    // device-id-12345678.proxyable.myapp.mydomain.com => myapp.mydomain.com
    // proxyable.myapp.mydomain.com => myapp.mydomain.com
    // TODO myapp.mydomain.com.proxyable.com => myapp.mydomain.com
    domainname = domainname.replace(/.*\.?proxyable\./, '');
  }

  if (secureContexts[domainname]) {
    return PromiseA.resolve(secureContexts[domainname]);
  }

  return PromiseA.some(certPaths.map(function (pathname) {
    return PromiseA.all([
      fs.readFileAsync(path.join(pathname, domainname, 'privkey.pem'), 'ascii')
    , fs.readFileAsync(path.join(pathname, domainname, 'fullchain.pem'), 'ascii')
    ]);
  }), 1).then(function (some) {
    var one = some[0];
    secureContexts[domainname] = require('tls').createSecureContext({
      key:  one[0]
    , cert: one[1]
      // https://hynek.me/articles/hardening-your-web-servers-ssl-ciphers/
      // https://nodejs.org/api/tls.html
      // removed :ECDH+AES256:DH+AES256 and added :!AES256 because AES-256 wastes CPU
    , ciphers: 'ECDH+AESGCM:DH+AESGCM:ECDH+AES128:DH+AES:ECDH+3DES:DH+3DES:RSA+AESGCM:RSA+AES:RSA+3DES:!aNULL:!MD5:!DSS:!AES256'
    , honorCipherOrder: true
    });

    // guard against race condition on Promise.some
    if (prevdomainname && !secureContexts[prevdomainname]) {
      // TODO XXX make sure that letsencrypt www. domains handle the bare domains also (and vice versa)
      secureContexts[prevdomainname] = secureContexts[domainname];
    }

    return secureContexts[domainname];
  }, function (/*err*/) {
    // AggregateError means both promises failed
    // TODO check ENOENT

    // test "is this server <<domainname>>?"
    // try letsencrypt
    // fail with www.example.com
    if (/^www\./i.test(domainname)) {
      return loadCerts(secureContexts, certPaths, domainname.replace(/^www\./i, ''), domainname);
    }

    return (secureContexts['www.example.com'] || secureContexts['example.com']);
  }).then(function (ctx) {
    // TODO generate some self-signed certs?
    if (!ctx) {
      console.error("[loadCerts()] Could not load default HTTPS certificates!!!");
      return PromiseA.reject({
        message: "No default certificates for https"
      , code: 'E_NO_DEFAULT_CERTS'
      });
    }

    return ctx;
  });
}
module.exports.load = loadCerts;
