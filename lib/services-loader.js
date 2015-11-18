'use strict';

module.exports.create = function (conf, deps) {
  var PromiseA = deps.Promise;

  function loadService(node) {
    var path = require('path');

    return new PromiseA(function (resolve) {
      // process.nextTick runs at the end of the current event loop
      // we actually want time to pass so that potential api traffic can be handled
      setTimeout(function () {
        var servicepath = path.join(conf.servicespath, node);
        var pkg;

        try {
          // TODO no package should be named package.json
          pkg = require(servicepath + '/package.json');
          resolve({
            pkg: pkg
          , name: node
          , service: require(servicepath)
          });
          return;
        } catch(e) {
          // TODO report errors to admin console
          // TODO take sha256sum of e.stack and store in db with tick for updatedAt
          console.error("[Service] could not require service '" + servicepath + "'");
          console.error(e.stack);
          //services.push({ error: e });
          resolve(null);
          return;
        }
      }, 1);
    });
  }

  function loadServices() {
    var fs = PromiseA.promisifyAll(require('fs'));

    // deps : { memstore, sqlstores, clientSqlFactory, systemSqlFactory }
    
    // XXX this is a no-no (file system access in a worker, cannot be statically analyzed)
    // TODO regenerate a static file of all requires on each install
    // TODO read system config db to find which services auto-start
    // TODO allow certain apis access to certain services
    return fs.readdirAsync(conf.servicespath).then(function (nodes) {
      var promise = PromiseA.resolve();
      var services = [];
      
      nodes.forEach(function (node) {
        promise = promise.then(function () {
          return loadService(node).then(function (srv) {
            if (!srv) {
              return;
            }
            services.push(srv);
          });
        });
      });

      return promise.then(function () {
        return services;
      });
    });
  }

  function startService(srv) {
    return new PromiseA(function (resolve) {
      // process.nextTick runs at the end of the current event loop
      // we actually want time to pass so that potential api traffic can be handled
      setTimeout(function () {
        try {
          PromiseA.resolve(srv.service.create(conf, deps)).then(resolve, function (e) {
            console.error("[Service] couldn't promise service");
            console.error(e.stack);
            resolve(null);
          });
          return;
        } catch(e) {
          console.error("[Service] couldn't start service");
          console.error(e.stack);
          resolve(null);
          return;
        }
      }, 1);
    });
  }

  function startServices(services) {
    var promise = PromiseA.resolve();
    var servicesMap = {};
    
    services.forEach(function (srv) {
      promise = promise.then(function () {
        return startService(srv).then(function (service) {
          if (!service) {
            // TODO log
            return null;
          }
          srv.service = service;
          servicesMap[srv.name] = srv;
        }); 
      });
    });

    return promise.then(function () {
      return servicesMap;
    });
  }

  return loadServices().then(startServices);
};
