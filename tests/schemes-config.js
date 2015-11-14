'use strict';

var deserialize = require('../lib/schemes-config').deserialize;
var getVhostsMap = require('../lib/schemes-config').getVhostsMap;
var getDomainInfo = require('../lib/utils').getDomainInfo;

// var results = {"apis":[{"id":"oauth3-api","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"json":null}],"apps":[{"id":"oauth3-app","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"json":null},{"id":"hellabit-app","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"json":null},{"id":"ldsio-app","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"json":null},{"id":"ldsconnect-app","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"json":null}],"domains":[{"id":"oauth3.org","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"token":null,"accountId":null,"json":null},{"id":"lds.io","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"token":null,"accountId":null,"json":null},{"id":"ldsconnect.org","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"token":null,"accountId":null,"json":null},{"id":"hellabit.com","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"token":null,"accountId":null,"json":null},{"id":"hellabit.com#connect","createdAt":null,"updatedAt":null,"deletedAt":null,"revokedAt":null,"name":null,"token":null,"accountId":null,"json":null}],"apisDomains":[{"id":"oauth3-api_oauth3.org","createdAt":null,"updatedAt":null,"deletedAt":null,"apiId":"oauth3-api","domainId":"oauth3.org","json":null}],"appsDomains":[{"id":"oauth3-app_oauth3.org","createdAt":null,"updatedAt":null,"deletedAt":null,"appId":"oauth3-app","domainId":"oauth3.org","json":null},{"id":"hellabit-app_hellabit.com","createdAt":null,"updatedAt":null,"deletedAt":null,"appId":"hellabit-app","domainId":"hellabit.com","json":null},{"id":"ldsio-app_lds.io","createdAt":null,"updatedAt":null,"deletedAt":null,"appId":"ldsio-app","domainId":"lds.io","json":null},{"id":"ldsconnect-app_ldsconnect.org","createdAt":null,"updatedAt":null,"deletedAt":null,"appId":"ldsconnect-app","domainId":"ldsconnect.org","json":null}]};
var results = {
  "apis":[
    {"id":"org.oauth3"}
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
    {"id":"org.oauth3_oauth3.org","apiId":"org.oauth3","domainId":"oauth3.org"}
  , {"id":"org.oauth3_hellabit.com#connect###","apiId":"org.oauth3","domainId":"hellabit.com#connect###"}
  ]
,"appsDomains":[
    {"id":"oauth3-app_oauth3.org","appId":"oauth3-app","domainId":"oauth3.org"}
  , {"id":"hellabit-app_hellabit.com","appId":"hellabit-app","domainId":"hellabit.com"}
  , {"id":"hellabit-app_hellabit.com###","appId":"hellabit-app","domainId":"hellabit.com#connect###"}
  , {"id":"ldsio-app_lds.io","appId":"ldsio-app","domainId":"lds.io"}
  , {"id":"ldsconnect-app_ldsconnect.org","appId":"ldsconnect-app","domainId":"ldsconnect.org"}
  ]
};

var req = { host: 'hellabit.com', url: '/connect' };
module.exports.create({
  apppath: '../packages/apps/'
, apipath: '../packages/apis/'
, vhostsMap: vhostsMap
}).api(req);
