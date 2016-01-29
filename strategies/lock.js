/**
* An opaque object that is returned when a mutex is acquired
*/

function Lock (key, nonce, ttl) {
  this._key = key
  this._nonce = nonce
  this._ttl = ttl
}

Lock.prototype.getTTL = function getTTL () {
  return this._ttl
}

Lock.prototype.getKey = function getKey () {
  return this._key
}

Lock.prototype.getNonce = function getNonce () {
  return this._nonce
}

Lock.prototype.isValidForDuration = function isValidForDuration (duration) {
  return Date.now() + duration < this.getTTL()
}

module.exports = Lock
