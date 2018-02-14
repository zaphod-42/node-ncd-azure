const SensorService = require("./includes/sensors.js");
const http = require('http');
const dbConn = require('./includes/db.js');
const db = new dbConn('./sql.db');
const server = require('./includes/server.js');

SensorService.init(db);
server.setDB(db);

SensorService.events.on('sensor_data', function(gid, data){
		server.events.emit('new_data', gid, data);
});

process.on('unhandledRejection', r => console.log(r));
