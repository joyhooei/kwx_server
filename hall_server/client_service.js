
var crypto = require('../utils/crypto');
var express = require('express');
var db = require('../utils/db');
var http = require('../utils/http');
var room_service = require("./room_service");

var app = express();
var config = null;

function check_account(req, res) {
	var account = req.query.account;
	var sign = req.query.sign;
	if (null == account || null == sign) {
		http.send(res,1, "unknown err.");
		return false;
	}

	/*
	var serverSign = crypto.md5(account + req.ip + config.ACCOUNT_PRI_KEY);
	if(serverSign != sign){
		http.send(res,2,"login failed.");
		return false;
	}
	*/

	return true;
}

app.all('*', function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
	res.header("X-Powered-By",' 3.2.1');
	res.header("Content-Type", "application/json;charset=utf-8");
	next();
});

app.get('/login', function(req, res) {
	if (!check_account(req, res)) {
		return;
	}

	var ip = req.ip;
	if (ip.indexOf("::ffff:") != -1) {
		ip = ip.substr(7);
	}

	var account = req.query.account;
	db.get_user_data(account, function(data) {
		if (null == data) {
			http.send(res, 0, "ok");
			return;
		}

		var ret = {
			account: data.account,
			userid: data.userid,
			name: data.name,
			lv: data.lv,
			exp: data.exp,
			coins: data.coins,
			gems: data.gems,
			ip: ip,
			sex: data.sex,
		};

		db.get_room_id_of_user(data.userid, function(roomId) {
			if (roomId != null) {
				db.is_room_exist(roomId, function(retval) {
					if (retval) {
						ret.roomid = roomId;
					} else {
						db.set_room_id_of_user(data.userid, null);
					}

					http.send(res, 0, "ok", ret);
				});
			} else {
				http.send(res, 0, "ok", ret);
			}
		});
	});
});

app.get('/create_user', function(req, res) {
	if (!check_account(req, res)) {
		return;
	}

	var account = req.query.account;
	var name = req.query.name;
	var coins = 1000; // TODO
	var gems = 21;

	console.log(name);

	db.is_user_exist(account, function(ret) {
		if (!ret) {
			db.create_user(account, name, coins, gems, 0, null, function(ret) {
				if (null == ret) {
					http.send(res, 2, "system error.");
				} else {
					http.send(res, 0, "ok");
				}
			});
		} else {
			http.send(res, 1, "account have already exist.");
		}
	});
});

app.get('/create_private_room', function(req, res) {
	var data = req.query;
	if (!check_account(req, res)) {
		return;
	}

	var account = data.account;

	data.account = null;
	data.sign = null;
	var conf = data.conf;
	db.get_user_data(account, function(data) {
		if (null == data) {
			http.send(res, 1, "system error");
			return;
		}

		var userId = data.userid;
		var name = data.name;

		db.get_room_id_of_user(userId, function(roomId) {
			if (roomId != null) {
				http.send(res, -1, "user is playing in room now.");
				return;
			}

			room_service.createRoom(account, userId, conf, function(err, roomId) {
				if (err == 0 && roomId != null) {
					room_service.enterRoom(userId, name, roomId, function(errcode, enterInfo) {
						if (enterInfo) {
							var ret = {
								roomid: roomId,
								ip: enterInfo.ip,
								port: enterInfo.port,
								token: enterInfo.token,
								time: Date.now()
							};

							ret.sign = crypto.md5(ret.roomid + ret.token + ret.time + config.ROOM_PRI_KEY);
							http.send(res, 0, "ok", ret);
						} else {
							http.send(res, errcode, "room doesn't exist.");
						}
					});
				} else {
					http.send(res, err, "create failed.");
				}
			});
		});
	});
});

app.get('/enter_private_room', function(req, res) {
	var data = req.query;
	var roomId = data.roomid;
	if (null == roomId) {
		http.send(res, -1, "parameters don't match api requirements.");
		return;
	}

	if (!check_account(req, res)) {
		return;
	}

	var account = data.account;

	db.get_user_data(account, function(data) {
		if (null == data) {
			http.send(res, -1, "system error");
			return;
		}

		var userId = data.userid;
		var name = data.name;

		// TODO: 验证玩家状态
		room_service.enterRoom(userId, name, roomId, function(errcode, enterInfo) {
			if (enterInfo) {
				var ret = {
					roomid: roomId,
					ip: enterInfo.ip,
					port: enterInfo.port,
					token: enterInfo.token,
					time: Date.now()
				};

				ret.sign = crypto.md5(roomId + ret.token + ret.time + config.ROOM_PRI_KEY);
				http.send(res, 0, "ok", ret);
			} else {
				http.send(res, errcode, "enter room failed.");
			}
		});
	});
});

