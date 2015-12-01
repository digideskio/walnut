'use strict';

var getDomainInfo = require('../lib/utils').getDomainInfo;

function deserialize(results) {
  var config = { apis: {}, apps: {}, domains: {} };
  results.apis.forEach(function (api) {
    config.apis[api.id] = api;
    api.domains = [];
    api.domainIds = [];
    api.domainsMap = {};
  });
  results.apps.forEach(function (app) {
    config.apps[app.id] = app;
    app.domains = [];
    app.domainIds = [];
    app.domainsMap = {};
  });

  results.domains.forEach(function (domain) {
    config.domains[domain.id] = domain;
    // as it currently stands each of these will only have one
    /*
    domain.apis = [];
    domain.apiIds = [];
    domain.apisMap = {};
    domain.apps = [];
    domain.appIds = [];
    domain.appsMap = {};
    */
    domain.api = null;
    domain.apiId = null;
    domain.app = null;
    domain.appId = null;
    domain.appsMap = null;
  });

  results.apisDomains.forEach(function (ad) {
    var api = config.apis[ad.apiId];
    var domain = config.domains[ad.domainId];
    if (api && !api.domainsMap[domain.id]) {
      api.domainIds.push(domain.id);
      api.domainsMap[domain.id] = domain;
      api.domains.push(domain);
    }
    if (domain) {
      if (domain.api) {
        console.error("[SANITY FAIL] single domain has multiple frontends in db: '" + domain.id + "'");
      }
      domain.apiId = api.id;
      domain.api = api;
    }
  });

  results.appsDomains.forEach(function (ad) {
    var app = config.apps[ad.appId];
    var domain = config.domains[ad.domainId];
    if (app && !app.domainsMap[domain.id]) {
      app.domainIds.push(domain.id);
      app.domainsMap[domain.id] = domain;
      app.domains.push(domain);
    }
    if (domain) {
      if (domain.app) {
        console.error("[SANITY FAIL] single domain has multiple frontends in db: '" + domain.id + "'");
      }
      domain.appId = app.id;
      domain.app = app;
    }
  });

  return config;
}

function sortApps(a, b) {
  // hlen isn't important in this current use of the sorter,
  // but is important for an alternate version
  var hlen = b.hostname.length - a.hostname.length;
  var plen = b.pathname.length - a.pathname.length;

  // A directory could be named example.com, example.com# example.com##
  // to indicate order of preference (for API addons, for example)
  var dlen = (b.priority || b.dirname.length) - (a.priority || a.dirname.length);

  if (!hlen) {
    if (!plen) {
      return dlen;
    }
    return plen;
  }
  return hlen;
}

function getVhostsMap(config) {
  var vhosts = [];
  var vhostsMap = {};

  Object.keys(config.domains).forEach(function (domainname) {
    var domain = config.domains[domainname];
    var info = getDomainInfo(domainname);

    domain.hostname = info.hostname;
    domain.pathname = '/' + (info.pathname || '');
    domain.dirname = info.dirname;

    vhosts.push(domain);
  });

  vhosts.sort(sortApps);

  vhosts.forEach(function (domain) {
    if (!vhostsMap[domain.hostname]) {
      vhostsMap[domain.hostname] = { hostname: domain.hostname, id: domain.id, pathnamesMap: {}, pathnames: [] };
    }

    if (!vhostsMap[domain.hostname].pathnamesMap[domain.pathname]) {
      vhostsMap[domain.hostname].pathnamesMap[domain.pathname] = { pathname: domain.pathname, packages: [] };
      vhostsMap[domain.hostname].pathnames.push(vhostsMap[domain.hostname].pathnamesMap[domain.pathname]);
    }

    vhostsMap[domain.hostname].pathnamesMap[domain.pathname].packages.push(domain);
  });

  return vhostsMap;
}

module.exports.deserialize = deserialize;
module.exports.getVhostsMap = getVhostsMap;
module.exports.create = function (db) {
  var wrap = require('masterquest-sqlite3');

  var dir = [
    //
    // Collections
    //
    { tablename: 'apis'
    , idname: 'id'      // com.example
    , unique: ['id']
      // name // LDS Account, Radio
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'revokedAt', 'name']
    }
  , { tablename: 'apps'
    , idname: 'id'      // com.example
    , unique: ['id']
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'revokedAt', 'name']
    }
  , { tablename: 'domains'
    , idname: 'id'      // api.coolaj86.com#radio
    , unique: ['id']
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'revokedAt', 'name', 'token', 'accountId']
    }

    //
    // Joins
    //
  , { tablename: 'apis_domains'
    , idname: 'id'      // hash(api_id + domain_id)
    , unique: ['id']
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'apiId', 'domainId']
      // TODO auto-form relations
    , hasMany: ['apis', 'domains']
    }
  , { tablename: 'apps_domains'
    , idname: 'id'      // hash(domain_id + app_id)
    , unique: ['id']
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'appId', 'domainId']
      // TODO auto-form relations
    , hasMany: ['apps', 'domains']
    }

/*
  , { tablename: 'accounts_apis'
    , idname: 'id'      // hash(account_id + api_id)
    , unique: ['id']
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'accountId', 'apiId']
      // TODO auto-form relations
    , hasMany: ['accounts', 'apis']
    }
  , { tablename: 'accounts_domains'
    , idname: 'id'      // hash(account_id + domain_id)
    , unique: ['id']
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'accountId', 'domainId']
      // TODO auto-form relations
    , hasMany: ['accounts', 'domains']
    }
  , { tablename: 'accounts_apps'
    , idname: 'id'      // hash(account_id + static_id)
    , unique: ['id']
    , indices: ['createdAt', 'updatedAt', 'deletedAt', 'accountId', 'staticId']
      // TODO auto-form relations
    , hasMany: ['accounts', 'apps']
    }
*/
  ];

  return wrap.wrap(db, dir).then(function (models) {
    models.Config = {
      get: function () {
        var PromiseA = require('bluebird');

        return PromiseA.all([
          models.Apis.find(null, { limit: 10000 })
        , models.Apps.find(null, { limit: 10000 })
        , models.Domains.find(null, { limit: 10000 })
        , models.ApisDomains.find(null, { limit: 10000 })
        , models.AppsDomains.find(null, { limit: 10000 })
        ]).then(function (args) {
          var results = {
            apis: args[0]
          , apps: args[1]
          , domains: args[2]
          , apisDomains: args[3]
          , appsDomains: args[4]
          };

          // create fixture with which to test
          // console.log(JSON.stringify(results));

          return getVhostsMap(deserialize(results));
        });
      }
    };

    return models;
  });
};
