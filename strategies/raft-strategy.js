var StrategyInterface = require('./strategy-interface')
  , util = require('util')
  , Promise = require('bluebird')
  , uuid = require('uuid')
  , conflux = require('conflux')
  , async = require('async')
  , defined = require('defined')
  , Joi = require('joi')
  , prettifyJoiError = require('../helpers/prettify-joi-error')
  , EventEmitter = require('events').EventEmitter
  , ACTIONS = {LOCK: 'LOCK', UNLOCK: 'UNLOCK'}

function RaftStrategy (opts) {

  var self = this
    , validatedOptions = Joi.validate(opts || {}, Joi.object().keys({
        strategyOptions: Joi.object().keys({
          unlockTimeout: Joi.number().integer().min(0).default(5000)
        , clusterSize: Joi.number().integer().min(0)
        , channel: Joi.object()
        })
      , id: Joi.string()
      }), {
        convert: false
      })

  StrategyInterface.apply(this, Array.prototype.slice.call(arguments))

  if (validatedOptions.error != null) {
    throw new Error(prettifyJoiError(validatedOptions.error))
  }

  opts = validatedOptions.value
  this._unlockTimeout = opts.strategyOptions.unlockTimeout

  this._emitter = new EventEmitter()

  this._conflux = conflux({
    id: opts.id
  , clusterSize: opts.strategyOptions.clusterSize
  , channel: opts.strategyOptions.channel
  , methods: {
      lock: function (key, nonce, duration) {
        var state = this.getProvisionalState()

        if (state == null || state[key] == null || state[key].ttl < Date.now()) {
          // Don't bother waiting for the dispatch to finish, nodes are listening
          // for the commit anyway. If we waited for the change to be committed then
          // we can't grant locks in parallel!
          return {
            type: ACTIONS.LOCK
          , key: key
          , nonce: nonce
          , ttl: Date.now() + duration
          }
        }
        else {
          return new Error('The lock is currently held by a different process, try again in ' + (Date.now() - state[key].ttl) + 'ms')
        }
      }
    , unlock: function (key, nonce) {
        var state = this.getProvisionalState()

        if (state != null && (state[key] != null && state[key].nonce === nonce)) {
          return {
            type: ACTIONS.UNLOCK
          , key: key
          , nonce: nonce
          }
        }
        else {
          return null
        }
      }
    }
  , reduce: function (state, action) {
      state = state == null ? {} : JSON.parse(JSON.stringify(state))

      if (action == null) {
        return state
      }

      switch (action.type) {
        case ACTIONS.LOCK:
          state[action.key] = {
            nonce: action.nonce
          , ttl: action.ttl
        }
        break

        case ACTIONS.UNLOCK:
        state[action.key] = null
        break
      }

      return state
    }
  })

  this._unsubscribe = this._conflux.subscribe(function () {
    self._emitter.emit('changed')
  })
}

util.inherits(RaftStrategy, StrategyInterface)

RaftStrategy.prototype._lock = function lock (key, opts) {
  var self = this
    , granted = false
    , started = Date.now()
    , ROUND_TRIP_LATENCY = 500 // an estimate, can make this dynamic later
    , EACH_TRY_TIMEOUT = 3000
    , MAX_WAIT = opts.maxWait
    , LOCK_DURATION = opts.duration
    , newNonce = this.id + '_' + uuid.v4()

  return new Promise(function (resolve, reject) {

    function resolveOnCommitted () {
      var keyState = defined(self._conflux.getState(), {})[key]
        , keyNonce = keyState == null ? null : keyState.nonce

      if (keyNonce === newNonce) {
        self._emitter.removeListener('changed', resolveOnCommitted)

        resolve(self._createLock(key, newNonce, keyState.ttl))
      }
    }

    self._emitter.on('changed', resolveOnCommitted)

    async.whilst(function () {
      return !granted && Date.now() < started + MAX_WAIT - ROUND_TRIP_LATENCY
    }, function (next) {
      self._conflux.perform('lock', [key, newNonce, LOCK_DURATION], EACH_TRY_TIMEOUT, function (err) {
        granted = !err
        next()
      })
    }, function () {
      if (!granted) {
        self._emitter.removeListener('changed', resolveOnCommitted)
        reject(new Error('The lock could not be granted in time'))
      }
    })
  })
}

RaftStrategy.prototype._unlock = function unlock (lock) {
  var self = this
    , released = false
    , started = Date.now()
    , ROUND_TRIP_LATENCY = 500 // an estimate, can make this dynamic later
    , EACH_TRY_TIMEOUT = 1500
    , MAX_WAIT = this._unlockTimeout

  return new Promise(function (resolve, reject) {
    async.whilst(function () {
      return !released && Date.now() < Math.max(started + MAX_WAIT - ROUND_TRIP_LATENCY, started)
    }, function (next) {
      self._conflux.perform('unlock', [lock.getKey(), lock.getNonce()], EACH_TRY_TIMEOUT, function (err) {
        released = !err
        next()
      })
    }, function () {
      if (!released) {
        reject(new Error('The lock could not be released in time'))
      }
      else {
        resolve()
      }
    })
  })
}

RaftStrategy.prototype.close = function close () {
  this._unsubscribe()

  return this._conflux.close()
}

module.exports = RaftStrategy