app.get('/get_history_list', function(req, res) {
	var data = req.query;
	if (!check_account(req, res)) {
		return;
	}

	var account = data.account;
	db.get_user_data(account, function(data) {
		if (null == data) {
			http.send(res, -1, "system error");
			return;
		}

		var userId = data.userid;
		db.get_user_history(userId, function(history) {
			http.send(res, 0, "ok", { history: history });
		});
	});
});

app.get('/get_games_of_room', function(req, res) {
	var data = req.query;
	var uuid = data.uuid;
	if (uuid == null) {
		http.send(res, -1, "bad param");
		return;
	}

	if (!check_account(req, res)) {
		return;
	}

	db.get_games_of_room(uuid, function(data) {
		console.log(data);
		http.send(res, 0, "ok", { data: data });
	});
});

app.get('/get_detail_of_game', function(req, res) {
	var data = req.query;
	var uuid = data.uuid;
	var index = data.index;
	if (uuid == null || index == null) {
		http.send(res, -1, "bad param");
		return;
	}

	if (!check_account(req, res)) {
		return;
	}

	db.get_detail_of_game(uuid, index, function(data) {
		http.send(res, 0, "ok", { data: data });
	});
});

app.get('/get_user_status', function(req, res) {
	if (!check_account(req, res)) {
		return;
	}

	var account = req.query.account;
	db.get_gems(account, function(data) {
		if (data != null) {
			http.send(res, 0, "ok", { gems: data.gems });
		} else {
			http.send(res, 1, "get gems failed.");
		}
	});
});

app.get('/get_bind_info', function(req, res) {
	if (!check_account(req, res)) {
		return;
	}

	var uid = req.query.uid;

	db.get_bind_info(uid, function(data) {
		if (data != null) {
			http.send(res, 0, "ok", { data: data });
		} else {
			http.send(res, 1, "get bind info failed.");
		}
	});
});

app.get('/bind', function(req, res) {
	if (!check_account(req, res)) {
		return;
	}

	var uid = req.query.uid;
	var bid = req.query.bid;

	console.log(uid);
	console.log(bid);
	db.bind(uid, bid, function(data) {
		if (data) {
			http.send(res, 0, "ok");
		} else {
			http.send(res, 1, "bind failed.");
		}
	})
});

app.get('/bind_done', function(req, res) {
	if (!check_account(req, res)) {
                return;
        }

	var uid = req.query.uid;

	db.bind_done(uid, function(data) {
		if (data) {
                        http.send(res, 0, "ok");
                } else {
                        http.send(res, 1, "bind_done failed.");
                }
	});
});

app.get('/get_awards', function(req, res) {
	if (!check_account(req, res)) {
                return;
        }

	var uid = req.query.uid;

	db.get_awards(uid, function(data) {
		if (data) {
                        http.send(res, 0, "ok");
                } else {
                        http.send(res, 1, "get_award failed.");
                }
	});
});

app.get('/get_message', function(req, res) {
	if (!check_account(req, res)) {
		return;
	}

	var type = req.query.type;

	if (type == null) {
		http.send(res, -1, "bad param");
		return;
	}

	var version = req.query.version;
	db.get_message(type, version, function(data) {
		if (data != null) {
			http.send(res, 0, "ok", { msg: data.msg, version: data.version });
		} else {
			http.send(res, 1, "get message failed.");
		}
	});
});

app.get('/is_server_online', function(req, res) {
	if (!check_account(req,res)) {
		return;
	}

	var ip = req.query.ip;
	var port = req.query.port;
	room_service.isServerOnline(ip, port, function(isonline) {
		var ret = {
			isonline: isonline
		};

		http.send(res, 0, "ok", ret);
	});
});

exports.start = function($config){
	config = $config;
	app.listen(config.CLIENT_PORT);
	console.log("client service is listening on port " + config.CLIENT_PORT);
};

