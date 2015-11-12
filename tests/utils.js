'use strict';

var utils = require('../lib/utils');

// TODO priority should be by arbitrarily, large numbers, not specific numbers of #
[
  { test: "example.com"
  , result: { host: "example.com" }
  }
, { test: "api.example.com"
  , result: { host: "api.example.com" }
  }
, { test: "api.example.com#"
  , result: { host: "api.example.com" }
  }
, { test: "api.example.com##"
  , result: { host: "api.example.com" }
  }
, { test: "api.example.com###"
  , result: { host: "api.example.com" }
  }
, { test: "example.com#blah"
  , result: { host: "example.com" }
  }
].forEach(function (sample) {
  console.log(utils.getDomainInfo(sample.test));
});
