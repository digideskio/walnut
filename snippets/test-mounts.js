// characters that generally can't be used in a url: # %
// more: @ ! $ &
// Have special meaning to some FSes: : \ /
function methodA(apps) {
  apps.map(function (apppath) {
    var parts = apppath.split(/[#%]+/);
    var hostname = parts.shift();
    var pathname = parts.join('/');
    return [hostname, pathname];
  }).sort(function (a, b) {
    var hlen = b[0].length - a[0].length;
    var plen = plen = b[1].length - a[1].length;
    if (!plen) {
      return hlen;
    }
    return plen;
  }).forEach(function (pair, i) {
    // should print ordered by longest path, longest domain
    console.log('app.use("/' + pair[1] + '", vhost("' + pair[0] + '"), app' + i + ')');
  });
  console.log('\n');
}

function methodB(apps) {
  var mergeMap = {};
  var merged = [];

  apps.map(function (apppath) {
    var parts = apppath.split(/[#%]+/);
    var hostname = parts.shift();
    var pathname = parts.join('/');

    return [hostname, pathname];
  }).sort(function (a, b) {
    var hlen = b[0].length - a[0].length;
    var plen = plen = b[1].length - a[1].length;
    if (!hlen) {
      return plen;
    }
    return plen;
  }).forEach(function (pair, i) {
    var apps;
    var hostname = pair[0];
    var pathname = pair[1];

    // should order and group by longest domain, then longest path
    if (!mergeMap[hostname]) {
      mergeMap[hostname] = { hostname: hostname, apps: 'express()' };
      merged.push(mergeMap[hostname]);
    }

    mergeMap[hostname].apps += '.use("/' + pathname + '", app' + i + ')';
  });

  console.log('\n');
  merged.forEach(function (vhost) {
    console.log("app.use(vhost('" + vhost.hostname + "', " + vhost.apps + ")");
  });
}

var apps;
apps = [
  'coolaj86.com'
, 'coolaj86.com#demos#tel-carrier'
, 'blog.coolaj86.com#demos#tel-carrier'
, 'blog.coolaj86.com%social'
, 'blog.coolaj86.com'
];

methodA(apps);
methodB(apps);
