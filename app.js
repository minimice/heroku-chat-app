//var fs = require('fs');
//var options = {
//  key: fs.readFileSync('keys/privatekey.pem'),
//  cert: fs.readFileSync('keys/certificate.pem')
//};
//var play = require('play');
var express = require('express'),
    app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	mongoose = require('mongoose'),
	thedocument = require("jsdom").jsdom(),
	Autolinker = require( 'autolinker' ),
	users = {},
	typingusers = {};

var port = Number(process.env.PORT || 3001);
server.listen(port, function() {
  console.log("Listening on " + port);
});

// Connect to cloud database
var username = "herokudb-admin"
var password = "herokudb-admin";
var address = '@ds053948.mlab.com:53948/chat';

// 'mongodb://localhost/chat'
var url = 'mongodb://' + username + ':' + password + address;

mongoose.connect(url, function(err) {
    if (err) {
	  console.log(err);
	} else {
	  console.log("Connected to mongodb (cloud)");
	}
});

var chatSchema = mongoose.Schema({
    nick: String,
	msg: String,
	created: {type: Date, default: Date.now}
});

var Chat = mongoose.model('Message', chatSchema);

app.use(express.static(__dirname));

app.get('/', function(req, res) {
    res.sendfile(__dirname + '/index.html');
});

io.sockets.on('connection', function(socket) {
    var query = Chat.find({});
	query.sort('-created').limit(8).exec(function(err, docs) {
	    if (err) {
	      throw err;
	    }
		console.log('Sending old msgs!');
		socket.emit('load old msgs', docs);
    });
	
    socket.on('new user', function(data, callback) {
	    var nick = data.nick;
	    var room = data.room;
	    if (nick in users) {
		    callback(false);
		} else {
		    callback(true);
		    var nickcolor = getRandomColor();		    
		    socket.nickname = nick;
		    socket.room = room;
		    socket.nickcolor = nickcolor;
		    socket.join(room);
			users[socket.nickname] = socket;
			io.sockets.in(room).emit('user connected', {nick: nick, room: room, nickcolor: nickcolor});
			console.log(nick + " joining room '" + room + "'");
			users[socket.nickname].in(room).emit('userid', {nick: nick});
			console.log("Updating nicknames");
			updateNicknames();
		}
	});
		
    socket.on('send message', function(data, callback) {
	    var msg = escapeHtml(data.msg.trim());
	    var room = data.room.trim();
		if (msg.substr(0,3) === '/w ') {
		  msg = msg.substr(3);
		  var ind = msg.indexOf(' ');
		  if (ind !== -1) {
		    var name = msg.substr(0, ind);
			var msg = msg.substr(ind + 1);
			if (name in users) {
			  users[name].emit('whisper', {msg: msg, nick: socket.nickname});
			  users[socket.nickname].emit('whisper sent', {msg: msg, nick: name})
			  console.log('Whisper!');
			} else {
			  callback('Enter a valid user!');
			}
		  } else {
		    callback('Error! Please enter msg for whisper.');
		  }
		} else {
		  var newMsg = new Chat({msg: msg, nick: socket.nickname});
		  newMsg.save(function(err, savedData){
		    if (err) { 
			  throw err;
			}
	        io.sockets.in(room).emit('new message', {msg: savedData.msg, nick: savedData.nick, nickcolor: socket.nickcolor, created: savedData.created});
		  });
		}
	});
	
	//socket.on('typing', function(data) {
	//	typingusers[socket.nickname] = { nick: socket.nickname, room: socket.room };
	//	io.sockets.emit('typing users', typingusers);		
	//});
	
	//socket.on('stop typing', function(data) {
	//	delete typingusers[socket.nickname];
	//	io.sockets.emit('typing users', typingusers);
	//});
	
	socket.on('disconnect', function(data) {
	    if(!socket.nickname) {
  		    return;
		}
		io.sockets.emit('user disconnected', {nick: socket.nickname, room: socket.room, nickcolor: socket.nickcolor});
		delete users[socket.nickname];
		updateNicknames();
	});

	function getRandomColor() {
    	var letters = '0123456789ABCDEF'.split('');
    	var color = '#';
    	for (var i = 0; i < 6; i++ ) {
        	color += letters[Math.floor(Math.random() * 16)];
    	}
    	return color;
	}
	
	function updateNicknames() {
		var allUsers = {};
		for (var key in users) {
			allUsers[key] = {nick: users[key].nickname, room: users[key].room, nickcolor: users[key].nickcolor};
		}
	    io.sockets.emit('usernames', allUsers);
	}

	function escapeHtml(str) {
        var div = thedocument.createElement('div');
        div.appendChild(thedocument.createTextNode(str));
		div.innerHTML = Autolinker.link(div.innerHTML);
		console.log(div.innerHTML);
        return div.innerHTML;
    };
});