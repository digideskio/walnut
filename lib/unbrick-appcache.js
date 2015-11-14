module.exports.unbrick = function (req, res) {
  // hack for bricked app-cache
  if (/\.(appcache|manifest)\b/.test(req.url)) {
    res.setHeader('Content-Type', 'text/cache-manifest');
    res.end('CACHE MANIFEST\n\n# v0__DELETE__CACHE__MANIFEST__\n\nNETWORK:\n*');
    return true;
  }

  return false;
};
