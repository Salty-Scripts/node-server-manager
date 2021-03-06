const ePlayer           = require('./ePlayer.js')
const path              = require('path')
const Commands          = require(path.join(__dirname, `../Commands.js`))
const EventEmitter      = require('events')
const ip                = require('public-ip')
const Maps              = require(path.join(__dirname, `../../Configuration/Localization-${process.env.LOCALE}.json`)).Maps
const Permissions       = require(path.join(__dirname, `../../Configuration/NSMConfiguration.json`)).Permissions
const { ChaiscriptApi } = require('../ChaiscriptApi.js')
const wait              = require('delay')

var wasRunning = true
class Server extends EventEmitter {
    constructor(IP, PORT, RCON, DATABASE, sessionStore, clientData, Managers, Id, Manager, config) {
        super()
        this.Clients = new Array(18).fill(null)
        this.Rcon = RCON
        this.IP = IP
        this.Id = Id
        this.PORT = PORT
        this.clientHistory = []
        this.clientActivity = []
        this.DB = DATABASE
        this.MaxClients = 18
        this.Mapname = null
        this.clientData = clientData
        this.Gametype = 'UNKNOWN'
        this.HostnameRaw = `[${this.IP}:${this.PORT}]`
        this.uptime = 0
        this.Gamename = 'UNKNOWN'
        this.Managers = Managers
        this.Manager = Manager
        this.previousUptime = 0
        this.previousStatus = null
        this.setMaxListeners(18)
        this.Heartbeat()
        this.heartbeatRetry = 2
        this.sessionStore = sessionStore
        this.on('init', this.onInitGame.bind(this))
        this.config = config
        this.reservedSlots = config.reservedSlots
        this.chai = new ChaiscriptApi(this)
        Manager.Commands = new Commands()
    }
    getMap(name) {
      return this.Maps.find(Map => Map.Name.toLocaleLowerCase().startsWith(name) || Map.Alias.toLocaleLowerCase().startsWith(name) )
    }
    getClients() {
        return this.Clients.filter(c => c)
    }
    getMapname() {
        var map = this.getMap(this.Mapname)
        return map ? map : this.Mapname
    }
    onInitGame() {
        var onLine = async () => {
            this.Mapname = await this.Rcon.getDvar('mapname')
            this.Gametype = await this.Rcon.getDvar('g_gametype')
            this.emit('map_loaded', this.Mapname, this.Gametype)
            this.removeListener('line', onLine)
        }
        this.on('line', onLine)
    }
    findLocalClient(name) {
        var clientIdRegex = /\@([0-9]+)/g
        var found = false

        name = name.match(clientIdRegex) ? clientIdRegex.exec(name)[1] : name

        this.Clients.forEach(Client => {
            if (!Client) return

            if (Client.Name.toLocaleLowerCase() == name || Client.ClientId == name) {
                found = Client
            }
        })
        return found
    }
    getStaffMembers() {
        var staff = []
        this.Clients.forEach(Client => {
            if (!Client) return
            Client.PermissionLevel >= Permissions.Levels['ROLE_MODERATOR'] && staff.push(Client)
        })
        staff.sort((a, b) => {
            return b.PermissionLevel - a.PermissionLevel
        })
        return staff
    }
    async setDvarsAsync() {
        try {
            this.Gametype = await this.Rcon.getDvar(this.Rcon.commandPrefixes.Dvars.gametype)
            await wait(200)
            this.Gamename = await this.Rcon.getDvar(this.Rcon.commandPrefixes.Dvars.gamename)
            await wait(200)

            this.Maps = this.Gamename != 'UNKNOWN' ? Maps.find(x => x.Game == this.Gamename).Maps : []
            this.mapRotation = (await this.Rcon.getDvar(this.Rcon.commandPrefixes.Dvars.maprotation)).match(/((?:gametype|exec) +(?:([a-z]{1,4})(?:.cfg)?))? *map ([a-z|_|\d]+)/gi).map(x => x.trim().split(/\s+/g)[1])
            await wait(200)

            this.Hostname = await this.Rcon.getDvar(this.Rcon.commandPrefixes.Dvars.hostname)
            this.HostnameRaw = this.Hostname
            await wait(200)

            this.Mapname = await this.Rcon.getDvar(this.Rcon.commandPrefixes.Dvars.mapname)
            await wait(200)
            this.MaxClients = this.config.maxClientsOverride ? this.config.maxClientsOverride : await this.Rcon.getDvar(this.Rcon.commandPrefixes.Dvars.maxclients)

            this.externalIP = !this.IP.match(/(^127\.)|(localhost)|(^192\.168\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^::1$)|(^[fF][cCdD])/g) ? this.IP : await ip.v4()
            this.emit('dvars_loaded')

            this.HeartbeatInt = setInterval(this.Heartbeat.bind(this), 15000)
        }
        catch (e) { }
    }
    tellStaffGlobal(Message) {
        this.Managers.forEach(Manager => {
            Manager.Server.tellStaff(Message)
        })
    }
    tellStaff(Message) {
        this.Clients.filter(x => x && x.PermissionLevel >= Permissions.Levels['ROLE_MODERATOR'] && x.Tell(Message))
    }
    async getClient(name) {
        var clientIdRegex = /\@([0-9]+)/g

        if (!name.match(/\@([0-9]+)/g) && this.findClientByName(name)) {
            return this.findClientByName(name)
        }
        
        var Clients = name.match(clientIdRegex) 
            ? [await this.DB.getClient(clientIdRegex.exec(name)[1])] 
            : ((name.length >= 3 && !name.match('%')) ? (await this.DB.getClientByName(name, 20)) : false)
        
        var Client = Clients ? Clients.reverse()[0] : false
        return Client 
    }
    toString() {
        return `${this.IP}:${this.PORT}`
    }
    getAddress() {
        return `${this.externalIP}:${this.PORT}`
    }
    getPlayerByName(Name) {
        var Client = this.Clients.find(x => x && x.Name.startsWith(Name))
        return Client
    }
    findClientByName(Name) {
        var Client = null
        this.Managers.forEach(Manager => {
            if (Client) return
            Client = Manager.Server.Clients.find(x => x && x.Name.toLocaleLowerCase().startsWith(Name.toLocaleLowerCase()))
        })
        return Client
    }
    findClient(ClientId) {
        var Client = null
        this.Managers.forEach(Manager => {
            if (Client) return
            Client = Manager.Server.Clients.find(x => x && x.ClientId == ClientId)
        })
        return Client
    }
    async Heartbeat() {
        try {
            var status = await this.Rcon.sendCommand('pingreq')

            if (!status) {
                if (this.heartbeatRetry <= 0) {
                    this.Rcon.isRunning = false
                    wasRunning && this.Manager.log(`^1Connection lost with ^6[${this.toString()}]^7`)
                    wasRunning = false
                }
                this.heartbeatRetry > 0 && this.heartbeatRetry--
            } else this.heartbeatRetry = 2
            
            if (!this.Rcon.isRunning && status != false) {
                this.heartbeatRetry = 1
                this.Rcon.isRunning = true
                wasRunning = true
                this.Manager.log(`^1Connection re-established with ^6[${this.toString()}]^7`)
                setTimeout( async () => {
                    await this.loadClientsAsync()
                    this.emit('reload')
                }, 10000)
            }
        }
        catch (e) {}
    }
    async loadClientsAsync() {
        var status = await this.Rcon.getStatus()

        if (!status) return

        for (var i = 0; i < this.Clients.length; i++) {
            if (!this.Clients[i]) continue
            this.Clients[i].removeAllListeners()
            this.Clients[i] = null
        }

        status.data.clients.forEach(async c => {
            if (this.Clients[c.num]) this.Clients[c.num].removeAllListeners()
            this.Clients[c.num] = new ePlayer(c.guid, c.name, c.num, c.address, this)
            await this.Clients[c.num].build()
            this.emit('connect', this.Clients[c.num])
            this.emit('any_event', {type: 'join', Origin: this.Clients[c.num]})
        })
    }
    globalBroadcast(Message) {
        this.Managers.forEach(Manager => {
            Manager.Server.Broadcast(Message)
        })
    }
    Broadcast (string) {
        this.Rcon.executeCommandAsync(this.Rcon.commandPrefixes.Rcon.Say.replace('%MESSAGE%', string))
    }
  }
module.exports = Server