'use strict';

//
// IMPORTANT !!!
//
// None of this is authenticated or encrypted
//

module.exports.create = function (app, xconfx, models) {
  var PromiseA = require('bluebird');
  var path = require('path');
  var fs = PromiseA.promisifyAll(require('fs'));
  var dns = PromiseA.promisifyAll(require('dns'));

  function isInitialized() {
    // TODO read from file only, not db
    return models.ComDaplieWalnutConfig.get('config').then(function (conf) {
      if (!conf || !conf.primaryDomain || !conf.primaryEmail) {
        console.log('DEBUG incomplete conf', conf);
        return false;
      }

      xconfx.primaryDomain = xconfx.primaryDomain || conf.primaryDomain;

      var configname = conf.primaryDomain + '.json';
      var configpath = path.join(__dirname, '..', '..', 'config', configname);

      return fs.readFileAsync(configpath, 'utf8').then(function (text) {
        return JSON.parse(text);
      }, function (/*err*/) {
        console.log('DEBUG not exists leconf', configpath);
        return false;
      }).then(function (data) {
        if (!data || !data.email || !data.agreeTos) {
          console.log('DEBUG incomplete leconf', data);
          return false;
        }

        return true;
      });
    });
  }

  function initialize() {
    var express = require('express');
    var getIpAddresses = require('./ip-checker').getExternalAddresses;
    var resolve;

    function errorIfNotApi(req, res, next) {
      // if it's not an ip address
      if (/[a-z]+/.test(req.hostname || req.headers.host)) {
        if (!/^api\./.test(req.hostname || req.headers.host)) {
          console.warn('not API req.headers.host:', req.hostname || req.headers.host);
          res.send({ error: { message: "no api. subdomain prefix" } });
          return;
        }
      }

      next();
    }

    function errorIfApi(req, res, next) {
      if (!/^api\./.test(req.headers.host)) {
        next();
        return;
      }

      // has api. hostname prefix

      // doesn't have /api url prefix
      if (!/^\/api\//.test(req.url)) {
        res.send({ error: { message: "missing /api/ url prefix" } });
        return;
      }

      res.send({ error: { code: 'E_NO_IMPL', message: "not implemented" } });
    }

    function getConfig(req, res) {
      getIpAddresses().then(function (inets) {
        var results = {
          hostname: require('os').hostname()
        , inets: inets.addresses.map(function (a) {
            a.time = undefined;
            return a;
          })
        };
        //res.send({ inets: require('os').networkInterfaces() });
        res.send(results);
      });
    }

    function verifyIps(inets, hostname) {
      var map = {};
      var arr = [];

      inets.forEach(function (addr) {
        if (!map[addr.family]) {
          map[addr.family] = true;
          if (4 === addr.family) {
            arr.push(dns.resolve4Async(hostname).then(function (arr) {
              return arr;
            }, function (/*err*/) {
              return [];
            }));
          }
          if (6 === addr.family) {
            arr.push(dns.resolve6Async(hostname).then(function (arr) {
              return arr;
            }, function (/*err*/) {
              return [];
            }));
          }
        }
      });

      return PromiseA.all(arr).then(function (fams) {
        console.log('DEBUG hostname', hostname);
        var ips = [];

        fams.forEach(function (addrs) {
          console.log('DEBUG ipv46');
          console.log(addrs);
          addrs.forEach(function (addr) {
            inets.forEach(function (a) {
              if (a.address === addr) {
                a.time = undefined;
                ips.push(a);
              }
            });
          });
          console.log('');
        });

        return ips;
      });
    }

    function setConfig(req, res) {
      var config = req.body;
      var results = {};

      return PromiseA.resolve().then(function () {
        if (!config.agreeTos && !config.tls) {
          return PromiseA.reject(new Error("To enable encryption you must agree to the LetsEncrypt terms of service"));
        }

        if (!config.domain) {
          return PromiseA.reject(new Error("You must specify a valid domain name"));
        }
        config.domain = config.domain.replace(/^www\./, '');

        return getIpAddresses().then(function (inet) {
          if (!inet.addresses.length) {
            return PromiseA.reject(new Error("no ip addresses"));
          }

          results.inets = inet.addresses.map(function (a) {
            a.time = undefined;
            return a;
          });

          results.resolutions = [];
          return PromiseA.all([
            // for static content
            verifyIps(inet.addresses, config.domain).then(function (ips) {
              results.resolutions.push({ hostname: config.domain, ips: ips });
            })
            // for redirects
          , verifyIps(inet.addresses, 'www.' + config.domain).then(function (ips) {
              results.resolutions.push({ hostname: 'www.' + config.domain, ips: ips });
            })
            // for api
          , verifyIps(inet.addresses, 'api.' + config.domain).then(function (ips) {
              results.resolutions.push({ hostname: 'api.' + config.domain, ips: ips });
            })
            // for protected assets
          , verifyIps(inet.addresses, 'assets.' + config.domain).then(function (ips) {
              results.resolutions.push({ hostname: 'assets.' + config.domain, ips: ips });
            })
            // for the cloud management
          , verifyIps(inet.addresses, 'cloud.' + config.domain).then(function (ips) {
              results.resolutions.push({ hostname: 'cloud.' + config.domain, ips: ips });
            })
          , verifyIps(inet.addresses, 'api.cloud.' + config.domain).then(function (ips) {
              results.resolutions.push({ hostname: 'api.cloud.' + config.domain, ips: ips });
            })
          ]).then(function () {
            if (!results.resolutions[0].ips.length) {
              results.error = { message: "bare domain could not be resolved to this device" };
            }
            else if (!results.resolutions[2].ips.length) {
              results.error = { message: "api subdomain could not be resolved to this device" };
            }
            /*
            else if (!results.resolutions[1].ips.length) {
              results.error = { message: "" }
            }
            else if (!results.resolutions[3].ips.length) {
              results.error = { message: "" }
            }
            else if (!results.resolutions[4].ips.length || !results.resolutions[4].ips.length) {
              results.error = { message: "cloud and api.cloud subdomains should be set up" };
            }
            */
          });
        });
      }).then(function () {
        if (results.error) {
          return;
        }

        var configname = config.domain + '.json';
        var configpath = path.join(__dirname, '..', '..', 'config', configname);
        var leAuth = {
          agreeTos: true
        , email: config.email // TODO check email
        , domain: config.domain
        , createdAt: Date.now()
        };

        return dns.resolveMxAsync(config.email.replace(/.*@/, '')).then(function (/*addrs*/) {
          // TODO allow private key to be uploaded
          return fs.writeFileAsync(configpath, JSON.stringify(leAuth, null, '  '), 'utf8').then(function () {
            return models.ComDaplieWalnutConfig.upsert('config', {
              letsencrypt: leAuth
            , primaryDomain: config.domain
            , primaryEmail: config.email
            });
          });
        }, function () {
          return PromiseA.reject(new Error("invalid email address (MX record lookup failed)"));
        });
      }).then(function () {
        if (!results.error && results.inets && resolve) {
          resolve();
          resolve = null;
        }
        res.send(results);
      }, function (err) {
        console.error('Error lib/bootstrap.js');
        console.error(err.stack || err);
        res.send({ error: { message: err.message || err.toString() } });
      });
    }

    var CORS = require('connect-cors');
    var cors = CORS({ credentials: true, headers: [
      'X-Requested-With'
    , 'X-HTTP-Method-Override'
    , 'Content-Type'
    , 'Accept'
    , 'Authorization'
    ], methods: [ "GET", "POST", "PATCH", "PUT", "DELETE" ] });

    app.use('/', function (req, res, next) {
      return isInitialized().then(function (initialized) {
        if (!initialized) {
          next();
          return;
        }

        resolve(true);

        // force page refresh
        // TODO goto top of routes?
        res.statusCode = 302;
        res.setHeader('Location', req.url);
        res.end();
      });
    });
    app.use('/api', errorIfNotApi);
    // NOTE Allows CORS access to API with ?access_token=
    // TODO Access-Control-Max-Age: 600
    // TODO How can we help apps handle this? token?
    // TODO allow apps to configure trustedDomains, auth, etc
    app.use('/api', cors);
    app.get('/api/com.daplie.walnut.init', getConfig);
    app.post('/api/com.daplie.walnut.init', setConfig);
    app.use('/', errorIfApi);
    app.use('/', express.static(path.join(__dirname, '..', '..', 'packages', 'pages', 'com.daplie.walnut.init')));

    return new PromiseA(function (_resolve) {
      resolve = _resolve;
    });
  }

  return isInitialized().then(function (initialized) {
    if (initialized) {
      return true;
    }

    return initialize();
  }, function (err) {
    console.error('FATAL ERROR:');
    console.error(err.stack || err);
    app.use('/', function (req, res) {
      res.send({
        error: {
          message: "Unrecoverable Error Requires manual server update: " + (err.message || err.toString())
        }
      });
    });
  });
};
