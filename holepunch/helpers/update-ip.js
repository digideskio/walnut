#!/usr/bin/env node
'use strict';

var PromiseA = require('bluebird').Promise;
var https = require('https');
var fs = PromiseA.promisifyAll(require('fs'));

module.exports.update = function (opts) {
  return new PromiseA(function (resolve, reject) {
    var options;
    var hostname = opts.hostname || opts.updater;
    var port = opts.port;
    var pathname = opts.pathname;
    var req;

    if (!hostname) {
      throw new Error('Please specify a DDNS host as opts.hostname');
    }
    if (!pathname) {
      throw new Error('Please specify the api route as opts.pathname');
    }

    options = {
      host: hostname
    , port: port
    , method: 'POST'
    , headers: {
        'Content-Type': 'application/json'
      }
    , path: pathname
    //, auth: opts.auth || 'admin:secret'
    };

    if (opts.cacert) {
      if (!Array.isArray(opts.cacert)) {
        opts.cacert = [opts.cacert];
      }
      options.ca = opts.cacert;
    }

    options.ca = (options.ca||[]).map(function (str) {
      if ('string' === typeof str && str.length < 1000) {
        str = fs.readFileAsync(str);
      }
      return str;
    });

    if (opts.token || opts.jwt) {
      options.headers.Authorization = 'Bearer ' + (opts.token || opts.jwt);
    }

    if (false === opts.cacert) {
      options.rejectUnauthorized = false;
    }

    return PromiseA.all(options.ca).then(function (cas) {
      options.ca = cas;
      options.agent = new https.Agent(options);

      req = https.request(options, function(res) {
        var textData = '';

        res.on('error', function (err) {
          reject(err);
        });
        res.on('data', function (chunk) {
          textData += chunk.toString();
          // console.log(chunk.toString());
        });
        res.on('end', function () {
          var err;
          try {
            resolve(JSON.parse(textData));
          } catch(e) {
            err = new Error("Unparsable Server Response");
            err.code = 'E_INVALID_SERVER_RESPONSE';
            err.data = textData;
            reject(err);
          }
        });
      });

      req.on('error', function (err) {
        reject(err);
      });

      req.end(JSON.stringify(opts.ddns, null, '  '));
    }, reject);
  });
};
