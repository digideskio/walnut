'use strict';

var PromiseA = require('bluebird').Promise
  , updateIp = require('./helpers/update-ip.js').update
  , request = PromiseA.promisifyAll(require('request'))
  , requestAsync = PromiseA.promisify(require('request'))
  , upnpForward = require('./helpers/upnp-forward').upnpForward
  , pmpForward = require('./helpers/pmp-forward').pmpForward
  , loopbackHttps = require('./loopback-https')
  //, checkip = require('check-ip-address')
  ;

function openPort(ip, port) {
  if (!/tcp|https|http/.test(port.protocol || 'tcp')) {
    throw new Error('not yet supported \'' + port.protocol + '\'');
  }

  if (false === port.testable) {
    return PromiseA.resolve();
  }

  return loopbackHttps.create(ip, port.private, port.public).then(function () {
    console.log('success');
  }).catch(function (err) {
    // TODO test err
    return upnpForward(port).catch(function (err) {
      console.error('[ERROR] UPnP Port Forward');
      console.error(err);
      // TODO test err
      return pmpForward(port);
    }).then(function () {
      return loopbackHttps.create(ip, port.private, port.public);
    });
  });
}

// 1. update dyndns
// 1.5. check ip every 5 min
// 2. loopback test on ip for http / https / ssh
// 3. if needed: discover gateway, map ports
function beacon(hostnames, ports) {
  // test with
  // dig -p 53 @redirect-www.org pi.nadal.daplie.com A
  return updateIp({
    updater: 'redirect-www.org'
  , port: 65443
  , ddns: hostnames.map(function (hostname) {
      return { "name": hostname /*, "value": ipaddress, "type": "A"*/ };
    })
  }).then(function (data) {
    var promises = [];

    console.log("Updated DynDNS");
    console.log(data);
    
    ports.forEach(function (port) {
      promises.push(openPort(JSON.parse(data)[0].answers[0] || hostname, port));
    });

    return PromiseA.all(promises);
  }).then(function () {
    console.log('opened ports');
  });

/*
  request.getAsync('http://checkip.hellabit.com').spread(function (resp, data) {
    console.log("External IP is", data);
  }).then(function () {
    return upnpForward().catch(function (err) {
      console.error('ERROR: UPnP failure:');
      console.error(err);
    });
  }).then(function () {
    return pmpForward().catch(function (err) {
      console.error('TODO: Notify user that their router is not compatible');
    });
  });

  // TODO test roundtrip
*/
}

//setInterval(beacon, 5 * 60 * 1000);
exports.run = beacon;
