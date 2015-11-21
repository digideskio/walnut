'use strict';

module.exports.scrubTheDub = function (req, res, redirectives) {
  // hack for bricked app-cache
  // Also 301 redirects will not work for appcache (must issue html)
  if (require('./unbrick-appcache').unbrick(req, res)) {
    return true;
  }

  // TODO port number for non-443
  var escapeHtml = require('escape-html');
  var newLocation;
  var safeLocation;

  if (redirectives) {
    newLocation = require('./hostname-redirects').redirectTo(req.hostname, redirectives);
    if (!newLocation) {
      return false;
    }
  } else {
    newLocation = 'https://' + req.hostname.replace(/^www\./, '') + req.url;
  }
  safeLocation = escapeHtml(newLocation);

  var metaRedirect = ''
    + '<html>\n'
    + '<head>\n'
    + '  <style>* { background-color: white; color: white; text-decoration: none; }</style>\n'
    + '  <META http-equiv="refresh" content="0;URL=' + safeLocation + '">\n'
    + '</head>\n'
    + '<body style="display: none;">\n'
    + '  <p>You requested an old resource. Please use this instead: \n'
    + '    <a href="' + safeLocation + '">' + safeLocation + '</a></p>\n'
    + '</body>\n'
    + '</html>\n'
    ;

  res.end(metaRedirect);

  return true;
};
