"use strict";

var PromiseA = require('bluebird').Promise;
var ifaces = require('os').networkInterfaces();
var dns = PromiseA.promisifyAll(require('dns'));
var https = require('https');

function getExternalAddresses() {
  var iftypes = {};

  Object.keys(ifaces).forEach(function (ifname) {
    ifaces[ifname].forEach(function (iface) {
      if (iface.internal) {
        return;
      }
      /*
      if (/^(::|f[cde])/.test(iface.address)) {
        console.log('non-public ipv6');
        return;
      }
      */

      iftypes[iface.family] = true;
    });
  });

  var now = Date.now();

  return PromiseA.all([
    dns.lookupAsync('api.ipify.org', { family: 4/*, all: true*/ }).then(function (ans) {
      iftypes.IPv4 = { address: ans[0], family: ans[1], time: Date.now() - now };
    }).error(function () {
      //console.log('no ipv4', Date.now() - now);
      iftypes.IPv4 = false;
    })
  , dns.lookupAsync('api.ipify.org', { family: 6/*, all: true*/ }).then(function (ans) {
      iftypes.IPv6 = { address: ans[0], family: ans[1], time: Date.now() - now };
    }).error(function () {
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
            Host: 'api.ipify.org'
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
            Host: 'api.ipify.org'
          }
        , path: '/'
        //, family: 6
        // TODO , localAddress: <<external_ipv6>>
        }, function (res) {
          var result = '';

          res.on('error', function (/*err*/) {
            resolve(null);
          });

          res.on('data', function (chunk) {
            result += chunk.toString('utf8');
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
