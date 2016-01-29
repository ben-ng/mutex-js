# Mutex [![Build Status](https://img.shields.io/circleci/project/ben-ng/mutex-js.svg)](https://circleci.com/gh/ben-ng/mutex-js/tree/master) [![Coverage Status](https://img.shields.io/coveralls/ben-ng/mutex-js/master.svg)](https://coveralls.io/github/ben-ng/mutex-js?branch=master) [![npm version](https://img.shields.io/npm/v/mutex.svg)](https://www.npmjs.com/package/mutex)

This is a keyed mutex. It abstracts over different [Strategies](#strategies) for mutual exclusion, so you can choose your own tradeoffs.

```sh
npm install mutex
```

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Contents**

- [Performance](#performance)
- [Usage](#usage)
  - [Strategies](#strategies)
  - [Channels](#channels)
- [Examples](#examples)
  - [Atomic Increments](#atomic-increments)
    - [Sample Code: Performing Atomic Increments (Callbacks)](#sample-code-performing-atomic-increments-callbacks)
    - [Sample Code: Performing Atomic Increments (Promises)](#sample-code-performing-atomic-increments-promises)
  - [Methods](#methods)
    - [Lock(key, duration, maxWait)](#lockkey-duration-maxwait)
      - [Leader.lock](#leaderlock)
      - [Follower.lock](#followerlock)
      - [Candidate.lock](#candidatelock)
    - [Unlock(key, nonce, maxWait)](#unlockkey-nonce-maxwait)
      - [Leader.unlock](#leaderunlock)
      - [Follower.unlock](#followerunlock)
      - [Candidate.unlock](#candidateunlock)
  - [Correctness](#correctness)
    - [Test Suite](#test-suite)
    - [Fuzzer](#fuzzer)
    - [Formal Proof](#formal-proof)
- [License](#license)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Performance

Each test performs an asynchronous operation that takes approximately 70ms a hundred times. The "sequential" test is a single process performing all one hundred operations itself, in series. The "Worst Case" tests are ten processes trying to acquire the same lock before performing the task. The "Best Case" tests are ten processes acquiring different locks before performing the task.

```
Sequential - Baseline x 0.15 ops/sec ±0.48% (5 runs sampled)
Redis - Worst Case x 0.14 ops/sec ±1.90% (5 runs sampled)
Raft - Worst Case x 0.05 ops/sec ±31.01% (5 runs sampled)
Redis - Best Case x 0.65 ops/sec ±1.47% (6 runs sampled)
Raft - Best Case x 0.10 ops/sec ±68.01% (5 runs sampled)

      Raft - Worst Case | ######################################## | 191.01 ms/op
       Raft - Best Case | #####################                    | 102.06 ms/op
     Redis - Worst Case | ###############                          | 73.8 ms/op
  Sequential - Baseline | ##############                           | 67.3 ms/op
      Redis - Best Case | ###                                      | 15.27 ms/op
```

Note that ms/operation can be much lower than the ~70ms each task takes because multiple processes are working on tasks at the same time.

You can run the benchmark suite with `npm run benchmark`, or run it ten times with `npm run benchmarks` (the results aren't very stable due to the randomness in Raft leader election).

## Usage

### Strategies

Distributed strategies require the use of a [Channel](#channels)

Strategy  | Distributed? | Failure Tolerance                                                                                       | Notes
--------- | ------------ | ------------------------------------------------------------------------------------------------------- | ----------------
Redis     | No           | Redis can't fail, but any number of processes can fail as locks automatically expire                    | Uses `SET EX NX`
Conflux   | Yes          | Less than half of all processes can fail, or be out of contact because of network partitions.           | Based on [Raft](http://raft.github.io)

### Channels

Mutex is built on [Conflux](https://github.com/ben-ng/conflux), which is in turn built on [Gaggle](https://github.com/ben-ng/gaggle). This means that you can use [any channel that Gaggle supports](https://github.com/ben-ng/gaggle#channels).

## Examples

### Atomic Increments

Multiple processes are simultaneously trying to increment the same value in a database that only supports "GET" and "SET" commands. A situation like this might arise:

```
Process A:
1. GET x => 0
2. SET x 1

Process B:
1. GET x => 0
2. SET x 1

Result: x = 1
Expected: x = 2
```

This is known as the "lost update" problem. You can solve this problem with Mutex, which supports both callbacks and promises.

#### Sample Code: Performing Atomic Increments (Callbacks)

```js

var mutex = require('mutex').Redis
  , m = new mutex()
  , db = require('your-hypothetical-database')

m.lock('myLock', {    // You can create multiple locks by naming them
  duration: 1000      // Hold the lock for no longer than 1 second
, maxWait: 5000       // Wait for no longer than 5s to acquire the lock
}, function (err, lock) {
  // Handle any errors. No need to release the lock as it will
  // automatically expire if the db.get or db.set commands failed.

  // You should check if the lock is valid for the needed duration
  // just before entering the critical section to protect against
  // lock drift, garbage collection cycles, network delays...
  if (lock.isValidForDuration(1000)) {
    // Begin critical section
    db.get('x', (err, val) => {

      // Err handling omitted for brevity
      db.set('x', val + 1, function (err) {

        m.unlock('myLock', function (err) {
          // End critical section
        })
      })
    })
  }
  else {
    // Error because the lock was not valid for the needed duration
  }
})

```

#### Sample Code: Performing Atomic Increments (Promises)

```js

var mutex = require('mutex').Redis
  , m = new mutex()
  , db = require('your-hypothetical-database')

m.lock('myLock', {    // You can create multiple locks by naming them
  duration: 1000      // Request a lock valid for at least 1 second
, maxWait: 5000       // Wait for no longer than 5s to acquire the lock
})
.then(lock => {
  // You should check if the lock is valid for the needed duration
  // just before entering the critical section to protect against
  // lock drift, garbage collection cycles, network delays...
  if (lock.isValidForDuration(1000)) {
    // Begin critical section
    return db.get('x')
    .then(value => {
      return db.set('x', value + 1)
    })
    // End critical section
    .then(() => {
      return m.unlock(lock)
    })
  }
  else {
    return Promise.reject(new Error('The lock was not valid for the needed duration'))
  }
})
.catch(err => {
  // Handle any errors. No need to release the lock as it will
  // automatically expire if the db.get or db.set commands failed.
})

```

By enclosing the `GET` and `SET` commands within the critical section, we guarantee that updates are not lost.

### Methods

All `Mutex` methods support callbacks or promises. Omit the `callback` parameter and the method will return a promise.

#### Mutex.lock(String key, [Object options], [Function callback])

```js
m.lock('foobar', {
  duration: 1000     // how long must the lock be valid for?
, maxWait: 5000      // how long to wait for another process before giving up?
}, function (err, lock) {
  // `lock` is an opaque object with several methods documented below
  // it is what you should hand as the first argument to `Mutex.unlock`
})
```

#### Mutex.unlock(Lock)

```js
// `lock` is the opaque object returned from `Mutex.lock`
m.unlock(lock, function (err) {})
```

#### Lock.isValidForDuration()

```js
if (lock.isValidForDuration(5000)) {
  // critical section
}
else {
  // toss out the lock, request a new one
}
```

#### Lock.getKey()

```js
lock.getKey()
```

Returns the key that the lock is for.

#### Lock.getTTL()

```js
lock.getTTL()
```

Returns the UNIX timestamp that the lock will expire at.

### Correctness

#### Test Suite

Mutex has a comprehensive test suite, and releases always have 100% statement, branch, and function coverage.

#### Fuzzer

Mutex has a fuzzer that has detected very subtle problems in the past (such as those caused by clock drift / garbage collection pauses). You can run it with `npm run fuzz`. It will keep running until a consistency issue is detected. The most subtle issues detected so far required up to fifteen hours of fuzzing.

#### Formal Proof

TODO

## License

Copyright (c) 2015 Ben Ng <me@benng.me>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
