'use strict';

var opts = {
  redirects: [
    { "id": "*", "value": true }
  , { "id": "ns2.redirect-www.org", "value": false }
  , { "id": "hellabit.com", "value": false }
  , { "id": "*.hellabit.com", "value": false }
  , { "id": "redirect-www.org", "value": null }
  , { "id": "www.redirect-www.org", "value": null }
  , { "id": "no.redirect-www.org", "value": false }
  , { "id": "*.redirect-www.org", "value": false }
  , { "id": "*.yes.redirect-www.org", "value": true }
  , { "id": "yes.redirect-www.org", "value": true }
  , { "id": "*.maybe.redirect-www.org", "value": null }
  , { "id": "maybe.redirect-www.org", "value": null }
  , { "id": "blog.coolaj86.com", "value": 'coolaj86.com' } // TODO pathname
]
, matchesMap: null
, patternsMap: null
, patterns: null
};

var redirectTo = require('../lib/hostname-redirects').redirectTo;
var sortOpts = require('../lib/hostname-redirects').sortOpts;

var domains = {
// maybewww
  'redirect-www.org': false
, 'www.redirect-www.org': false
, 'maybe.redirect-www.org': false
, 'www.maybe.redirect-www.org': false

// yeswww
, 'yes.redirect-www.org': 'www.yes.redirect-www.org'
, 'foo.yes.redirect-www.org': 'www.foo.yes.redirect-www.org'

// nowww
, 'www.no.redirect-www.org': 'no.redirect-www.org'
, 'www.foo.no.redirect-www.org': 'foo.no.redirect-www.org'

, 'ns2.redirect-www.org': false
, 'www.ns2.redirect-www.org': 'ns2.redirect-www.org'

, 'ns1.redirect-www.org': false
, 'www.ns1.redirect-www.org': 'ns1.redirect-www.org'

, 'hellabit.com': false
, 'www.hellabit.com': 'hellabit.com'

// default policy (yeswww)
, 'ahellabit.com': 'www.ahellabit.com'
, 'www.ahellabit.com': false
, 'example.com': 'www.example.com'
, 'www.example.com': false
};

var redirects = sortOpts(opts.redirects);

//console.log(redirects);

Object.keys(domains).forEach(function (domain, i) {
  var redir = domains[domain];
  var result = redirectTo(domain, redirects);

  if (redir !== result) {
    throw new Error("For domain #" + i + " '" + domain + "' expected '" + redir + "' but got '" + result + "'");
  }
});

console.log("TODO: we do not yet detect infinite loop redirects");
console.log("");
console.log("");
console.log("Didn't throw any errors. Must have worked, eh?");
console.log("");
