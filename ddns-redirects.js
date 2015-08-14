#!/usr/bin/env node
'use strict';

// TODO have a quick timeout
require('ipify')(function (err, ip) {
  console.log('ip', ip);

  var path = require('path');
  // dig -p 53 @redirect-www.org pi.nadal.daplie.com A
  var updateIp = require('./holepunch/helpers/update-ip.js').update;

  var redirects = require('./redirects');
  var ddns = [];
  var ddnsMap = {};

  function add(hostname) {
    ddns.push({
      "name": hostname
    , "answer": ip
    });
  }

  redirects.forEach(function (r) {
    if (!ddnsMap[r.from.hostname.toLowerCase()]) {
      add(r.from.hostname);
    }
    if (!ddnsMap[r.to.hostname.toLowerCase()]) {
      add(r.to.hostname);
    }
  });

  return updateIp({
    updater: 'ns1.redirect-www.org'
  , port: 65443
  , cacert: path.join(__dirname, 'certs/ca/ns1-test.root.crt.pem')
  , ddns: ddns
  , token: require('./dyndns-token').token
  }).then(function (data) {
    if ('string' === typeof data) {
      try {
        data = JSON.parse(data);
      } catch(e) {
        console.error('[ERROR] bad json response');
        console.error(data);
      }
    }

    console.log(JSON.stringify(data, null, '  '));
    console.log('Test with');
    console.log('dig <<hostname>> A');
  });
});
