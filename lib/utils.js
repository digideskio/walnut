'use strict';

module.exports.getDomainInfo = function (instancename) {
  var parts = instancename.split(/[#%]+/);
  var hostname = parts.shift();
  var pathname = parts.join('/').replace(/\/+/g, '/').replace(/\/$/g, '').replace(/^\//g, '');

  return {
    hostname: hostname
  , pathname: pathname
  , dirpathname: parts.join('#')
  , dirname: instancename
  , isRoot: instancename === hostname
  };
};
