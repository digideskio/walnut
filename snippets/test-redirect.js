'use strict';

var escapeRe = require('escape-string-regexp');

function redirect(host, url) {
  var insecureRedirects;
  // because I have domains for which I don't want to pay for SSL certs
  insecureRedirects = [
    { "from": { "hostname": "coolaj86.org" , "path": "" }
    , "to": { "hostname": "coolaj86.com", "path": "" }
    }
  , { "from": { "hostname": "blog.coolaj86.org" , "path": "" }
    , "to": { "hostname": "coolaj86.com", "path": "" }
    }
  , { "from": { "hostname": "coolaj86.info" , "path": "" }
    , "to": { "hostname": "coolaj86.com", "path": "" }
    }
  , { "from": { "hostname": "blog.coolaj86.info" , "path": "" }
    , "to": { "hostname": "coolaj86.com", "path": "" }
    }
  , { "from": { "hostname": "blog.coolaj86.com" , "path": "" }
    , "to": { "hostname": "coolaj86.com", "path": "" }
    }
  , { "from": { "hostname": "example.org" , "path": "/blog" }
    , "to": { "hostname": "blog.example.com", "path": "" }
    }
  ].sort(function (a, b) {
    var hlen = b.from.hostname.length - a.from.hostname.length;
    var plen;
    if (!hlen) {
      plen = b.from.path.length - a.from.path.length;
      return plen;
    }
    return hlen;
  }).forEach(function (redirect) {
    // TODO if '*' === hostname[0], omit '^'
    host = host.replace(
      new RegExp('^' + escapeRe(redirect.from.hostname))
    , redirect.to.hostname
    );
    url = url.replace(
      new RegExp('^' + escapeRe(redirect.from.path))
    , redirect.to.path
    );
  });

  return [host, url];
}

[
  [ "blog.coolaj86.info", "/articles/awesome.html" ]
, [ "example.org", "/blog" ]
].forEach(function (pair) {
  var host = pair[0];
  var url = pair[1];

  console.log(host, url);
  console.log(redirect(host, url));
});
