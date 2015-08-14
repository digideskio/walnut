#!/usr/bin/env node
'use strict';

var PromiseA = require('bluebird').Promise;
var https = require('https');
var fs = require('fs');
var path = require('path');

module.exports.update = function (opts) {
  return new PromiseA(function (resolve, reject) {
    var options;
    var hostname = opts.updater || 'redirect-www.org';
    var port = opts.port || 65443;

    options = {
      host: hostname
    , port: port
    , method: 'POST'
    , headers: {
        'Content-Type': 'application/json'
      }
    , path: '/api/ddns'
    , auth: opts.auth || 'admin:secret'
    , ca: [ fs.readFileSync(path.join(__dirname, '..', 'certs', 'ca', 'my-root-ca.crt.pem')) ]
    };

    if (opts.jwt) {
      options.headers['Authorization'] = 'Bearer ' + opts.jwt;
    }

    options.agent = new https.Agent(options);

    https.request(options, function(res) {
      var textData = '';

      res.on('error', function (err) {
        reject(err);
      });
      res.on('data', function (chunk) {
        textData += chunk.toString();
        // console.log(chunk.toString());
      });
      res.on('end', function () {
        resolve(textData);
      });
    }).end(JSON.stringify(opts.ddns, null, '  '));
  });
};
