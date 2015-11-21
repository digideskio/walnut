'use strict';

var fs = require('fs');
var path = require('path');
var updateIp = require('../holepunch/helpers/update-ip.js').update;
// TODO XXX use API + storage
var token = require('../dyndns-token.js').token;

/*
 * @param {string[]} hostnames - A list of hostnames
 * @param {Object[]} addresses - A list of { address: <ip-address>, family: <4|6> }
 */
function update(hostnames, addresses) {
  // TODO use not-yet-built API to get and store tokens
  // TODO use API to add and remove nameservers
  var services = [
    // TODO XXX don't disable cacert checking
    { hostname: 'ns1.redirect-www.org', port: 6443, cacert: false, pathname: '/api/com.daplie.dns/ddns' }
  , { hostname: 'ns2.redirect-www.org', port: 6443, cacert: false, pathname: '/api/com.daplie.dns/ddns' }
  // { cacert = [path.join(__dirname, '..', 'certs', 'ca', 'my-root-ca.crt.pem')] };
  ];
  var answers = [];
  var promises;
  var results = [];
  var PromiseA;

  hostnames.forEach(function (hostname) {
    addresses.forEach(function (address) {
      var answer = {
        "name": hostname
      , "value": address.address
      , "type": null
      , "priority": null
      , "token": token
      };

      if (4 === address.family) {
        answer.type = 'A';
      }
      else if (6 === address.family) {
        answer.type = 'AAAA';
      }
      else {
        console.error('[ERROR] unspported address:');
        console.error(address);
        return;
      }

      answers.push(answer);
    });
  });

  promises = services.map(function (service, i) {
    return updateIp({
      hostname: service.hostname
    , port: service.port
    , pathname: service.pathname
    , cacert: service.cacert
    , token: token
    , ddns: answers
    }).then(function (data) {
      results[i] = { service: service, data: data };
      return data;
    }).error(function (err) {
      results[i] = { service: service, error: err };
    });
  });

  PromiseA = require('bluebird').Promise;
  return PromiseA.all(promises).then(function () {
    return results;
  });
}

module.exports.update = function () {
  var allMap = {};
  var hostnames = require('../redirects.json').reduce(function (all, redirect) {
    if (!allMap[redirect.from.hostname]) {
      allMap[redirect.from.hostname] = true;
      all.push(redirect.from.hostname);
    }
    if (!all[redirect.to.hostname]) {
      allMap[redirect.to.hostname] = true;
      all.push(redirect.to.hostname);
    }

    return all;
  }, []);
  fs.readdirSync(path.join(__dirname, '..', 'vhosts')).forEach(function (node) {
    if (/^\w.*\..*\w$/.test(node)) {
      hostnames.push(node);
    }
  });

  return require('./ip-checker').getExternalAddresses().then(function (result) {
    //console.log(Object.keys(allMap), result);
    //console.log(hostnames)
    //console.log(result.addresses);
    console.log('[IP CHECKER] hostnames.length', hostnames.length);
    console.log('[IP CHECKER] result.addresses.length', result.addresses.length);
    return update(hostnames, result.addresses);
  });
};

if (require.main === module) {
  module.exports.update().then(function (results) {
    console.log('results');
    console.log(results);
  });
}
