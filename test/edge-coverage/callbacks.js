/**
* Coverage for the callback API
*/

var Strategy = require('../../strategies/redis-strategy')
  , tap = require('tap')
  , uuid = require('uuid')

tap.test('callback api', function (t) {
  var a = new Strategy({id: uuid.v4()})

  t.plan(3)

  a.lock('foo', function (err, lock) {
    t.ifError(err, 'should not error when locking')

    a.unlock(lock, function (err) {
      t.ifError(err, 'should not error when unlocking')

      a.close(function (err) {
        t.ifError(err, 'should not error when closing')
      })
    })
  })
})
