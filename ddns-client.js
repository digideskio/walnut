#!/usr/bin/env node
'use strict';

// dig -p 53 @redirect-www.org pi.nadal.daplie.com A
var updateIp = require('./holepunch/helpers/update-ip.js').update;
var cli = require('cli');

cli.parse({
  service: [ 's', 'The service to use for updates i.e. redirect-www.org', 'string', 'redirect-www.org' ]
, hostname: [ 'h', 'The hostname you wish to update i.e. example.com', 'string' ]
, type: [ 't', 'The record type i.e. A, MX, CNAME, etc', 'string', 'A' ]
, priority: [ 'p', 'The priority (for MX and other records)', 'string' ]
, port: [ false, 'The port (default https/443)', 'number', 443 ]
, insecure: [ false, '(deprecated) allow insecure non-https connections', 'boolean' ]
, cacert: [ false, '(not implemented) specify a CA for "self-signed" https certificates', 'string' ]
, answer: [ 'a', 'The answer', 'string' ]
});

cli.main(function (args, options) {
  //console.log(options);
  options.hostname = options.hostname || args[0]
  options.answer = options.answer || args[1]

  if (options.insecure) {
    console.error('--insecure is not supported. You must use secure connections.');
    return;
  }

  if (!options.hostname) {
    console.error('Usage: ddns-client HOSTNAME ANSWER -t A -s updater.mydns.com');
    console.error('Example: ddns-client example.com');
    console.error('Note: if you omit ANSWER, it is assumed that the dyndns service will use the request ip');
    return;
  }

  //console.log('args');
  //console.log(args);
  //console.log(options);

  return updateIp({
    updater: options.service
  , port: options.port
  , cacert: options.cacert
  , ddns: [
      { "name": options.hostname
      , "value": options.answer
      , "type": options.type
      , "priority": options.priority
      }
    ]
  }).then(function (data) {
    if ('string') {
      data = JSON.parse(data);
    }

    console.log(JSON.stringify(data, null, '  '));
    console.log('Test with');
    console.log('dig ' + options.hostname + ' ' + options.type);
  })
});
