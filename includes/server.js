const express = require('express');
const WebSocket = require('ws');
const EventEmitter = require('events');
const server = require('http').createServer();
const app = express();
const bodyParser = require('body-parser');
const url = require('url');

const fs = require('fs');

class ServerEmmiter extends EventEmitter {}

app.use(express.static('./assets'));
app.use(bodyParser.json());

exports.events = new ServerEmmiter();

var db;

exports.setDB = function(_db){
	db = _db;
}

app.get('/', function(req, res) {
	db.query('SELECT * FROM gateways').fetch_all().then((gtwys) => {
		var output = '<ul>';
		gtwys.forEach((gw) => {
			var name = (gw.name == null ? 'No Name' : gw.name)+` (${gw.port})`;
			output+='<li><a href="/gateways/'+gw.gid+'">'+name+'</a></li>';
		});
		output+='</ul>';
		res.send(output);
	}).catch(console.log);
  // console.log('Get index');
  // fs.createReadStream('./app/index.html')
  // .pipe(res);
});
app.get('/gateways/:gw_id', function(req, res) {
	db.query('SELECT * FROM sensor_data AS t1 WHERE t1.created = (SELECT MAX(created) FROM sensor_data AS t2 WHERE t1.gid = t2.gid AND t1.nid=t2.nid)').fetch_all().then((rows) => {
		console.log(rows);
	}).catch(console.log);
	console.log('Get index');
    fs.createReadStream('./app/index.html')
    .pipe(res);
});

const wss = new WebSocket.Server({server});

server.on('request', app);

wss.on('connection', (ws, req) => {
	console.log(req.url);
	var parts = req.url.split('/');

	ws.listen_for = false;
	if(parts[1] == 'gateways'){
		if(parts.length == 3) ws.listen_for = {type: 'gateway', gateway: parts[2]};
		else if(parts[3] == 'node'){
			ws.listen_for = {type: 'sensor', gateway: parts[2], node: parts[4]};
		}
	}
	ws.on('error', function (err) {
	    if (err.code !== 'ECONNRESET') {
	        // Ignore ECONNRESET and re throw anything else
	        throw err
	    }
	});
	ws.req = req;
});

exports.events.on('new_data', (gateway, data) => {
	console.log('broadcasting...');
	wss.clients.forEach((client) => {
		if(client.listen_for){
			switch(client.listen_for.type){
				case 'gateway':
					if(client.listen_for.gateway == gateway){
						client.send(JSON.stringify([data]));
					}
					break;
				case 'sensor':
					if(client.listen_for.gateway == gateway && client.listen_for.node == data.data.nodeID){
						client.send(JSON.stringify([data]));
					}
					break;
			}
		}
	})
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Server running');
});
