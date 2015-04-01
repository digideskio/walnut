'use strict';

console.log('\n\n\nWelcome to WALNUT!');

/*
var fs = require('fs');
var daplieReadFile = fs.readFileSync;
var time = 0;

fs.readFileSync = function (filename) {
  var now = Date.now();
  var data = daplieReadFile.apply(fs, arguments);
  var t;

  t = (Date.now() - now);
  time += t;
  console.log('loaded "' + filename + '" in ' + t + 'ms (total ' + time + 'ms)');

  return data;
};
*/

//var config = require('./device.json');
var securePort = process.argv[2] || 443;
var insecurePort = process.argv[3] || 80;
var redirects = require('./redirects.json');
var path = require('path');

    // force SSL upgrade server
var certsPath = path.join(__dirname, 'certs');
// require('ssl-root-cas').inject();
var vhostsdir = path.join(__dirname, 'vhosts');

function phoneHome() {
  var holepunch = require('./holepunch/beacon');
  var ports;

  ports = [
    { private: 65022
    , public: 65022
    , protocol: 'tcp'
    , ttl: 0
    , test: { service: 'ssh' }
    , testable: false
    }
  , { private: 650443
    , public: 650443
    , protocol: 'tcp'
    , ttl: 0
    , test: { service: 'https' }
    }
  , { private: 65080
    , public: 65080
    , protocol: 'tcp'
    , ttl: 0
    , test: { service: 'http' }
    }
  ];

  // TODO return a middleware
  holepunch.run(require('./redirects.json').reduce(function (all, redirect) {
    if (!all[redirect.from.hostname]) {
      all[redirect.from.hostname] = true;
      all.push(redirect.from.hostname)
    }
    if (!all[redirect.to.hostname]) {
      all[redirect.to.hostname] = true;
      all.push(redirect.to.hostname)
    }

    return all;
  }, []), ports).catch(function () {
    console.error("Couldn't phone home. Oh well");
  });
}
require('./lib/insecure-server').create(securePort, insecurePort, redirects);
require('./lib/vhost-sni-server.js').create(securePort, certsPath, vhostsdir)
  //.then(phoneHome)
  ;
