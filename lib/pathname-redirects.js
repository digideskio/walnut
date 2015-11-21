  /*
  //var escapeRe;
    //var insecureRedirects;
    if (require('./unbrick-appcache').unbrick(req, res)) {
      return;
    }

    // because I have domains for which I don't want to pay for SSL certs
    insecureRedirects = (redirects||[]).sort(function (a, b) {
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
    */

