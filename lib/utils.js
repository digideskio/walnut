'use strict';

module.exports.getDomainInfo = function (apppath) {
  var parts = apppath.split(/[#%]+/);
  var hostname = parts.shift();
  var pathname = parts.join('/').replace(/\/+/g, '/').replace(/^\//, '');

  return {
    hostname: hostname
  , pathname: pathname
  , dirpathname: parts.join('#')
  , dirname: apppath
  , isRoot: apppath === hostname
  };
};
