const EventEmitter = require('events')

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
        this.IPAddress = IPAddress
        this.Clientslot = Clientslot
        this.Server = Server
        this.Server.Clients[Clientslot] = this
      }
      delete() {
        this.removeAllListeners()
      }
      async build() {
        await this.Server.DB.addClient(this.Guid)
        this.ClientId = await this.Server.DB.getClientId(this.Guid)
        await this.Server.DB.initializeStats(this.ClientId)
        this.PermissionLevel = await this.Server.DB.getClientLevel(this.ClientId)
        this.Server.DB.logConnection(this)
      }
      Ban (Reason, Origin) {
        this.Server.DB.addPenalty({
          TargetId: this.ClientId,
          OriginId: Origin,
          PenaltyType: 'PENALTY_PERMA_BAN',
          Duration: 0,
          Reason: Reason
        })
        this.Kick(`You have been permanently banned for: ^5${Reason}`, Origin)
      }
      Tempban (Reason, Origin, Duration) {
        this.Server.DB.addPenalty({
          TargetId: this.ClientId,
          OriginId: Origin,
          PenaltyType: 'PENALTY_TEMP_BAN',
          Duration: Duration,
          Reason: Reason
        })
        this.Kick(`You have been banned for: ^5${Reason} ${secondsToDhms(Duration)}^7 left`, Origin)
      }
      Tell (text) {
        this.Server.Rcon.executeCommandAsync(`tell ${this.Clientslot} ${text}`)
      }
      Kick (Message, Origin) {
        this.Server.DB.addPenalty({
          TargetId: this.ClientId,
          OriginId: Origin,
          PenaltyType: 'PENALTY_KICK',
          Duration: 0,
          Reason: Message
        })
        this.Server.Rcon.executeCommandAsync(`clientkick ${this.Clientslot} "You were kicked: ^5${Message}"`)
  } 
}
module.exports = ePlayer