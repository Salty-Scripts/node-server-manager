const dgram             = require('dgram');
const path              = require('path')
const commandPrefixes   = require('./RconCommandPrefixes')
const Utils             = new (require(path.join(__dirname, '../Utils/Utils.js')))()
const wait              = require('delay')

class Rcon {
    constructor (ip, port, password) {
      this.ip = ip
      this.port = port
      this.password = password
      this.commandPrefixes = commandPrefixes
      this.isRunning = true
      this.commandRetries = 3
      this.previousClients = []
      this.client = dgram.createSocket('udp4')
    }
    async sendCommand(command) {
        return new Promise(async (resolve, reject) => {
            var client =  dgram.createSocket('udp4')
            var message = new Buffer.from(command, 'binary')
        try {
            client.on('listening', async () => {
                client.send(message, 0, message.length, this.port, this.ip, async (err) => {
                    if (err) {
                        client.close()
                        resolved = true
                        resolve(false)
                    }
                })
            })
        }
        catch (e) {
            console.log(`Error sending udp packet: ${e.toString()}`)
            resolve(false)
        }

        client.bind()

        var resolved = false;
        var onMessage = (msg) => {
            client.removeAllListeners()
            client.close()
            resolved = true
            resolve(msg.toString())
        }

        client.on('message', onMessage);

        setTimeout(() => {
            if (!resolved) {
                    client.removeAllListeners()
                    client.close()
                    resolve(false)
                }
            }, 3000)
        })
    }
    async executeCommandAsync(command) {
        return new Promise(async (resolve, reject) => {
            var client =  dgram.createSocket('udp4')
            var message = new Buffer.from(this.commandPrefixes.Rcon.prefix
                                        .replace('%PASSWORD%', this.password)
                                        .replace('%COMMAND%', command), 'binary')
        try {
            client.on('listening', async () => {
                client.send(message, 0, message.length, this.port, this.ip, async (err) => {
                    if (err) {
                        client.close()
                        resolved = true
                        resolve(false)
                    }
                })
            })
        }
        catch (e) {
            console.log(`Error sending udp packet: ${e.toString()}`)
            resolve(false)
        }

        client.bind()

        var resolved = false;
        var onMessage = (msg) => {
            client.close()
            client.removeAllListeners()
            resolved = true
            resolve(msg.toString())
        }

        client.on('message', onMessage);

        setTimeout(() => {
            if (!resolved) {
                    client.close()
                    client.removeAllListeners()
                    resolve(false)
                }
            }, 5000)
        })
    }
    async setDvar(dvarName, value) {
        await this.executeCommandAsync(this.commandPrefixes.Rcon.setDvar.replace('%DVAR%', dvarName).replace('%VALUE%', value))
    }
    async getDvar(dvarName) {
        for (var i = 0; i < 3; i++) {
            var dvar = await this.executeCommandAsync(this.commandPrefixes.Rcon.getDvar.replace('%DVAR%', dvarName))
            if (!dvar || !dvar.match(/"(.*?)"/g)) continue
            return dvar.match(/"(.*?)"/g)[0].slice(1, -1)
        }
        return false
    }
    async getStatus() {
        try {
            var status = await this.executeCommandAsync(this.commandPrefixes.Rcon.status)

            if (!status) return false
            status = status.split('\n').slice(1, -1)

            if (status[0].includes('invalid')) return false

            var map = status[0].split(/\s+/g)[1]
            var rawClients = status.slice(3)
            var clients = []
            var gamename = await this.getDvar('gamename')

            rawClients.forEach(client => {
                var regex = /^ *([0-9]+) +-?([0-9]+) +-?([0-9]+) +-?([0-9]+) +((?:[A-Za-z0-9]){8,32}|(?:[A-Za-z0-9]){8,32}|bot[0-9]+|(?:[[A-Za-z0-9]+)) *(.{0,32}) +([0-9]+) +(\d+\.\d+\.\d+.\d+\:-*\d{1,5}|0+.0+:-*\d{1,5}|loopback|unknown|bot) +(-*[0-9]+) +([0-9]+) *$/g
                
                if (!client.match(regex)) return
                var match = regex.exec(client)

                for (var i = 0; i < match.length; i++) {
                    match[i] = match[i].trim()
                }

                clients.push({
                    num: match[1],
                    score: match[2],
                    bot: match[3],
                    ping: match[4],
                    guid: Utils.convertGuid(match[5], gamename),
                    name: match[6].replace(new RegExp(/\^([0-9]|\:|\;)/g, 'g'), ``),
                    lastmgs: match[7],
                    address: match[8],
                    qport: match[9],
                    rate: match[10]
                })
            })
        }
        catch (e) {
            return false
        }

        return {success: true, data : { map, clients }}
    }
    async getClients() {
        var status = await this.executeCommandAsync(this.commandPrefixes.Rcon.status);
        if (!status) return this.previousClients
        status = status.trim().split('\n').slice(4).map(x => x.trim().split(/\s+/));
        var clients = new Array(18).fill(null)
        for (var i = 0; i < status.length; i++) {
            var client = {
                Clientslot: status[i][0],
                Name: status[i][5],
                Guid: status[i][4],
                IPAddress: status[i][7]
            }
            clients[client.Clientslot] = client
        }
        this.previousClients = clients
        return clients;
    }
    async getClientByGuid(guid) {
        var clients = (await this.getStatus()).data.clients;
        for (var i = 0; i < clients.length; i++) {
            if (clients[i].guid == guid) {
                return clients[i]
            }
        } 
    }
}
module.exports = Rcon