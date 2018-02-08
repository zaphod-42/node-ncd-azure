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
			readings[addr] = [];
			var port = new SerialPort(addr, {
			  baudRate: 115200
			});
			port.open(function(err){
			  if (err) {
				reject(err);
			  }
			});
			var temp = [];
			port.on('data', function(data){
				readings[addr].push(data);
				var ti = temp.length;
				for(var b=0; b<data.length; b++) temp[ti+b] = data[b];
				if(temp.length > 20 && confirm_checksum(temp)){
					//process packet!
					temp = [];
				}else{
					if(temp.length > 255) temp = [];
				}
			});
		}
		fulfill(readings[addr]);
	})

}
function process_packet(pckt){
	var ret = {};
	ret.addr = pckt[4].toString(16)+pckt.slice(5, 11).reduce((h,i) => {h+=':'+i.toString(16);});
}

function confirm_checksum(pckt){
	return (255 - (pckt.slice(3,-1).reduce((t, n) => {return t+n;}) & 255)) == pckt[pckt.length-1];
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
				fulfill(util.inspect(data));
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

// SerialPort.list().then(function(available){
// 	if(available.length > 0){
// 		var hostname = '127.0.0.1';
// 		var port = 3000;
// 		var content = 'Available Devices:<ol>';
// 		for(var i=0;i<available.length;i++){
// 			if(available[i].manufacturer == "FTDI"){
// 				content+='<li>'+available[i].comName+'</li>';
// 			}
// 		}
// 		content += '</ol>';
//
//
//
// 	}
// });
