#!/usr/bin/env node
'use strict';

require('../walnut.js');
/*
var c = require('console-plus');
console.log = c.log;
console.error = c.error;
*/

function eagerLoad() {
  var PromiseA = require('bluebird').Promise;
  var promise = PromiseA.resolve();

  [ 'express'
  , 'request'
  , 'sqlite3'
  , 'body-parser'
  , 'urlrouter'
  , 'express-lazy'
  , 'connect-send-error'
  , 'underscore.string'
  , 'secret-utils'
  , 'connect-cors'
  , 'uuid'
  , 'connect-recase'
  , 'escape-string-regexp'
  , 'connect-query'
  , 'recase'
  ].forEach(function (name/*, i*/) {
    promise = promise.then(function () {
      return new PromiseA(function (resolve/*, reject*/) {
        setTimeout(function () {
          require(name);
          resolve();
        }, 4);
      });
    });
  });

  [ function () {
      require('body-parser').json();
    }
    /*
    // do not use urlencoded as it enables csrf
  , function () {
      require('body-parser').urlencoded();
    }
    */
  ].forEach(function (fn) {
    promise = promise.then(function (thing) {
      return new PromiseA(function (resolve) {
        setTimeout(function () {
         resolve(fn(thing));
        }, 4);
      });
    });
  });

  promise.then(function () {
    console.log('Eager Loading Complete');
  });
}

// this isn't relevant to do in the master process, duh
if (false) {
  setTimeout(eagerLoad, 100);
}
