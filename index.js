'use strict';

function hello(name = 'world') {
  return `Hello, ${name}!`;
}

module.exports = { hello };
