'use strict';

module.exports.create = function (securePort, insecurePort, redirects) {
  var PromiseA = require('bluebird').Promise;
  var http = require('http');
  var escapeRe;

  function redirectHttps(req, res) {
    var insecureRedirects;
    var host = req.headers.host || '';
    var url = req.url;

    // because I have domains for which I don't want to pay for SSL certs
    insecureRedirects = redirects.sort(function (a, b) {
      var hlen = b.from.hostname.length - a.from.hostname.length;
      var plen;
      if (!hlen) {
        plen = b.from.path.length - a.from.path.length;
        return plen;
      }
      return hlen;
    }).forEach(function (redirect) {
      var origHost = host;

      if (!escapeRe) {
        escapeRe = require('escape-string-regexp');
      }

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

    var escapeHtml = require('escapeHtml');
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
  insecureServer.on('request', redirectHttps);
  insecureServer.listen(insecurePort, function () {
    console.log("\nListening on https://localhost:" + insecureServer.address().port);
    console.log("(redirecting all traffic to https)\n");
  });

  return PromiseA.resolve(insecureServer);
};
