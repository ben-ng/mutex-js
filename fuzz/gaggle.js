var Strategy = require('../strategies/raft-strategy')
  , atomicIncrement = require('../lib/atomic-increment')
  , uuid = require('uuid')
  , INCREMENTS_PER_PROCESS = 2
  , CLUSTER_SIZE = 10
  , redisChannel = uuid.v4()

atomicIncrement(function () {
  var id = uuid.v4()
    , strat = new Strategy({
        id: id
      , channel: {
          name: 'redis'
        , channelName: redisChannel
        }
      , strategyOptions: {
          clusterSize: CLUSTER_SIZE
        }
      })

  return strat
}
, CLUSTER_SIZE, INCREMENTS_PER_PROCESS, function (err) {
  if (err) {
    process.stderr.write('x\n')
    console.error(err)
    process.exit(1)
  }
  else {
    process.stdout.write('.')
    process.exit(0)
  }
})
