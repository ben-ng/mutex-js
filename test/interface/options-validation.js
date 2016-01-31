var tap = require('tap')
  , NoopStrategy = require('../../strategies/noop-strategy')
  , RedisStrategy = require('../../strategies/redis-strategy')
  , uuid = require('uuid')

tap.test('Throws when constructor options are invalid', function (t) {
  t.throws(function () {
      /*eslint-disable no-unused-vars*/
      var s = new NoopStrategy({
        logFunction: 'should be a function'
      , id: uuid.v4()
      })
      /*eslint-enable no-unused-vars*/
    }
  , /^Invalid options: "logFunction" must be a Function$/
  , 'Should throw if logFunction is not a function')

  t.end()
})

tap.test('Throws when redis constructor options are invalid', function (t) {
  t.throws(function () {
      /*eslint-disable no-unused-vars*/
      var s = new RedisStrategy({
        strategyOptions: {
          connectionString: false
        }
      , id: uuid.v4()
      })
      /*eslint-enable no-unused-vars*/
    }
  , /Invalid options: "connectionString" must be a string/
  , 'Should throw if logFunction is not a function')

  t.end()
})

tap.test('Throws when lock options are invalid', function (t) {
  var s = new NoopStrategy({id: uuid.v4()})

  s.lock('dummy', {maxWait: 'should be number'})
  .catch(function (err) {
    t.equals(err.toString()
    , 'Invalid options: "maxWait" must be a number'
    , 'Should reject if lock options are invalid')

    t.end()
  })
})

tap.test('Throws when unlock argument is invalid', function (t) {
  var s = new NoopStrategy({id: uuid.v4()})

  s.unlock('should be a lock object')
  .catch(function (err) {
    t.equals(err.toString()
    , 'unlock() expects the Lock object returned from lock()'
    , 'Should reject if unlock argument is invalid')

    t.end()
  })
})
