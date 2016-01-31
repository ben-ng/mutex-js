var Joi = require('joi')
  , _ = require('lodash')
  , prettifyJoiError = require('../helpers/prettify-joi-error')
  , RaftStrategy = require('../strategies/raft-strategy')
  , RedisStrategy = require('../strategies/redis-strategy')
  , schema

/**
* Validate the bare minimum, leave the rest up to the strategies
* to handle.
*/
schema = Joi.object().keys({
  id: Joi.string()
, strategy: Joi.object().keys({
    name: Joi.string().valid('raft', 'redis')
  }).unknown()
}).requiredKeys('id', 'strategy')


module.exports = function ConfluxFactory (opts) {
  var validatedOptions = Joi.validate(opts || {}, schema)
    , strategyOpts

  if (validatedOptions.error != null) {
    throw new Error(prettifyJoiError(validatedOptions.error))
  }

  strategyOpts = {
    id: validatedOptions.value.id
  , strategyOptions: _.omit(validatedOptions.value.strategy, 'name')
  }

  switch (validatedOptions.value.strategy.name) {
    case 'raft':
      return new RaftStrategy(strategyOpts)

    case 'redis':
      return new RedisStrategy(strategyOpts)
  }
}
