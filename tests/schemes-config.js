'use strict';

// var results = {"apis":[{"id":"oauth3-api","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"json":null}],"apps":[{"id":"oauth3-app","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"json":null},{"id":"hellabit-app","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"json":null},{"id":"ldsio-app","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"json":null},{"id":"ldsconnect-app","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"json":null}],"domains":[{"id":"oauth3.org","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"token":null,"accountId":null,"json":null},{"id":"lds.io","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"token":null,"accountId":null,"json":null},{"id":"ldsconnect.org","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"token":null,"accountId":null,"json":null},{"id":"hellabit.com","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"token":null,"accountId":null,"json":null},{"id":"hellabit.com#connect","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"token":null,"accountId":null,"json":null}],"apisDomains":[{"id":"oauth3-api_oauth3.org","createdAt":null,"updatedAt":null,"deletedAt":null,"apiId":"oauth3-api","domainId":"oauth3.org","json":null}],"appsDomains":[{"id":"oauth3-app_oauth3.org","createdAt":null,"updatedAt":null,"deletedAt":null,"appId":"oauth3-app","domainId":"oauth3.org","json":null},{"id":"hellabit-app_hellabit.com","createdAt":null,"updatedAt":null,"deletedAt":null,"appId":"hellabit-app","domainId":"hellabit.com","json":null},{"id":"ldsio-app_lds.io","createdAt":null,"updatedAt":null,"deletedAt":null,"appId":"ldsio-app","domainId":"lds.io","json":null},{"id":"ldsconnect-app_ldsconnect.org","createdAt":null,"updatedAt":null,"deletedAt":null,"appId":"ldsconnect-app","domainId":"ldsconnect.org","json":null}]};
var results = {
  "apis":[
    {"id":"oauth3-api"}
  ]
, "apps":[
    {"id":"oauth3-app"}
  , {"id":"hellabit-app"}
  , {"id":"ldsio-app"}
  , {"id":"ldsconnect-app"}
  ]
, "domains":[
    {"id":"oauth3.org"}
  , {"id":"lds.io"}
  , {"id":"ldsconnect.org"}
  , {"id":"hellabit.com#####"}
  , {"id":"hellabit.com"}
  , {"id":"hellabit.com###"}
  , {"id":"hellabit.com#connect###"}
  , {"id":"hellabit.com#connect"}
  , {"id":"hellabit.com#connect#too"}
  ]
, "apisDomains":[
    {"id":"oauth3-api_oauth3.org","apiId":"oauth3-api","domainId":"oauth3.org"}
  ]
,"appsDomains":[
    {"id":"oauth3-app_oauth3.org","appId":"oauth3-app","domainId":"oauth3.org"}
  , {"id":"hellabit-app_hellabit.com","appId":"hellabit-app","domainId":"hellabit.com"}
  , {"id":"hellabit-app_hellabit.com###","appId":"hellabit-app","domainId":"hellabit.com#connect###"}
  , {"id":"ldsio-app_lds.io","appId":"ldsio-app","domainId":"lds.io"}
  , {"id":"ldsconnect-app_ldsconnect.org","appId":"ldsconnect-app","domainId":"ldsconnect.org"}
  ]
};

var deserialize = require('../lib/schemes-config').deserialize;
var getDomainInfo = require('../lib/utils').getDomainInfo;
var config = deserialize(results);
var req = { host: 'hellabit.com', url: '/connect' };
var vhosts = [];
var vhostsMap = {};

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
  console.log(domain.hostname, domain.pathname, domain.dirname);

  if (!vhostsMap[domain.hostname]) {
    vhostsMap[domain.hostname] = { pathnamesMap: {}, pathnames: [] };
  }

  if (!vhostsMap[domain.hostname].pathnamesMap[domain.pathname]) {
    vhostsMap[domain.hostname].pathnamesMap[domain.pathname] = { pathname: domain.pathname, apps: [] };
    vhostsMap[domain.hostname].pathnames.push(vhostsMap[domain.hostname].pathnamesMap[domain.pathname]);
  }

  vhostsMap[domain.hostname].pathnamesMap[domain.pathname].apps.push(domain);
});

if (!vhostsMap[req.host]) {
  console.log("there's no app for this hostname");
  return;
}

//console.log("load an app", vhosts[req.host]);

//console.log(vhosts[req.host]);


function getApp(route) {
  var PromiseA = require('bluebird');

  return new PromiseA(function (resolve, reject) {
    console.log(route);
    // route.hostname
  });
}

function api(req, res, next) {
  var apps; 

  vhostsMap[req.host].pathnames.some(function (route) {
    // /connect /
    if (req.url.match(route.pathname) && route.pathname.match(req.url)) {
      apps = route.apps;
      return true;
    }
  });

  //console.log(apps);

  function nextify(err) {
    var route;

    if (err) {
      next(err);
      return;
    }
    
    // shortest to longest
    //route = apps.pop();
    // longest to shortest
    route = apps.shift();
    if (!route) {
      next();
      return;
    }

    if (route.route) {
      route.route(req, res, nextify);
      return;
    }

    getApp(route).then(function (route) {
      route.route = route;
      try {
        route.route(req, res, nextify);
      } catch(e) {
        console.error('[App Load Error]');
        console.error(e.stack);
        nextify(new Error("couldn't load app"));
      }
    });
  }

  nextify();
}

api(req);
