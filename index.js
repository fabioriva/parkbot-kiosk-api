require('dotenv').config()
const uWS = require('uWebSockets.js')
const logger = require('pino')()
const Plc = require('./Plc')
const { readJson, sendJson } = require('./json')

const log = (req) => {
  logger.info({
    'user-agent': req.getHeader('user-agent'),
    method: req.getMethod(),
    url: req.getUrl()
  })
}

const CLS = {
  area: 0x84,
  dbNr: 37,
  start: 4,
  amount: 2,
  wordLen: 0x02
}
const PIN = {
  area: 0x84,
  dbNr: 37,
  start: 6,
  amount: 2,
  wordLen: 0x02
}
const TAG = {
  area: 0x84,
  dbNr: 37,
  start: 8,
  amount: 8,
  wordLen: 0x02
}
const PATH = '/api/kiosk'

const main = async () => {
  try {
    const app = uWS.App().listen(Number(process.env.PORT), token => logger.info(token))
    app.get('/*', (res, req) => {
      log(req)
      res.end('Resource not found')
    })
    // app.get(PATH + '/read', async (res, req) => {
    //   log(req)
    //   res.onAborted(() => {
    //     res.aborted = true
    //   })
    //   const buffer = await plc.read(0x84, 510, 0, 20, 0x02)
    //   sendJson(res, { hello: buffer })
    // })
    app.get(PATH + '/press', async (res, req) => {
      log(req)
      res.onAborted(() => {
        res.aborted = true
      })
      const buffer = Buffer.allocUnsafe(2)
      buffer.writeUInt16BE(1, 0)
      const { area, dbNr, start, amount, wordLen } = CLS
      const done = await plc.write(area, dbNr, start, amount, wordLen, buffer)
      sendJson(res, { message: done ? 'closing' : 'error' })
    })
    app.get(PATH + '/unpress', async (res, req) => {
      log(req)
      res.onAborted(() => {
        res.aborted = true
      })
      const buffer = Buffer.allocUnsafe(2)
      buffer.writeUInt16BE(0, 0)
      const { area, dbNr, start, amount, wordLen } = CLS
      const done = await plc.write(area, dbNr, start, amount, wordLen, buffer)
      sendJson(res, { message: done ? 'opening' : 'error' })
    })
    app.post(PATH + '/pin', async (res, req) => {
      log(req)
      readJson(
        res,
        async json => {
          const regexp = /^[a-fA-F0-9]{3}$/
          // console.log(json, regexp.test(json.pin))
          const buffer = Buffer.alloc(2)
          buffer.writeInt16BE(parseInt(json.pin, 16), 0) // string to hex
          const { area, dbNr, start, amount, wordLen } = PIN
          const done = await plc.write(area, dbNr, start, amount, wordLen, buffer)
          // console.log(buffer, done)
          sendJson(res, json)
        })
    })
    app.post(PATH + '/tag', async (res, req) => {
      log(req)
      // res.onAborted(() => {
      //   res.aborted = true
      // })
      // sendJson(res, { hello: 'world' })
      readJson(
        res,
        async json => {
          const { id } = json
          // const s = id.toString(16)
          // console.log(typeof s, s)
          // const hex = parseInt(s, 16)
          // console.log(typeof hex, hex)
          const buffer = Buffer.allocUnsafe(6)
          // buffer.writeUInt32BE(id, 0)
          buffer.writeUIntBE(id, 0, 6)
          console.log(json, typeof id, id, buffer)
          const { area, dbNr, start, amount, wordLen } = TAG
          const done = await plc.write(area, dbNr, start, amount, wordLen, buffer)
          sendJson(res, { id, written: done })
        })
    })
    app.ws(PATH + '/info', { open: ws => ws.subscribe('api/kiosk/info') })
    // PLC
    const plc = new Plc(process.env.PLC_IP, process.env.PLC_RACK, process.env.PLC_SLOT, process.env.PLC_TIME)
    plc.run()
    plc.on('pub', ({ channel, data }) => app.publish(channel, data))
  } catch (err) {
    logger.error(new Error(err))
    process.exit(1)
  }
}

main()
