'use strict';

module.exports.create = function (securePort, insecurePort, info, serverCallback) {
  var PromiseA = require('bluebird').Promise;
  var appPromise;
  //var app;
  var http = require('http');
  var redirectives;

  function useAppInsecurely(req, res) {
    if (!appPromise) {
      return false;
    }

    appPromise.then(function (app) {
      req._WALNUT_SECURITY_EXCEPTION = true;
      app(req, res);
    });

    return true;
  }

  function redirectHttps(req, res) {
    // Let it do this once they visit the https site
    // res.setHeader('Strict-Transport-Security', 'max-age=10886400; includeSubDomains; preload');

    var host = req.headers.host || '';
    var url = req.url;

    // TODO
    // XXX NOTE: info.conf.redirects may or may not be loaded at first
    // the object will be modified when the config is loaded
    if (!redirectives && info.conf.redirects) {
      redirectives = require('./hostname-redirects').compile(info.conf.redirects);
    }
    if (require('./no-www').scrubTheDub(req, res, redirectives)) {
      return true;
    }

    // TODO
    // allow exceptions for the case of arduino and whatnot that cannot handle https?
    // http://evothings.com/is-it-possible-to-secure-micro-controllers-used-within-iot/
    // needs ECDSA?

    console.warn('HARD-CODED HTTPS EXCEPTION in insecure-server.js');
    if (/redirect-www.org/.test(host) && useAppInsecurely(req, res)) {
      return true;
    }

    var escapeHtml = require('escape-html');
    var newLocation = 'https://'
      + host.replace(/:\d+/, ':' + securePort) + url
      ;
    var safeLocation = escapeHtml(newLocation);

    var metaRedirect = ''
      + '<html>\n'
      + '<head>\n'
      + '  <style>* { background-color: white; color: white; text-decoration: none; }</style>\n'
      + '  <META http-equiv="refresh" content="0;URL=' + safeLocation + '">\n'
      + '</head>\n'
      + '<body style="display: none;">\n'
      + '  <p>You requested an insecure resource. Please use this instead: \n'
      + '    <a href="' + safeLocation + '">' + safeLocation + '</a></p>\n'
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
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(metaRedirect);
  }

  // TODO localhost-only server shutdown mechanism
  // that closes all sockets, waits for them to finish,
  // and then hands control over completely to respawned server

  //
  // Redirect HTTP to HTTPS
  //
  // This simply redirects from the current insecure location to the encrypted location
  //
  var insecureServer;
  insecureServer = http.createServer();
  insecureServer.listen(insecurePort, function () {
    console.log("\nListening on http://localhost:" + insecureServer.address().port);
    console.log("(handling any explicit redirects and redirecting all other traffic to https)\n");
    if (serverCallback) {
      appPromise = serverCallback(null, insecureServer);
    }
  });
  insecureServer.on('request', redirectHttps);

  return PromiseA.resolve(insecureServer);
};
