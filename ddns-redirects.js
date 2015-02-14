#!/usr/bin/env node
'use strict';

// dig -p 53 @redirect-www.org pi.nadal.daplie.com A
var updateIp = require('./holepunch/helpers/update-ip.js').update;

var redirects = require('./redirects');
var ddns = [];
var ddnsMap = {};

function add(hostname) {
  ddns.push({
    "name": hostname
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
  updater: 'redirect-www.org'
, port: 65443
, cacert: null
, ddns: ddns
}).then(function (data) {
  if ('string') {
    data = JSON.parse(data);
  }

  console.log(JSON.stringify(data, null, '  '));
  console.log('Test with');
  console.log('dig <<hostname>> A');
});
