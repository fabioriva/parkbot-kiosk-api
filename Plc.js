const EventEmitter = require('events')
const logger = require('pino')()
const snap7 = require('node-snap7')
const util = require('util')

const DATA = {
  area: 0x84,
  dbNr: Number(process.env.DB_NR),
  start: Number(process.env.DB_START),
  amount: Number(process.env.DB_AMOUNT),
  wordLen: 0x02
}

class PLC extends EventEmitter {
  constructor (ip, rack, slot, time) {
    super()
    this.client = new snap7.S7Client()
    this.online = false
    this.ip = ip
    this.rack = Number(rack)
    this.slot = Number(slot)
    this.time = Number(time)
    this.data = {
      lang: 0,
      page: 0,
      card: 0,
      digitNr: 0,
      errMesg: 0,
      successMesg: 0
    }
  }

  error (e) {
    this.online = !this.client.Disconnect()
    isNaN(e) ? logger.error(e) : logger.error(this.client.ErrorText(e))
  }

  async read (area, dbNumber, start, amount, wordLen) {
    try {
      const buffer = await ReadArea(this.client, area, dbNumber, start, amount, wordLen)
      return buffer
    } catch (e) {
      this.error(e)
    }
  }

  async write (area, dbNumber, start, amount, wordLen, buffer) {
    try {
      const res = await WriteArea(this.client, area, dbNumber, start, amount, wordLen, buffer)
      return res
    } catch (e) {
      this.error(e)
    }
  }

  forever (timeout) {
    setTimeout(async () => {
      try {
        if (this.online) {
          const { area, dbNr, start, amount, wordLen } = DATA
          const buffer = await this.read(area, dbNr, start, amount, wordLen)
          this.data.lang = buffer.readInt16BE(0)
          this.data.page = buffer.readInt16BE(2)
          this.data.card = buffer.readInt16BE(4)
          this.data.digitNr = buffer.readInt16BE(6)
          this.data.errMesg = buffer.readInt16BE(8)
          this.data.successMesg = buffer.readInt16BE(10)
        } else {
          this.online = this.client.Connect()
          this.online ? logger.info('Connected to PLC %s', this.ip) : logger.info('Connecting to PLC %s ...', this.ip)
          // this.data.lang = buffer.readInt16BE(0)
          this.data.page = 0
          this.data.card = 0
          this.data.digitNr = 0
          this.data.errMesg = 0
          this.data.successMesg = 0
        }
        this.publish('api/kiosk/info', { comm: this.online, ...this.data })
      } catch (e) {
        this.error(e)
      }
      this.forever(timeout)
    }, timeout)
  }

  publish (channel, data) {
    this.emit('pub', { channel, data: Buffer.from(JSON.stringify(data)) })
  }

  run () {
    try {
      this.online = this.client.ConnectTo(this.ip, this.rack, this.slot)
      this.forever(this.time)
    } catch (e) {
      this.error(e)
    }
  }
}

const ReadArea = util.promisify(
  (client, area, dbNumber, start, amount, wordLen, callback) => {
    client.ReadArea(area, dbNumber, start, amount, wordLen, function (
      err,
      data
    ) {
      if (err) return callback(err)
      callback(err, data)
    })
  }
)

const WriteArea = util.promisify(
  (client, area, dbNumber, start, amount, wordLen, buffer, callback) => {
    client.WriteArea(area, dbNumber, start, amount, wordLen, buffer, function (
      err
    ) {
      if (err) return callback(err)
      callback(err, true)
    })
  }
)

module.exports = PLC
