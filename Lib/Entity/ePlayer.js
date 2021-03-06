const EventEmitter          = require('events')
const path                  = require('path')
const { Commands, NodeServerManager } = require(path.join(__dirname, '../Classes.js'))
const { ChaiPlayer }            = require('../ChaiscriptApi.js')

function secondsToDhms (seconds) {
  seconds = Number(seconds);
  var d = Math.floor(seconds / (3600*24));
  var h = Math.floor(seconds % (3600*24) / 3600);
  var m = Math.floor(seconds % 3600 / 60);
  var s = Math.floor(seconds % 60);
  
  var dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
  var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
  var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
  var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
  return dDisplay + hDisplay + mDisplay + sDisplay;
}

class ePlayer extends EventEmitter {
    constructor (Guid, Name, Clientslot, IPAddress, Server) {
        super()
        this.Guid = Guid
        this.Name = Name
        this.chai = new ChaiPlayer(Server, Clientslot)
        this.inGame = true
        this.lastSeen = new Date()
        this.IPAddress = IPAddress
        this.Clientslot = Clientslot
        this.Server = Server
        this.Server.Clients[Clientslot] = this
      }
      delete() {
        this.removeAllListeners()
      }
      async build() {
        this.ClientId = await this.Server.DB.addClient(this.Guid)
        await this.Server.DB.initializeStats(this.ClientId)

        this.PermissionLevel = await this.Server.DB.getClientLevel(this.ClientId)
        this.Server.DB.logConnection(this)

        this.Data = this.Server.clientData.getData(this.ClientId)
        this.IPAddress.split(':')[0] && (this.Session = this.Server.sessionStore.createSession(this.IPAddress.split(':')[0]))
        this.Session && (this.Session.Data.Authorized = this.Session.Data.Authorized != undefined ? this.Session.Data.Authorized : false)
      }
      Ban (Reason, Origin) {
        this.Server.DB.addPenalty({
          TargetId: this.ClientId,
          OriginId: Origin.ClientId,
          PenaltyType: 'PENALTY_PERMA_BAN',
          Duration: 0,
          Reason: Reason
        })
        this.Server.emit('penalty', 'PENALTY_PERMA_BAN', this, Reason, Origin)
        this.Kick(`You have been permanently banned for: ^5${Reason}`, Origin, false, '')
      }
      Tempban (Reason, Origin, Duration) {
        this.Server.DB.addPenalty({
          TargetId: this.ClientId,
          OriginId: Origin.ClientId,
          PenaltyType: 'PENALTY_TEMP_BAN',
          Duration: Duration,
          Reason: Reason
        })
        this.Server.emit('penalty', 'PENALTY_TEMP_BAN', this, Reason, Origin, Duration)
        this.Kick(`You have been banned for: ^5${Reason} ${secondsToDhms(Duration)}^7 left`, Origin, false, '')
      }
      Tell (text) {
        if (!text) return
        this.Server.Rcon.executeCommandAsync(this.Server.Rcon.commandPrefixes.Rcon.Tell
                                            .replace('%CLIENT%', this.Clientslot)
                                            .replace('%MESSAGE%', text))
      }
      Kick (Message, Origin = NodeServerManager, Log = true, Basemsg = 'You have been kicked: ^5') {
        this.Server.DB.addPenalty({
          TargetId: this.ClientId,
          OriginId: Origin.ClientId,
          PenaltyType: 'PENALTY_KICK',
          Duration: 0,
          Reason: Message
        })
        Log && this.Server.emit('penalty', 'PENALTY_KICK', this, Message, Origin)
        this.Server.Rcon.executeCommandAsync(this.Server.Rcon.commandPrefixes.Rcon.clientKick
                                            .replace('%CLIENT%', this.Clientslot)
                                            .replace('%REASON%', `${Basemsg}${Message}`))
  } 
}
module.exports = ePlayer