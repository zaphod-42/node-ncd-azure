const SerialPort = require('serialport');

const http = require('http');
const qs = require('querystring');

const fs = require('fs');

const util = require("util");

var hostname = '127.0.0.1';
var port = 3000;

var readings = {};

function init_device(addr){
	return new Promise(function(fulfill, reject){
		if(typeof readings[addr] == 'undefined'){
			readings[addr] = {};
			var port = new SerialPort(addr, {
			  baudRate: 115200
			});
			port.open(function(err){
			  if (err) {
				  console.log(err);
				reject(err);
			  }
			});
			var temp = [];
			port.on('data', function(data){
				console.log(data);
				var ti = temp.length;
				for(var b=0; b<data.length; b++) temp[ti+b] = data[b];
				if(validate_s3bpacket(temp)){
					var packet = process_packet(temp);
					readings[addr][packet.addr]=packet.data;
					temp = [];
				}else{
					if(temp.length > 255) temp = [];
				}
			});
		}
		fulfill(readings[addr]);
	})

}
function msbLsb(m,l){return (m<<8)+l;}
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
		timeStamp: 0,
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

var devices = {
	list: function(req){
		return new Promise(function (fulfill, reject){
			SerialPort.list().then((available) => {
				var devices = [];
				for(var i=0;i<available.length;i++){
					if(available[i].manufacturer == "FTDI"){
						devices.push(available[i].comName);
					}
				}
				if(!devices.length){
					reject('No Devices Found');
				}else{
					var content = "<ul>";
					for(var i=0;i<devices.length;i++){
						content += '<li><a href="/devices/show?port='+devices[i]+'">'+devices[i]+'</a></li>';
					}
					content += '</ul>';
					fulfill(content);
				}
			});
		  });
	},
	show: function(req, res){
		return new Promise(function(fulfill, reject) {
			var formData = qs.parse(req.url.split('?')[1]);
			console.log(formData);
			init_device(formData.port).then(function(data){
				fulfill('<pre>'+util.inspect(data)+'</pre>');
			}).catch(function(err){
				reject(err);
			});
		});
	}
}

var server = http.createServer((req, res) => {
	var script = '<script type="text/javascript">req_dump='+util.inspect(req)+'</script>';
	if(req.url == "/"){
		res.statusCode = 200;
	    res.setHeader('Content-Type', 'text/html');
	    res.end('<a href="/devices/list">List Connected Devices</a>');
	}else if(fs.existsSync("assets"+req.url)){

	}else{
		var parts = req.url.split('?')[0].substring(1).split('/');
		if(parts[0] == 'devices'){
			var func = parts[1];
			if(typeof devices[func] == 'function'){
				devices[func](req, res).then(function(result){
					res.statusCode = 200;
				    res.setHeader('Content-Type', 'text/html');
					res.end(result);
				}).catch(function(err){
					res.statusCode = 500;
				    res.setHeader('Content-Type', 'text/html');
					res.end(err);
				});
			}else{
				res.statusCode = 404;
			    res.setHeader('Content-Type', 'text/html');
				res.end("Page not found");
			}
		}else{
			res.statusCode = 404;
		    res.setHeader('Content-Type', 'text/html');
			res.end("Page not found");
		}
	}
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
