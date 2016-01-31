/**
* Coverage for edge cases in the raft strategy
*/

var Strategy = require('../../strategies/raft-strategy')
  , tap = require('tap')
  , uuid = require('uuid')
  , async = require('async')
  , Promise = require('bluebird')

tap.test('raft strategy - fails when no options are given', function (t) {
  t.throws(function () {
    /*eslint-disable no-unused-vars*/
    var c = new Strategy()
    /*eslint-enable no-unused-vars*/
  }, /Invalid options/, 'Should throw if missing options')

  t.end()
})

tap.test('raft strategy - fails when invalid options are given', function (t) {
  t.throws(function () {
    /*eslint-disable no-unused-vars*/
    var c = new Strategy({
      id: uuid.v4()
    , strategyOptions: {
        heartbeatInterval: 'well this should be a number'
      }
    })
    /*eslint-enable no-unused-vars*/
  }, /Invalid options/, 'Should throw if invalid options')

  t.end()
})

tap.test('raft strategy - acquiring a lock times out', function (t) {
  var a_id = uuid.v4()
    , a = new Strategy({
        id: a_id
      , strategyOptions: {
          clusterSize: 2
        , channel: {
            name: 'redis'
          , channelName: 'acqtimeoutpubsub'
          }
        }
      })
    , b_id = uuid.v4()
    , b = new Strategy({
        id: b_id
      , strategyOptions: {
          clusterSize: 2
        , channel: {
            name: 'redis'
          , channelName: 'acqtimeoutpubsub'
          }
        }
      })
    , sameKey = 'timeOutLock'
    , sawExpectedErr = false

  t.plan(3)

  a.lock(sameKey, {
    duration: 10000
  , maxWait: 0
  })
  .catch(function (err) {
    sawExpectedErr = true
    t.equals(err.toString(), 'Error: The lock could not be granted in time', 'should time out')
  })
  .finally(function () {
    t.ok(sawExpectedErr, 'acquisition should fail')

    // This test happens so quickly that the channels usually haven't even connected yet
    async.whilst(function () {
      return !a._conflux._gaggle._channel.state.connected || !b._conflux._gaggle._channel.state.connected
    }, function (next) {
      setTimeout(next, 100)
    }, function () {
      b.close()
      a.close()

      t.pass('closed cleanly')
    })
  })
})

tap.test('raft strategy - acquiring a lock held by another process fails', function (t) {
  var a_id = uuid.v4()
    , a = new Strategy({
        id: a_id
      , strategyOptions: {
          clusterSize: 2
        , channel: {
            name: 'redis'
          , channelName: 'acqfailpubsub'
          }
        }
      })
    , b_id = uuid.v4()
    , b = new Strategy({
        id: b_id
      , strategyOptions: {
          clusterSize: 2
        , channel: {
            name: 'redis'
          , channelName: 'acqfailpubsub'
          }
        }
      })
    , sameKey = 'blockedLock'
    , sawExpectedErr = false

  t.plan(5)

  a.lock(sameKey, {
    duration: 20000
  , maxWait: 5000
  })
  .then(function (lock) {
    t.pass('first lock acquired')

    return b.lock(sameKey, {
      duration: 5000
    , maxWait: 1000
    })
    .catch(function (err) {
      sawExpectedErr = true
      t.equals(err.toString(), 'Error: The lock could not be granted in time', 'should time out')
    })
    .then(function () {
      return a.unlock(lock)
    })
    .then(function () {
      t.pass('should unlock the lock')
      return Promise.resolve()
    })
  })
  .finally(function () {
    t.ok(sawExpectedErr, 'acquisition should fail')

    // This test happens so quickly that the channels usually haven't even connected yet
    async.whilst(function () {
      return !a._conflux._gaggle._channel.state.connected || !b._conflux._gaggle._channel.state.connected
    }, function (next) {
      setTimeout(next, 100)
    }, function () {
      b.close()
      a.close()

      t.pass('closed cleanly')
    })
  })
})

tap.test('raft strategy - releasing a lock times out', function (t) {
  var a_id = uuid.v4()
    , a = new Strategy({
        id: a_id
      , strategyOptions: {
          clusterSize: 2
        , unlockTimeout: 0
        , channel: {
            name: 'redis'
          , channelName: 'releasetimeoutpubsub'
          }
        }
      })
    , b_id = uuid.v4()
    , b = new Strategy({
        id: b_id
      , strategyOptions: {
          clusterSize: 2
        , unlockTimeout: 0
        , channel: {
            name: 'redis'
          , channelName: 'releasetimeoutpubsub'
          }
        }
      })
    , sameKey = 'timeOutLock'
    , sawExpectedErr = false

  t.plan(4)

  a.lock(sameKey, {
    duration: 10000
  , maxWait: 10000
  })
  .then(function (lock) {
    t.pass('should acquire the lock')

    return a.unlock(lock)
    .catch(function (err) {
      sawExpectedErr = true
      t.equals(err.toString(), 'Error: The lock could not be released in time', 'should time out')
    })
  })
  .finally(function () {
    t.ok(sawExpectedErr, 'acquisition should fail')

    // This test happens so quickly that the channels usually haven't even connected yet
    async.whilst(function () {
      return !a._conflux._gaggle._channel.state.connected || !b._conflux._gaggle._channel.state.connected
    }, function (next) {
      setTimeout(next, 100)
    }, function () {
      b.close()
      a.close()

      t.pass('closed cleanly')
    })
  })
})

tap.test('raft strategy - releasing a lock with a different nonce is okay', function (t) {
  var a_id = uuid.v4()
    , a = new Strategy({
        id: a_id
      , strategyOptions: {
          clusterSize: 2
        , unlockTimeout: 1000
        , channel: {
            name: 'redis'
          , channelName: 'releasetimeoutpubsub'
          }
        }
      })
    , b_id = uuid.v4()
    , b = new Strategy({
        id: b_id
      , strategyOptions: {
          clusterSize: 2
        , unlockTimeout: 1000
        , channel: {
            name: 'redis'
          , channelName: 'releasetimeoutpubsub'
          }
        }
      })

  t.plan(2)

  a.unlock(Strategy.prototype._createLock('rubbish', uuid.v4(), Date.now()))
  .then(function () {
    t.pass('should silently pass')

    return Promise.resolve()
  })
  .finally(function () {
    // This test happens so quickly that the channels usually haven't even connected yet
    async.whilst(function () {
      return !a._conflux._gaggle._channel.state.connected || !b._conflux._gaggle._channel.state.connected
    }, function (next) {
      setTimeout(next, 100)
    }, function () {
      b.close()
      a.close()

      t.pass('closed cleanly')
    })
  })
})
