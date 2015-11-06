'use strict';

module.exports.create = function () {
  var PromiseA = require('bluebird');
  var express = require('connect');

  var app = express();
  var promise;

  promise = new PromiseA(function (resolve) {
    var path = require('path');
    var serveStatic;
    var serveInitStatic;
    var jsonParser;
    //var rootMasterKey;

    app.use(function (req, res, next) {
      res.setHeader('Connection', 'close');
      next();
    });

    app.use('/api/unlock-device', function (req, res, next) {
      console.log('[unlock-device]');
      if (!jsonParser) {
        jsonParser = require('body-parser').json({
          strict: true // only objects and arrays
        , inflate: true
        , limit: 100 * 1024
        , reviver: undefined
        , type: 'json'
        , verify: undefined
        });
      }

      jsonParser(req, res, function (err) {
        if (err) {
          console.log('[unlock-device] err', err, err.stack);
          next(err);
          return;
        }

        console.log('[unlock-device] with root');
        resolve("ROOT MASTER KEY");
        //setRootMasterKey();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Location', '/');
        res.statusCode = 302;
        res.end(JSON.stringify({ success: true }));
      });
    });

    app.use('/api', function (req, res) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.statusCode = 200;
      res.end(JSON.stringify({
        error: {
          message: "This device is locked. It must be unlocked with its encryption key at /unlock-device"
        , code: 'E_DEVICE_LOCKED'
        , uri: '/unlock-device' }
        }
      ));
    });

    // TODO break application cache?
    // TODO serve public sites?
    app.use('/', function (req, res, next) {
      if (!serveInitStatic) {
        serveStatic = require('serve-static');
        serveInitStatic = serveStatic(path.join(__dirname, '..', 'init.public'));
      }

      serveInitStatic(req, res, next);
    });
  });

  return PromiseA.resolve({
    app: app
  , promise: promise
  });
};
