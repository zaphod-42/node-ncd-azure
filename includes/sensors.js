const dbConn = require('./db.js');
//const db = new dbConn(':memory:');
const SerialPort = require('serialport');
const EventEmitter = require('events');

class SensorEmmiter extends EventEmitter {}


exports.events = new SensorEmmiter();
var gateways = {};
var gids = {};
var db;

function ensure_table(name, fields){
	return new Promise((fulfill, reject) => {
		db.query('SELECT * FROM sqlite_master WHERE type=? AND name=?', ['table', name]).fetch().then((table) => {
			if(!table) db.query(name, fields).create().then(fulfill).catch(reject);
			else fulfill();
		}).catch(reject);
	});
}

function init_gateways(devices){
	return new Promise((fulfill, reject) => {
		db.query('gateways', devices).insert(true).then(() => {
			db.query('SELECT * FROM gateways').fetch_all().then((gtwys) => {
				gtwys.forEach((g) => {
					g.sensors = {};
					gateways[g.port] = g;
					gids[g.gid] = g.port;
				});
				db.query('SELECT * FROM sensors').fetch_all().then((existing) => {
					existing.forEach((s) => {
						if(typeof gateways[gids[s.gid]] != undefined){
							gateways[gids[s.gid]].sensors[s.nid] = s;
						}
					});
					fulfill(devices);
				}).catch(reject);
			}).catch((err) => {
				reject('Cannot load gateways');
			});
		}).catch((err) => reject(['cannot insert gateways', err]));
	});
}

function add_sensor(addr, packet){
	var data = {gid: gateways[addr].gid, nid: packet.data.nodeID, addr: packet.addr, type: packet.data.sensorType};
	db.query('sensors', data).insert().then().catch(console.log);
	gateways[addr].sensors[packet.data.nodeID]=data;
}

function init_sensors(devices){
	devices.forEach(async (device) => {
		var addr = device.port;
		var port = new SerialPort(addr, {
		  baudRate: 9600
		});
		port.open(function(err){
			if(err) {
				//console.log(err);
			}
		});
		var gateway = gateways[addr];
		var temp = [];
		console.log('add data handler');
		port.on('data', function(data){
			var ti = temp.length;
			for(var b=0; b<data.length; b++) temp[ti+b] = data[b];
			if(validate_s3bpacket(temp)){
				var packet = process_packet(temp);
				// console.log(packet);
				readings=packet.data;
				temp = [];
			}else{
				readings = false;
				if(temp.length > 255) temp = [];
			}
			if(readings){
				if(typeof gateways[addr][packet.data.nodeID] == 'undefined'){
					add_sensor(addr, packet);
				}
				db.query('sensor_data', {nid: packet.data.nodeID, gid: gateway.gid, data: JSON.stringify(readings)}).insert().then(() => {
					exports.events.emit('sensor_data', gateway.gid, packet)
				}).catch((err) => console.log(err));
			}
		});
	});
}

function validate_s3bpacket(pckt){
	if(pckt[0] != 126) return false;
	if((pckt.length-4) != msbLsb(pckt[1], pckt[2])) return false;
	return (255 - (pckt.slice(3,-1).reduce((t, n) => {return t+n;}) & 255)) == pckt[pckt.length-1];
}

function process_packet(pckt){
	var ret = {};
	pckt[4] = pckt[4].toHex();
	ret.addr = pckt.slice(4, 11).reduce((h,i) => {return h+=':'+i.toHex();});
	ret.data = process_sensor_payload(pckt.slice(15, -1));
	return ret;
}

function process_sensor_payload(payload){
	//header, nodeID, firmware, battMSB, battLSB, transCount, typeMSB, typeLSB,
	var sensor = {
		nodeID: payload[1],
		timeStamp: getDateTime(),
		firmware: payload[2],
		battery: msbLsb(payload[3], payload[4]) * 0.0032,
		sensorType: msbLsb(payload[6], payload[7]),
		transmission_id: payload[5]
	};
	return add_sensor_data(sensor, payload);
}

function add_sensor_data(sensor, payload){
	switch(sensor.sensorType){
		case 1:
			sensor.humidity = msbLsb(payload[9], payload[10])/100;
		case 4:
			sensor.temperature = (msbLsb(payload[11], payload[12])/100)*1.8+32;
			break;
		case 2:
			sensor.input_1 = payload[9];
			sensor.input_2 = payload[10];
			break;
		case 3:
			sensor.input_1 = msbLsb(payload[9], payload[10]);
			sensor.input_2 = msbLsb(payload[11], payload[12]);
			break;
		case 10006:
			sensor.channel_1 = msbLsb(payload[9], payload[10])/100;
			sensor.channel_2 = msbLsb(payload[11], payload[12])/100;
			sensor.channel_3 = msbLsb(payload[13], payload[14])/100;
			sensor.channel_4 = msbLsb(payload[15], payload[16])/100;
			break;
		case 10007:
			sensor.channel_1 = (((payload[9] * 65536.00) + (payload[10] * 256.00) + payload[11])/1000.00);
			sensor.channel_2 = (((payload[12] * 65536.00) + (payload[13] * 256.00) + payload[14])/1000.00);
			sensor.channel_3 = (((payload[15] * 65536.00) + (payload[16] * 256.00) + payload[17])/1000.00);
			sensor.channel_4 = (((payload[18] * 65536.00) + (payload[19] * 256.00) + payload[20])/1000.00);
			break;
		case 10012:
			//relay controller


	}
	return sensor;
}

Number.prototype.toHex = function(){
	return ("00" + this.toString(16)).substr(-2);
}

function msbLsb(m,l){return (m<<8)+l;}
function getDateTime() {

    var date = new Date();

    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;

    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;

    var year = date.getFullYear();

    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;

    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;

    return year + ":" + month + ":" + day + ":" + hour + ":" + min + ":" + sec;

}
// db.query('DROP TABLE IF EXISTS gateways').process().then(() => {
// 	db.query('DROP TABLE IF EXISTS sensors').process().then(() =>{
// 		db.query('DROP TABLE IF EXISTS sensor_data').process().then().catch();
// 	}).catch();
// }).catch();
exports.init = function(_db){
	db = _db;
	Promise.all([
		ensure_table('gateways', ['gid INTEGER PRIMARY KEY', 'name TEXT', 'port TEXT UNIQUE']),
		ensure_table('sensors', ['nid INTEGER NOT NULL', 'gid INTEGER NOT NULL', 'addr TEXT NOT NULL', 'type INTEGER', 'name TEXT']),
		ensure_table('sensor_data', ['nid INTEGER NOT NULL', 'gid INTEGER NOT NULL', 'data TEXT', 'created DATETIME DEFAULT CURRENT_TIMESTAMP']),
	]).then(() => {
		SerialPort.list().then((available) => {
			var devices = available.filter((port) => port.manufacturer == "FTDI").map((v) => ({port: v.comName}));
			if(devices.length){
				init_gateways(devices).then(init_sensors).catch(console.log);
			}
		}).catch(console.log);
	}).catch(console.log);
}
