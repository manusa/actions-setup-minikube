'use strict';

// Quotes a value so the shell passes it as a single, literal argument
const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;

module.exports = {shellQuote};
