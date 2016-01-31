/**
* Test if multiple gaggles can atomically increment a value
*
* Each process starts up, creates a gaggle, and then tries to increment
* a value 1000 times.
*/

var tap = require('tap')
  , uuid = require('uuid')
  , _ = require('lodash')
  , mutex = require('../../')
  , atomicIncrement = require('../../lib/atomic-increment')
  , CLUSTER_SIZE = 10

tap.test('atomic increment test fails when mutual exclusion is faulty', function (t) {
  var Strategy = require('../../strategies/noop-strategy')

  t.plan(2)

  atomicIncrement(function () {
    return new Strategy({id: uuid.v4()})
  }, CLUSTER_SIZE, 100, function (err) {
    t.ok(err, 'There should be an error')

    if (err != null) {
      t.ok(err.toString().indexOf('Error: Increments were not atomic') === 0
      , 'The error should be that "Increments were not atomic"')
    }
  })
})

tap.test('atomic increment - Redis', function (t) {
  var counter = 0
    , testStart = Date.now()
    , INCREMENTS_PER_PROCESS = 50

  t.plan(2)

  atomicIncrement(function () {
    counter = counter + 1

    // Gives us coverage for both default and explicit init
    return mutex({
      id: uuid.v4()
    , strategy: {
        name: 'redis'
      }
    })
  }
  , CLUSTER_SIZE, INCREMENTS_PER_PROCESS, function (err) {
    t.ifError(err, 'There should be no error')

    t.pass('Average lock time: ' + _.round((Date.now() - testStart) / (CLUSTER_SIZE * INCREMENTS_PER_PROCESS), 2) + 'ms')
  })
})

tap.test('atomic increment - Raft', function (t) {
  var testStart = Date.now()
    , INCREMENTS_PER_PROCESS = 20

  t.plan(2)

  atomicIncrement(function () {
    return mutex({
      id: uuid.v4()
    , strategy: {
        name: 'raft'
      , clusterSize: CLUSTER_SIZE
      , channel: {
          name: 'memory'
        }
      }
    })
  }
  , CLUSTER_SIZE, INCREMENTS_PER_PROCESS, function (err) {
    t.ifError(err, 'There should be no error ' + err)

    t.pass('Average lock time: ' + _.round((Date.now() - testStart) / (CLUSTER_SIZE * INCREMENTS_PER_PROCESS), 2) + 'ms')
  })
})
