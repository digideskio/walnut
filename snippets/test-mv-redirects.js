var redirects = require('./redirects.json');

redirects.forEach(function (r) {
  var frompath = "'" + r.from.hostname + r.from.path + "'";
  var topath = "'" + r.to.hostname + r.to.path.replace(/\//g, '#') + "'";

  if (frompath !== topath) {
    console.log("mv", frompath, " ", topath);
  }
});
