/**
* Coverage for edge cases in the factory
*/

var mutex = require('../../')
  , tap = require('tap')

tap.test('factory - throws when missing required options', function (t) {
  t.throws(function () {
    mutex({
      id: 'foobar'
      // missing strategy
    })
  }, /Invalid options/, 'Should throw if missing options')

  t.end()
})

tap.test('factory - throws when missing all options', function (t) {
  t.throws(function () {
    mutex()
  }, /Invalid options/, 'Should throw if missing options')

  t.end()
})
