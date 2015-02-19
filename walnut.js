//var holepunch = require('./holepunch/beacon');
//var config = require('./device.json');
var securePort = process.argv[2] || 443;
var insecurePort = process.argv[3] || 80;
var redirects = require('./redirects.json');
var path = require('path');

    // force SSL upgrade server
var certsPath = path.join(__dirname, 'certs');
// require('ssl-root-cas').inject();
var vhostsdir = path.join(__dirname, 'vhosts');

require('./lib/insecure-server').create(securePort, insecurePort, redirects);
require('./lib/vhost-sni-server.js').create(securePort, certsPath, vhostsdir).then(function () {
  var ports ;

  ports = [
    { private: 22
    , public: 22
    , protocol: 'tcp'
    , ttl: 0
    , test: { service: 'ssh' }
    , testable: false
    }
  , { private: 443
    , public: 443
    , protocol: 'tcp'
    , ttl: 0
    , test: { service: 'https' }
    }
  , { private: 80
    , public: 80
    , protocol: 'tcp'
    , ttl: 0
    , test: { service: 'http' }
    }
  ];

  /*
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
  */
});
