const sqlite = require('sqlite3').verbose();

module.exports = class dbConn{
	constructor(db){
		this.db = db;
	}
	query(q, p){
		return new dbQuery(q,p,this.db);
	}
};

class dbQuery{
	constructor(q, p, db){
		this.q = q;
		this.p = p;
		this.method = 'all';
		this.db_path = db;
		this.retries = 0;
		this._async = false;
	}
	async(){
		this._async = true;
		return this;
	}
	fetch(){
		this.method = 'get';
		return this.process();
	}
	fetch_all(){
		return this.process();
	}
	fetch_col(col){
		var dbq = this;
		return new Promise((fulfill, reject) => {
			dbq.process().then((results) => {
				var cols = [];
				results.forEach((row) => {
					cols.push(row[col]);
				})
				fulfill(cols);
			}).catch((err) => reject(err));
		});
	}
	insert(ignore){
		if(this.p.constructor == Object){
			this.p = [this.p];
		}
		var placeholders = [],
			values = [],
			names = [];
		for(var i=0;i<this.p.length;i++){
			let _placeholders = [];
			for(var j in this.p[i]){
				if(i == 0) names.push(j);
				_placeholders.push('?');
				values.push(this.p[i][j]);
			}
			placeholders.push(_placeholders.join(','));
		}
		var insig = ignore ? "INSERT OR IGNORE" : "INSERT"
		this.q = insig+' INTO '+this.q+'('+names+') VALUES('+placeholders.join(')(')+')';
		this.p = values;
		this.method = 'run';
		//console.log(this.q);
		return this.process();
	}
	run(){
		this.method = run;
		return this.process();
	}
	update(){
	}
	create(){
		this.q = 'CREATE TABLE '+this.q+'('+this.p.join(', ')+')';
		this.p = [];
		this.method = 'run';
		return this.process();
	}
	remove(){
		var values = [],
			placeholders = [];
		for(i in this.p){
			placeholders.push(i+' = ?');
			values = this.p[i];
		}
		this.q = 'DELETE FROM '+this.q+' WHERE '+placeholders.join(' AND ');
		this.p = values;
		this.method = run();
		return this.process();
	}
	process(ae){
		var dbq = this;
		if(this._async && !ae){
			console.log('async_process');
			return this.async_process();
		}
		if(typeof this.p == 'undefined') this.p = [];
		var db = new sqlite.Database(this.db_path);
		return new Promise((fulfill, reject) => {
			db[dbq.method](dbq.q,dbq.p,(err, res) => {
				if(err){
					if(err.code == 'SQLITE_BUSY' && dbq.retries < 5){
						dbq.retries++;
						console.log('sqlite busy, retrying');
						return dbq.process();
					}else{
						console.log([dbq.q, dbq.p, err]);
						db.close();
						reject(err.message);
					}
				}else{
					db.close();
					fulfill(res);
				}
			});
		});
	}
	async async_process(){
		var result = await this.process(true).then((results) => {return results});
		return result;
	}
};
