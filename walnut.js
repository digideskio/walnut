var holepunch = require('./holepunch/beacon');
var config = require('./device.json')
var ports ;

ports = [
  { private: 22
  , public: 65022
  , protocol: 'tcp'
  , ttl: 0
  , test: { service: 'ssh' }
  , testable: false
  }
, { private: 65443
  , public: 65443
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

holepunch.run([
  'aj.daplie.com'
, 'coolaj86.com'
, 'prod.coolaj86.com'
, 'production.coolaj86.com'
], ports).then(function () {
  // TODO use as module
  require('./vhost-sni-server.js');
});
