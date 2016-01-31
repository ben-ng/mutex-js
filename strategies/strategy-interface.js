var Promise = require('bluebird')
  , Joi = require('joi')
  , _ = require('lodash')
  , Lock = require('./lock')
  , prettifyJoiError = require('../helpers/prettify-joi-error')

/*
* Gaggle is an interface for mutual exclusion Strategies
*
* Strategy implementors should extend this class with the methods:
*   _setLockState
*   _close
*
* Implementors should use the following protected methods:
*   _createPromise
*   _logFunction
*
* Strategy consumers should use the public interface:
*   lock
*   unlock
*   close
*/

function StrategyInterface (opts) {
  var validatedOptions = Joi.validate(opts || {}, Joi.object().keys({
    logFunction: Joi.func().default(_.noop)
  , strategyOptions: Joi.object()
  , id: Joi.string()
  }).requiredKeys('id'), {allowUnknown: true, stripUnknown: false})

  if (validatedOptions.error != null) {
    throw new Error(prettifyJoiError(validatedOptions.error))
  }

  this.id = validatedOptions.value.id
  this._logFunction = validatedOptions.value.logFunction
  this._closed = false
}

StrategyInterface.prototype.lock = function lock (key, opts, _cb) {
  var validatedOptions = Joi.validate(typeof opts === 'object' ? opts : {}, Joi.object().keys({
        duration: Joi.number().min(0).default(10000)
      , maxWait: Joi.number().min(0).default(5000)
      }), {
        convert: false
      })
    , cb = typeof opts === 'function' ? opts : _cb
    , validatedOpts
    , p

  if (this._closed !== false) {
    p = Promise.reject(new Error('This instance has been closed'))
  }
  else if (validatedOptions.error != null) {
    p = Promise.reject(prettifyJoiError(validatedOptions.error))
  }
  else if (typeof this._lock === 'function') {
    validatedOpts = validatedOptions.value
    // Acquire for a longer duration so that the requester actually gets the lock for the
    // duration that they asked for
    validatedOpts.duration = Math.max(validatedOpts.duration + 2000, validatedOpts.duration * 1.5)
    p = this._lock(key, validatedOpts)
  }
  else {
    p = Promise.reject(new Error('unimplemented method _lock is required by the Strategy interface'))
  }

  if (typeof cb === 'function') {
    p.then(_.curry(cb, 2)(null)).catch(cb)
  }
  else {
    return p
  }
}

StrategyInterface.prototype.unlock = function unlock (lock, cb) {
  var p

  if (this._closed !== false) {
    p = Promise.reject(new Error('This instance has been closed'))
  }
  else if (typeof this._unlock !== 'function') {
    p = Promise.reject(new Error('unimplemented method _unlock is required by the Strategy interface'))
  }
  else if (!(lock instanceof Lock)) {
    p = Promise.reject('unlock() expects the Lock object returned from lock()')
  }
  else {
    p = this._unlock(lock)
  }

  if (typeof cb === 'function') {
    p.then(_.curry(cb, 2)(null)).catch(cb)
  }
  else {
    return p
  }
}

StrategyInterface.prototype.close = function close (cb) {
  var p

  this._closed = true

  if (typeof this._close === 'function') {
    p = this._close()
  }
  else {
    p = Promise.reject(new Error('unimplemented method _close is required by the Strategy interface'))
  }

  if (typeof cb === 'function') {
    p.then(_.curry(cb, 2)(null)).catch(cb)
  }
  else {
    return p
  }
}

StrategyInterface.prototype._createLock = function (key, nonce, ttl) {
  return new Lock(key, nonce, ttl)
}

module.exports = StrategyInterface
