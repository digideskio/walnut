'use strict';

var updateIp = require('ddns-cli').update;

/*
 * @param {string[]} hostnames - A list of hostnames
 * @param {Object[]} addresses - A list of { address: <ip-address>, family: <4|6> }
 */
function update(services, hostnames, addresses, ddnsToken) {
  // TODO use not-yet-built API to get and store tokens
  // TODO use API to add and remove nameservers
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
        // token = require('../dyndns-token.js').token;
      , "token": ddnsToken
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
    , token: ddnsToken
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

module.exports.update = function (services, hostnames, ddnsToken) {
  return require('./ip-checker').getExternalAddresses().then(function (result) {
    //console.log(Object.keys(allMap), result);
    //console.log(hostnames)
    //console.log(result.addresses);
    console.log('[IP CHECKER] hostnames.length', hostnames.length);
    console.log('[IP CHECKER] result.addresses.length', result.addresses.length);
    return update(services, hostnames, result.addresses, ddnsToken);
  });
};

if (require.main === module) {
  module.exports.update().then(function (results) {
    console.log('results');
    console.log(results);
  });
}
