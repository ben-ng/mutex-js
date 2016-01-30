var Promise = require('bluebird')
  , async = require('async')
  , redis = require('redis')
  , once = require('once')
  , _ = require('lodash')
  , uuid = require('uuid')

Promise.promisifyAll(redis.RedisClient.prototype)

module.exports = function atomicIncrement (createStrategy, clusterSize, incrementCount, _cb) {
  // Test parameters
  var lockKey = 'gaggleAtomicIncrementTestLock-' + uuid.v4()
  // Test state
    , r = redis.createClient()
    , expectedFinalValue = incrementCount * clusterSize
    , i = 0
    , finishedGaggles = 0
    , gaggleFinished
    , globalValue = 0
    , cluster = []
    , oplog = []
    , errContext = []
    , cb = once(_cb)

  gaggleFinished = function gaggleFinished () {
    finishedGaggles = finishedGaggles + 1

    if (finishedGaggles === clusterSize) {
        r.quit()

        _.each(cluster, function (node) {
          node.close()
        })

      if (globalValue !== expectedFinalValue) {
        var errMsg = 'Increments were not atomic: expected ' + expectedFinalValue + ', got ' + globalValue

        errMsg += '\n\nRelevant logs:\n' + errContext.join('\n')

        cb(new Error(errMsg))
      }
      else {
        cb()
      }
    }
  }

  r.delAsync(lockKey, 0)
  .then(function () {
    for (i=0; i<clusterSize; ++i) {
    (function (ii) {
      var incrementCounter = 0
        , g = createStrategy()

      cluster.push(g)

      async.whilst(
        function () { return incrementCounter < incrementCount }
      , function (next) {
          // Correctness doesn't change when locks fail to be acquired
          // we only care about behavior when locks are acquired
          var ignoreResultAndKeepGoing = function () { return Promise.resolve() }

          g.lock(lockKey, {maxWait: 10000, duration: 5000})
          // CRITICAL SECTION BEGIN
          .then(function (lock) {
            /**
            * It is so incredibly unlikely that this code ever gets hit in testing. In fact, it takes
            * the fuzzer about 8-15 hours to ever encounter this problem. I'm ignoring coverage on this
            * branch. Rest assured that if you have many hours to kill on a slow machine, you will see
            * it happen.
            */
            /* istanbul ignore if */
            if (!lock.isValidForDuration(5000)) {
              return Promise.reject(new Error('The lock was not valid for the requested duration'))
            }

            return new Promise(function (resolve, reject) {
              setTimeout(function () {
                var temp = globalValue

                oplog.push('@' + Date.now() + ' process ' + g.id.substring(0, 5) + ' read ' + temp)

                setTimeout(function () {
                  resolve(temp)
                }, 15)
              }, 15)
            })
            .then(function (val) {
              return new Promise(function (resolve, reject) {
                setTimeout(function () {

                  var oldGlobalValue = globalValue

                  globalValue = val + 1

                  oplog.push('@' + Date.now() + ' process ' + g.id.substring(0, 5) + ' wrote ' + globalValue)

                  // Obviously, this should never get hit if things are working... so ignore it in coverage
                  /* istanbul ignore if */
                  if (oldGlobalValue === globalValue) {
                    errContext = errContext.concat(_.takeRight(oplog, 10))
                    errContext.push('^ lost update detected')

                    // Detect a distributed strategy and make additional debugging info available
                    if (g._conflux != null) {
                      errContext.push('v process states')

                      _.each(cluster, function (mutexNode) {
                        var confluxNode = mutexNode._conflux
                          , gaggleNode = confluxNode._gaggle
                          , logSummary = _(gaggleNode._log).takeRight(10).map(function (entry, i) {
                              return '  ' + _.padEnd(i, 3) + ' ' + JSON.stringify(entry.data)
                            }).valueOf().join('\n')
                          , lockSummary = _(confluxNode.getState()).map(function (v, k) {
                              if (v == null) {
                                return null
                              }
                              else {
                                return '  ' + k + ' ttl: ' + v.ttl
                              }
                            }).compact().value().join('\n')

                        errContext.push(gaggleNode.id.substring(0, 5) + ' (' + gaggleNode._state + ')' +
                          ' Term: ' + gaggleNode._currentTerm +
                          ' Commit Index: ' + gaggleNode._commitIndex +
                          ' Applied Index: ' + gaggleNode._lastApplied +
                          ' \nLocks:\n' + lockSummary +
                          ' \n\nLogs:\n' + logSummary + '\n')
                      })
                    }

                    errContext.push('--------------')
                  }

                  setTimeout(function () {
                    resolve()
                  }, 15)
                }, 15)
              })
            })
            // CRITICAL SECTION END
            .then(function () {
              incrementCounter = incrementCounter + 1
              return g.unlock(lock)
              .then(function () {
                return Promise.resolve()
              })
            })
            .then(ignoreResultAndKeepGoing)
            .catch(ignoreResultAndKeepGoing)
          })
          .then(ignoreResultAndKeepGoing)
          .catch(ignoreResultAndKeepGoing)
          // Breaks the promise chain to **significantly** reduce memory usage
          .finally(function () {
            setTimeout(next, 0)
          })
        }
      , function () {
          gaggleFinished()
        }
      )
    })(i)
    }
  })
}
