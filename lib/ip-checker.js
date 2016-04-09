"use strict";

var PromiseA = require('bluebird').Promise;
var ifaces = require('os').networkInterfaces();
var dns = PromiseA.promisifyAll(require('dns'));
var https = require('https');

function getExternalAddresses() {
  var iftypes = {};
  var ipv4check = 'api.ipify.org';
  var ipv6check = 'myexternalip.com';

  Object.keys(ifaces).forEach(function (ifname) {
    ifaces[ifname].forEach(function (iface) {
      // local addresses
      if (iface.internal) {
        return;
      }
      // auto address space
      if (/^(fe80:|169\.)/.test(iface.address)) {
        return;
      }
      /*
      if (/^(fe80:|10\.|192\.168|172\.1[6-9]|172\.2[0-9]|172\.3[0-1])/.test(iface.address)) {
        return;
      }
      */

      iftypes[iface.family] = true;
    });
  });

  console.log(iftypes);

  var now = Date.now();

  return PromiseA.all([
    dns.lookupAsync(ipv4check, { family: 4/*, all: true*/ }).then(function (ans) {
      iftypes.IPv4 = { address: ans[0], family: ans[1], time: Date.now() - now };
    }).error(function () {
      //console.log('no ipv4', Date.now() - now);
      iftypes.IPv4 = false;
    })
    // curl -6 https://myexternalip.com/raw
  , dns.lookupAsync(ipv6check, { family: 6/*, all: true*/ }).then(function (ans) {
      iftypes.IPv6 = { address: ans[0], family: ans[1], time: Date.now() - now };
    }).error(function (err) {
      console.error('Error ip-checker.js');
      console.error(err.stack || err);
      //console.log('no ipv6', Date.now() - now);
      iftypes.IPv6 = false;
    })
  ]).then(function () {
    var requests = [];

    if (iftypes.IPv4) {
      requests.push(new PromiseA(function (resolve)  {
        var req = https.request({
          method: 'GET'
        , hostname: iftypes.IPv4.address
        , port: 443
        , headers: {
            Host: ipv4check
          }
        , path: '/'
        //, family: 4
        // TODO , localAddress: <<external_ipv4>>
        }, function (res) {
          var result = '';

          res.on('error', function (/*err*/) {
            resolve(null);
          });

          res.on('data', function (chunk) {
            result += chunk.toString('utf8');
          });

          res.on('end', function () {
            resolve({ address: result, family: 4/*, wan: result === iftypes.IPv4.localAddress*/, time: iftypes.IPv4.time });
          });
        });

        req.on('error', function () {
          resolve(null);
        });
        req.end();
      }));
    }

    if (iftypes.IPv6) {
      requests.push(new PromiseA(function (resolve)  {
        var req = https.request({
          method: 'GET'
        , hostname: iftypes.IPv6.address
        , port: 443
        , headers: {
            Host: ipv6check
          }
        , path: '/raw'
        //, family: 6
        // TODO , localAddress: <<external_ipv6>>
        }, function (res) {
          var result = '';

          res.on('error', function (/*err*/) {
            resolve(null);
          });

          res.on('data', function (chunk) {
            result += chunk.toString('utf8').trim();
          });
          res.on('end', function () {
            resolve({ address: result, family: 6/*, wan: result === iftypes.IPv6.localAaddress*/, time: iftypes.IPv4.time });
          });
        });

        req.on('error', function () {
          resolve(null);
        });
        req.end();
      }));
    }

    return PromiseA.all(requests).then(function (ips) {
      ips = ips.filter(function (ip) {
        return ip;
      });

      return {
        addresses: ips
      , time: Date.now() - now
      };
    });
  });
}

exports.getExternalAddresses = getExternalAddresses;
