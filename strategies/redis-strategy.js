var StrategyInterface = require('./strategy-interface')
  , redis = require('redis')
  , Joi = require('joi')
  , util = require('util')
  , Promise = require('bluebird')
  , async = require('async')
  , _ = require('lodash')
  , uuid = require('uuid')
  , prettifyJoiError = require('../helpers/prettify-joi-error')

Promise.promisifyAll(redis.RedisClient.prototype)

/**
* A simple solution to mutual exclusion, mostly so that the test suite can be
* tested, but good in situations where simplicity is more important than
* high performance. For example, you might want to use this to run migrations
* on deploy of an 12-factor app with multiple processes.
*/

function RedisStrategy (opts) {
  var validatedOptions = Joi.validate(opts || {}, Joi.object().keys({
        logFunction: Joi.func().default(_.noop)
      , strategyOptions: Joi.object().keys({
          connectionString: Joi.string()
        })
      , id: Joi.string()
      }), {
        convert: false
      })
    , connString
    , redisClient

  StrategyInterface.apply(this, Array.prototype.slice.call(arguments))

  if (validatedOptions.error != null) {
    throw new Error(prettifyJoiError(validatedOptions.error))
  }

  connString = _.get(validatedOptions, 'value.strategyOptions.connectionString')
  redisClient = connString != null ? redis.createClient(connString) : redis.createClient()

  redisClient.on('error', this._logFunction)

  this._redis = redisClient
}

util.inherits(RedisStrategy, StrategyInterface)

RedisStrategy.prototype._lock = function _lock (key, opts) {
  var self = this
    , acquired = false
    , started = Date.now()
    , r = this._redis
    , newNonce = this.id + '_' + uuid.v4()

  return new Promise(function (resolve, reject) {
    async.whilst(function () {
      return acquired === false && Date.now() - started < opts.maxWait
    }, function (next) {
      /*eslint-disable handle-callback-err*/
      r.set(key, newNonce, 'NX', 'PX', opts.duration, function (err, res) {
        // Ignore errors since we'll be trying again anyway
        /*eslint-enable handle-callback-err*/
        if (res === 'OK') {
          acquired = self._createLock(key, newNonce, Date.now() + opts.duration)

          next(null)
        }
        else {
          // "try again later" -- fail with no error
          setTimeout(next, _.random(150, 300))
        }
      })
    }, function () {
      if (acquired !== false) {
        resolve(acquired)
      }
      else {
        reject(new Error('Timed out before acquiring the lock'))
      }
    })
  })
}

RedisStrategy.prototype._unlock = function _unlock (lock) {
  var r = this._redis

  return r.getAsync(lock.getKey())
  .then(function (res) {
    if (res === lock.getNonce()) {
      return r.delAsync(lock.getKey())
    }
    else {
      return Promise.resolve()
    }
  })
}

RedisStrategy.prototype._close = function _close () {
  this._redis.quit()

  return Promise.resolve()
}

module.exports = RedisStrategy
