'use strict';

var cluster = require('cluster');

var crypto;
var stacks = {};
Math.random = function () {
  var err = new Error("Math.random() was used");

  if (!stacks[err.stack.toString()]) {
    stacks[err.stack.toString()] = true;
    console.warn(err.stack);
  }

  if (!crypto) {
    crypto = require('crypto');
  }

  return parseFloat(('0.' + (parseInt(crypto.randomBytes(8).toString('hex'), 16))).replace(/(^0)|(0$)/g, ''));
};

if (cluster.isMaster) {
  require('./boot/master');
} else {
  /*
  alternately we could use this and then check require.main
  cluster.setupMaster({ exec : "app.js", });
  */
  require('./boot/worker').create(null);
}
