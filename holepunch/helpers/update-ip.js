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
    //, auth: opts.auth || 'admin:secret'
    };

    if (opts.cacert) {
      if (!Array.isArray(opts.cacert)) {
        opts.cacert = [opts.cacert];
      }
      options.ca = opts.cacert;
    } else {
      options.ca = [path.join(__dirname, '..', 'certs', 'ca', 'my-root-ca.crt.pem')]
    }

    options.ca = options.ca.map(function (str) {
      if ('string' === typeof str && str.length < 1000) {
        str = fs.readFileSync(str);
      }
      return str;
    });

    if (opts.token || opts.jwt) {
      options.headers['Authorization'] = 'Bearer ' + (opts.token || opts.jwt);
    }

    if (false === opts.cacert) {
      options.rejectUnauthorized = false;
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
