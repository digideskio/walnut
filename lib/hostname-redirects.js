'use strict';

// TODO detect infinite redirects

module.exports.compile = module.exports.sortOpts = function (redirects) {
  var dups = {};
  var results = {
    conflicts: {}
  , patterns: []
  , matchesMap: {}
  };

  redirects.forEach(function (r) {
    var bare;
    var www;

    if ('.' === r.id[0]) {
      // for consistency
      // TODO this should happen at the database level
      r.id = '*' + r.id;
    }
    if ('*' === r.id[0]) {
      // TODO check that we are not trying to redirect a tld (.com, .co.uk, .org, etc)
      // tlds should follow the global policy
      if (r.id[1] && '.' !== r.id[1]) {
        // this is not a good place to throw as the consequences of a bug would be
        // very bad, but errors should never be silent, so we'll compromise
        console.warn("[NON-FATAL ERROR]: ignoring redirect pattern '" + r.id + "'");
        results.conflicts[r.id] = r;
      }

      // nix the '*' for easier matching
      r.id = r.id.slice(1);
      if (!r.id) {
        r.id = '*';
      }
      if (dups[r.id]) {
        results.conflicts[r.id] = r;
        console.warn("[NON-FATAL ERROR]: duplicate entry for redirect pattern '" + r.id + "'");
      }
      dups[r.id] = true;
      results.patterns.push(r);
      return;
    }

    bare = r.id.replace(/^www\./i, '');
    www = r.id.replace(/^(www\.)?/i, 'www.');

    if (true === r.value) {
      // implicit add www
      results.matchesMap[bare] = www;
      results.matchesMap[www] = www;
    } else if (false === r.value) {
      // implicit remove www
      results.matchesMap[bare] = bare;
      results.matchesMap[www] = bare;
    } else if (!r.value) {
      // (null, '', 0, undefined)
      // explicitly no change
      results.matchesMap[r.id] = r.id;
    } else {
      // explicit value
      results.matchesMap[r.id] = r.value;
    }
  });

  results.patterns.sort(function (a, b) {
    return b.id.length - a.id.length;
  });

  return results;
};

module.exports.redirectTo = function (hostname, opts) {
  var redir = opts.matchesMap[hostname];

  if (redir) {
    if (redir === hostname) {
      return false;
    }
    return redir;
  }

  // longest to shortest
  var hasWww = ('www.' === hostname.slice(0, 4));
  //var noWww = (hasWww && hostname.slice(4)) || hostname;
  //var yesWww = (hasWww && hostname) || ('www.' + hostname);

  redir = false;
  opts.patterns.some(function (r) {
    // r.id begins with a dot, such as '.foo.example.com'
    if (r.id !== hostname.slice(hostname.length - r.id.length)) {
      // except for the default, which is an *
      if ('*' !== r.id) {
        return false;
      }
    }

    if (true === r.value) {
      // implicit add www
      redir = hasWww ? hostname : ('www.' + hostname);
    } else if (false === r.value) {
      // implicit remove www
      redir = hasWww ? hostname.slice(4) : hostname;
    } else if (!r.value) {
      // (null, '', 0, undefined)
      // explicitly no change
      redir = false;
    } else {
      // explicit value
      redir = r.value;
    }

    return true;
  });

  if (redir === hostname) {
    return false;
  }

  return redir;
};
